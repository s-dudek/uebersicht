// Daten laden, Live-Updates und Speichern
import { askConfirm, debounce, itemById, sb, state, toast } from './core.js';
import { openItem } from './items.js';
import { deletePageTree } from './ink-store.js';
import { checkReminders } from './reminders.js';
import { render } from './render.js';
import { purgeCategory } from './trash.js';

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
  // Papierkorb: Markiertes getrennt halten; Einträge einer gelöschten Kategorie erscheinen bis dahin „ohne Kategorie“
  state.categories = c.data.filter((x) => !x.deleted_at);
  state.members = m.data;
  state.items = i.data.filter((x) => !x.deleted_at);
  state.trash = { items: i.data.filter((x) => x.deleted_at), cats: c.data.filter((x) => x.deleted_at) };
  state.shares = s.data;
  state.profiles = Object.fromEntries(p.data.map((x) => [x.id, x]));
  state.loaded = true;
  render();
  setTimeout(checkReminders, 1200);
  purgeOld();
}

// ---------- Papierkorb ----------
export const TRASH_DAYS = 30;
const expired = (x) => Date.now() - new Date(x.deleted_at).getTime() > TRASH_DAYS * 864e5;

// in den Papierkorb legen (ohne Rückfrage – die stellt der Aufrufer)
export async function trashItems(ids) {
  const now = new Date().toISOString();
  const moved = state.items.filter((i) => ids.includes(i.id));
  state.items = state.items.filter((i) => !ids.includes(i.id));
  moved.forEach((i) => { i.deleted_at = now; state.trash.items.unshift(i); });
  render();
  const { error } = await sb.from('items').update({ deleted_at: now }).in('id', ids);
  if (error) { toast('Fehler: ' + error.message); await loadAll(); return false; }
  return true;
}

export async function restoreItems(ids) {
  const back = state.trash.items.filter((i) => ids.includes(i.id));
  state.trash.items = state.trash.items.filter((i) => !ids.includes(i.id));
  back.forEach((i) => { i.deleted_at = null; state.items.unshift(i); });
  render();
  const { error } = await sb.from('items').update({ deleted_at: null }).in('id', ids);
  if (error) { toast('Fehler: ' + error.message); await loadAll(); }
}

// endgültig löschen (samt Canvas-Unterseite einer Notiz)
export async function purgeItems(ids) {
  const { error } = await sb.from('items').delete().in('id', ids);
  if (error) { toast('Fehler: ' + error.message); return false; }
  const notes = state.trash.items.filter((i) => ids.includes(i.id) && i.type === 'note').map((i) => i.id);
  state.trash.items = state.trash.items.filter((i) => !ids.includes(i.id));
  notes.forEach((id) => deletePageTree(id).catch(() => {}));
  render();
  return true;
}

// nach 30 Tagen still endgültig löschen (nur, was man selbst löschen darf)
async function purgeOld() {
  const items = state.trash.items.filter(expired).map((i) => i.id);
  if (items.length) await purgeItems(items).catch(() => {});
  for (const c of state.trash.cats.filter((x) => expired(x) && x.owner_id === state.me)) await purgeCategory(c.id, { silent: true }).catch(() => {});
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

// Löschen = in den Papierkorb (30 Tage wiederherstellbar)
export async function deleteItem(id) {
  const i = itemById(id);
  const what = { note: 'Notiz', todo: 'Todo', event: 'Termin', meal: 'Gericht', training: 'Training' }[i?.type] || 'Eintrag';
  if (!i || !(await askConfirm(`${what} „${i.title || 'Ohne Titel'}“ löschen?`, 'Löschen', `Landet im Papierkorb und lässt sich ${TRASH_DAYS} Tage lang wiederherstellen.`))) return false;
  if (!(await trashItems([id]))) return false;
  toast('In den Papierkorb gelegt');
  return true;
}

// mehrere Einträge auf einmal: verschieben bzw. löschen (Mehrfachauswahl in den Notizen)
export async function moveItems(ids, categoryId) {
  const now = new Date().toISOString();
  state.items.forEach((i) => { if (ids.includes(i.id)) Object.assign(i, { category_id: categoryId, updated_at: now }); });
  render();
  const { error } = await sb.from('items').update({ category_id: categoryId }).in('id', ids);
  if (error) toast('Verschieben fehlgeschlagen: ' + error.message, 4000);
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
