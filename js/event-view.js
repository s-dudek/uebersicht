// Termin ansehen (nur lesen): Titel, Zeit, Ort, Notiz und Kalender; „Bearbeiten“ öffnet erst das Formular.
// Gemeinsam für eigene Termine, Google-Termine und verknüpfte Kalender.
import { esc, safeColor } from './core.js';
import { ICON } from './icons.js';
import { closeSheet, openSheet, sheetActs } from './sheet.js';

// o: { title, when, location, desc, calName, color, notes: [Text], hint, onEdit }
export function showEventCard(o) {
  const sheet = openSheet(`<div class="sheet-head"><span class="status"><i class="src-dot" style="background:${safeColor(o.color, '#0C3741')}"></i>${esc(o.calName || 'Kalender')}</span>
      ${sheetActs({ edit: !!o.onEdit })}</div>
    <h2 class="xe-t">${esc(o.title)}</h2>
    <p class="xe-w">${ICON.clock}<span>${esc(o.when)}</span></p>
    ${o.location ? `<p class="xe-w">${ICON.pin}<span>${esc(o.location)}</span></p>` : ''}
    ${(o.notes || []).map((n) => `<p class="xe-w">${ICON.bell}<span>${esc(n)}</span></p>`).join('')}
    ${o.desc ? `<div class="xe-d">${esc(o.desc)}</div>` : ''}
    ${o.hint ? `<p class="hint">${esc(o.hint)}</p>` : ''}`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-edit]')?.addEventListener('click', () => { closeSheet(); o.onEdit(); });
}

// Zeitangabe für Vorkommen mit Date-Objekten (ganztägig: Ende ist exklusiv)
export function whenText(start, end, allDay) {
  const long = { weekday: 'long', day: 'numeric', month: 'long' }, t = { hour: '2-digit', minute: '2-digit' };
  if (allDay) {
    const last = new Date(end - 1);
    const multi = last.toDateString() !== start.toDateString();
    return `${start.toLocaleDateString('de-AT', long)}${multi ? ' – ' + last.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'long' }) : ''} · ganztägig`;
  }
  return `${start.toLocaleDateString('de-AT', long)} · ${start.toLocaleTimeString('de-AT', t)}–${end.toLocaleTimeString('de-AT', t)}`;
}
