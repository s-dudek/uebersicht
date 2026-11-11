// Schnelle Notiz und Einstellungen
import { askConfirm, esc, sb, state, toast } from './core.js';
import { disablePush, enablePush, pushOn, pushSupport } from './reminders.js';
import { render } from './render.js';
import { openTrash, trashCount } from './trash.js';
import { categoryOptions, closeSheet, openSheet, sheetActs } from './sheet.js';

// ---------- Menü ----------
// ---------- Schnelle Notiz ----------
export function openQuickNote() {
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Neue Notiz</h2>${sheetActs({ save: true })}</div>
    <form class="quick" id="quick-note">
      <textarea id="quick-text" class="quick-text" rows="4" placeholder="Einfach lostippen … Die erste Zeile wird der Titel."></textarea>
      <div class="quick-row">
        <select id="quick-cat" class="select quick-cat" aria-label="Kategorie">${categoryOptions(state.tab === 'notes' ? state.list || null : null)}</select>
      </div>
    </form>`);
  const qt = sheet.querySelector('#quick-text');
  setTimeout(() => qt.focus(), 60);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-save]').addEventListener('click', () => sheet.querySelector('#quick-note').requestSubmit());
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
export function openSettings() {
  const me = state.profiles[state.me];
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Einstellungen</h2>${sheetActs()}</div>
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
      <button class="menu-item" data-go="trash">Papierkorb<span class="muted">${trashCount() || ''}</span></button>
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
  sheet.querySelector('[data-go=trash]').addEventListener('click', () => { closeSheet(); openTrash(); });
  sheet.querySelector('[data-go=reset]')?.addEventListener('click', async () => {
    if (!(await askConfirm('Beispieldaten zurücksetzen?', 'Zurücksetzen'))) return;
    window.__resetDemo?.();
  });
}
