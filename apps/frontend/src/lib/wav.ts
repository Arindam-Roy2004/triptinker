/** Speech needs no more than this; it keeps a minute of audio under 2 MB. */
export const SPEECH_SAMPLE_RATE = 16_000;

/**
 * Turns whatever the browser recorded (WebM/Opus in Chrome and Firefox, MP4/AAC in Safari)
 * into 16 kHz mono 16-bit WAV, the one format every speech model accepts.
 */
export async function toSpeechWav(recording: Blob): Promise<Blob> {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await recording.arrayBuffer());
  } finally {
    void context.close();
  }
  const length = Math.max(1, Math.ceil(decoded.duration * SPEECH_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, SPEECH_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded; // a stereo source is mixed down to the single output channel
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), SPEECH_SAMPLE_RATE);
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
