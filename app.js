import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ====================================================================
// Grundlagen
// ====================================================================
const cfg = window.APP_CONFIG || {};
const $app = document.getElementById('app');
const $sheetRoot = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');
document.documentElement.lang = 'de';

const COLORS = ['#0C3741', '#7FA08A', '#3E7CA8', '#7A5AA6', '#C2575A', '#D9873E', '#C9A227', '#76907F'];

const ICON = {
  pot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16v6.5A3.5 3.5 0 0 1 16.5 20h-9A3.5 3.5 0 0 1 4 16.5z"/><path d="M2.5 10h19M9 6.5c0-1 1-1.2 1-2.2M13 6.5c0-1 1-1.2 1-2.2"/></svg>',
  fork: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v7a2.5 2.5 0 0 0 5 0V3M9.5 3v18M17 21V3c-2 1.5-3 4-3 7v3h3"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19C5 10 10 5 20 4c-1 10-6 15-15 15z"/><path d="M5 19l7-7"/></svg>',
  bread: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M5 11a3.5 3.5 0 0 1 0-7h14a3.5 3.5 0 0 1 0 7v8.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5z"/></svg>',
  milk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M9 3h6v3l2 3v11.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V9l2-3z"/><path d="M7 12h10"/></svg>',
  meat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M15.5 4.5c3 1 4.5 4 3.5 7s-4.5 5.5-8.5 6l-3.5 3-2-2 3-3.5c.5-4 3-7.5 6-8.5z"/><circle cx="14" cy="10" r="1.6"/></svg>',
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5"/></svg>',
  jar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="6" y="3.5" width="12" height="3.5" rx="1"/><path d="M6.5 7h11v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z"/><path d="M6.5 12h11"/></svg>',
  spice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M9 3h6v4H9zM8 7h8l1 3v10.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V10z"/><path d="M11 4.5h.1M13 4.5h.1"/></svg>',
  bottle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M10 2.5h4V6c0 1 2.5 2 2.5 5v9.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V11c0-3 2.5-4 2.5-5z"/><path d="M7.5 13h9"/></svg>',
  candy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M8.5 10 4 7v6zM15.5 14l4.5 3v-6z"/></svg>',
  spray: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M8 9h7v11.5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5zM9.5 9V6h4v3M13.5 6h3l1.5-2"/><path d="M19 7.5h.1M20.5 5h.1"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 4.5h2.2l2.1 10.2h9.6l2-7.2H6.6"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="16.5" cy="19" r="1.4"/></svg>',
  work: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V5.8A1.3 1.3 0 0 1 10.3 4.5h3.4A1.3 1.3 0 0 1 15 5.8v1.7M3.5 12.5h17"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M6.6 3.8l2.6.3 1.3 3.7-1.8 1.4a12 12 0 0 0 6.1 6.1l1.4-1.8 3.7 1.3.3 2.6a2 2 0 0 1-2.2 2.2A16.5 16.5 0 0 1 4.4 6a2 2 0 0 1 2.2-2.2z"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M4 16.5v-4l1.8-4.6A2 2 0 0 1 7.7 6.5h8.6a2 2 0 0 1 1.9 1.4l1.8 4.6v4z"/><path d="M4 12.5h16"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3.5-5-4-5-1.6C7 9 12 9 12 9zM12 9c1.5-3.5 5-4 5-1.6C17 9 12 9 12 9z"/></svg>',
  plane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M10.5 13.5L3.5 11l1.4-1.4 7.4.8 4.5-4.5a1.9 1.9 0 0 1 2.7 2.7l-4.5 4.5.8 7.4-1.4 1.4-2.5-7-3 3 .3 2.3-1.1 1.1-1.6-3.1-3.1-1.6 1.1-1.1 2.3.3z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 21V4M5.5 4.5h11l-2.2 4 2.2 4h-11"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.3v.2"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M4.5 5.5A2 2 0 0 1 6.5 3.5h12v15h-12a2 2 0 0 0-2 2z"/><path d="M4.5 20.5a2 2 0 0 1 2-2h12v2.5"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.1M17.5 14.5v.1"/></svg>',
  paw: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="9" r="1.9"/><circle cx="10.5" cy="5.8" r="1.9"/><circle cx="14.5" cy="5.8" r="1.9"/><circle cx="18" cy="9" r="1.9"/><path d="M12.5 11c3 0 5.5 4 5.5 6.2 0 1.9-2 2.3-3 2-1-.3-1.5-.6-2.5-.6s-1.5.3-2.5.6c-1 .3-3-.1-3-2 0-2.2 2.5-6.2 5.5-6.2z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  todos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12l3 3 5-6"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h9l4 4v13H6z"/><path d="M15 3.5v4h4M9 12h7M9 16h5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  share: '<svg class="share-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2.4 0 4 1.3 4.5 3.9"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 11.5L12 4l8 7.5V20h-5.5v-5h-5v5H4z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5"/></svg>',
  power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3.5v8"/><path d="M7 6.6a7.5 7.5 0 1 0 10 0"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h3.9l2 2.2h7.7A2.2 2.2 0 0 1 21 9.4v8.4A2.2 2.2 0 0 1 18.8 20H5.2A2.2 2.2 0 0 1 3 17.8z" fill="var(--fc)"/><path d="M3 10h18" stroke="rgba(255,255,255,.55)" stroke-width="1.4"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/></svg>',
  wheel: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="7" r="2.3"/><circle cx="7" cy="17" r="2.3"/><circle cx="17" cy="17" r="2.3"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/></svg>',
  notePlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 3.5H6v17h12V8z"/><path d="M13.5 3.5V8H18M12 11.5v6M9 14.5h6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="17.5" r="1.2" fill="currentColor"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  stack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M7 5h10M9.5 2.5h5"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(text, ms = 2600) {
  $toast.textContent = text;
  $toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($toast.hidden = true), ms);
}

// Bestätigungsdialog in der Seite (statt confirm(), das nicht überall funktioniert)
function askConfirm(question, okLabel = 'OK', detail = '') {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'backdrop confirm-backdrop';
    wrap.innerHTML = `<div class="confirm" role="alertdialog" aria-modal="true">
      <div class="confirm-q">${esc(question)}</div>
      ${detail ? `<div class="confirm-d">${esc(detail)}</div>` : ''}
      <div class="confirm-actions">
        <button class="btn secondary" data-no>Abbrechen</button>
        <button class="btn danger-fill" data-yes>${esc(okLabel)}</button>
      </div></div>`;
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap) done(false); });
    wrap.querySelector('[data-no]').addEventListener('click', () => done(false));
    wrap.querySelector('[data-yes]').addEventListener('click', () => done(true));
    document.body.appendChild(wrap);
    wrap.querySelector('[data-yes]').focus();
  });
}

function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch { return null; }
}

// ====================================================================
// Konfiguration prüfen
// ====================================================================
const configured = cfg.SUPABASE_URL && cfg.SUPABASE_KEY &&
  !cfg.SUPABASE_URL.includes('DEINE') && !cfg.SUPABASE_KEY.includes('DEIN');

if (!configured) {
  $app.innerHTML = `<div class="center"><div>
    <h2>Fast fertig</h2>
    <p class="muted">In der Datei <b>config.js</b> fehlen noch die Supabase-Daten<br>(Project URL und Publishable Key).</p>
  </div></div>`;
  throw new Error('config.js nicht ausgefüllt');
}

const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ====================================================================
// Zustand
// ====================================================================
const state = {
  me: null,            // auth user id
  profiles: {},        // id -> profile
  categories: [],
  members: [],         // {category_id, user_id}
  items: [],
  shares: [],          // {item_id, user_id}
  tab: 'home',
  filter: 'all',       // 'all' | 'none' | category id
  weekStart: (() => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; })(),   // Montag der angezeigten Woche
  doneOpen: new Set(),   // Todo-Listen, deren erledigte Einträge aufgeklappt sind
  views: (() => { try { return JSON.parse(store('views')) || {}; } catch { return {}; } })(),   // je Bereich 'detail' oder 'list'
  folded: new Set(),    // zugeklappte Ordner in der Listenansicht
  list: null,           // geöffnete Todo-Liste (null = Übersicht, '' = Allgemein)
  loaded: false,
};

const catById = (id) => state.categories.find((c) => c.id === id);
// Mischansicht: ausgewählte Ordner als Kachel, alle anderen als Liste (im Browser gemerkt)
const TILES_KEY = 'uebersicht-tiles';
const tileSets = (() => {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(TILES_KEY)); } catch {}
  const d = raw || window.__DEMO_TILES || { todos: [''], notes: [], categories: [] };
  return { todos: new Set(d.todos || []), notes: new Set(d.notes || []), categories: new Set(d.categories || []) };
})();
const isTile = (tab, id) => tileSets[tab]?.has(id || '');
function toggleTile(tab, id) {
  const set = tileSets[tab]; id = id || '';
  set.has(id) ? set.delete(id) : set.add(id);
  try { localStorage.setItem(TILES_KEY, JSON.stringify(Object.fromEntries(Object.entries(tileSets).map(([k, v]) => [k, [...v]])))); } catch {}
  render();
}
const tileToggle = (tab, id, asTile) => `<button class="vtog" data-act="tile-toggle" data-tt="${tab}" data-id="${id}" aria-label="${asTile ? 'Als Liste anzeigen' : 'Als Kachel anzeigen'}" title="${asTile ? 'Als Liste anzeigen' : 'Als Kachel anzeigen'}">${asTile ? ICON.list : ICON.grid}</button>`;

// Ordner einer Seite: Kacheln oben, Rest als Explorer-Liste
function mixed(tab, folders, tileFn) {
  const tiles = folders.filter((f) => isTile(tab, f.id));
  const rest = folders.filter((f) => !isTile(tab, f.id));
  return `${tiles.length ? `<div class="tgrid">${tiles.map(tileFn).join('')}</div>` : ''}
    ${rest.length ? explorer(tab, rest) : ''}
    <p class="hint xhint">Einträge lange gedrückt halten und in einen anderen Ordner ziehen. ${ICON.grid.replace('<svg', '<svg class="ihint"')} macht einen Ordner zur Kachel.</p>`;
}
// Todo-Listen: Kategorien mit Markierung "todo_list", mit Todos, oder lokal hinzugefügt (bei fremden Kategorien)
const LOCAL_LISTS = 'uebersicht-lists';
const localLists = () => { try { return JSON.parse(localStorage.getItem(LOCAL_LISTS)) || []; } catch { return []; } };
const setLocalLists = (a) => { try { localStorage.setItem(LOCAL_LISTS, JSON.stringify(a)); } catch {} };
const isTodoList = (c) => !!c.todo_list || localLists().includes(c.id) || state.items.some((i) => i.type === 'todo' && i.category_id === c.id);
const itemById = (id) => state.items.find((i) => i.id === id);
const membersOf = (cid) => state.members.filter((m) => m.category_id === cid).map((m) => m.user_id);
const sharesOf = (iid) => state.shares.filter((s) => s.item_id === iid).map((s) => s.user_id);
const nameOf = (uid) => (uid === state.me ? 'Ich' : state.profiles[uid]?.name || state.profiles[uid]?.email || 'Unbekannt');

const isCatShared = (c) => !!c && (c.owner_id !== state.me || membersOf(c.id).length > 0);
const isItemShared = (i) => i.owner_id !== state.me || sharesOf(i.id).length > 0 || isCatShared(catById(i.category_id));
const canDeleteItem = (i) => i.owner_id === state.me || (i.category_id && catById(i.category_id));

// ====================================================================
// Daten laden + Live-Updates
// ====================================================================
async function loadAll() {
  const [c, m, i, s, p] = await Promise.all([
    sb.from('categories').select('*').order('name'),
    sb.from('category_members').select('*'),
    sb.from('items').select('*').order('created_at', { ascending: false }),
    sb.from('item_shares').select('*'),
    sb.from('profiles').select('*'),
  ]);
  const err = c.error || m.error || i.error || s.error || p.error;
  if (err) { toast('Laden fehlgeschlagen: ' + err.message, 4000); return; }
  state.categories = c.data;
  state.members = m.data;
  state.items = i.data;
  state.shares = s.data;
  state.profiles = Object.fromEntries(p.data.map((x) => [x.id, x]));
  if (state.filter !== 'all' && state.filter !== 'none' && !catById(state.filter)) state.filter = 'all';
  state.loaded = true;
  render();
  setTimeout(checkReminders, 1200);
}
const reload = debounce(loadAll, 300);

let channel = null;
function subscribe() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => reload())
    .subscribe();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.me) reload();
});

// ====================================================================
// Anmeldung
// ====================================================================
let authMode = 'login';

