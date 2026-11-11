// Canvas: Erinnerungs-Feld (Element b) – eine kleine Glocken-Kachel bei markierten Titeln oder Objekten.
// Verweist auf eine Erinnerung (rem, Eintrag vom Typ 'reminder'), zeigt Zeit und Text immer aktuell (Kopie tt als Ersatz).
// Größe wie Kacheln (sz s/m/l), ziehen verschiebt, antippen öffnet die Erinnerung im Bereich Erinnerungen (mit Pfeil zurück).
import { esc, itemById, state } from './core.js';
import { remindLabel } from './dates.js';
import { ICON } from './icons.js';
import { BELL_SIZES } from './ink-draw.js';
import { backToCanvas } from './ink.js';
import { goFromCanvas } from './nav.js';
import { openReminder } from './remind-page.js';

const SIZE_ICON = { s: 'szS', m: 'szM', l: 'szL' };
const AMBER = '#D9873E';

function bellInfo(it) {
  const r = itemById(it.rem);
  if (!r) return { title: it.tt || 'Erinnerung', when: 'nicht mehr vorhanden', gone: true };
  return { title: r.title || 'Erinnerung', when: remindLabel(r.remind_at), done: r.reminded || r.done };
}

export function bellCardHtml(it) {
  const i = bellInfo(it), sz = it.sz || 's';
  return `<div class="icl-h"><span class="icl-ic">${ICON.bell}</span><b>${esc(i.done ? 'Erinnert' : i.when)}</b>
      <button type="button" class="icl-b" data-csz aria-label="Größe ändern" title="Größe ändern">${ICON[SIZE_ICON[sz]]}</button>
      <button type="button" class="icl-b" data-cdel aria-label="Erinnerung entfernen" title="Entfernen">${ICON.trash}</button></div>
    <div class="icl-t">${esc(i.title)}</div>
    ${sz === 'l' && !i.done ? `<div class="icl-tm">${ICON.clock}<span>${esc(i.when)}</span></div>` : ''}`;
}
export const bellColor = (it) => (bellInfo(it).done || bellInfo(it).gone ? '#6E8582' : AMBER);

// Antippen: die Erinnerung öffnen (Bereich Erinnerungen, Pfeil zurück zum Feld)
export function openBellOf(it) {
  goFromCanvas('reminders', { fid: state.list, match: { rem: it.rem } });
  if (itemById(it.rem)) openReminder(it.rem);
}

// Erinnerung aus dem Canvas: Knopf „Im Canvas zeigen“ (öffnet den Ordner und zeigt das Feld), sonst null
export function canvasShow(r) {
  if (r.meta?.fid == null) return null;
  return () => { state.backTo = { fid: r.meta.fid, match: { rem: r.id } }; backToCanvas(); };
}

// für Speichern als PDF/Bild: das Feld als Karte zeichnen
export function drawBellCard(ctx, it) {
  const i = bellInfo(it), [w, h] = BELL_SIZES[it.sz] || BELL_SIZES.s;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(it.x, it.y, w, h, 14) : ctx.rect(it.x, it.y, w, h);
  ctx.fill(); ctx.stroke();
  ctx.textBaseline = 'top';
  ctx.fillStyle = AMBER;
  ctx.font = '600 14px Outfit, sans-serif';
  ctx.fillText(i.done ? 'Erinnert' : i.when, it.x + 16, it.y + 14, w - 28);
  ctx.fillStyle = '#0C3741';
  ctx.font = '600 18px Outfit, sans-serif';
  ctx.fillText(i.title, it.x + 16, it.y + 38, w - 28);
  ctx.restore();
}
