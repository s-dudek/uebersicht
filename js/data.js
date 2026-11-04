// Daten laden, Live-Updates und Speichern
import { askConfirm, debounce, itemById, sb, state, toast } from './core.js';
import { openItem } from './items.js';
import { deletePageTree } from './ink-store.js';
import { checkReminders } from './reminders.js';
import { render } from './render.js';

// ====================================================================
// Daten laden + Live-Updates
// ====================================================================
export async function loadAll() {
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
  state.loaded = true;
  render();
  setTimeout(checkReminders, 1200);
}

const reload = debounce(loadAll, 300);

let channel = null;

export function unsubscribe() {
  if (channel) sb.removeChannel(channel);
  channel = null;
}

export function subscribe() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => reload())
    .subscribe();
}

// ====================================================================
// Aktionen
// ====================================================================
export async function toggleTodo(id) {
  const i = itemById(id);
  if (!i) return;
  i.done = !i.done;
  i.updated_at = new Date().toISOString();
  render();
  const { error } = await sb.from('items').update({ done: i.done }).eq('id', id);
  if (error) { i.done = !i.done; render(); toast('Fehler: ' + error.message); }
}

// Kategorie anlegen ohne Rückgabe aus der Datenbank (die Zugriffsregel würde die neue Zeile sonst ablehnen):
// ID selbst erzeugen, einfügen, dann lokal ergänzen
export async function insertCategory(fields) {
  const row = { id: crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)), owner_id: state.me, color: '#0C3741', todo_list: false, created_at: new Date().toISOString(), ...fields };
  const { error } = await sb.from('categories').insert(row);
  if (error) return { error };
  return { data: row };
}

export async function createTodo(cat = null) {
  const { data, error } = await sb.from('items').insert({ type: 'todo', title: '', category_id: cat }).select().single();
  if (error) return toast('Fehler: ' + error.message);
  state.items.unshift(data);
  render();
  openItem(data.id, { isNew: true });
  setTimeout(() => document.querySelector('#f-title')?.focus(), 60);
}

export async function createNote(cat) {
  const category_id = cat ?? null;
  const { data, error } = await sb.from('items').insert({ type: 'note', title: '', category_id }).select().single();
  if (error) return toast('Fehler: ' + error.message);
  state.items.unshift(data);
  render();
  openItem(data.id, { isNew: true });
}

export async function saveItem(id, patch) {
  const i = itemById(id);
  if (!i) return { error: { message: 'Eintrag nicht gefunden' } };
  Object.assign(i, patch, { updated_at: new Date().toISOString() });
  render();
  const { error } = await sb.from('items').update(patch).eq('id', id);
  if (error) toast('Speichern fehlgeschlagen: ' + error.message, 4000);
  return { error };
}

export async function deleteItem(id) {
  const i = itemById(id);
  const what = { note: 'Notiz', todo: 'Todo', event: 'Termin', meal: 'Gericht' }[i?.type] || 'Eintrag';
  if (!i || !(await askConfirm(`${what} „${i.title || 'Ohne Titel'}“ löschen?`, 'Löschen'))) return false;
  const { error } = await sb.from('items').delete().eq('id', id);
  if (error) { toast('Fehler: ' + error.message); return false; }
  state.items = state.items.filter((x) => x.id !== id);
  if (i.type === 'note') deletePageTree(id).catch(() => {});   // Unterseite der Notiz im Canvas mit löschen
  render();
  return true;
}

export async function silentDelete(id) {
  state.items = state.items.filter((x) => x.id !== id);
  render();
  await sb.from('items').delete().eq('id', id);
}

export function initSync() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.me) reload();
  });
}