// Dudek Grafik – Wortmarke und Gestaltungselement (aus den Original-SVGs, Farbe über currentColor)
const LOGO_WORD = '<svg class="logo-word" viewBox="11 49.5 204.5 53" role="img" aria-label="dudek"><path d="M38.58,50.31v19.16c-2.2-3.13-5.76-4.75-9.95-4.75-7.95,0-17.05,5.81-17.05,18.02,0,11.28,7.82,18.87,18.97,18.87s18.69-7.02,18.69-18.8v-32.5h-10.66ZM30.48,91.68c-4.83,0-8.1-3.48-8.1-8.51s3.27-8.52,8.1-8.52,8.1,3.48,8.1,8.52-3.27,8.51-8.1,8.51ZM79.38,65.64v18.17c0,5.53-2.7,7.87-6.67,7.87s-6.68-2.34-6.68-7.87v-18.17h-10.66v18.17c0,11.84,6.96,17.81,17.34,17.81s17.33-6.03,17.33-17.81v-18.17h-10.66ZM121.6,50.31v19.16c-2.2-3.13-5.76-4.75-9.95-4.75-7.96,0-17.05,5.81-17.05,18.02,0,11.28,7.82,18.87,18.97,18.87s18.68-7.02,18.68-18.8v-32.5h-10.65ZM113.5,91.68c-4.83,0-8.1-3.48-8.1-8.51s3.27-8.52,8.1-8.52,8.1,3.48,8.1,8.52-3.27,8.51-8.1,8.51ZM172.45,74.89l-7.68,7.88c.43,2.3-.7,4.37-2.83,6.56-2.68,2.75-6.18,3.69-9.73,1.43l18.49-18.95-2.13-2.08c-7.64-7.43-18.54-7.44-26.27.49-7.74,7.93-7.59,18.96.04,26.39,7.64,7.42,18.69,7.28,26.42-.65,6.1-6.25,7.3-14.39,3.69-21.07ZM149.12,76.86c2.57-2.65,5.68-3.6,9.11-1.93l-10.7,10.98c-1.8-3.24-.99-6.41,1.59-9.05ZM200.35,82.81l14.28-17.17h-13.22l-11.15,14.76v-30.09h-10.66v50.38h10.66v-15.12l11.44,15.12h13.49l-14.84-17.89Z"/></svg>';
const LOGO_PORTRAIT = '<svg class="logo-portrait" viewBox="0 0 226.77 283.46" role="img" aria-label="dudek"><rect width="226.77" height="283.46" fill="#0C3741"/><g fill="#A8BEA7"><path d="M38.58,220.32v19.19c-2.2-3.13-5.76-4.76-9.95-4.76-7.95,0-17.05,5.82-17.05,18.04,0,11.3,7.82,18.9,18.97,18.9s18.69-7.03,18.69-18.83v-32.54h-10.66ZM30.48,261.74c-4.83,0-8.1-3.48-8.1-8.52s3.27-8.53,8.1-8.53,8.1,3.48,8.1,8.53-3.27,8.52-8.1,8.52Z"/><path d="M79.38,235.67v18.19c0,5.54-2.7,7.88-6.67,7.88s-6.68-2.34-6.68-7.88v-18.19h-10.66v18.19c0,11.86,6.96,17.83,17.34,17.83s17.33-6.04,17.33-17.83v-18.19h-10.66Z"/><path d="M121.6,220.32v19.19c-2.2-3.13-5.76-4.76-9.95-4.76-7.96,0-17.05,5.82-17.05,18.04,0,11.3,7.82,18.9,18.97,18.9s18.68-7.03,18.68-18.83v-32.54h-10.65ZM113.5,261.74c-4.83,0-8.1-3.48-8.1-8.52s3.27-8.53,8.1-8.53,8.1,3.48,8.1,8.53-3.27,8.52-8.1,8.52Z"/><path d="M172.45,244.93l-7.68,7.89c.43,2.3-.7,4.38-2.83,6.57-2.68,2.75-6.18,3.7-9.73,1.43l18.49-18.98-2.13-2.08c-7.64-7.44-18.54-7.45-26.27.49-7.74,7.94-7.59,18.99.04,26.43,7.64,7.43,18.69,7.29,26.42-.65,6.1-6.26,7.3-14.41,3.69-21.1ZM149.12,246.9c2.57-2.65,5.68-3.6,9.11-1.93l-10.7,10.99c-1.8-3.24-.99-6.42,1.59-9.06Z"/><path d="M200.35,252.86l14.28-17.19h-13.22l-11.15,14.78v-30.13h-10.66v50.45h10.66v-15.14l11.44,15.14h13.49l-14.84-17.91Z"/><path d="M205.4,29.69c0,.31-.01.63-.02.94-.28,5.39-2.89,10.18-6.85,13.36-.49.4-1,.77-1.53,1.11-.52.33-1.05.64-1.6.92-2.5,1.29-5.34,2.01-8.35,2.01s-5.8-.71-8.29-1.98c-.54-.27-1.08-.58-1.59-.91-.53-.34-1.05-.71-1.54-1.1-3.98-3.18-6.61-7.97-6.9-13.38-.02-.32-.02-.65-.02-.97,0-.3,0-.58.02-.87.03-.64.09-1.26.18-1.88,1.33-8.82,8.96-15.6,18.14-15.6s16.8,6.77,18.15,15.57c.08.62.15,1.24.18,1.88.01.3.02.6.02.9Z"/><path d="M183.79,64.08c-2.08.81-4.34,1.26-6.71,1.26-10.11,0-18.34-8.23-18.34-18.35,0-5.77,2.68-10.94,6.87-14.3.89,6.42,4.6,11.94,9.84,15.28.29,6.54,3.5,12.33,8.34,16.11Z"/><path d="M215.43,46.99c0,10.12-8.23,18.35-18.34,18.35-2.37,0-4.63-.45-6.71-1.26-.59-.24-1.15-.49-1.71-.78-.54-.29-1.07-.59-1.58-.93-4.29-2.8-7.34-7.34-8.14-12.6,2.5,1.01,5.24,1.57,8.1,1.57s5.66-.57,8.18-1.6c.6-.25,1.19-.52,1.76-.82.59-.3,1.17-.64,1.73-1,5.22-3.34,8.91-8.86,9.79-15.27,4.21,3.37,6.92,8.54,6.92,14.34Z"/></g></svg>';
const LOGO_MARK = '<svg class="logo-mark" viewBox="56 59 114.5 108.8" aria-hidden="true"><path d="M106.79,164.87c-4.16,1.62-8.68,2.52-13.42,2.52-20.22,0-36.68-16.46-36.68-36.7,0-11.54,5.36-21.88,13.74-28.6,1.78,12.84,9.2,23.88,19.68,30.56.58,13.08,7,24.66,16.68,32.22Z"/><path d="M170.08,130.69c0,20.24-16.46,36.7-36.68,36.7-4.74,0-9.26-.9-13.42-2.52-1.18-.48-2.3-.98-3.42-1.56-1.09-.58-2.14-1.18-3.16-1.86-8.59-5.6-14.69-14.68-16.29-25.2,5,2.02,10.48,3.14,16.2,3.14s11.33-1.14,16.37-3.2c1.2-.5,2.38-1.04,3.52-1.64,1.18-.6,2.34-1.28,3.46-2,10.44-6.68,17.82-17.72,19.58-30.54,8.42,6.74,13.84,17.08,13.84,28.68Z"/><path d="M150.02,96.09c0,.62-.02,1.26-.04,1.88-.56,10.78-5.78,20.36-13.7,26.72-.98.8-2,1.54-3.06,2.22-1.04.66-2.1,1.28-3.2,1.84-5,2.58-10.68,4.02-16.71,4.02s-11.6-1.42-16.58-3.96c-1.08-.54-2.16-1.16-3.18-1.82-1.06-.68-2.1-1.42-3.08-2.2-7.96-6.36-13.22-15.94-13.8-26.76-.04-.64-.04-1.3-.04-1.94,0-.6,0-1.16.04-1.74.06-1.28.18-2.52.36-3.76,2.66-17.65,17.92-31.21,36.28-31.21s33.61,13.55,36.31,31.15c.16,1.24.3,2.48.36,3.76.02.6.04,1.2.04,1.8Z"/></svg>';

function renderAuth(message = '', isError = false) {
  ctl.show(false);
  const signup = authMode === 'signup';
  $app.innerHTML = `
  <div class="lg-page">
    <header class="band lg-band">
      <div class="lg-logos">
        <span class="ln"></span><span class="sl"></span>
        <span class="lg-mark">${LOGO_MARK}${LOGO_WORD}</span>
        <span class="sl r"></span><span class="ln"></span>
      </div>
    </header>
    <main class="lg-main">
      <h1>${signup ? 'Registrieren' : 'Login'}</h1>
      <form id="auth-form" class="lg-form" novalidate>
        <div class="lbox">
          ${signup ? `<input id="f-name" name="name" placeholder="Name" autocomplete="name" required><hr>` : ''}
          <input id="f-email" name="email" type="email" placeholder="E-Mail" autocomplete="email" autocapitalize="off" required>
          <hr>
          <input id="f-pass" name="password" type="password" placeholder="Passwort" autocomplete="${signup ? 'new-password' : 'current-password'}" required>
        </div>
        <div class="lg-msg ${isError ? 'err' : ''}" role="status">${esc(message)}</div>
        <button class="lg-go" type="submit" aria-label="${signup ? 'Konto erstellen' : 'Anmelden'}">${ICON.arrow}</button>
      </form>
      <button class="lg-switch" data-mode="${signup ? 'login' : 'signup'}">${signup ? 'Zurück zum Login' : 'Noch kein Konto? Registrieren'}</button>
      ${window.__DEMO ? `<div class="lg-demo">
        <button class="tipl" id="demo-toggle" type="button">Demo-Zugänge</button>
        <div class="demo-list" id="demo-list" hidden>
          <button type="button" data-demo="simon@demo.at">Simon</button>
          <button type="button" data-demo="anna@demo.at">Anna</button>
        </div>
      </div>` : ''}
    </main>
    <footer class="band lg-ftr"></footer>
  </div>`;

  $app.querySelector('.lg-switch').addEventListener('click', (e) => { authMode = e.currentTarget.dataset.mode; renderAuth(); });
  $app.querySelector('#demo-toggle')?.addEventListener('click', () => { const l = $app.querySelector('#demo-list'); l.hidden = !l.hidden; });
  $app.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
    authMode = 'login';
    sb.auth.signInWithPassword({ email: b.dataset.demo, password: 'demo123' });
  }));
  $app.querySelector('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = String(f.get('email') || '').trim();
    const password = String(f.get('password') || '');
    const name = String(f.get('name') || '').trim();
    if (signup && !name) return renderAuth('Bitte gib deinen Namen ein.', true);
    if (!email || !email.includes('@')) return renderAuth('Bitte gib eine gültige E-Mail-Adresse ein.', true);
    if (password.length < 6) return renderAuth('Das Passwort braucht mindestens 6 Zeichen.', true);
    e.target.querySelector('.lg-go').disabled = true;
    if (signup) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
      if (error) return renderAuth(translateAuthError(error), true);
      if (!data.session) { authMode = 'login'; return renderAuth('Konto erstellt. Bitte bestätige den Link in deiner E-Mail und melde dich dann an.'); }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return renderAuth(translateAuthError(error), true);
    }
  });
}

function translateAuthError(e) {
  const m = (e.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-Mail oder Passwort falsch.';
  if (m.includes('not confirmed')) return 'Bitte zuerst die E-Mail bestätigen.';
  if (m.includes('already registered')) return 'Diese E-Mail ist schon registriert.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'Registrierung ist deaktiviert.';
  if (m.includes('password')) return 'Das Passwort braucht mindestens 6 Zeichen.';
  return e.message;
}

sb.auth.onAuthStateChange((event, session) => {
  const uid = session?.user?.id || null;
  if (uid === state.me) return;
  state.me = uid;
  if (uid) {
    $app.innerHTML = '<div class="center">Lädt …</div>';
    // ausserhalb des Auth-Callbacks starten (vermeidet Blockieren in supabase-js)
    setTimeout(() => { loadAll(); subscribe(); }, 0);
  } else {
    if (channel) sb.removeChannel(channel);
    channel = null;
    closeSheet();
    state.loaded = false;
    renderAuth();
  }
});

// ====================================================================
// Hauptansicht
// ====================================================================
const TABS = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'todos', label: 'Todos', icon: 'todos' },
  { key: 'notes', label: 'Notizen', icon: 'notes' },
];
let lastIndLeft = null;

function render() {
  if (!state.me || !state.loaded) return;
  if (render.hold) { render.pending = true; return; }
  // Eingabe im "Neues Todo"-Feld und Scrollposition bei Live-Updates behalten
  const typedMap = {};
  document.querySelectorAll('.addrow[data-list] input').forEach((i) => { if (i.value) typedMap[i.closest('form').dataset.list] = i.value; });
  const focusedList = document.activeElement?.closest?.('.addrow[data-list]')?.dataset.list;
  const prevScroll = document.querySelector('.main')?.scrollTop || 0;
  const sameTab = render.lastTab === state.tab;
  render.lastTab = state.tab;
  if (!sameTab && !state.keepList) state.list = null;
  state.keepList = false;

  const openTodos = state.items.filter((i) => i.type === 'todo' && !i.done).length;
  const noteCount = state.items.filter((i) => i.type === 'note').length;
  const badge = { home: 0, todos: openTodos, notes: noteCount };

  $app.innerHTML = `
  <div class="app">
    ${state.tab === 'home' ? '' : pageHead(state.tab)}
    <main class="main ${state.tab === 'home' ? 'is-home' : ''}">
      ${({ home: renderHome, todos: renderTodos, notes: renderNotes, categories: renderCategoryPage, meals: renderMeals, calendar: renderCalendar })[state.tab]?.() ?? renderHome()}
    </main>
  </div>`;
  ctl.show(true, state.tab === 'home' ? 'center' : null);

  if (sameTab) $app.querySelector('.main').scrollTop = prevScroll;
  for (const [k, v] of Object.entries(typedMap)) { const i = document.querySelector(`.addrow[data-list="${k}"] input`); if (i) i.value = v; }
  if (focusedList !== undefined) document.querySelector(`.addrow[data-list="${focusedList}"] input`)?.focus();
}


function renderStrip() {
  const chip = (key, label, color) =>
    `<button class="chip ${state.filter === key ? 'on' : ''}" data-filter="${esc(key)}">${color ? `<i style="background:${esc(color)}"></i>` : ''}${esc(label)}</button>`;
  const shared = state.categories.filter(isCatShared).length;
  return `<div class="strip">
    <div class="strip-head">
      <b>Kategorien</b>
      <small>${state.categories.length} gesamt${shared ? `, ${shared} gemeinsam` : ''}</small>
    </div>
    <div class="chips">
      ${chip('all', 'Alle')}
      ${state.categories.map((c) => chip(c.id, c.name, c.color)).join('')}
      ${chip('none', 'Ohne Kategorie')}
    </div>
    <button class="sbtn" data-act="categories" aria-label="Kategorien verwalten">${ICON.plus}</button>
  </div>`;
}

function filteredItems(type) {
  return state.items.filter((i) => {
    if (i.type !== type) return false;
    if (state.filter === 'all') return true;
    if (state.filter === 'none') return !i.category_id || !catById(i.category_id);
    return i.category_id === state.filter;
  });
}

function metaHtml(i, { showDue = false, hideCat = false } = {}) {
  const parts = [];
  if (showDue && i.due_date) {
    const d = dueLabel(i.due_date);
    parts.push(`<span class="due ${d.overdue && !i.done ? 'overdue' : ''}">${esc(d.text)}</span>`);
  }
  const c = catById(i.category_id);
  if (c && !hideCat && state.filter !== c.id) parts.push(`<span><i class="dot" style="background:${esc(c.color)}"></i>${esc(c.name)}</span>`);
  if (i.owner_id !== state.me) parts.push(`<span class="who">von ${esc(nameOf(i.owner_id))}</span>`);
  else if (isItemShared(i)) parts.push(`<span class="who">${ICON.share}geteilt</span>`);
  return parts.length ? `<div class="meta">${parts.join('')}</div>` : '';
}

function dueLabel(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d - today) / 86400000);
  let text;
  if (diff === 0) text = 'Heute';
  else if (diff === 1) text = 'Morgen';
  else if (diff === -1) text = 'Gestern';
  else text = d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  return { text, overdue: diff < 0 };
}

function tileHead(title, count, act, label) {
  return `<div class="th">
    <b>${title}</b>
    ${act ? `<button class="cbtn" data-act="${act}" aria-label="${label}">${ICON.plus}</button>` : ''}
    <span class="cnt ${count ? '' : 'zero'}">${count}</span>
  </div>`;
}

// Todos: zuerst die Ordner (Listen), geöffnet eine Liste groß mit Titeln, Tippen = Details
const todoLists = () => [
  ...state.categories.filter(isTodoList).map((c) => ({ id: c.id, name: c.name, color: c.color, shared: isCatShared(c) })),
  { id: '', name: 'Allgemein', color: null, shared: false },
];
const todosIn = (lid) => state.items.filter((i) => i.type === 'todo' && (lid ? i.category_id === lid : !i.category_id || !catById(i.category_id)));
const byDue = (a, b) => {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return b.created_at.localeCompare(a.created_at);
};

function renderTodos() {
  if (state.list !== null && (state.list === '' || catById(state.list))) return renderTodoList(state.list);
  state.list = null;
  const card = (l) => {
    const mine = todosIn(l.id);
    const open = mine.filter((i) => !i.done);
    const due = open.filter((i) => i.due_date && dueLabel(i.due_date).overdue).length;
    return `<button class="fcard" data-act="open-list" data-id="${l.id}" data-drop="${l.id}">
      <span class="fc-ic" style="--fc:${esc(l.color || '#9AABA6')}">${ICON.folder}</span>
      <span class="fc-n">${esc(l.name)}</span>
      <span class="fc-s">${open.length ? `${open.length} offen` : mine.length ? 'alles erledigt' : 'leer'}${due ? ` · <em>${due} überfällig</em>` : ''}</span>
      ${l.shared ? `<span class="fc-sh" title="gemeinsam">${ICON.share}</span>` : ''}
      <span class="fc-c ${open.length ? '' : 'zero'}">${open.length}</span>
    </button>`;
  };
  return `<div class="fgrid">${todoLists().map(card).join('')}
    <button class="fcard fnew" data-act="new-list"><span class="fc-ic">${ICON.plus}</span><span class="fc-n">Neue Liste</span></button>
  </div>`;
}

// Beim Ziehen erscheinen die anderen Ordner als Ablageziele
function dropTray(folders, current) {
  const others = folders.filter((f) => f.id !== current);
  if (!others.length) return '';
  return `<div class="droptray" aria-hidden="true">
    <div class="dt-h">Verschieben nach …</div>
    <div class="dt-list">${others.map((f) => `<div class="dt" data-drop="${f.id}"><span class="dt-ic" style="--fc:${esc(f.color || '#9AABA6')}">${ICON.folder}</span><span>${esc(f.name)}</span></div>`).join('')}</div>
  </div>`;
}

