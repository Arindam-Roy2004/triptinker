/** Display a local itinerary time without applying the browser's timezone. */
export function formatTime(time: string | null): string | null {
  if (!time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hour, minute] = time.split(':');
  const h = Number(hour);
  return `${h % 12 || 12}:${minute} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatDuration(minutes: number | null): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}

export function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function relativeTime(timestamp: number, now = Date.now()) {
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function mapsSearchUrl(title: string, destination: string, area?: string | null) {
  const query = [title, area, destination].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
