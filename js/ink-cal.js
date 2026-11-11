// Canvas: Termin-Feld (Element c). Verweist auf einen Termin der App (ev) oder eines verknüpften Kalenders (xo)
// und zeigt ihn immer aktuell an – ändert sich der Termin im Kalender, ändert sich das Feld mit.
// Die Kopie im Element (tt Titel, d Datum, tm Uhrzeit) dient nur als Ersatz, solange der Termin nicht geladen ist.
// Größe wie die Kacheln der Startseite: Klein, Mittel, Groß (sz). Antippen öffnet die Wochenansicht des Tages.
import { calOf, extOcc } from './cal-sources.js';
import { dayContent, hm } from './calendar.js';
import { esc, itemById, safeColor, state, store } from './core.js';
import { addDays, parseYmd, ymd } from './dates.js';
import { evTitle, isYearly } from './events.js';
import { ICON } from './icons.js';
import { CAL_SIZES } from './ink-draw.js';
import { navigate } from './nav.js';
import { closeSheet, openSheet, sheetActs } from './sheet.js';

const BLUE = '#3E7CA8';
const NEXT = { s: 'm', m: 'l', l: 's' };
const SIZE_ICON = { s: 'szS', m: 'szM', l: 'szL' };
const PICK_DAYS = [-14, 120];   // Auswahl: Termine von zwei Wochen zurück bis vier Monate voraus
const hhmm = (d) => hm(d.getHours() * 60 + d.getMinutes());
const dateText = (d, size) => parseYmd(d).toLocaleDateString('de-AT', size === 's' ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' });

export const nextCalSize = (sz) => NEXT[sz] || 'l';

// aktueller Stand des Termins (oder die Kopie, wenn er gerade nicht da ist)
export function calInfo(it) {
  if (it.ev) {
    const e = itemById(it.ev);
    // jährlich (z. B. Geburtstag): das Jahr, in dem der Termin eingefügt wurde
    if (e) return { title: evTitle(e), day: isYearly(e) && it.d ? it.d.slice(0, 4) + e.due_date.slice(4) : e.due_date, time: e.meta?.time || '', end: e.meta?.end || '', color: BLUE, where: 'Übersicht' };
  } else if (it.xo) {
    const o = extOcc(it.xo), cal = o && calOf(o.cal);
    if (o) return { title: o.title, day: ymd(o.start), time: o.allDay ? '' : hhmm(o.start), end: o.allDay ? '' : hhmm(o.end), color: cal?.color || BLUE, where: o.location || cal?.name || '' };
  }
  return { title: it.tt || 'Termin', day: it.d, time: it.tm || '', end: '', color: BLUE, where: '', stale: true };
}

// Inhalt des Feldes (HTML, alles maskiert)
export function calCardHtml(it) {
  const i = calInfo(it), sz = it.sz || 'm';
  const time = i.time ? `${i.time}${i.end ? '–' + i.end : ''}` : 'ganztägig';
  return `<div class="icl-h"><span class="icl-ic">${ICON.calendar}</span><b>${esc(dateText(i.day, sz))}</b>
      <button type="button" class="icl-b" data-csz aria-label="Größe ändern" title="Größe ändern">${ICON[SIZE_ICON[sz]]}</button>
      <button type="button" class="icl-b" data-cdel aria-label="Termin-Feld entfernen" title="Entfernen">${ICON.trash}</button></div>
    <div class="icl-t">${esc(i.title)}</div>
    ${sz === 's' ? '' : `<div class="icl-tm">${ICON.clock}<span>${esc(time)}</span></div>`}
    ${sz === 'l' && i.where ? `<div class="icl-w">${esc(i.where)}</div>` : ''}`;
}
export const calColor = (it) => safeColor(calInfo(it).color, BLUE);

// Antippen: Wochenansicht des Termins (dort lässt er sich verschieben; das Feld zieht mit)
export function openCalOf(it) {
  const d = calInfo(it).day;
  Object.assign(state, { calDate: d, calView: 'week' });
  store('calView', 'week');
  navigate('calendar');
}

// für Speichern als PDF/Bild: das Feld als Karte zeichnen
export function drawCalCard(ctx, it) {
  const i = calInfo(it), [w, h] = CAL_SIZES[it.sz] || CAL_SIZES.m, sz = it.sz || 'm';
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = safeColor(i.color, BLUE);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(it.x, it.y, w, h, 14) : ctx.rect(it.x, it.y, w, h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = safeColor(i.color, BLUE);
  ctx.fillRect(it.x, it.y + 14, 5, h - 28);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#5F7F78';
  ctx.font = '600 15px Outfit, sans-serif';
  ctx.fillText(dateText(i.day, sz), it.x + 18, it.y + 16, w - 32);
  ctx.fillStyle = '#0C3741';
  ctx.font = `600 ${sz === 'l' ? 24 : 20}px Outfit, sans-serif`;
  ctx.fillText(i.title, it.x + 18, it.y + 42, w - 32);
  if (sz !== 's') {
    ctx.fillStyle = '#5F7F78';
    ctx.font = '500 15px Outfit, sans-serif';
    ctx.fillText(i.time ? `${i.time}${i.end ? '–' + i.end : ''}` : 'ganztägig', it.x + 18, it.y + (sz === 'l' ? 80 : 76), w - 32);
    if (sz === 'l' && i.where) ctx.fillText(i.where, it.x + 18, it.y + 106, w - 32);
  }
  ctx.restore();
}

// Termin auswählen (eigene Termine, Geburtstage, verknüpfte Kalender); gibt das neue Element ohne Lage zurück
export function pickCalEvent() {
  return new Promise((resolve) => {
    const today = ymd(new Date()), rows = [];
    for (let d = addDays(today, PICK_DAYS[0]); d <= addDays(today, PICK_DAYS[1]); d = addDays(d, 1)) {
      const { timed, allday } = dayContent(d);
      const list = [...allday.filter((a) => a.kind === 'ev' || a.kind === 'bday' || a.kind === 'x'), ...timed.filter((t) => t.kind === 'ev' || t.kind === 'x')];
      list.forEach((a) => rows.push({ d, a, time: a.start != null ? hm(a.start) : '' }));
    }
    const seen = new Set();   // mehrtägige verknüpfte Termine nur einmal
    const unique = rows.filter(({ a }) => { const k = a.kind === 'x' ? a.item.id : `${a.item.id}:${a.kind}`; if (a.kind === 'x' && seen.has(k)) return false; seen.add(k); return true; });
    let picked = false;
    const list = (q) => {
      const hit = unique.filter(({ a }) => !q || a.label.toLowerCase().includes(q));
      let last = '';
      return hit.length ? hit.map(({ d, a, time }, k) => {
        const head = d !== last ? `<div class="icp-d ${d === today ? 'today' : ''}">${esc(dateText(d, 'l'))}</div>` : '';
        last = d;
        return `${head}<button class="icp-r" data-k="${unique.indexOf(hit[k])}"><i style="background:${safeColor(a.color, BLUE)}"></i><span>${esc(time || 'ganztägig')}</span><b>${esc(a.label)}</b></button>`;
      }).join('') : '<p class="kempty">Keine Termine gefunden.</p>';
    };
    const sheet = openSheet(`<div class="sheet-head"><h2>Termin einfügen</h2>${sheetActs()}</div>
      <input class="input icp-q" type="search" placeholder="Suchen …" autocomplete="off">
      <div class="icp-list">${list('')}</div>`, { onClose: () => { if (!picked) resolve(null); } });
    const box = sheet.querySelector('.icp-list');
    sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
    sheet.querySelector('.icp-q').addEventListener('input', (e) => { box.innerHTML = list(e.target.value.trim().toLowerCase()); });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      const { d, a, time } = unique[+b.dataset.k];
      picked = true;
      resolve({ t: 'c', sz: 'm', ...(a.kind === 'x' ? { xo: a.item.id } : { ev: a.item.id }), d, tt: a.label.slice(0, 200), ...(time ? { tm: time } : {}) });
      closeSheet();
    });
    const now = box.querySelector('.icp-d.today');   // Liste bei heute beginnen (nur innerhalb der Liste scrollen)
    if (now) box.scrollTop = now.offsetTop - box.offsetTop;
  });
}