function renderTodoList(lid) {
  const mine = todosIn(lid);
  const open = mine.filter((i) => !i.done).sort(byDue);
  const done = mine.filter((i) => i.done).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const showDone = state.doneOpen.has(lid);
  const row = (i) => `
    <div class="trow ${i.done ? 'done' : ''}" data-drag="${i.id}">
      <button class="tcheck ${i.done ? 'on' : ''}" data-act="toggle" data-id="${i.id}" aria-label="${i.done ? 'Wieder öffnen' : 'Erledigt'}">${i.done ? ICON.check : ''}</button>
      <button class="tname" data-act="open" data-id="${i.id}">${i.icon ? `<span class="tic-in">${itemIcon(i)}</span>` : ''}<span>${esc(i.title) || '<span class="muted">Ohne Titel</span>'}</span></button>
      ${i.meta?.amount ? `<span class="kamt">${esc(i.meta.amount)}</span>` : ''}
      ${!i.done && i.remind_at && !i.reminded ? `<span class="tbell" title="Erinnerung">${ICON.bell}</span>` : ''}
      ${!i.done ? dueTag(i) : ''}
    </div>`;
  const rows = (list) => `<div class="trows">${list.map(row).join('')}</div>`;
  return `<section class="tbig" data-drop="${lid}">
    <form class="addrow tadd" data-list="${lid}"><span class="xic">${ICON.plus}</span><input name="title" placeholder="Neues Todo …" autocomplete="off" enterkeyhint="done"></form>
    ${open.length ? (open.some((i) => i.meta?.section) ? groupBySection(open, row).replaceAll('class="krows"', 'class="trows"') : rows(open)) : '<p class="kempty">Alles erledigt.</p>'}
    ${done.length ? `<button class="done-toggle" data-act="toggle-done" data-id="${lid}" aria-expanded="${showDone}">
      <span class="chev ${showDone ? 'open' : ''}">${ICON.chevron}</span>${done.length} erledigt</button>
      ${showDone ? rows(done) : ''}` : ''}
  </section>
  ${dropTray(todoLists(), lid)}
  <p class="hint xhint">Todo lange drücken, um es in eine andere Liste zu ziehen.</p>`;
}

function groupBySection(items, row) {
  const groups = new Map();
  [...items].sort((a, b) => sectionIndex(a.meta?.section) - sectionIndex(b.meta?.section) || a.title.localeCompare(b.title, 'de'))
    .forEach((i) => { const k = SECTIONS[sectionIndex(i.meta?.section)][0]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  return [...groups].map(([name, list]) => `<div class="sec">
      <div class="sec-h">${ICON[SECTIONS[sectionIndex(name)][1]]}<span>${esc(name)}</span><i>${list.length}</i></div>
      <div class="krows">${list.map(row).join('')}</div>
    </div>`).join('');
}

// Notizen: wie Todos – Ordner-Übersicht, geöffnet groß mit Titeln, Tippen = Notiz
const noteFolders = () => [
  ...state.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, shared: isCatShared(c) })),
  { id: '', name: 'Ohne Kategorie', color: null, shared: false },
];
// Reihenfolge: eigene Sortierung (meta.sort); neue, noch nicht sortierte Notizen oben
const noteKey = (n) => (typeof n.meta?.sort === 'number' ? n.meta.sort : -1e9);
const notesIn = (fid) => state.items.filter((i) => i.type === 'note' && (fid ? i.category_id === fid : !i.category_id || !catById(i.category_id)))
  .sort((a, b) => noteKey(a) - noteKey(b) || b.updated_at.localeCompare(a.updated_at));
// Blöcke: einzelne Notizen und Gruppen (meta.group), Gruppe steht an der Stelle ihres ersten Mitglieds
function noteBlocks(fid) {
  const list = notesIn(fid), seen = new Set(), out = [];
  for (const n of list) {
    const g = n.meta?.group;
    if (!g) { out.push({ note: n }); continue; }
    if (seen.has(g)) continue;
    seen.add(g);
    const items = list.filter((x) => x.meta?.group === g);
    out.push({ group: g, name: items.find((x) => x.meta?.gname)?.meta.gname || 'Gruppe', items });
  }
  return out;
}

function renderNotes() {
  if (state.list !== null && (state.list === '' || catById(state.list))) return renderNoteList(state.list);
  state.list = null;
  const card = (f) => {
    const list = notesIn(f.id);
    return `<button class="fcard" data-act="open-list" data-id="${f.id}">
      <span class="fc-ic" style="--fc:${esc(f.color || '#9AABA6')}">${ICON.folder}</span>
      <span class="fc-n">${esc(f.name)}</span>
      <span class="fc-s">${list.length ? `${list.length} ${list.length === 1 ? 'Notiz' : 'Notizen'}` : 'leer'}</span>
      ${f.shared ? `<span class="fc-sh" title="gemeinsam">${ICON.share}</span>` : ''}
      <span class="fc-c ${list.length ? '' : 'zero'}">${list.length}</span>
    </button>`;
  };
  return `<div class="fgrid">${noteFolders().map(card).join('')}
    <button class="fcard fnew" data-act="new-cat"><span class="fc-ic">${ICON.plus}</span><span class="fc-n">Neuer Ordner</span></button>
  </div>`;
}

function renderNoteList(fid) {
  const blocks = noteBlocks(fid);
  const row = (n) => `
    <div class="trow" data-drag="${n.id}" data-gid="${esc(n.meta?.group || '')}">
      <span class="nic ${n.icon ? 'has' : ''}">${itemIcon(n)}</span>
      <button class="tname" data-act="open" data-id="${n.id}"><span>${esc(n.title) || '<span class="muted">Ohne Titel</span>'}</span></button>
      ${n.remind_at && !n.reminded ? `<span class="tbell" title="Erinnerung">${ICON.bell}</span>` : ''}
      ${n.owner_id !== state.me ? `<span class="tby">${esc(nameOf(n.owner_id))}</span>` : ''}
    </div>`;
  const group = (b) => {
    const key = 'g:' + b.group, folded = state.folded.has(key);
    return `<div class="ngrp ${folded ? 'folded' : ''}">
      <div class="ngrp-h" data-ghead="${esc(b.group)}">
        <button class="xtoggle" data-act="fold" data-id="${esc(key)}" aria-label="${folded ? 'Aufklappen' : 'Zuklappen'}">${ICON.chevron}</button>
        <span class="ngrp-ic">${ICON.stack}</span>
        <button class="ngrp-n" data-act="group-edit" data-id="${esc(b.group)}" data-f="${fid}">${esc(b.name)}</button>
        <span class="ngrp-c">${b.items.length}</span>
      </div>
      ${folded ? '' : `<div class="ngrp-b">${b.items.map(row).join('')}</div>`}
    </div>`;
  };
  return `<section class="tbig" data-drop="${fid}">
    <button class="addrow tadd tnew" data-act="new-note-in" data-id="${fid}"><span class="xic">${ICON.plus}</span><span>Neue Notiz …</span></button>
    ${blocks.length ? `<div class="trows" data-sortable="${fid}">${blocks.map((b) => (b.group ? group(b) : row(b.note))).join('')}<div class="tend" data-end="1"></div></div>` : '<p class="kempty">Noch keine Notizen.</p>'}
  </section>
  ${dropTray(noteFolders(), fid)}
  ${blocks.length ? '<p class="hint xhint">Lange drücken und ziehen: nach oben oder unten verschieben, auf eine andere Notiz halten für eine Gruppe, unten in einen anderen Ordner.</p>' : ''}`;
}

// Neue Reihenfolge / Gruppen speichern (ein Render, Speichern im Hintergrund)
async function applyNoteOrder(fid, flat) {
  // flat: [{id, group}] in neuer Reihenfolge; Gruppen mit nur einer Notiz lösen sich auf
  const cnt = {}; flat.forEach((f) => { if (f.group) cnt[f.group] = (cnt[f.group] || 0) + 1; });
  const jobs = [];
  flat.forEach((f, idx) => {
    const n = itemById(f.id); if (!n) return;
    const group = f.group && cnt[f.group] > 1 ? f.group : null;
    const meta = { ...(n.meta || {}), sort: (idx + 1) * 10 };
    if (group) { meta.group = group; meta.gname = f.gname || meta.gname || 'Gruppe'; } else { delete meta.group; delete meta.gname; }
    if (JSON.stringify(meta) === JSON.stringify(n.meta || {})) return;
    n.meta = meta;
    jobs.push(sb.from('items').update({ meta }).eq('id', n.id));
  });
  render();
  const res = await Promise.all(jobs);
  const err = res.find((r) => r.error);
  if (err) toast('Speichern fehlgeschlagen: ' + err.error.message, 4000);
}
const flatOrder = (fid) => noteBlocks(fid).flatMap((b) => (b.group ? b.items.map((n) => ({ id: n.id, group: b.group, gname: b.name })) : [{ id: b.note.id, group: null }]));

