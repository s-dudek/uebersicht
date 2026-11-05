// Grundlagen: Konfiguration, Supabase-Verbindung, Zustand, kleine Helfer und Nachschlage-Funktionen
import { createClient } from './vendor/supabase.js';

// ====================================================================
// Grundlagen
// ====================================================================
export const cfg = window.APP_CONFIG || {};

export const $app = document.getElementById('app');

export const $sheetRoot = document.getElementById('sheet-root');

const $toast = document.getElementById('toast');

export const COLORS = ['#0C3741', '#7FA08A', '#3E7CA8', '#7A5AA6', '#C2575A', '#D9873E', '#C9A227', '#76907F'];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Desktop-Layout (Seitenleiste statt Steuerknopf) ab dieser Breite
const DESKTOP = window.matchMedia('(min-width: 1024px)');
export const isDesktop = () => DESKTOP.matches;
export const onLayoutChange = (fn) => DESKTOP.addEventListener('change', fn);

// Farben kommen aus der Datenbank und landen in style-Attributen: nur echte Hex-Farben zulassen
export const safeColor = (c, fallback = '') => (/^#[0-9a-fA-F]{3,8}$/.test(c || '') ? c : fallback);

export function toast(text, ms = 2600) {
  $toast.textContent = text;
  $toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($toast.hidden = true), ms);
}

// Bestätigungsdialog in der Seite (statt confirm(), das nicht überall funktioniert)
export function askConfirm(question, okLabel = 'OK', detail = '') {
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

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function store(key, val) {
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

export const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ====================================================================
// Zustand
// ====================================================================
export const state = {
  me: null,            // auth user id
  profiles: {},        // id -> profile
  categories: [],
  members: [],         // {category_id, user_id}
  items: [],
  shares: [],          // {item_id, user_id}
  tab: 'home',
  weekStart: (() => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; })(),   // Montag der angezeigten Woche
  noteMode: 'text',   // Notiz-Ordner: Notizen-Liste oder Canvas (über den Knopf in den Notizen)
  doneOpen: new Set(),   // Todo-Listen, deren erledigte Einträge aufgeklappt sind
  folded: new Set(),    // zugeklappte Ordner in der Listenansicht
  calView: store('calView') || 'week',   // 'day' | 'week' | 'month'
  homeDay: null,                         // Startseite: gezeigter Tag (null = heute)
  calAllOpen: false,                     // Ganztägiges: alle Zeilen zeigen
  calDate: null,        // gezeigter Tag im Kalender (YYYY-MM-DD)
  list: null,           // geöffnete Todo-Liste (null = Übersicht, '' = Allgemein)
  loaded: false,
};

export const catById = (id) => state.categories.find((c) => c.id === id);

// Todo-Listen: Kategorien mit Markierung "todo_list", mit Todos, oder lokal hinzugefügt (bei fremden Kategorien)
const LOCAL_LISTS = 'uebersicht-lists';

export const localLists = () => { try { return JSON.parse(localStorage.getItem(LOCAL_LISTS)) || []; } catch { return []; } };

export const setLocalLists = (a) => { try { localStorage.setItem(LOCAL_LISTS, JSON.stringify(a)); } catch {} };

export const isTodoList = (c) => !!c.todo_list || localLists().includes(c.id) || state.items.some((i) => i.type === 'todo' && i.category_id === c.id);

export const itemById = (id) => state.items.find((i) => i.id === id);

export const membersOf = (cid) => state.members.filter((m) => m.category_id === cid).map((m) => m.user_id);

export const sharesOf = (iid) => state.shares.filter((s) => s.item_id === iid).map((s) => s.user_id);

export const nameOf = (uid) => (uid === state.me ? 'Ich' : state.profiles[uid]?.name || state.profiles[uid]?.email || 'Unbekannt');

export const isCatShared = (c) => !!c && (c.owner_id !== state.me || membersOf(c.id).length > 0);

export const isItemShared = (i) => i.owner_id !== state.me || sharesOf(i.id).length > 0 || isCatShared(catById(i.category_id));

export const canDeleteItem = (i) => i.owner_id === state.me || (i.category_id && catById(i.category_id));
