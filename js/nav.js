// Bereiche der App und der Wechsel zwischen ihnen (vom Steuerknopf und von der Seitenleiste am Desktop)
import { scrollCal } from './calendar.js';
import { state, toast } from './core.js';
import { openQuickNote } from './panels.js';
import { render } from './render.js';
import { closeSheet } from './sheet.js';

export const NAV = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'todos', label: 'Todos', icon: 'todos' },
  { key: 'notes', label: 'Notizen', icon: 'notes' },
  { key: 'meals', label: 'Gerichte', icon: 'pot' },
  { key: 'calendar', label: 'Kalender', icon: 'calendar' },
  { key: 'training', label: 'Training', icon: 'dumbbell' },
  { key: 'quick', label: 'Neue Notiz', icon: 'notePlus' },
];

// transition: Funktion, die den Seitenwechsel animiert ausführt (Steuerknopf), sonst sofort
export function navigate(k, transition = (fn) => fn()) {
  const w = NAV.find((x) => x.key === k);
  if (!w) return;
  if (w.soon) return toast(`${w.label} kommt als Nächstes.`);
  if (k === 'quick') return openQuickNote();
  closeSheet();
  // nochmal derselbe Bereich: aus einer geöffneten Liste zurück zur Übersicht
  if (state.tab === k && (k === 'todos' || k === 'notes') && state.list !== null) { state.list = null; return render(); }
  if (state.tab === k) return;
  transition(() => {
    state.tab = k;
    render();
    document.querySelector('.main')?.scrollTo({ top: 0 });
    if (k === 'calendar') scrollCal();
  });
}