function openGroupEdit(gid, fid) {
  const b = noteBlocks(fid).find((x) => x.group === gid);
  if (!b) return;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Gruppe</h2><button class="link-btn" data-close>Fertig</button></div>
    <div class="field"><label for="g-name">Name</label><input class="input" id="g-name" value="${esc(b.name)}" autocomplete="off"></div>
    <p class="hint">${b.items.length} Notizen: ${b.items.map((n) => esc(n.title || 'Ohne Titel')).join(', ')}</p>
    <div class="divider"></div>
    <button class="btn danger block" id="g-split">Gruppe auflösen</button>`, {
    onClose: () => {
      const v = sheet.querySelector('#g-name').value.trim() || 'Gruppe';
      if (v !== b.name) applyNoteOrder(fid, flatOrder(fid).map((f) => (f.group === gid ? { ...f, gname: v } : f)));
    },
  });
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('#g-split').addEventListener('click', () => {
    sheet.querySelector('#g-name').value = b.name;
    closeSheet();
    applyNoteOrder(fid, flatOrder(fid).map((f) => (f.group === gid ? { id: f.id, group: null } : f)));
    toast('Gruppe aufgelöst');
  });
}

// ---------- Kopfkachel (hängt am oberen Rand) ----------
function pageHead(tab) {
  const cfg = {
    todos: { title: 'Todos', act: 'new-list', label: 'Neue Liste', count: state.items.filter((i) => i.type === 'todo' && !i.done).length },
    notes: { title: 'Notizen', act: 'new-note', label: 'Neue Notiz', count: state.items.filter((i) => i.type === 'note').length },
    categories: { title: 'Kategorien', act: 'new-cat', label: 'Neue Kategorie', count: state.categories.length },
    meals: { title: 'Gerichte', act: 'import-plan', label: 'Wochenplan einfügen', count: state.items.filter((i) => i.type === 'meal' && i.due_date >= state.weekStart && i.due_date <= addDays(state.weekStart, 6)).length },
    calendar: { title: 'Kalender', act: 'week-today', label: 'Heute', count: 0, icon: 'calendar' },
  }[tab];
  if (!cfg) return '';
  if ((tab === 'todos' || tab === 'notes') && state.list !== null) {
    const c = catById(state.list);
    const n = tab === 'todos' ? todosIn(state.list).filter((i) => !i.done).length : notesIn(state.list).length;
    return `<header class="pagehead">
    <div class="ph-in">
      <button class="ph-back" data-act="close-list" aria-label="Zurück zu den Listen">${ICON.chevL}</button>
      ${c ? `<i class="ldot" style="background:${esc(c.color)}"></i>` : ''}
      <b class="ph-t">${esc(c ? c.name : tab === 'todos' ? 'Allgemein' : 'Ohne Kategorie')}</b>
      <span class="cnt ${n ? '' : 'zero'}">${n}</span>
      ${c ? `<button class="cbtn ph-add" data-act="list-edit" data-id="${c.id}" aria-label="Bearbeiten" title="Bearbeiten">${ICON.dots}</button>` : ''}
    </div>
  </header>`;
  }
  return `<header class="pagehead">
    <div class="ph-in">
      <b>${cfg.title}</b>
      <span class="cnt ${cfg.count ? '' : 'zero'}">${cfg.count}</span>
      <button class="cbtn ph-add" data-act="${cfg.act}" aria-label="${cfg.label}" title="${cfg.label}">${ICON[cfg.icon || 'plus']}</button>
    </div>
  </header>`;
}

// ---------- Listenansicht im Explorer-Stil ----------
const fmtShort = (iso) => {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: d.getFullYear() === now.getFullYear() ? undefined : '2-digit' });
};

// ---------- Wochenplan: Abteilungen, Mahlzeiten, Datum ----------
const SECTIONS = [
  ['Obst & Gemüse', 'leaf'], ['Brot & Backwaren', 'bread'], ['Kühlregal', 'milk'], ['Fleisch & Fisch', 'meat'],
  ['Tiefkühl', 'snow'], ['Trockenware & Konserven', 'jar'], ['Gewürze & Öle', 'spice'], ['Getränke', 'bottle'],
  ['Süßes & Snacks', 'candy'], ['Drogerie & Haushalt', 'spray'], ['Sonstiges', 'dots'],
];
const sectionIndex = (name) => { const i = SECTIONS.findIndex(([n]) => n === name); return i < 0 ? SECTIONS.length - 1 : i; };
const SLOTS = [['fruehstueck', 'Frühstück'], ['mittag', 'Mittag'], ['abend', 'Abend']];
const slotLabel = (k) => (SLOTS.find(([s]) => s === k) || [k, k])[1];
const SHOP_NAME = 'Wocheneinkauf';
const shopCat = () => state.categories.find((c) => c.name.trim().toLowerCase() === SHOP_NAME.toLowerCase());
const ymd = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
const isoWeek = (s) => { const d = parseYmd(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7); };
const dayName = (s, o = { weekday: 'long' }) => parseYmd(s).toLocaleDateString('de-AT', o);

// Vorgefertigte Symbole für Notizen und Todos
const ITEM_ICONS = [
  ['bulb', 'Idee'], ['star', 'Wichtig'], ['flag', 'Ziel'], ['alert', 'Achtung'], ['work', 'Arbeit'], ['home', 'Zuhause'],
  ['cart', 'Einkauf'], ['money', 'Geld'], ['phone', 'Anrufen'], ['car', 'Auto'], ['plane', 'Reise'], ['pin', 'Ort'],
  ['gift', 'Geschenk'], ['heart', 'Persönlich'], ['dumbbell', 'Training'], ['book', 'Lesen'], ['paw', 'Tier'], ['calendar', 'Termin'],
];
const itemIcon = (i) => (i.icon && ICON[i.icon] ? ICON[i.icon] : i.type === 'note' ? ICON.notes : '');
const remindLabel = (iso) => {
  const d = new Date(iso), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86400000);
  const t = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  return (diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : d.toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })) + ' ' + t;
};
const remindTag = (i) => i.remind_at && !i.reminded && !i.done
  ? `<span class="kbell" title="Erinnerung ${esc(remindLabel(i.remind_at))}">${ICON.bell}<span>${esc(remindLabel(i.remind_at))}</span></span>` : '';

// Kompakte Zeile in Kacheln: etwas luftiger als die Liste, aber gleiche Infos
const dueTag = (i) => {
  if (!i.due_date) return '';
  const d = dueLabel(i.due_date);
  return `<span class="kdue ${d.overdue && !i.done ? 'overdue' : ''}">${esc(d.text)}</span>`;
};
const krow = (i) => `
  <div class="krow ${i.done ? 'done' : ''}" data-drag="${i.id}">
    ${i.type === 'todo'
      ? `<button class="xcheck ${i.done ? 'on' : ''}" data-act="toggle" data-id="${i.id}" aria-label="${i.done ? 'Wieder öffnen' : 'Erledigt'}">${i.done ? ICON.check : ''}</button>`
      : `<span class="xic ${i.icon ? 'has' : ''}">${itemIcon(i)}</span>`}
    <button class="kname" data-act="open" data-id="${i.id}">${i.type === 'todo' && i.icon ? `<span class="tic-in">${itemIcon(i)}</span>` : ''}${esc(i.title) || '<span class="muted">Ohne Titel</span>'}</button>
    ${i.meta?.amount ? `<span class="kamt">${esc(i.meta.amount)}</span>` : ''}
    ${remindTag(i)}
    ${i.type === 'todo' ? dueTag(i) : ''}
    ${!i.meta?.section && (i.owner_id !== state.me || isItemShared(i)) ? `<span class="kshare" title="${i.owner_id !== state.me ? 'von ' + esc(nameOf(i.owner_id)) : 'geteilt'}">${ICON.share}</span>` : ''}
  </div>`;

function explorer(tab, folders) {

  const pool = state.items.filter((i) => (tab === 'todos' ? i.type === 'todo' : tab === 'notes' ? i.type === 'note' : i.type !== 'meal'));
  const inFolder = (f) => pool
    .filter((i) => (f.id ? i.category_id === f.id : !i.category_id || !catById(i.category_id)))
    .sort((a, b) => (a.type === 'todo' && b.type === 'todo' && a.done !== b.done) ? (a.done ? 1 : -1) : b.updated_at.localeCompare(a.updated_at));

  const col2 = (i) => { const d = dueLabel(i.due_date); return `<span class="${d.overdue && !i.done ? 'overdue' : ''}">${esc(d.text)}</span>`; };

  const row = (i) => `
    <div class="nrow xr ${i.done ? 'done' : ''}" data-note="${i.id}" data-drag="${i.id}">
      ${i.type === 'todo'
        ? `<button class="xcheck ${i.done ? 'on' : ''}" data-act="toggle" data-id="${i.id}" aria-label="${i.done ? 'Wieder öffnen' : 'Erledigt'}">${i.done ? ICON.check : ''}</button>`
        : `<span class="xic ${i.icon ? 'has' : ''}">${itemIcon(i)}</span>`}
      <button class="xname" data-act="open" data-id="${i.id}">${i.type === 'todo' && i.icon ? `<span class="tic-in">${itemIcon(i)}</span>` : ''}${esc(i.title) || '<span class="muted">Ohne Titel</span>'}</button>
      <span class="xc2">${i.meta?.amount ? `<span class="kamt">${esc(i.meta.amount)}</span>` : ''}${remindTag(i)}${i.type === 'todo' && i.due_date ? col2(i) : ''}</span>
      <span class="grip" data-grip="${i.id}" aria-label="Verschieben" role="button" tabindex="0">${ICON.grip}</span>
    </div>`;

  const folder = (f) => {
    const items = inFolder(f);
    const key = tab + ':' + f.id;
    const folded = state.folded.has(key);
    const open = items.filter((i) => i.type !== 'todo' || !i.done).length;
    return `<div class="ngroup xf ${folded ? 'folded' : ''}" data-drop="${f.id}">
      <div class="xfh">
        <button class="xtoggle" data-act="fold" data-id="${esc(key)}" aria-expanded="${!folded}" aria-label="${folded ? 'Aufklappen' : 'Zuklappen'}">${ICON.chevron}</button>
        <span class="xfolder" style="--fc:${esc(f.color || '#9AABA6')}">${ICON.folder}</span>
        <button class="xfname" data-act="fold" data-id="${esc(key)}">${esc(f.name)}</button>
        ${f.shared ? `<span class="xshared" title="gemeinsam">${ICON.share}</span>` : ''}
        <span class="xcount">${tab === 'todos' ? `${open} offen` : `${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}`}</span>
        ${tab === 'notes' ? `<button class="xadd" data-act="new-note-in" data-id="${f.id}" aria-label="Neue Notiz in ${esc(f.name)}">${ICON.plus}</button>` : ''}
        ${tileToggle(tab, f.id, false).replace('class="vtog"', 'class="xadd vtog"')}
        ${f.id ? `<button class="xadd" data-act="list-edit" data-id="${f.id}" aria-label="${esc(f.name)} bearbeiten">${ICON.dots}</button>` : '<span class="xadd-sp"></span>'}
      </div>
      ${folded ? '' : `<div class="xbody">
        ${items.map(row).join('')}
        ${tab === 'todos' ? `<form class="addrow xaddrow" data-list="${f.id}"><span class="xic">${ICON.plus}</span><input name="title" placeholder="Neues Todo …" autocomplete="off" enterkeyhint="done"></form>` : ''}
        ${!items.length && tab !== 'todos' ? '<p class="ng-empty">Leer. Hierher ziehen.</p>' : ''}
      </div>`}
    </div>`;
  };

  return `<section class="xpl">
    <div class="xhead">Liste</div>
    ${folders.map(folder).join('')}
  </section>`;
}

// ---------- Verschieben: Eintrag lange drücken (oder am Griff ziehen) und auf einen Ordner ziehen ----------
(() => {
  const HOLD = 380, SLOP = 8;
  let press = null, drag = null, swallowClick = false;
  const scroller = () => document.querySelector('.main');
  const dropAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop]');

  const begin = (p) => {
    // Falls inzwischen neu gezeichnet wurde: aktuelles Element suchen
    const el = p.el.isConnected ? p.el : document.querySelector(`[data-drag="${p.el.dataset.drag}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-drag');
    const gw = Math.min(r.width, 270);   // kompakter Geist, schwebt über dem Finger
    ghost.style.width = gw + 'px';
    ghost.style.left = r.left + 'px';
    ghost.style.top = r.top + 'px';
    document.body.appendChild(ghost);
    el.classList.add('dragging');
    document.body.classList.add('is-dragging');
    render.hold = true;   // während des Ziehens nicht neu zeichnen
    const sortable = el.closest('[data-sortable]');
    drag = { id: el.dataset.drag, el, ghost, dx: Math.min(p.x - r.left, gw - 30), dy: r.height + 14, from: el.closest('[data-drop]')?.dataset.drop ?? '', over: null, y: p.y, x: p.x, raf: 0,
      sortable, ins: null, merge: null, mergeT: 0, mergeCand: null };
    navigator.vibrate?.(12);
    const loop = () => {
      if (!drag) return;
      const m = scroller(); const mr = m.getBoundingClientRect();
      if (drag.over?.classList.contains('dt')) { /* über dem Ablagefeld nicht scrollen */ }
      else if (drag.y < mr.top + 70) m.scrollTop -= 12;
      else if (drag.y > mr.bottom - 70) m.scrollTop += 12;
      move(drag.x, drag.y);
      drag.raf = requestAnimationFrame(loop);
    };
    drag.raf = requestAnimationFrame(loop);
  };
  const move = (x, y) => {
    drag.x = x; drag.y = y;
    drag.ghost.style.left = (x - drag.dx) + 'px';
    drag.ghost.style.top = (y - drag.dy) + 'px';
    const g = dropAt(x, y);
    if (g !== drag.over) {
      drag.over?.classList.remove('over');
      drag.over = g;
      if (g && g.dataset.drop !== drag.from) g.classList.add('over');
    }
    if (drag.sortable) sortMove(x, y);
  };
  // Innerhalb einer Notizliste: Einfügestelle (oben/unten) oder Gruppe bilden (in der Mitte halten)
  const MERGE_HOLD = 550;
  const clearMarks = () => {
    drag.ins?.el.classList.remove('ins-before', 'ins-after');
    drag.ins = null;
  };
  const setMerge = (el) => {
    if (drag.merge === el) return;
    drag.merge?.classList.remove('merge');
    drag.merge = el;
    if (el) { el.classList.add('merge'); navigator.vibrate?.(8); }
  };
  const sortMove = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    const inList = hit && drag.sortable.contains(hit);
    const t = inList ? hit.closest('.trow[data-drag], .ngrp-h, .tend') : null;
    if (!t || t === drag.el) {
      clearMarks(); setMerge(null); clearTimeout(drag.mergeT); drag.mergeCand = null;
      return;
    }
    const r = t.getBoundingClientRect();
    const rel = (y - r.top) / r.height;
    const center = !t.classList.contains('tend') && rel > 0.28 && rel < 0.72;
    if (center) {
      clearMarks();
      if (drag.mergeCand !== t) {
        clearTimeout(drag.mergeT); setMerge(null); drag.mergeCand = t;
        drag.mergeT = setTimeout(() => { if (drag && drag.mergeCand === t) setMerge(t); }, MERGE_HOLD);
      }
      return;
    }
    clearTimeout(drag.mergeT); drag.mergeCand = null; setMerge(null);
    const after = t.classList.contains('tend') ? false : rel >= 0.5;
    if (drag.ins?.el === t && drag.ins.after === after) return;
    clearMarks();
    drag.ins = { el: t, after };
    t.classList.add(after ? 'ins-after' : 'ins-before');
  };
  const sortFinish = (d) => {
    const fid = d.sortable.dataset.sortable;
    const flat = flatOrder(fid);
    const me = flat.find((f) => f.id === d.id);
    if (!me) return false;
    const rest = flat.filter((f) => f.id !== d.id);
    const idxOf = (id) => rest.findIndex((f) => f.id === id);
    if (d.merge) {
      const m = d.merge;
      if (m.classList.contains('ngrp-h')) {           // auf Gruppenkopf: ans Ende der Gruppe
        const gid = m.dataset.ghead;
        const last = rest.map((f) => f.group).lastIndexOf(gid);
        const gname = rest.find((f) => f.group === gid)?.gname;
        rest.splice(last + 1, 0, { id: d.id, group: gid, gname });
      } else {
        const tid = m.dataset.drag, ti = idxOf(tid), tf = rest[ti];
        let gid = tf.group, gname = tf.gname;
        if (!gid) { gid = 'g' + Date.now().toString(36); gname = 'Gruppe'; rest[ti] = { ...tf, group: gid, gname }; }
        rest.splice(ti + 1, 0, { id: d.id, group: gid, gname });
      }
      applyNoteOrder(fid, rest);
      toast('Gruppe gebildet – Namen antippen zum Umbenennen');
      return true;
    }
    if (!d.ins) return false;
    const { el, after } = d.ins;
    let at, group = null, gname;
    if (el.classList.contains('tend')) at = rest.length;
    else if (el.classList.contains('ngrp-h')) {        // vor/nach einem Gruppenkopf
      const gid = el.dataset.ghead;
      const first = rest.findIndex((f) => f.group === gid);
      if (after) { at = first; group = gid; gname = rest[first]?.gname; }   // als erste Notiz in die Gruppe
      else at = first;                                                       // vor die Gruppe
    } else {
      const ti = idxOf(el.dataset.drag), tf = rest[ti];
      at = after ? ti + 1 : ti;
      if (tf.group) {
        const firstOfGroup = rest.findIndex((f) => f.group === tf.group) === ti;
        if (after || !firstOfGroup) { group = tf.group; gname = tf.gname; }
      }
    }
    rest.splice(at, 0, { id: d.id, group, gname });
    const changed = rest.some((f, i) => f.id !== flat[i].id || (f.group || null) !== (flat[i].group || null));
    if (changed) applyNoteOrder(fid, rest);
    return changed;
  };
  const finish = async (cancel) => {
    const d = drag; drag = null;
    render.hold = false;
    const redo = render.pending; render.pending = false;
    if (redo) setTimeout(render, 0);
    cancelAnimationFrame(d.raf);
    document.body.classList.remove('is-dragging');
    d.over?.classList.remove('over');
    d.el.classList.remove('dragging');
    clearTimeout(d.mergeT);
    d.merge?.classList.remove('merge');
    d.ins?.el.classList.remove('ins-before', 'ins-after');
    const target = !cancel && d.over ? d.over.dataset.drop : null;
    if (!cancel && d.sortable && !d.over?.classList.contains('dt') && sortFinish(d)) { d.ghost.remove(); return; }
    if (target === null || target === d.from) {
      d.ghost.classList.add('back');
      const r = d.el.getBoundingClientRect();
      d.ghost.style.left = r.left + 'px'; d.ghost.style.top = r.top + 'px';
      setTimeout(() => d.ghost.remove(), 220);
      return;
    }
    d.ghost.remove();
    const { error } = await saveItem(d.id, { category_id: target || null });
    if (!error) {
      const c = catById(target);
      toast(c ? `Nach „${c.name}“ verschoben` : 'Kategorie entfernt');
      document.querySelector(`[data-drag="${d.id}"]`)?.classList.add('landed');
    }
  };

  $app.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = e.target.closest('[data-drag]');
    if (!el || e.target.closest('.check, .xcheck, .tcheck, input')) return;
    const p = { el, x: e.clientX, y: e.clientY, id: e.pointerId, t: 0 };
    if (e.target.closest('[data-grip]')) { e.preventDefault(); press = p; return begin(p); }
    p.t = setTimeout(() => { if (press === p) begin(p); }, HOLD);
    press = p;
    el.classList.add('pressing');
  });
  document.addEventListener('pointermove', (e) => {
    if (drag) { e.preventDefault(); return move(e.clientX, e.clientY); }
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) {   // bewegt = scrollen, kein Verschieben
      clearTimeout(press.t); press.el.classList.remove('pressing'); press = null;
    }
  }, { passive: false });
  const up = (cancel) => () => {
    if (press) { clearTimeout(press.t); press.el.classList.remove('pressing'); press = null; }
    if (drag) { swallowClick = true; setTimeout(() => (swallowClick = false), 60); finish(cancel); }
  };
  document.addEventListener('pointerup', up(false));
  document.addEventListener('pointercancel', up(true));
  // Während des Ziehens nicht scrollen lassen (iPhone) und kein Kontextmenü
  document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  $app.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-drag]')) e.preventDefault(); });
  document.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);

  // Tastatur: Griff fokussieren, Pfeil hoch/runter wechselt den Ordner
  $app.addEventListener('keydown', async (e) => {
    const grip = e.target.closest?.('[data-grip]');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const order = [...state.categories.map((c) => c.id), ''];
    const n = itemById(grip.dataset.grip);
    const cur = order.indexOf(n.category_id && catById(n.category_id) ? n.category_id : '');
    const next = order[(cur + (e.key === 'ArrowDown' ? 1 : -1) + order.length) % order.length];
    await saveItem(n.id, { category_id: next || null });
    document.querySelector(`[data-grip="${n.id}"]`)?.focus();
  });
})();

