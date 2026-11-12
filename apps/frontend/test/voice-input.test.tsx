// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceInput } from '@/features/planner/use-voice-input';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/features/planner/api', () => ({ transcribe: vi.fn(async () => 'hello') }));
vi.mock('@/lib/wav', () => ({ toSpeechWav: vi.fn(async (blob: Blob) => blob) }));

/** A permission prompt the test answers when it chooses. */
function pendingPermission() {
  let grant!: () => void;
  let deny!: (error: unknown) => void;
  const track = { stop: vi.fn() };
  const media = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve, reject) => {
        grant = () => resolve(media);
        deny = reject;
      }),
  );
  return { getUserMedia, track, grant: () => grant(), deny: (e: unknown) => deny(e) };
}

class FakeRecorder {
  static made: FakeRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    FakeRecorder.made.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => this.onstop?.());
  }
}

let permission: ReturnType<typeof pendingPermission>;

beforeEach(() => {
  FakeRecorder.made = [];
  permission = pendingPermission();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: permission.getUserMedia } });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('AudioContext', undefined); // the meter is optional; recording works without it
});

afterEach(() => vi.unstubAllGlobals());

describe('useVoiceInput', () => {
  it('reports the permission prompt as its own state and ignores a second press during it', async () => {
    const { result } = renderHook(() => useVoiceInput(vi.fn()));
    act(() => void result.current.start());
    expect(result.current.state).toBe('requesting');
    act(() => void result.current.start());
    expect(permission.getUserMedia).toHaveBeenCalledTimes(1);

    await act(async () => permission.grant());
    expect(result.current.state).toBe('recording');
    expect(FakeRecorder.made).toHaveLength(1);
  });

  it('hands the microphone back when cancelled while the prompt is open', async () => {
    const { result } = renderHook(() => useVoiceInput(vi.fn()));
    act(() => void result.current.start());
    act(() => result.current.cancel());
    expect(result.current.state).toBe('idle');

    await act(async () => permission.grant());
    expect(FakeRecorder.made).toHaveLength(0);
    expect(permission.track.stop).toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  it('never starts recording after unmounting while the prompt is open', async () => {
    const { result, unmount } = renderHook(() => useVoiceInput(vi.fn()));
    act(() => void result.current.start());
    unmount();
    await act(async () => permission.grant());
    expect(FakeRecorder.made).toHaveLength(0);
    expect(permission.track.stop).toHaveBeenCalled();
  });

  it('returns to idle when permission is denied', async () => {
    const { result } = renderHook(() => useVoiceInput(vi.fn()));
    act(() => void result.current.start());
    await act(async () => permission.deny(new DOMException('no', 'NotAllowedError')));
    expect(result.current.state).toBe('idle');
  });

  it('does not deliver text from a recording cancelled mid-way', async () => {
    const onText = vi.fn();
    const { result } = renderHook(() => useVoiceInput(onText));
    act(() => void result.current.start());
    await act(async () => permission.grant());
    act(() => result.current.cancel());
    await act(async () => {});
    expect(onText).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });
});
