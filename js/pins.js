// Startseite (Desktop): selbst gewählte Einträge und Listen ("Zu Home hinzufügen")
// Gespeichert pro Person wie die Ordner-Reihenfolge (profiles.cat_order, Schlüssel "home").
import { catById, itemById, toast } from './core.js';
import { catOrder, saveCatOrder } from './folders.js';

const KIND = 'home';
export const pinKey = { item: (id) => 'i:' + id, cat: (id) => 'c:' + id };

// angeheftete Einträge in gespeicherter Reihenfolge; Gelöschtes fällt weg
export function pinned() {
  return catOrder(KIND).map((key) => {
    const [t, id] = [key.slice(0, 1), key.slice(2)];
    const obj = t === 'i' ? itemById(id) : t === 'c' ? catById(id) : null;
    return obj ? { key, type: t === 'i' ? 'item' : 'cat', obj } : null;
  }).filter(Boolean);
}

export const isPinned = (key) => catOrder(KIND).includes(key);

export function togglePin(key) {
  const list = catOrder(KIND);
  const on = list.includes(key);
  saveCatOrder(KIND, on ? list.filter((k) => k !== key) : [...list, key]);
  toast(on ? 'Von Home entfernt' : 'Zu Home hinzugefügt');
}