function renderCategoryPage() {
  const cats = state.categories;
  const uncategorized = state.items.filter((i) => (!i.category_id || !catById(i.category_id)) && i.type !== 'meal');
  const itemLine = (i) => `<button class="use-item ${i.done ? 'done' : ''}" data-act="open" data-id="${i.id}" data-drag="${i.id}">
      <span class="ui-ic">${i.type === 'todo' ? (i.done ? ICON.check : '<i class="ui-ring"></i>') : ICON.notes}</span>
      <span class="ui-t">${esc(i.title) || 'Ohne Titel'}</span>
      ${i.owner_id !== state.me ? `<small>${esc(nameOf(i.owner_id))}</small>` : ''}
    </button>`;
  const block = (label, items, max = 4) => items.length ? `<div class="use-block"><div class="use-h">${label}<span>${items.length}</span></div>
      ${items.slice(0, max).map(itemLine).join('')}${items.length > max ? `<p class="use-more">+ ${items.length - max} weitere</p>` : ''}</div>` : '';
  const tile = (c) => {
    const items = state.items.filter((i) => i.category_id === c.id && i.type !== 'meal');
    const todosOpen = items.filter((i) => i.type === 'todo' && !i.done);
    const todosDone = items.filter((i) => i.type === 'todo' && i.done);
    const notes = items.filter((i) => i.type === 'note');
    const mine = c.owner_id === state.me;
    const people = (mine ? membersOf(c.id) : [c.owner_id, ...membersOf(c.id).filter((u) => u !== state.me)]).map(nameOf);
    const where = [isTodoList(c) ? 'Todo-Liste' : null, notes.length ? 'Notizen' : null].filter(Boolean);
    return `<section class="tile ctile" data-drop="${c.id}">
      <div class="th">
        <i class="ldot" style="background:${esc(c.color)}"></i>
        <b>${esc(c.name)}</b>
        <span class="th-sp"></span>
        ${tileToggle('categories', c.id, true)}
        <button class="lgear" data-act="list-edit" data-id="${c.id}" aria-label="Kategorie bearbeiten">${ICON.dots}</button>
        <span class="cnt ${items.length ? '' : 'zero'}">${items.length}</span>
      </div>
      <div class="use-tags">
        ${where.map((w) => `<span class="utag">${w}</span>`).join('')}
        <span class="utag light">${people.length ? `${mine ? 'gemeinsam mit' : 'von'} ${esc(people.join(', '))}` : 'privat'}</span>
      </div>
      ${items.length ? `<div class="use-cols">
        ${block('Offene Todos', todosOpen)}
        ${block('Notizen', notes)}
        ${block('Erledigt', todosDone, 2)}
      </div>` : '<p class="empty">Wird noch nirgends verwendet.</p>'}
    </section>`;
  };
  const tileOf = (f) => f.id ? tile(catById(f.id)) : `<section class="tile ctile" data-drop="">
      <div class="th"><i class="ldot none"></i><b>Ohne Kategorie</b><span class="th-sp"></span>${tileToggle('categories', '', true)}<span class="cnt light">${uncategorized.length}</span></div>
      ${uncategorized.length ? `<div class="use-cols">
        ${block('Todos (Allgemein)', uncategorized.filter((i) => i.type === 'todo' && !i.done))}
        ${block('Notizen', uncategorized.filter((i) => i.type === 'note'))}
      </div>` : '<p class="ng-empty">Leer.</p>'}
    </section>`;
  const folders = [
    ...cats.map((c) => ({ id: c.id, name: c.name, color: c.color, shared: isCatShared(c) })),
    { id: '', name: 'Ohne Kategorie', color: null, shared: false },
  ];
  return mixed('categories', folders, tileOf);
}

function weekNav() {
  const ws = state.weekStart, we = addDays(ws, 6);
  const isNow = ws === mondayOf(new Date());
  const f = (s, o) => parseYmd(s).toLocaleDateString('de-AT', o);
  return `<div class="weeknav">
    <button class="wn-b" data-act="week-prev" aria-label="Vorige Woche">${ICON.chevL}</button>
    <div class="wn-t"><b>KW ${isoWeek(ws)}</b><span>${f(ws, { day: 'numeric', month: 'short' })} – ${f(we, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
    ${isNow ? '<span class="wn-now">diese Woche</span>' : '<button class="chip" data-act="week-today">Heute</button>'}
    <button class="wn-b" data-act="week-next" aria-label="Nächste Woche">${ICON.chevR}</button>
  </div>`;
}

const mealsOn = (day) => state.items.filter((i) => i.type === 'meal' && i.due_date === day)
  .sort((a, b) => SLOTS.findIndex(([k]) => k === a.meta?.slot) - SLOTS.findIndex(([k]) => k === b.meta?.slot));
const cookOn = (day) => state.items.filter((i) => i.type === 'meal' && i.meta?.cook_date === day && i.due_date !== day);

function mealRow(m, { compact = false } = {}) {
  const n = m.meta?.nutrition || {};
  const pre = m.meta?.cook_date && m.meta.cook_date !== m.due_date;
  return `<button class="mrow slot-${esc(m.meta?.slot || '')}" data-act="open" data-id="${m.id}">
    <span class="m-slot">${esc(slotLabel(m.meta?.slot))}</span>
    <span class="m-main">
      <b>${m.icon && ICON[m.icon] ? `<span class="tic-in">${ICON[m.icon]}</span>` : ''}${esc(m.title)}</b>
      ${compact ? '' : `<span class="m-tags">
        ${(m.meta?.tags || []).slice(0, 3).map((t) => `<i>${esc(t)}</i>`).join('')}
        ${pre ? `<i class="pre">${ICON.pot} vorgekocht ${esc(dayName(m.meta.cook_date, { weekday: 'short' }))}</i>` : ''}
      </span>`}
    </span>
    ${n.kcal ? `<span class="m-kcal">${Math.round(n.kcal)}<small>kcal</small></span>` : ''}
  </button>`;
}

function renderMeals() {
  const days = Array.from({ length: 7 }, (_, k) => addDays(state.weekStart, k));
  const today = ymd(new Date());
  const weekMeals = days.flatMap(mealsOn);
  const cat = shopCat();
  const openShop = cat ? state.items.filter((i) => i.type === 'todo' && i.category_id === cat.id && !i.done).length : 0;
  const lunches = weekMeals.filter((m) => m.meta?.slot === 'mittag');
  const kcal = lunches.map((m) => m.meta?.nutrition?.kcal).filter(Boolean);
  const summary = `<section class="tile wsum">
      ${weekNav()}
      <div class="wsum-row">
        <div><b>${lunches.length}</b><span>Mittagessen</span></div>
        <div><b>${weekMeals.length - lunches.length}</b><span>Frühstück / Abend</span></div>
        <div><b>${kcal.length ? Math.round(kcal.reduce((a, b) => a + b, 0) / kcal.length) : '–'}</b><span>kcal Mittag Ø</span></div>
      </div>
      <div class="wsum-act">
        ${cat ? `<button class="btn secondary" data-act="goto-shop">${ICON.cart} Wocheneinkauf · ${openShop} offen</button>` : ''}
        <button class="btn" data-act="import-plan">${ICON.plus} Wochenplan einfügen</button>
      </div>
    </section>`;
  if (!weekMeals.length) {
    return summary + `<section class="tile"><p class="empty">Für diese Woche ist noch nichts geplant. Lass dir mit dem Skill „Wochenplan“ einen Plan erstellen und füge den Code hier ein.</p>
      ${window.__DEMO ? '<button class="btn block" data-act="demo-plan">Beispielwoche laden</button>' : ''}</section>`;
  }
  return summary + `<div class="tgrid days">${days.map((d) => {
    const list = mealsOn(d), cook = cookOn(d);
    if (!list.length && !cook.length) return `<section class="tile day empty-day"><div class="th"><b>${esc(dayName(d))}</b><small class="dd">${esc(dayName(d, { day: 'numeric', month: 'numeric' }))}</small></div><p class="kempty">Nichts geplant.</p></section>`;
    return `<section class="tile day ${d === today ? 'today' : ''}">
      <div class="th"><b>${esc(dayName(d))}</b><small class="dd">${esc(dayName(d, { day: 'numeric', month: 'numeric' }))}</small>${d === today ? '<span class="utag">Heute</span>' : ''}</div>
      ${cook.length ? `<div class="cook">${ICON.pot}<span>Heute auch vorkochen: <b>${cook.map((m) => `${esc(m.title)} (${esc(dayName(m.due_date, { weekday: 'short' }))})`).join(', ')}</b></span></div>` : ''}
      <div class="mrows">${list.map((m) => mealRow(m)).join('')}</div>
    </section>`;
  }).join('')}</div>`;
}

function renderCalendar() {
  const days = Array.from({ length: 7 }, (_, k) => addDays(state.weekStart, k));
  const today = ymd(new Date());
  const remindOn = (d) => state.items.filter((i) => i.remind_at && !i.done && ymd(new Date(i.remind_at)) === d);
  return `<section class="tile wsum">${weekNav()}</section>
  <div class="tgrid days">${days.map((d) => {
    const meals = mealsOn(d), cook = cookOn(d);
    const todos = state.items.filter((i) => i.type === 'todo' && i.due_date === d);
    const rem = remindOn(d).filter((i) => !todos.includes(i));
    const any = meals.length || cook.length || todos.length || rem.length;
    return `<section class="tile day ${d === today ? 'today' : ''} ${any ? '' : 'empty-day'}">
      <div class="th"><b>${esc(dayName(d))}</b><small class="dd">${esc(dayName(d, { day: 'numeric', month: 'numeric' }))}</small>${d === today ? '<span class="utag">Heute</span>' : ''}</div>
      ${!any ? '<p class="kempty">Nichts geplant.</p>' : ''}
      ${meals.length ? `<div class="cal-h">${ICON.fork}Essen</div><div class="mrows">${meals.map((m) => mealRow(m, { compact: true })).join('')}</div>` : ''}
      ${cook.length ? `<div class="cook">${ICON.pot}<span>Vorkochen: <b>${cook.map((m) => esc(m.title)).join(', ')}</b></span></div>` : ''}
      ${todos.length ? `<div class="cal-h">${ICON.todos}Todos</div><div class="krows">${todos.map(krow).join('')}</div>` : ''}
      ${rem.length ? `<div class="cal-h">${ICON.bell}Erinnerungen</div><div class="krows">${rem.map(krow).join('')}</div>` : ''}
    </section>`;
  }).join('')}</div>`;
}

