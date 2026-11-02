// Startseite
import { askConfirm, esc, sb, state } from './core.js';
import { addDays, ymd } from './dates.js';
import { eventsOn, isBday } from './events.js';
import { ICON, LOGO_PORTRAIT } from './icons.js';
import { openSettings } from './panels.js';
import { render } from './render.js';

const HOME_BTNS = [
  { key: 'settings', label: 'Einstellungen', icon: 'gear' },
  { key: 'logout', label: 'Abmelden', icon: 'power' },
];

function homeEvents() {
  const t = ymd(new Date()), m = addDays(t, 1);
  const list = [...eventsOn(t).map((e) => [e, 'Heute']), ...eventsOn(m).map((e) => [e, 'Morgen'])].slice(0, 3);
  if (!list.length) return '';
  return `<div class="home-ev">${list.map(([e, w]) => `<button class="hev ${isBday(e) ? 'bday' : ''}" data-act="open" data-id="${e.id}">${isBday(e) ? ICON.cake : ICON.calendar}<span><em>${w}</em> ${esc(isBday(e) ? (e.title || 'Geburtstag') : e.title || 'Termin')}${!isBday(e) && e.meta?.time ? ' · ' + esc(e.meta.time) : ''}</span></button>`).join('')}</div>`;
}

// Das Lesezeichen-Logo fällt nur beim Betreten der Startseite herunter, nicht bei jedem Neuzeichnen
let introShown = false;
export function resetHomeIntro() { introShown = false; }

export function renderHome() {
  const settled = introShown;
  introShown = true;
  const d = new Date();
  return `
  <div class="home">
    <header class="home-head">
      <div class="home-day"><b>${d.toLocaleDateString('de-AT', { weekday: 'long' })}</b><span>${d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        ${homeEvents()}</div>
    </header>
    <div class="bookmark ${settled ? 'settled' : ''}">${LOGO_PORTRAIT}</div>
    <div class="home-plate" aria-hidden="true"><i></i><i></i></div>
    <div class="home-foot">
      ${HOME_BTNS.map((b) => `<button class="hb ${b.key === 'logout' ? 'out' : ''}" data-home="${b.key}" aria-label="${b.label}">
        <span class="hb-c">${ICON[b.icon]}</span><span class="hb-l">${b.label}</span>
      </button>`).join('')}
    </div>
  </div>`;
}

export async function homeAction(k) {
  const b = HOME_BTNS.find((x) => x.key === k);
  if (!b) return;
  if (k === 'settings') return openSettings();
  if (k === 'logout') { if (await askConfirm('Abmelden?', 'Abmelden')) sb.auth.signOut(); return; }
  state.tab = k;
  render();
  document.querySelector('.main')?.scrollTo({ top: 0 });
}
