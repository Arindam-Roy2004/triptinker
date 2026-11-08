import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { toSpeechWav } from '@/lib/wav';
import { transcribe } from './api';

export type VoiceState = 'idle' | 'recording' | 'transcribing';

/** Long enough for a full trip brief; short enough to keep the upload under 2 MB. */
export const MAX_RECORDING_MS = 60_000;
const MIN_RECORDING_MS = 500;

export const voiceSupported = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined';

function micError(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return { title: 'Microphone access is blocked', description: 'Allow the microphone for this site in your browser settings, then try again.' };
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { title: 'No microphone found', description: 'Connect a microphone, or type your request instead.' };
  if (name === 'NotReadableError') return { title: 'The microphone is busy', description: 'Another app may be using it. Close it, then try again.' };
  return { title: 'Could not start the microphone', description: 'Type your request instead.' };
}

/**
 * Record → stop → transcribe. The transcript goes to `onText`, which only fills a text field:
 * nothing is sent to the planner until the traveller presses Send themselves.
 */
export function useVoiceInput(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [startedAt, setStartedAt] = useState(0);
  /** Live level of the microphone while recording, for the waveform. */
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const meter = useRef<AudioContext | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const request = useRef<AbortController | null>(null);
  const limit = useRef<ReturnType<typeof setTimeout>>(undefined);
  const discard = useRef(false);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const release = useCallback(() => {
    clearTimeout(limit.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
    void meter.current?.close().catch(() => {});
    meter.current = null;
    setAnalyser(null);
  }, []);

  const finish = useCallback(async (chunks: Blob[], type: string, durationMs: number) => {
    if (discard.current) return setState('idle');
    if (durationMs < MIN_RECORDING_MS) {
      toast('Hold on a little longer', { description: 'Press the microphone, speak, then press it again to stop.' });
      return setState('idle');
    }
    setState('transcribing');
    const controller = new AbortController();
    request.current = controller;
    try {
      const wav = await toSpeechWav(new Blob(chunks, { type }));
      const text = await transcribe(wav, controller.signal);
      if (controller.signal.aborted) return;
      if (text) onTextRef.current(text);
      else toast('Didn’t catch that', { description: 'Try again a little closer to the microphone.' });
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error('Voice input failed', { description: error instanceof Error && error.message ? error.message : 'Type your request instead.' });
    } finally {
      if (request.current === controller) {
        request.current = null;
        setState('idle');
      }
    }
  }, []);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (recorder.current || request.current) return;
    discard.current = false;
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      toast.error(micError(error).title, { description: micError(error).description });
      return;
    }
    stream.current = media;
    const rec = new MediaRecorder(media);
    recorder.current = rec;
    const chunks: Blob[] = [];
    const began = Date.now();
    rec.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
    rec.onstop = () => {
      const type = rec.mimeType;
      release();
      void finish(chunks, type, Date.now() - began);
    };
    rec.start();
    try {
      const context = new AudioContext();
      const node = context.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.6;
      context.createMediaStreamSource(media).connect(node);
      meter.current = context;
      setAnalyser(node);
    } catch {
      /* the waveform is decoration; recording works without it */
    }
    setStartedAt(began);
    setState('recording');
    limit.current = setTimeout(stop, MAX_RECORDING_MS);
  }, [finish, stop, release]);

  /** Drop the recording or the transcription in flight; nothing reaches the text field. */
  const cancel = useCallback(() => {
    discard.current = true;
    request.current?.abort();
    request.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    else release();
    setState('idle');
  }, [release]);

  useEffect(
    () => () => {
      discard.current = true;
      request.current?.abort();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      release();
    },
    [release],
  );

  return { state, startedAt, analyser, start, stop, cancel };
}

/** Adds dictated text after what is already typed, within the field's limit. */
export const appendSpoken = (current: string, spoken: string, max: number) => {
  const joined = current.trim() ? `${current.trimEnd()} ${spoken}` : spoken;
  return [...joined].slice(0, max).join('');
};