// ---------- Gericht ansehen ----------
function openMeal(id) {
  const m = itemById(id);
  if (!m) return;
  const meta = m.meta || {};
  const n = meta.nutrition || {};
  const pre = meta.cook_date && meta.cook_date !== m.due_date;
  const sheet = openSheet(`
    <div class="sheet-head"><span class="status">${esc(slotLabel(meta.slot))} · ${esc(dayName(m.due_date, { weekday: 'long', day: 'numeric', month: 'long' }))}</span><button class="link-btn" data-close>Fertig</button></div>
    <div class="title-row"><span class="icon-pick has">${m.icon && ICON[m.icon] ? ICON[m.icon] : ICON.pot}</span><textarea class="title-input m-title" id="m-title" rows="2">${esc(m.title)}</textarea></div>
    <div class="m-badges">
      ${(meta.tags || []).map((t) => `<span class="utag light">${esc(t)}</span>`).join('')}
      ${meta.minutes ? `<span class="utag light">${ICON.clock} ${esc(meta.minutes)} Min.</span>` : ''}
      ${meta.servings ? `<span class="utag light">${esc(meta.servings)} Portionen</span>` : ''}
      ${pre ? `<span class="utag">${ICON.pot} vorkochen am ${esc(dayName(meta.cook_date, { weekday: 'long' }))}</span>` : ''}
    </div>
    ${n.kcal || n.protein || n.fat || n.carbs ? `<div class="nutri">
      <div><b>${n.kcal ? Math.round(n.kcal) : '–'}</b><span>kcal</span></div>
      <div><b>${n.protein != null ? Math.round(n.protein) + ' g' : '–'}</b><span>Eiweiß</span></div>
      <div><b>${n.fat != null ? Math.round(n.fat) + ' g' : '–'}</b><span>Fett</span></div>
      <div><b>${n.carbs != null ? Math.round(n.carbs) + ' g' : '–'}</b><span>Kohlenh.</span></div>
    </div><p class="hint">Schätzwerte pro Portion.</p>` : ''}
    ${(meta.ingredients || []).length ? `<div class="field"><label>Zutaten${meta.servings ? ` für ${esc(meta.servings)} Portionen` : ''}</label><ul class="ing">${meta.ingredients.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${(meta.steps || []).length ? `<div class="field"><label>Zubereitung</label><ol class="steps">${meta.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
    ${meta.note ? `<div class="field"><label>Hinweis</label><p class="m-note">${esc(meta.note)}</p></div>` : ''}
    <div class="row-inline" style="margin-bottom:14px">
      <div class="field" style="flex:1;margin:0"><label>Essen am</label><input class="input" type="date" id="m-date" value="${esc(m.due_date || '')}"></div>
      <div class="field" style="flex:1;margin:0"><label>Kochen am</label><input class="input" type="date" id="m-cook" value="${esc(meta.cook_date || m.due_date || '')}"></div>
    </div>
    ${canDeleteItem(m) ? '<button class="btn danger block" id="m-delete">Gericht entfernen</button>' : ''}`, { onClose: () => saveTitle.flush() });
  const saveTitle = debounce(() => { const v = sheet.querySelector('#m-title')?.value; if (v != null && v !== itemById(id)?.title) saveItem(id, { title: v }); }, 600);
  sheet.querySelector('#m-title').addEventListener('input', saveTitle);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('#m-date').addEventListener('change', (e) => { if (e.target.value) saveItem(id, { due_date: e.target.value }); });
  sheet.querySelector('#m-cook').addEventListener('change', (e) => saveItem(id, { meta: { ...(itemById(id).meta || {}), cook_date: e.target.value || null } }));
  sheet.querySelector('#m-delete')?.addEventListener('click', async () => { if (await deleteItem(id)) closeSheet(); });
}

// ---------- Wochenplan einfügen ----------
function parsePlan(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Kein Wochenplan-Code gefunden. Bitte den ganzen Code aus dem Chat einfügen.');
  let plan;
  try { plan = JSON.parse(text.slice(a, b + 1)); } catch { throw new Error('Der Code ist unvollständig oder beschädigt. Bitte noch einmal komplett kopieren.'); }
  if (!Array.isArray(plan.gerichte) && !Array.isArray(plan.einkauf)) throw new Error('Im Code fehlen Gerichte und Einkaufsliste.');
  return plan;
}

function openImport() {
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Wochenplan einfügen</h2><button class="link-btn" data-close>Fertig</button></div>
    <p class="hint" style="margin:0 2px 12px">Den Code, den dir Claude mit dem Skill „Wochenplan“ gibt, hier komplett einfügen.</p>
    <textarea class="textarea" id="imp-text" rows="7" placeholder="WOCHENPLAN { … }"></textarea>
    <div id="imp-preview"></div>
    <div class="row-inline" style="margin-top:12px">
      ${window.__DEMO ? '<button class="btn secondary" id="imp-demo" type="button">Beispiel</button>' : ''}
      <button class="btn" id="imp-go" type="button" style="flex:1" disabled>Übernehmen</button>
    </div>`);
  const $t = sheet.querySelector('#imp-text'), $p = sheet.querySelector('#imp-preview'), $go = sheet.querySelector('#imp-go');
  let plan = null;
  const check = () => {
    plan = null; $go.disabled = true;
    if (!$t.value.trim()) { $p.innerHTML = ''; return; }
    try {
      plan = parsePlan($t.value);
      const g = plan.gerichte || [], e = plan.einkauf || [];
      const dates = g.map((x) => x.datum).filter(Boolean).sort();
      $p.innerHTML = `<div class="imp-ok">${ICON.check}<div><b>${g.length} Gerichte, ${e.length} Einkäufe</b>
        <small>${dates.length ? `${esc(dayName(dates[0], { weekday: 'short', day: 'numeric', month: 'numeric' }))} bis ${esc(dayName(dates[dates.length - 1], { weekday: 'short', day: 'numeric', month: 'numeric' }))}` : ''}</small>
        <small>Abgehakte Einkäufe werden gelöscht, offene bleiben. Gerichte an denselben Tagen und Mahlzeiten werden ersetzt.</small></div></div>`;
      $go.disabled = false;
    } catch (err) { $p.innerHTML = `<div class="imp-err">${esc(err.message)}</div>`; }
  };
  $t.addEventListener('input', check);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('#imp-demo')?.addEventListener('click', () => { $t.value = JSON.stringify(window.__DEMO_PLAN(), null, 1); check(); });
  $go.addEventListener('click', async () => {
    if (!plan) return;
    $go.disabled = true; $go.textContent = 'Übernehme …';
    try {
      const r = await importPlan(plan);
      closeSheet();
      if (r.firstDate) state.weekStart = mondayOf(parseYmd(r.firstDate));
      state.tab = 'meals'; render();
      toast(`${r.meals} Gerichte und ${r.added} Einkäufe übernommen${r.merged ? `, ${r.merged} zusammengeführt` : ''}`, 4000);
    } catch (err) { toast('Fehler: ' + err.message, 5000); $go.disabled = false; $go.textContent = 'Übernehmen'; }
  });
  setTimeout(() => $t.focus(), 60);
}

async function importPlan(plan) {
  const gerichte = (plan.gerichte || []).filter((g) => g && g.datum && g.titel);
  const einkauf = (plan.einkauf || []).filter((e) => e && e.name);

  // 1. Kategorie "Wocheneinkauf" sicherstellen (Liste, als Kachel)
  let cat = shopCat();
  if (!cat) {
    const { data, error } = await sb.from('categories').insert({ name: SHOP_NAME, color: '#7FA08A', todo_list: true }).select().single();
    if (error) throw error;
    state.categories.push(data); cat = data;
    toast('Kategorie „Wocheneinkauf“ angelegt. Teile sie unter Kategorien mit deiner Freundin.', 5000);
  } else if (!cat.todo_list && cat.owner_id === state.me) {
    await sb.from('categories').update({ todo_list: true }).eq('id', cat.id); cat.todo_list = true;
  }
  if (!isTile('todos', cat.id)) toggleTile('todos', cat.id);

  // 2. Abgehakte Einkäufe löschen
  for (const i of state.items.filter((x) => x.type === 'todo' && x.category_id === cat.id && x.done)) {
    await sb.from('items').delete().eq('id', i.id);
  }

  // 3. Gerichte: gleiche Tage + Mahlzeit ersetzen, dann neu anlegen
  for (const g of gerichte) {
    const slot = g.mahlzeit || 'mittag';
    for (const old of state.items.filter((x) => x.type === 'meal' && x.due_date === g.datum && x.meta?.slot === slot)) {
      await sb.from('items').delete().eq('id', old.id);
    }
  }
  const mealRows = gerichte.map((g) => {
    const ing = (g.zutaten || []).map(String), steps = (g.zubereitung || []).map(String);
    const nv = g.naehrwerte || {};
    return {
      type: 'meal', title: String(g.titel).slice(0, 140), category_id: cat.id, due_date: g.datum, icon: ICON[g.symbol] ? g.symbol : null,
      body: [ing.length ? 'Zutaten:\n' + ing.map((x) => '- ' + x).join('\n') : '', steps.length ? 'Zubereitung:\n' + steps.map((x, k) => `${k + 1}. ${x}`).join('\n') : ''].filter(Boolean).join('\n\n'),
      meta: {
        slot: g.mahlzeit || 'mittag', cook_date: g.kochen_am || g.datum, servings: g.portionen || null, minutes: g.dauer_min || null,
        tags: (g.tags || []).map(String).slice(0, 6), ingredients: ing, steps, note: g.hinweis || '',
        nutrition: { kcal: nv.kcal ?? null, protein: nv.eiweiss ?? null, fat: nv.fett ?? null, carbs: nv.kohlenhydrate ?? null },
      },
    };
  });
  if (mealRows.length) { const { error } = await sb.from('items').insert(mealRows); if (error) throw error; }

  // 4. Einkauf: gleiche offene Artikel zusammenführen, Rest neu
  const openByName = new Map(state.items.filter((x) => x.type === 'todo' && x.category_id === cat.id && !x.done).map((x) => [x.title.trim().toLowerCase(), x]));
  const newRows = []; let merged = 0;
  for (const e of einkauf) {
    const key = String(e.name).trim().toLowerCase();
    const meta = { amount: e.menge || '', section: SECTIONS.some(([n]) => n === e.abteilung) ? e.abteilung : 'Sonstiges', for: e.fuer || '' };
    const ex = openByName.get(key);
    if (ex) {
      merged++;
      const amount = [ex.meta?.amount, meta.amount].filter(Boolean).join(' + ');
      await sb.from('items').update({ meta: { ...(ex.meta || {}), ...meta, amount } }).eq('id', ex.id);
    } else newRows.push({ type: 'todo', title: String(e.name).slice(0, 120), category_id: cat.id, meta });
  }
  if (newRows.length) { const { error } = await sb.from('items').insert(newRows); if (error) throw error; }

  await loadAll();
  return { meals: mealRows.length, added: newRows.length, merged, firstDate: gerichte.map((g) => g.datum).sort()[0] };
}

const HOME_BTNS = [
  { key: 'settings', label: 'Einstellungen', icon: 'gear' },
  { key: 'logout', label: 'Abmelden', icon: 'power' },
];

function renderHome() {
  const d = new Date();
  return `
  <div class="home">
    <header class="home-head">
      <div class="home-day"><b>${d.toLocaleDateString('de-AT', { weekday: 'long' })}</b><span>${d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
    </header>
    <div class="bookmark">${LOGO_PORTRAIT}</div>
    <div class="home-plate" aria-hidden="true"><i></i><i></i></div>
    <div class="home-foot">
      ${HOME_BTNS.map((b) => `<button class="hb ${b.key === 'logout' ? 'out' : ''}" data-home="${b.key}" aria-label="${b.label}">
        <span class="hb-c">${ICON[b.icon]}</span><span class="hb-l">${b.label}</span>
      </button>`).join('')}
    </div>
  </div>`;
}

async function homeAction(k) {
  const b = HOME_BTNS.find((x) => x.key === k);
  if (!b) return;
  if (k === 'settings') return openSettings();
  if (k === 'logout') { if (await askConfirm('Abmelden?', 'Abmelden')) sb.auth.signOut(); return; }
  state.tab = k;
  render();
  document.querySelector('.main')?.scrollTo({ top: 0 });
}

// ====================================================================
// Steuerknopf: tippen = Home (auf Home: neue Notiz), halten = Steuerrad, ziehen = verschieben
// Auf der Home-Seite sitzt er groß in der Mitte und lässt sich nicht verschieben.
// ====================================================================
const WHEEL = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'todos', label: 'Todos', icon: 'todos' },
  { key: 'notes', label: 'Notizen', icon: 'notes' },
  { key: 'meals', label: 'Gerichte', icon: 'pot' },
  { key: 'calendar', label: 'Kalender', icon: 'calendar' },
  { key: 'training', label: 'Training', icon: 'dumbbell', soon: true },
  { key: 'quick', label: 'Neue Notiz', icon: 'notePlus' },
  { key: 'categories', label: 'Kategorien', icon: 'tag' },
];

const ctl = (() => {
  const R = 160;          // Radius des Rads
  const SPAN = 100;       // Öffnungswinkel in Grad
  const HOLD = 280;       // ms still halten bis zum Wackeln
  const WOBBLE = 380;     // ms Wackeln bis das Rad aufgeht
  const MOVE = 8;         // px Bewegung = Verschieben statt Menü
  const SIZE = 64, EDGE = 12;
  const POS_KEY = 'uebersicht-ctl-pos';

  const el = document.createElement('div');
  el.className = 'ctl';
  el.hidden = true;
  el.innerHTML = `
    <div class="ctl-veil"></div>
    <div class="ctl-label" aria-live="polite"></div>
    ${WHEEL.map((w, i) => `<button class="wi ${w.soon ? 'soon' : ''}" data-go="${w.key}" style="--d:${i * 28}ms" tabindex="-1" aria-label="${w.label}">${ICON[w.icon]}</button>`).join('')}
    <div class="ctl-burst">${Array.from({ length: 10 }, (_, i) => `<i style="--a:${i * 36}deg"></i>`).join('')}</div>
    <button class="ctl-btn" aria-label="Steuerung: tippen für Home, gedrückt halten für Auswahl, ziehen zum Verschieben">${LOGO_MARK}</button>`;
  document.body.appendChild(el);

  const btn = el.querySelector('.ctl-btn');
  const label = el.querySelector('.ctl-label');
  const items = [...el.querySelectorAll('.wi')];
  let pos = [];
  let holdT = 0, wobT = 0, mode = 'idle', hovered = null, start = null, origin = null;
  let anchorEl = null;   // 'center' auf der Home-Seite: Knopf groß in der Bildschirmmitte
  let active = WHEEL;    // aktuell sichtbare Ziele

  // ---- Position (verschiebbar, wird im Browser gemerkt) ----
  const vw = () => document.documentElement.clientWidth;
  const vh = () => document.documentElement.clientHeight;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  let place = (() => {
    try { const p = JSON.parse(localStorage.getItem(POS_KEY)); if (p && isFinite(p.fx) && isFinite(p.fy)) return p; } catch {}
    return null;
  })();
  const applyPos = () => {
    el.classList.toggle('big', !!anchorEl);
    if (anchorEl) {
      el.style.left = (vw() / 2 - el.offsetWidth / 2) + 'px';
      el.style.top = (vh() / 2 - el.offsetHeight / 2) + 'px';
      return;
    }
    const insetB = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
    let x, y;
    if (place) { x = place.fx * vw() - SIZE / 2; y = place.fy * vh() - SIZE / 2; }
    else { x = vw() - SIZE - 20; y = vh() - SIZE - 120 - insetB; }   // Standard: rechts, etwas höher
    x = clamp(x, EDGE, vw() - SIZE - EDGE);
    y = clamp(y, EDGE, vh() - SIZE - EDGE);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  };
  const savePos = () => {
    const r = el.getBoundingClientRect();
    place = { fx: (r.left + SIZE / 2) / vw(), fy: (r.top + SIZE / 2) / vh() };
    try { localStorage.setItem(POS_KEY, JSON.stringify(place)); } catch {}
  };
  window.addEventListener('resize', applyPos);

  // ---- Rad: öffnet Richtung Bildschirmmitte ----
  const layout = () => {
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const base = anchorEl ? 90 : Math.atan2(vh() / 2 - cy, vw() / 2 - cx) * 180 / Math.PI;
    const span = anchorEl ? 170 : SPAN;
    active = anchorEl ? WHEEL.filter((w) => w.key !== 'home') : WHEEL;
    items.forEach((b) => { b.hidden = !active.some((w) => w.key === b.dataset.go); });
    const arc = (d) => active.map((w, i) => {
      const a = (d - span / 2 + i * span / (active.length - 1)) * Math.PI / 180;
      const rr = anchorEl ? Math.min(R, vw() / 2 - 44) : R;
      return { x: Math.round(rr * Math.cos(a)), y: Math.round(rr * Math.sin(a)) };
    });
    // Rad so weit drehen, bis alle Ziele auf dem Bildschirm liegen
    const fits = (p) => p.every(({ x, y }) => cx + x > 30 && cx + x < vw() - 30 && cy + y > 30 && cy + y < vh() - 30);
    let dir = base;
    for (let k = 0; k <= 36; k++) {
      const cand = [base + k * 5, base - k * 5].find((d) => fits(arc(d)));
      if (cand !== undefined) { dir = cand; break; }
    }
    pos = arc(dir);
    active.forEach((w, i) => { const b = items.find((x) => x.dataset.go === w.key); b.style.setProperty('--x', pos[i].x + 'px'); b.style.setProperty('--y', pos[i].y + 'px'); });
    // Hinweis: auf Home unter dem Knopf, sonst oben in der Bildschirmmitte
    label.style.top = anchorEl ? Math.round(r.top - 62) + 'px' : '';
  };

  const setHover = (k) => {
    if (hovered === k) return;
    hovered = k;
    items.forEach((b) => b.classList.toggle('hot', b.dataset.go === k));
    const w = WHEEL.find((x) => x.key === k);
    label.textContent = w ? (w.soon ? `${w.label} (bald)` : w.label) : (anchorEl ? '' : 'Ziehen oder tippen');
    el.classList.toggle('has-hot', !!w);
    if (k) navigator.vibrate?.(8);
  };
  const open = () => {
    mode = 'open';
    layout();
    el.classList.remove('wobble');
    el.classList.add('open', 'burst');
    setTimeout(() => el.classList.remove('burst'), 520);
    hovered = undefined;
    setHover(null);
    navigator.vibrate?.(14);
  };
  const close = () => {
    el.classList.remove('wobble', 'burst', 'drag', 'pulse');
    if (anchorEl) { mode = 'pinned'; setHover(null); return; }   // Home: Bereiche bleiben stehen
    mode = 'idle';
    el.classList.remove('open', 'pinned');
    setHover(null);
  };
  const pin = (first) => {
    mode = 'pinned';
    layout();
    el.classList.add('open', 'pinned');
    if (first) { el.classList.add('burst'); setTimeout(() => el.classList.remove('burst'), 520); }
    hovered = undefined;
    setHover(null);
  };

  // Kreis wird größer und deckt die neue Seite auf
  const reveal = (fn) => {
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !$app.animate) return fn();
    const ghost = $app.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.className = 'reveal-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(ghost, $app);
    el.classList.add('revealing');
    $app.classList.add('revealing');
    fn();
    const far = Math.hypot(Math.max(cx, vw() - cx), Math.max(cy, vh() - cy)) + 20;
    const start0 = Math.max(r.width / 2, 20);
    $app.animate(
      [{ clipPath: `circle(${start0}px at ${cx}px ${cy}px)` }, { clipPath: `circle(${far}px at ${cx}px ${cy}px)` }],
      { duration: 560, easing: 'cubic-bezier(.65,0,.25,1)' }
    ).finished.finally(() => {
      ghost.remove();
      $app.classList.remove('revealing');
      el.classList.remove('revealing');
    });
  };
  const go = (k) => {
    close();
    const w = WHEEL.find((x) => x.key === k);
    if (!w) return;
    if (w.soon) return toast(`${w.label} kommt als Nächstes.`);
    if (k === 'quick') return openQuickNote();
    closeSheet();
    if (state.tab === k && (k === 'todos' || k === 'notes') && state.list !== null) { state.list = null; return render(); }
    if (state.tab === k) return;
    reveal(() => {
      state.tab = k;
      render();
      document.querySelector('.main')?.scrollTo({ top: 0 });
    });
  };
  const nearest = (e) => {
    const r = btn.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    let best = null, bd = 1e9;
    pos.forEach((p, i) => { const d = Math.hypot(dx - p.x, dy - p.y); if (d < bd) { bd = d; best = active[i].key; } });
    return bd < 40 ? best : null;
  };
  const stopTimers = () => { clearTimeout(holdT); clearTimeout(wobT); };

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (mode === 'open') return;
    try { btn.setPointerCapture(e.pointerId); } catch {}
    start = { x: e.clientX, y: e.clientY };
    if (anchorEl) { mode = 'press'; return; }          // Home: Bereiche stehen schon, kein Halten nötig
    mode = 'press';
    const r = el.getBoundingClientRect();
    origin = { x: r.left, y: r.top };
    holdT = setTimeout(() => {
      mode = 'wobble';
      el.classList.add('wobble');
      wobT = setTimeout(open, WOBBLE);
    }, HOLD);
  });
  btn.addEventListener('pointermove', (e) => {
    if (mode === 'open' || (anchorEl && mode === 'press')) return setHover(nearest(e));
    if (mode === 'press' && !anchorEl && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE) {
      stopTimers();                    // gleich bewegt -> verschieben, kein Menü
      mode = 'drag';
      el.classList.add('drag');
    }
    if (mode === 'drag') {
      el.style.left = clamp(origin.x + e.clientX - start.x, EDGE, vw() - SIZE - EDGE) + 'px';
      el.style.top = clamp(origin.y + e.clientY - start.y, EDGE, vh() - SIZE - EDGE) + 'px';
    }
  });
  btn.addEventListener('pointerup', (e) => {
    stopTimers();
    if (mode === 'press' && anchorEl) {
      const k = nearest(e);
      if (k) return go(k);
      mode = 'pinned';
      el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
      return;
    }
    if (mode === 'press') { close(); return go('home'); }
    if (mode === 'drag') { savePos(); close(); return; }
    if (mode === 'wobble') { close(); return; }
    if (mode === 'open') { const k = nearest(e); if (k) go(k); else label.textContent = 'Ziel antippen'; }
  });
  btn.addEventListener('pointercancel', () => { stopTimers(); if (mode === 'drag') savePos(); if (mode !== 'open') close(); });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (!anchorEl) go('home'); }
    if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); open(); items[0].focus(); }
  });
  btn.addEventListener('click', (e) => e.preventDefault());
  items.forEach((b) => {
    b.addEventListener('click', () => go(b.dataset.go));
    const on = () => mode === 'open' || mode === 'pinned';
    b.addEventListener('pointerenter', () => { if (on()) setHover(b.dataset.go); });
    b.addEventListener('pointerleave', () => { if (on()) setHover(null); });
    b.addEventListener('focus', () => { if (on()) setHover(b.dataset.go); });
    b.addEventListener('blur', () => { if (on()) setHover(null); });
  });
  el.querySelector('.ctl-veil').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode === 'open') close(); });

  document.fonts?.ready.then(() => { if (!el.hidden) applyPos(); });
  document.addEventListener('scroll', () => { if (anchorEl && !el.hidden) applyPos(); }, true);
  return {
    show: (v, anchor = null) => {
      const wasPinned = el.classList.contains('pinned');
      anchorEl = v ? anchor : null;
      el.hidden = !v;
      if (!v) return close();
      applyPos();
      if (anchorEl) pin(!wasPinned); else close();
    },
  };
})();

// Klicks in der Hauptansicht
$app.addEventListener('click', async (e) => {
  const hb = e.target.closest('[data-home]');
  if (hb) return homeAction(hb.dataset.home);
  const t = e.target.closest('[data-act],[data-tab],[data-filter]');
  if (!t) return;
  if (t.dataset.tab) {
    if (t.dataset.tab === state.tab) { document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    state.tab = t.dataset.tab; store('tab', state.tab); render(); return;
  }
  if (t.dataset.filter) { state.filter = t.dataset.filter; render(); return; }
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case 'toggle': toggleTodo(id); break;
    case 'group-edit': openGroupEdit(id, t.dataset.f); break;
    case 'open-list': state.list = id || ''; render(); document.querySelector('.main')?.scrollTo({ top: 0 }); break;
    case 'close-list': state.list = null; render(); break;
    case 'open': openItem(id); break;
    case 'toggle-done': state.doneOpen.has(id || '') ? state.doneOpen.delete(id || '') : state.doneOpen.add(id || ''); render(); break;
    case 'new-list': openNewList(); break;
    case 'import-plan': openImport(); break;
    case 'week-prev': state.weekStart = addDays(state.weekStart, -7); render(); break;
    case 'week-next': state.weekStart = addDays(state.weekStart, 7); render(); break;
    case 'week-today': state.weekStart = mondayOf(new Date()); render(); break;
    case 'goto-shop': state.tab = 'todos'; state.keepList = true; state.list = shopCat()?.id ?? null; render(); break;
    case 'demo-plan': importPlan(window.__DEMO_PLAN()).then((r) => { render(); toast(`${r.meals} Gerichte und ${r.added} Einkäufe übernommen`); }); break;
    case 'tile-toggle': toggleTile(t.dataset.tt, id); break;
    case 'fold': state.folded.has(id) ? state.folded.delete(id) : state.folded.add(id); render(); break;
    case 'new-note-in': createNote(id || null); break;
    case 'new-cat': openNewList({ mode: 'category' }); break;
    case 'list-edit': openCategory(id); break;
    case 'new-note': createNote(); break;
    case 'menu': state.tab = 'home'; render(); break;
    case 'categories': openCategories(); break;
    case 'home': state.filter = 'all'; render(); document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'logout': if (await askConfirm('Abmelden?', 'Abmelden')) sb.auth.signOut(); break;
  }
});

$app.addEventListener('submit', async (e) => {
  const form = e.target.closest('.addrow[data-list]');
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector('input');
  const title = input.value.trim();
  if (!title) return;
  input.value = '';
  const category_id = form.dataset.list || null;
  const { data, error } = await sb.from('items').insert({ type: 'todo', title, category_id }).select().single();
  if (error) { toast('Fehler: ' + error.message); input.value = title; return; }
  state.items.unshift(data);
  render();
  document.querySelector(`.addrow[data-list="${form.dataset.list}"] input`)?.focus();
});

// ====================================================================
// Aktionen
// ====================================================================
async function toggleTodo(id) {
  const i = itemById(id);
  if (!i) return;
  i.done = !i.done;
  i.updated_at = new Date().toISOString();
  render();
  const { error } = await sb.from('items').update({ done: i.done }).eq('id', id);
  if (error) { i.done = !i.done; render(); toast('Fehler: ' + error.message); }
}

async function createNote(cat) {
  const category_id = cat !== undefined ? cat : (state.filter !== 'all' && state.filter !== 'none' ? state.filter : null);
  const { data, error } = await sb.from('items').insert({ type: 'note', title: '', category_id }).select().single();
  if (error) return toast('Fehler: ' + error.message);
  state.items.unshift(data);
  render();
  openItem(data.id, { isNew: true });
}

async function saveItem(id, patch) {
  const i = itemById(id);
  if (!i) return { error: { message: 'Eintrag nicht gefunden' } };
  Object.assign(i, patch, { updated_at: new Date().toISOString() });
  render();
  const { error } = await sb.from('items').update(patch).eq('id', id);
  if (error) toast('Speichern fehlgeschlagen: ' + error.message, 4000);
  return { error };
}

async function deleteItem(id) {
  const i = itemById(id);
  if (!i || !(await askConfirm(i.type === 'note' ? 'Notiz löschen?' : 'Todo löschen?', 'Löschen'))) return false;
  const { error } = await sb.from('items').delete().eq('id', id);
  if (error) { toast('Fehler: ' + error.message); return false; }
  state.items = state.items.filter((x) => x.id !== id);
  render();
  return true;
}

// ====================================================================
// Sheets (Overlays)
// ====================================================================
let onSheetClose = null;

function openSheet(html, { full = false, onClose = null } = {}) {
  closeSheet();
  onSheetClose = onClose;
  $sheetRoot.innerHTML = `<div class="backdrop"><div class="sheet ${full ? 'full' : ''}">${html}</div></div>`;
  const bd = $sheetRoot.querySelector('.backdrop');
  bd.addEventListener('click', (e) => { if (e.target === bd) closeSheet(); });
  document.body.style.overflow = 'hidden';
  return $sheetRoot.querySelector('.sheet');
}

function closeSheet() {
  if (onSheetClose) { const f = onSheetClose; onSheetClose = null; f(); }
  $sheetRoot.innerHTML = '';
  document.body.style.overflow = '';
}

function categoryOptions(selected) {
  return `<option value="">Ohne Kategorie</option>` + state.categories.map((c) =>
    `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}${isCatShared(c) ? ' (gemeinsam)' : ''}</option>`).join('');
}

// ---------- Todo / Notiz öffnen ----------
function openItem(id, { isNew = false } = {}) {
  const i = itemById(id);
  if (!i) return;
  if (i.type === 'meal') return openMeal(id);
  const isNote = i.type === 'note';
  const mine = i.owner_id === state.me;

  const sheet = openSheet(`
    <div class="sheet-head">
      <span class="status" id="save-status"></span>
      <button class="link-btn" data-close>Fertig</button>
    </div>
    <div class="title-row">
      <button class="icon-pick ${i.icon ? 'has' : ''}" id="f-icon-btn" type="button" aria-label="Symbol wählen" aria-expanded="false">${i.icon ? itemIcon(i) : ICON.plus}</button>
      <input class="title-input" id="f-title" placeholder="${isNote ? 'Titel' : 'Todo'}" value="${esc(i.title)}">
    </div>
    <div class="icon-grid" id="f-icons" hidden>
      <button type="button" class="ig ${!i.icon ? 'on' : ''}" data-icon="" aria-label="Kein Symbol"><span class="ig-none"></span></button>
      ${ITEM_ICONS.map(([k, l]) => `<button type="button" class="ig ${i.icon === k ? 'on' : ''}" data-icon="${k}" aria-label="${l}" title="${l}">${ICON[k]}</button>`).join('')}
    </div>
    ${isNote
      ? `<textarea class="note-body" id="f-body" placeholder="Notiz …">${esc(i.body)}</textarea>`
      : `<div class="field" style="margin-top:12px"><label>Notiz</label><textarea class="textarea" id="f-body" style="min-height:90px" placeholder="Details (optional)">${esc(i.body)}</textarea></div>
         <div class="field"><label>Fällig am</label><input class="input" type="date" id="f-due" value="${esc(i.due_date || '')}"></div>`}
    <div class="field" ${isNote ? 'style="margin-top:12px"' : ''}><label>Kategorie</label><select class="select" id="f-cat">${categoryOptions(i.category_id)}</select></div>
    <div class="field"><label>Erinnerung</label>
      <div class="row-inline">
        <input class="input" type="datetime-local" id="f-remind" value="${i.remind_at ? esc(toLocalInput(i.remind_at)) : ''}">
        <button class="btn secondary" type="button" id="f-remind-clear" ${i.remind_at ? '' : 'hidden'}>Entfernen</button>
      </div>
      <div class="remind-quick">
        ${[['in 1 Std.', 60], ['Heute 18:00', 'today18'], ['Morgen 8:00', 'tom8']].map(([l, v]) => `<button type="button" class="chip" data-remind="${v}">${l}</button>`).join('')}
      </div>
      <div class="hint" id="f-remind-hint">${remindHint(i)}</div>
    </div>
    <div class="field"><label>Geteilt</label><div id="share-area"></div></div>
    ${canDeleteItem(i) ? `<button class="btn danger block" id="f-delete">${isNote ? 'Notiz' : 'Todo'} löschen</button>` : ''}
  `, { full: isNote, onClose: () => { saveText.flush(); if (isNew && !itemById(id)?.title && !itemById(id)?.body) silentDelete(id); } });

  const $status = sheet.querySelector('#save-status');
  const $title = sheet.querySelector('#f-title');
  const $body = sheet.querySelector('#f-body');

  const saveText = debounce(async () => {
    const cur = itemById(id);
    if (!cur) return;
    const patch = {};
    if ($title.value !== cur.title) patch.title = $title.value;
    if ($body.value !== cur.body) patch.body = $body.value;
    if (!Object.keys(patch).length) return;
    $status.textContent = 'Speichert …';
    const { error } = await saveItem(id, patch);
    if ($status.isConnected) $status.textContent = error ? 'Nicht gespeichert' : 'Gespeichert';
  }, 600);

  $title.addEventListener('input', saveText);
  $body.addEventListener('input', saveText);
  sheet.querySelector('#f-due')?.addEventListener('change', (e) => saveItem(id, { due_date: e.target.value || null }));
  // Symbol
  const $iconBtn = sheet.querySelector('#f-icon-btn'), $icons = sheet.querySelector('#f-icons');
  $iconBtn.addEventListener('click', () => { $icons.hidden = !$icons.hidden; $iconBtn.setAttribute('aria-expanded', String(!$icons.hidden)); });
  $icons.querySelectorAll('[data-icon]').forEach((b) => b.addEventListener('click', async () => {
    const icon = b.dataset.icon || null;
    $icons.querySelectorAll('.ig').forEach((x) => x.classList.toggle('on', x === b));
    $iconBtn.innerHTML = icon ? ICON[icon] : ICON.plus;
    $iconBtn.classList.toggle('has', !!icon);
    $icons.hidden = true;
    await saveItem(id, { icon });
  }));
  // Erinnerung
  const $remind = sheet.querySelector('#f-remind'), $rClear = sheet.querySelector('#f-remind-clear'), $rHint = sheet.querySelector('#f-remind-hint');
  const setRemind = async (date) => {
    const iso = date ? date.toISOString() : null;
    $remind.value = date ? toLocalInput(iso) : '';
    $rClear.hidden = !date;
    await saveItem(id, { remind_at: iso, reminded: false });
    $rHint.innerHTML = remindHint(itemById(id));
    if (date && !pushOn() && !pushSupport()) toast('Tipp: In den Einstellungen Mitteilungen aktivieren, dann kommt die Erinnerung auch bei geschlossener App.', 5000);
  };
  $remind.addEventListener('change', () => setRemind($remind.value ? new Date($remind.value) : null));
  $rClear.addEventListener('click', () => setRemind(null));
  sheet.querySelectorAll('[data-remind]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.remind, d = new Date();
    if (v === 'today18') { d.setHours(18, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); }
    else if (v === 'tom8') { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); }
    else d.setMinutes(d.getMinutes() + Number(v), 0, 0);
    setRemind(d);
  }));
  sheet.querySelector('#f-cat').addEventListener('change', (e) => {
    saveItem(id, { category_id: e.target.value || null }).then(() => renderShareArea(sheet, id));
  });
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('#f-delete')?.addEventListener('click', async () => {
    saveText.flush = () => {};
    if (await deleteItem(id)) { isNew = false; closeSheet(); }
  });

  renderShareArea(sheet, id);
  if (isNew || (!isNote && !i.title)) setTimeout(() => $title.focus(), 50);
}

// ---------- Push-Mitteilungen ----------
const pushOn = () => store('push') === 'on';
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function pushSupport() {
  if (window.__DEMO) return 'In der Vorschau nicht verfügbar. Funktioniert in der installierten App.';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios && !isStandalone()) return 'Am iPhone zuerst über Teilen → „Zum Home-Bildschirm“ installieren und die App von dort öffnen.';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'Dieser Browser unterstützt keine Push-Mitteilungen.';
  if (!cfg.VAPID_PUBLIC_KEY) return 'Push ist noch nicht eingerichtet (VAPID_PUBLIC_KEY fehlt in config.js).';
  return '';
}
async function enablePush() {
  const why = pushSupport();
  if (why) { toast(why, 5000); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Mitteilungen wurden nicht erlaubt. Das lässt sich in den Geräte-Einstellungen ändern.', 5000); return false; }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.VAPID_PUBLIC_KEY) }));
  const j = sub.toJSON();
  await sb.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
  const { error } = await sb.from('push_subscriptions').insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
  if (error) { toast('Fehler: ' + error.message, 5000); return false; }
  store('push', 'on');
  toast('Mitteilungen aktiviert');
  return true;
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  } catch {}
  store('push', 'off');
  toast('Mitteilungen ausgeschaltet');
}

// ---------- Erinnerungen ----------
function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function remindHint(i) {
  if (!i?.remind_at) return 'Optional. Die App erinnert dich zur gewählten Zeit.';
  if (pushOn()) return `Erinnerung ${esc(remindLabel(i.remind_at))}, als Mitteilung auf deinen Geräten.`;
  if (!('Notification' in window)) return `Erinnerung ${esc(remindLabel(i.remind_at))}. Auf diesem Gerät erscheint sie als Hinweis in der App.`;
  if (Notification.permission === 'denied') return `Erinnerung ${esc(remindLabel(i.remind_at))}. Benachrichtigungen sind blockiert, sie erscheint als Hinweis in der App.`;
  return `Erinnerung ${esc(remindLabel(i.remind_at))}.`;
}
function askNotifyPermission() {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch {}
}
async function fireReminder(i) {
  const title = i.title || (i.type === 'note' ? 'Notiz' : 'Todo');
  const body = i.type === 'note' ? (i.body || '').slice(0, 120) : 'Erinnerung zu deinem Todo';
  let shown = false;
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'item-' + i.id, data: { id: i.id } });
      else new Notification(title, { body, icon: 'icons/icon-192.png' });
      shown = true;
    }
  } catch {}
  if (!shown || document.visibilityState === 'visible') showReminderBanner(i);
  saveItem(i.id, { reminded: true });
}
function showReminderBanner(i) {
  const el = document.createElement('div');
  el.className = 'rbanner';
  el.innerHTML = `<span class="rb-ic">${ICON.bell}</span><span class="rb-t"><b>${esc(i.title || 'Erinnerung')}</b><small>Erinnerung</small></span>
    <button class="btn secondary" data-rb="open">Öffnen</button><button class="x-btn" data-rb="x" aria-label="Schließen">×</button>`;
  document.body.appendChild(el);
  el.querySelector('[data-rb=open]').addEventListener('click', () => { el.remove(); openItem(i.id); });
  el.querySelector('[data-rb=x]').addEventListener('click', () => el.remove());
  setTimeout(() => el.remove(), 20000);
}
const bannerShown = new Set();
function checkReminders() {
  if (!state.me || !state.loaded) return;
  const now = Date.now();
  const due = state.items.filter((i) => i.remind_at && !i.reminded && !i.done && (i.owner_id === state.me || isItemShared(i)) && new Date(i.remind_at).getTime() <= now);
  if (pushOn()) {
    // Server verschickt die Mitteilung; in der offenen App nur einmal den Hinweis zeigen
    due.filter((i) => !bannerShown.has(i.id)).forEach((i) => { bannerShown.add(i.id); if (document.visibilityState === 'visible') showReminderBanner(i); });
    return;
  }
  due.forEach(fireReminder);
}
setInterval(checkReminders, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(checkReminders, 800); });

async function silentDelete(id) {
  state.items = state.items.filter((x) => x.id !== id);
  render();
  await sb.from('items').delete().eq('id', id);
}

function renderShareArea(sheet, id) {
  const area = sheet.querySelector('#share-area');
  const i = itemById(id);
  if (!area || !i) return;
  const mine = i.owner_id === state.me;
  const cat = catById(i.category_id);
  let html = '';

  if (!mine) html += `<div class="hint" style="margin:0 2px 8px">Erstellt von ${esc(nameOf(i.owner_id))}.</div>`;
  if (cat && isCatShared(cat)) {
    const people = [cat.owner_id, ...membersOf(cat.id)].filter((u) => u !== state.me).map(nameOf);
    html += `<div class="hint" style="margin:0 2px 8px">Sichtbar für alle in „${esc(cat.name)}“: ${esc(people.join(', '))}</div>`;
  }
  if (mine) {
    const shared = sharesOf(id);
    html += `<div class="people">${shared.map((u) => `
      <div class="person"><div>${esc(nameOf(u))}<small>${esc(state.profiles[u]?.email || '')}</small></div>
      <button class="x-btn" data-unshare="${u}" aria-label="Entfernen">×</button></div>`).join('')}</div>
      <form class="row-inline" id="share-form">
        <input class="input" type="email" name="email" placeholder="E-Mail der Person" autocomplete="email" required>
        <button class="btn secondary" type="submit">Teilen</button>
      </form>`;
  } else if (!(cat && isCatShared(cat))) {
    html += `<div class="hint" style="margin:0 2px">Direkt mit dir geteilt.</div>`;
  }
  area.innerHTML = html;

  area.querySelectorAll('[data-unshare]').forEach((b) => b.addEventListener('click', async () => {
    const { error } = await sb.from('item_shares').delete().eq('item_id', id).eq('user_id', b.dataset.unshare);
    if (error) return toast('Fehler: ' + error.message);
    state.shares = state.shares.filter((s) => !(s.item_id === id && s.user_id === b.dataset.unshare));
    renderShareArea(sheet, id); render();
  }));
  area.querySelector('#share-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const { data, error } = await sb.rpc('share_item', { iid: id, target_email: email });
    if (error) return toast('Fehler: ' + error.message);
    if (data !== 'ok') return toast(shareMessage(data), 3500);
    await loadAll();
    renderShareArea(sheet, id);
    toast('Geteilt');
  });
}

function shareMessage(code) {
  return {
    not_found: 'Mit dieser E-Mail gibt es noch kein Konto in der App.',
    self: 'Das bist du selbst.',
    not_allowed: 'Nur der Besitzer kann teilen.',
  }[code] || 'Teilen nicht möglich.';
}

// ---------- Menü ----------
// ---------- Schnelle Notiz ----------
function openQuickNote() {
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Neue Notiz</h2><button class="link-btn" data-close>Fertig</button></div>
    <form class="quick" id="quick-note">
      <textarea id="quick-text" class="quick-text" rows="4" placeholder="Einfach lostippen … Die erste Zeile wird der Titel."></textarea>
      <div class="quick-row">
        <select id="quick-cat" class="select quick-cat" aria-label="Kategorie">${categoryOptions(state.filter !== 'all' && state.filter !== 'none' ? state.filter : null)}</select>
        <button class="btn" type="submit">Speichern</button>
      </div>
    </form>`);
  const qt = sheet.querySelector('#quick-text');
  setTimeout(() => qt.focus(), 60);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('#quick-note').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = qt.value.trim();
    if (!text) { qt.focus(); return toast('Erst etwas eintippen.'); }
    const [first, ...rest] = text.split('\n');
    const title = first.trim().slice(0, 120);
    const body = (first.length > 120 ? first.slice(120) + '\n' : '') + rest.join('\n').trim();
    const category_id = sheet.querySelector('#quick-cat').value || null;
    const { data, error } = await sb.from('items').insert({ type: 'note', title, body, category_id }).select().single();
    if (error) return toast('Fehler: ' + error.message);
    state.items.unshift(data);
    closeSheet();
    render();
    toast('Notiz gespeichert');
  });
}

