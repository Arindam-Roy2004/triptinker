import type { Itinerary, Stop } from '@triptinker/contracts';
import { formatDuration, formatTime, mapsSearchUrl } from '@/lib/format';
import { CATEGORY_META } from './categories';

/**
 * Ways to take a trip out of the app in a form a traveller can use on the road:
 * a printable page (Save as PDF), a plain-text file, or text to paste into notes or a chat.
 */

export const fileSlug = (itinerary: Itinerary) => itinerary.destination.split(',')[0].trim().toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'trip';

const stopMeta = (stop: Stop) => [CATEGORY_META[stop.category].label, formatDuration(stop.durationMinutes), stop.area].filter(Boolean).join(' · ');

/** The trip as plain text: readable in any notes app, email or messenger. */
export function tripAsText(itinerary: Itinerary): string {
  const lines: string[] = [itinerary.title, itinerary.destination];
  if (itinerary.summary) lines.push('', itinerary.summary);
  itinerary.days.forEach((day, i) => {
    lines.push('', '', `DAY ${i + 1} · ${day.title}`);
    if (day.summary) lines.push(day.summary);
    for (const stop of day.stops) {
      lines.push('', `${formatTime(stop.time) ?? 'Any time'}  ${stop.title}`);
      const meta = stopMeta(stop);
      if (meta) lines.push(`       ${meta}`);
      if (stop.description) lines.push(`       ${stop.description}`);
      if (stop.tip) lines.push(`       Tip: ${stop.tip}`);
      lines.push(`       Map: ${mapsSearchUrl(stop.title, itinerary.destination, stop.area)}`);
    }
    if (!day.stops.length) lines.push('', 'Free day.');
  });
  if (itinerary.notes.length) {
    lines.push('', '', 'GOOD TO KNOW');
    itinerary.notes.forEach((note) => lines.push(`• ${note}`));
  }
  lines.push('', '', 'Planned with TripTinker. Check opening hours and bookings before you go.');
  return lines.join('\n') + '\n';
}

export function downloadText(itinerary: Itinerary) {
  const blob = new Blob([tripAsText(itinerary)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: `${fileSlug(itinerary)}-itinerary.txt` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A self-contained, print-ready page: one day per section, with map links that stay clickable in the PDF. */
export function tripAsPrintableHtml(itinerary: Itinerary): string {
  const days = itinerary.days
    .map((day, i) => {
      const stops = day.stops.length
        ? day.stops
            .map(
              (stop) => `
        <li>
          <span class="time">${escape(formatTime(stop.time) ?? '')}</span>
          <div>
            <h3>${escape(stop.title)}</h3>
            <p class="meta">${escape(stopMeta(stop))} · <a href="${escape(mapsSearchUrl(stop.title, itinerary.destination, stop.area))}">Map</a></p>
            ${stop.description ? `<p>${escape(stop.description)}</p>` : ''}
            ${stop.tip ? `<p class="tip"><b>Tip</b> ${escape(stop.tip)}</p>` : ''}
          </div>
        </li>`,
            )
            .join('')
        : '<li><span class="time"></span><div><p class="meta">Free day.</p></div></li>';
      return `
    <section>
      <p class="eyebrow">Day ${i + 1}</p>
      <h2>${escape(day.title)}</h2>
      ${day.summary ? `<p class="summary">${escape(day.summary)}</p>` : ''}
      <ol>${stops}</ol>
    </section>`;
    })
    .join('');
  const notes = itinerary.notes.length ? `<section class="notes"><h2>Good to know</h2><ul>${itinerary.notes.map((n) => `<li>${escape(n)}</li>`).join('')}</ul></section>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(itinerary.title)}</title>
<style>
  @page { margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 11pt/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1d1b19; background: #fff; }
  header { border-bottom: 2px solid #1d1b19; padding-bottom: 10pt; margin-bottom: 14pt; }
  .eyebrow { margin: 0; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; color: #c4623f; font-weight: 600; }
  h1 { margin: 4pt 0 6pt; font: 600 22pt/1.15 Georgia, "Times New Roman", serif; }
  h2 { margin: 2pt 0 4pt; font: 600 14pt/1.25 Georgia, "Times New Roman", serif; }
  h3 { margin: 0; font-size: 11pt; }
  p { margin: 2pt 0; }
  .summary { color: #57524c; }
  section { margin-bottom: 16pt; break-inside: avoid-page; }
  section + section { border-top: 1px solid #ddd8d2; padding-top: 12pt; }
  ol, ul { margin: 6pt 0 0; padding: 0; }
  ol { list-style: none; }
  ol li { display: grid; grid-template-columns: 58pt 1fr; gap: 8pt; padding: 6pt 0; break-inside: avoid; }
  .time { font: 600 10pt/1.6 ui-monospace, Menlo, monospace; white-space: nowrap; color: #57524c; }
  .meta { font-size: 9pt; color: #77716a; }
  .tip { font-size: 9.5pt; color: #57524c; }
  a { color: #c4623f; }
  .notes ul { padding-left: 14pt; }
  footer { margin-top: 18pt; font-size: 8.5pt; color: #8f8a84; }
</style>
</head>
<body>
  <header>
    <p class="eyebrow">${escape(itinerary.destination)} · ${itinerary.days.length} day${itinerary.days.length === 1 ? '' : 's'}</p>
    <h1>${escape(itinerary.title)}</h1>
    ${itinerary.summary ? `<p class="summary">${escape(itinerary.summary)}</p>` : ''}
  </header>
  ${days}
  ${notes}
  <footer>Planned with TripTinker. Check opening hours and bookings before you go.</footer>
</body>
</html>`;
}

/** Opens the browser's print dialog for the trip, where "Save as PDF" is one click away. No pop-up needed. */
export function printTrip(itinerary: Itinerary) {
  document.getElementById('trip-print-frame')?.remove();
  const frame = Object.assign(document.createElement('iframe'), { id: 'trip-print-frame', title: 'Printable trip', srcdoc: tripAsPrintableHtml(itinerary) });
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    // The printed file is named after the page title in most browsers.
    win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 0), { once: true });
    win.focus();
    win.print();
  };
  document.body.appendChild(frame);
}
