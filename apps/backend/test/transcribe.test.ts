import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createTranscriber, isWav } from '../src/transcribe';

const providerConfig = {
  apiKey: 'sk-secret-never-leaves',
  baseUrl: 'https://llm.test/v1',
  model: 'test-model',
  jsonMode: true,
  firstTokenTimeoutMs: 500,
  idleTimeoutMs: 500,
  totalTimeoutMs: 3000,
  maxOutputTokens: 1000,
};

/** A valid, silent 16 kHz mono WAV. */
function wav(samples = 1600) {
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(samples * 2, 40);
  return buf;
}

let close: (() => void) | null = null;
afterEach(() => close?.());

async function serve(transcribe: Parameters<typeof createApp>[0]['transcribe'], configured = true) {
  const app = createApp({ provider: providerConfig, configured, allowSimulation: false, transcribe });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  close = () => server.close();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const send = (base: string, body: Buffer | string, type = 'audio/wav') => fetch(`${base}/api/transcribe`, { method: 'POST', headers: { 'content-type': type }, body });

describe('POST /api/transcribe', () => {
  it('returns the transcript and reports voice in health', async () => {
    const base = await serve(async (audio) => (isWav(audio) ? 'Three days in Lisbon' : 'bad'));
    const health = (await (await fetch(`${base}/api/health`)).json()) as { voice: boolean };
    expect(health.voice).toBe(true);
    const response = await send(base, wav());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: 'Three days in Lisbon' });
  });

  it('rejects anything that is not a WAV clip without calling the model', async () => {
    let calls = 0;
    const base = await serve(async () => (calls++, 'x'));
    expect((await send(base, 'hello', 'text/plain')).status).toBe(400);
    expect((await send(base, Buffer.from('not a wav at all, just some bytes padding padding'))).status).toBe(400);
    expect(calls).toBe(0);
  });

  it('refuses clips over the size limit', async () => {
    const base = await serve(async () => 'x');
    expect((await send(base, wav(1_300_000))).status).toBe(413);
  });

  it('is unavailable when voice is off', async () => {
    const base = await serve(null);
    expect(((await (await fetch(`${base}/api/health`)).json()) as { voice: boolean }).voice).toBe(false);
    const response = await send(base, wav());
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('NOT_CONFIGURED');
  });
});

describe('transcriber', () => {
  const config = { apiKey: 'k', baseUrl: 'https://llm.test/v1', model: 'audio-model', timeoutMs: 1000 };

  it('sends the clip as input_audio and cleans the answer', async () => {
    let sent: { model: string; messages: { content: { type: string; input_audio?: { format: string; data: string } }[] }[] } | null = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: '“Four days​ in  Kyoto”\n' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const text = await createTranscriber(config, fetchImpl)(wav(), new AbortController().signal);
    expect(text).toBe('Four days in Kyoto');
    expect(sent!.model).toBe('audio-model');
    const audio = sent!.messages[0].content.find((part) => part.type === 'input_audio');
    expect(audio?.input_audio?.format).toBe('wav');
    expect(Buffer.from(audio!.input_audio!.data, 'base64').subarray(0, 4).toString()).toBe('RIFF');
  });

  it('maps provider failures to safe errors', async () => {
    const failing = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;
    await expect(createTranscriber(config, failing(401))(wav(), new AbortController().signal)).rejects.toMatchObject({ code: 'PROVIDER_AUTH' });
    await expect(createTranscriber(config, failing(429))(wav(), new AbortController().signal)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(createTranscriber(config, failing(503))(wav(), new AbortController().signal)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('times out a provider that never answers', async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    await expect(createTranscriber({ ...config, timeoutMs: 50 }, hang)(wav(), new AbortController().signal)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
