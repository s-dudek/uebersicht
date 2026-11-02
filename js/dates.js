// Datum und Uhrzeit: Umrechnen und Beschriften

export function dueLabel(dateStr) {
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

export const ymd = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };

export const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };

export const isoWeek = (s) => { const d = parseYmd(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7); };

export const dayName = (s, o = { weekday: 'long' }) => parseYmd(s).toLocaleDateString('de-AT', o);

export const remindLabel = (iso) => {
  const d = new Date(iso), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86400000);
  const t = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  return (diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : d.toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })) + ' ' + t;
};

// ---------- Erinnerungen ----------
export function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