// ---------- Einstellungen ----------
function openSettings() {
  const me = state.profiles[state.me];
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Einstellungen</h2><button class="link-btn" data-close>Fertig</button></div>
    <div class="field"><label>Angemeldet als</label>
      <div class="person"><div>${esc(me?.name || '')}<small>${esc(me?.email || '')}</small></div></div>
    </div>
    <div class="field"><label>Mein Name (sehen andere beim Teilen)</label>
      <form class="row-inline" id="name-form"><input class="input" name="name" value="${esc(me?.name || '')}" required><button class="btn secondary">Speichern</button></form>
    </div>
    <div class="field"><label>Mitteilungen</label>
      <button class="menu-item" id="push-toggle" type="button">Erinnerungen als Mitteilung<span class="sw ${pushOn() ? 'on' : ''}"></span></button>
      <div class="hint">${pushSupport() || 'Kommen auch bei geschlossener App. Einmal pro Gerät aktivieren (iPhone und Mac getrennt).'}</div>
    </div>
    <div class="menu-list">
      <button class="menu-item" data-go="ctl-reset">Steuerknopf an Standardplatz setzen</button>
      ${window.__DEMO ? '<button class="menu-item" data-go="reset">Beispieldaten zurücksetzen</button>' : ''}
    </div>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('#name-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const { error } = await sb.from('profiles').update({ name }).eq('id', state.me);
    if (error) return toast('Fehler: ' + error.message);
    state.profiles[state.me].name = name;
    toast('Gespeichert');
  });
  sheet.querySelector('#push-toggle').addEventListener('click', async (e) => {
    const sw = e.currentTarget.querySelector('.sw');
    if (pushOn()) { await disablePush(); sw.classList.remove('on'); }
    else if (await enablePush()) sw.classList.add('on');
  });
  sheet.querySelector('[data-go=ctl-reset]').addEventListener('click', () => {
    try { localStorage.removeItem('uebersicht-ctl-pos'); } catch {}
    location.reload();
  });
  sheet.querySelector('[data-go=reset]')?.addEventListener('click', async () => {
    if (!(await askConfirm('Beispieldaten zurücksetzen?', 'Zurücksetzen'))) return;
    window.__resetDemo?.();
  });
}

