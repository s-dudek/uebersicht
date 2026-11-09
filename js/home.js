// Startseite
import { ensureExternal } from './cal-sources.js';
import { allChip, dayContent, hm, openAttr } from './calendar.js';
import { askConfirm, esc, isDesktop, sb, state } from './core.js';
import { addDays, parseYmd, ymd } from './dates.js';
import { renderTiles } from './home-tiles.js';
import { ICON, LOGO_MARK, LOGO_WORD } from './icons.js';
import { openSettings } from './panels.js';
import { openTrash } from './trash.js';

// Startseite – auf allen Geräten Kacheln wie Widgets am iPhone (home-tiles.js), am Desktop dem Platz angepasst und mit Datum oben;
// Smartphone/Tablet zusätzlich die Leiste oben (homeBar).
export function renderHome() {
  ensureExternal();
  return renderDashboard();
}

export async function homeAction(k) {
  if (k === 'settings') return openSettings();
  if (k === 'trash') return openTrash();
  if (k === 'logout' && (await askConfirm('Abmelden?', 'Abmelden'))) sb.auth.signOut();
}

// ---------- Desktop: große Kalender-Kachel – Tag als Zeitleiste (home-tiles.js) ----------
const DAY_FROM = 6 * 60, DAY_TO = 24 * 60;   // sichtbarer Zeitraum der Tagesleiste

// Name des gezeigten Tags: Heute, Morgen, Gestern oder Wochentag mit Datum
function dayLabel(day) {
  const t = ymd(new Date());
  if (day === t) return 'Heute';
  if (day === addDays(t, 1)) return 'Morgen';
  if (day === addDays(t, -1)) return 'Gestern';
  return parseYmd(day).toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'long' });
}

export function calDayBody(today) {
  const day = state.homeDay || today, isToday = day === today;
  const { timed, allday } = dayContent(day, 'home');
  const pct = (min) => ((Math.min(Math.max(min, DAY_FROM), DAY_TO) - DAY_FROM) / (DAY_TO - DAY_FROM)) * 100;
  const rows = Math.max(1, ...timed.map((t) => t.cols));
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const hours = [];
  for (let h = 6; h <= 24; h += 2) hours.push(`<span class="ds-h" style="left:${pct(h * 60)}%">${String(h % 24).padStart(2, '0')}</span>`);
  const block = (t) => `<button class="ds-b k-${t.kind}" ${openAttr(t).replace(/style="[^"]*"/, '')} title="${esc(t.label)}"
      style="left:${pct(t.start)}%;width:calc(${pct(t.end) - pct(t.start)}% - 3px);top:${(t.col / rows) * 100}%;height:calc(${100 / rows}% - 4px)${t.kind === 'x' ? `;--xc:${t.color}` : ''}">
      <small>${hm(t.start)}</small><b>${esc(t.label)}</b></button>`;
  // die Kachel führt zum Kalender (an diesen Tag); Blättern, Termin +, Auswahl und Termine haben eigene Aktionen
  return `<div class="th">${ICON.calendar}<b class="ds-t">${esc(dayLabel(day))}</b>
      <button class="lgear ds-nav" data-act="home-day" data-id="-1" aria-label="Tag zurück">${ICON.chevL}</button>
      <button class="lgear ds-nav" data-act="home-day" data-id="1" aria-label="Tag vor">${ICON.chevR}</button>
      ${isToday ? '' : '<button class="chip ds-today" data-act="home-day" data-id="0">Heute</button>'}
      <span class="th-sp"></span>
      <button class="link-more" data-act="new-event" data-id="${day}">${ICON.plus} Termin</button>
      <button class="lgear" data-act="cal-sources" data-id="home" aria-label="Was die Startseite zeigt" title="Auswahl">${ICON.eye}</button></div>
    <div class="allday">${allday.map(allChip).join('')}</div>
    <div class="ds">
      <div class="ds-grid">${hours.join('')}</div>
      <div class="ds-track">${timed.map(block).join('')}
        ${isToday && nowMin >= DAY_FROM ? `<i class="ds-now" style="left:${pct(nowMin)}%"></i>` : ''}
        ${!timed.length && !allday.length ? `<p class="kempty ds-empty">${isToday ? 'Heute ist' : 'An diesem Tag ist'} nichts eingetragen.</p>` : ''}</div>
    </div>`;
}

// Kacheln wie am Smartphone, am Desktop dem Platz angepasst (Datum ist eine eigene Kachel).
// Bearbeiten über langes Drücken bzw. Rechtsklick; am Desktop solange oben der Knopf „Fertig“
function renderDashboard() {
  const today = ymd(new Date()), d = new Date();
  const done = isDesktop() && state.homeEdit ? '<div class="dash-bar"><button class="chip on" data-act="home-edit">Fertig</button></div>' : '';
  return `<div class="dash-wrap">${done}${renderTiles(today, d)}</div>`;
}

// Smartphone/Tablet: Leiste oben auf der Startseite – Logo, Neue Notiz (rund), Einstellungen, Abmelden
export function homeBar() {
  return `<header class="homebar"><div class="hbar-in">
    <span class="hbar-logo">${LOGO_MARK}${LOGO_WORD}</span>
    <button class="hbar-new" data-act="nav" data-id="quick" aria-label="Neue Notiz" title="Neue Notiz">${ICON.plus}</button>
    <span class="th-sp"></span>
    ${state.homeEdit ? '<button class="hbar-done" data-act="home-edit">Fertig</button>' : `
    <button class="hbar-ic" data-home="settings" aria-label="Einstellungen" title="Einstellungen">${ICON.gear}</button>
    <button class="hbar-ic" data-home="logout" aria-label="Abmelden" title="Abmelden">${ICON.power}</button>`}
  </div></header>`;
}
