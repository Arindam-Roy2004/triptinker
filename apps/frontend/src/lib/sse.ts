/**
 * Reads a `text/event-stream` body and yields each `data:` payload.
 * `onActivity` fires for every chunk (including keepalive comments) so callers can
 * detect a stalled connection independently of whether events are arriving.
 */
export async function* readEventStream(body: ReadableStream<Uint8Array>, { onActivity, signal }: { onActivity?: () => void; signal?: AbortSignal } = {}): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  // Aborting a fetch does not always end a body that is already being read; cancel it explicitly.
  const cancel = () => void reader.cancel().catch(() => {});
  signal?.addEventListener('abort', cancel, { once: true });
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onActivity?.();
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
      }
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