// ---------- Kategorien ----------
function openCategories() {
  closeSheet();
  state.tab = 'categories';
  render();
}

// Neue Todo-Liste (neue oder vorhandene Kategorie) bzw. neue Kategorie
function openNewList({ mode = 'list' } = {}) {
  const isList = mode === 'list';
  const available = state.categories.filter((c) => !isTodoList(c));
  let color = COLORS[1];
  const sheet = openSheet(`
    <div class="sheet-head"><h2>${isList ? 'Neue Liste' : 'Neue Kategorie'}</h2><button class="link-btn" data-close>Fertig</button></div>
    <form id="nl-form">
      <div class="field"><label>Name</label>
        <div class="row-inline"><input class="input" id="nl-name" name="name" placeholder="${isList ? 'z. B. Einkaufen' : 'z. B. Haushalt'}" required><button class="btn">Anlegen</button></div>
      </div>
      <div class="field"><label>Farbe</label><div class="colors">${COLORS.map((col) => `<button type="button" class="color ${col === color ? 'on' : ''}" data-color="${col}" style="background:${col}"></button>`).join('')}</div></div>
    </form>
    ${isList && available.length ? `<div class="divider"></div>
      <div class="field"><label>Oder vorhandene Kategorie als Liste nehmen</label>
        <div class="pick">${available.map((c) => `<button class="pick-item" data-pick="${c.id}"><i class="ldot" style="background:${esc(c.color)}"></i>${esc(c.name)}${isCatShared(c) ? `<small>gemeinsam</small>` : ''}</button>`).join('')}</div>
      </div>` : ''}`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  setTimeout(() => sheet.querySelector('#nl-name').focus(), 60);
  sheet.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
    color = b.dataset.color;
    sheet.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  const asList = async (c) => {
    if (c.owner_id === state.me) {
      const { error } = await sb.from('categories').update({ todo_list: true }).eq('id', c.id);
      if (error) return toast('Fehler: ' + error.message);
      c.todo_list = true;
    } else setLocalLists([...new Set([...localLists(), c.id])]);
  };
  sheet.querySelector('#nl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = sheet.querySelector('#nl-name').value.trim();
    if (!name) return;
    const { data, error } = await sb.from('categories').insert({ name, color, todo_list: isList }).select().single();
    if (error) return toast('Fehler: ' + error.message);
    state.categories.push(data);
    state.categories.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    closeSheet(); render();
    toast(isList ? `Liste „${name}“ angelegt` : `Kategorie „${name}“ angelegt`);
    if (isList) document.querySelector(`.addrow[data-list="${data.id}"] input`)?.focus();
  });
  sheet.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
    const c = catById(b.dataset.pick);
    await asList(c);
    closeSheet(); render();
    toast(`„${c.name}“ ist jetzt eine Liste`);
    document.querySelector(`.addrow[data-list="${c.id}"] input`)?.focus();
  }));
}

function openCategory(cid) {
  const c = catById(cid);
  if (!c) return openCategories();
  const mine = c.owner_id === state.me;
  const listOn = isTodoList(c);
  const sheet = openSheet(mine ? `
    <div class="sheet-head"><h2>${esc(c.name)}</h2><button class="link-btn" data-close>Fertig</button></div>
    <div class="field"><label>Name</label><input class="input" id="c-name" value="${esc(c.name)}"></div>
    <div class="field"><label>Farbe</label><div class="colors">${COLORS.map((col) => `<button type="button" class="color ${col === c.color ? 'on' : ''}" data-color="${col}" style="background:${col}"></button>`).join('')}</div></div>
    <div class="field"><label>Gemeinsam mit</label>
      <div class="people">${membersOf(cid).map((u) => `
        <div class="person"><div>${esc(nameOf(u))}<small>${esc(state.profiles[u]?.email || '')}</small></div>
        <button class="x-btn" data-remove="${u}" aria-label="Entfernen">×</button></div>`).join('')}</div>
      <form class="row-inline" id="c-share">
        <input class="input" type="email" name="email" placeholder="E-Mail der Person" required>
        <button class="btn secondary">Einladen</button>
      </form>
      <div class="hint">Alle Todos und Notizen in dieser Kategorie sehen und bearbeiten dann beide.</div>
    </div>
    <div class="field"><label>Todo-Liste</label>
      <button class="menu-item" id="c-list" type="button">${listOn ? 'Als Todo-Liste anzeigen: an' : 'Als Todo-Liste anzeigen: aus'}<span class="sw ${listOn ? 'on' : ''}"></span></button>
      ${listOn && state.items.some((i) => i.type === 'todo' && i.category_id === cid) ? '<div class="hint">Solange Todos darin sind, bleibt sie in den Todos sichtbar.</div>' : ''}
    </div>
    <div class="divider"></div>
    <button class="btn danger block" id="c-delete">Kategorie löschen</button>
    <div class="hint" style="text-align:center">Einträge bleiben erhalten, nur ohne Kategorie.</div>
  ` : `
    <div class="sheet-head"><span></span><button class="link-btn" data-close>Fertig</button></div>
    <h2 style="display:flex;align-items:center;gap:10px;margin:4px 0 6px"><span class="dot" style="background:${esc(c.color)};width:14px;height:14px"></span>${esc(c.name)}</h2>
    <p class="muted" style="margin:0 0 20px">Gemeinsame Kategorie von ${esc(nameOf(c.owner_id))}${membersOf(cid).filter((u) => u !== state.me).length ? ', auch mit ' + esc(membersOf(cid).filter((u) => u !== state.me).map(nameOf).join(', ')) : ''}.</p>
    <button class="btn danger block" id="c-leave">Kategorie verlassen</button>
  `);

  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);

  if (mine) {
    sheet.querySelector('#c-name').addEventListener('change', async (e) => {
      const name = e.target.value.trim();
      if (!name) return;
      const { error } = await sb.from('categories').update({ name }).eq('id', cid);
      if (error) return toast('Fehler: ' + error.message);
      c.name = name; render();
    });
    sheet.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', async () => {
      sheet.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
      const { error } = await sb.from('categories').update({ color: b.dataset.color }).eq('id', cid);
      if (error) return toast('Fehler: ' + error.message);
      c.color = b.dataset.color; render();
    }));
    sheet.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      const { error } = await sb.from('category_members').delete().eq('category_id', cid).eq('user_id', b.dataset.remove);
      if (error) return toast('Fehler: ' + error.message);
      await loadAll(); openCategory(cid);
    }));
    sheet.querySelector('#c-share').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { data, error } = await sb.rpc('share_category', { cid, target_email: e.target.email.value });
      if (error) return toast('Fehler: ' + error.message);
      if (data !== 'ok') return toast(shareMessage(data), 3500);
      await loadAll(); openCategory(cid); toast('Eingeladen');
    });
    sheet.querySelector('#c-list').addEventListener('click', async () => {
      const next = !c.todo_list && !localLists().includes(cid);
      const { error } = await sb.from('categories').update({ todo_list: next }).eq('id', cid);
      if (error) return toast('Fehler: ' + error.message);
      c.todo_list = next;
      if (!next) setLocalLists(localLists().filter((x) => x !== cid));
      render(); openCategory(cid);
    });
    sheet.querySelector('#c-delete').addEventListener('click', async () => {
      if (!(await askConfirm(`Kategorie „${c.name}“ löschen?`, 'Löschen', 'Die Einträge bleiben erhalten, nur ohne Kategorie.'))) return;
      const { error } = await sb.from('categories').delete().eq('id', cid);
      if (error) return toast('Fehler: ' + error.message);
      closeSheet(); await loadAll();
    });
  } else {
    sheet.querySelector('#c-leave').addEventListener('click', async () => {
      if (!(await askConfirm(`„${c.name}“ verlassen?`, 'Verlassen', 'Du siehst die Einträge darin dann nicht mehr.'))) return;
      const { error } = await sb.from('category_members').delete().eq('category_id', cid).eq('user_id', state.me);
      if (error) return toast('Fehler: ' + error.message);
      await loadAll(); openCategories();
    });
  }
}

// Start: falls keine Sitzung vorhanden ist, Login zeigen
sb.auth.getSession().then(({ data }) => { if (!data.session) renderAuth(); });
