// Kalender-Abos (ICS, z. B. von Outlook, Google, iCloud) lesen: Termine mit Wiederholungen und Zeitzonen,
// aufgeklappt auf einen Zeitraum. Ohne Bibliothek; deckt die üblichen Fälle ab (täglich, wöchentlich mit Tagen,
// monatlich nach Datum oder z. B. „2. Dienstag“, jährlich; Ausnahmen und verschobene Einzeltermine).

// Windows-Zeitzonen (Outlook) auf übliche Namen
const WIN_TZ = {
  'W. Europe Standard Time': 'Europe/Vienna', 'Central Europe Standard Time': 'Europe/Budapest', 'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris', 'GMT Standard Time': 'Europe/London', 'E. Europe Standard Time': 'Europe/Bucharest',
  'Eastern Standard Time': 'America/New_York', 'Pacific Standard Time': 'America/Los_Angeles', UTC: 'UTC', 'Coordinated Universal Time': 'UTC',
};
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const MAX_STEPS = 4000;   // Schutz bei endlosen Wiederholungen

const unfold = (text) => text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
const unesc = (v) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function parseLine(line) {
  const i = line.indexOf(':');
  if (i < 0) return null;
  const [name, ...ps] = line.slice(0, i).split(';');
  const params = {};
  for (const p of ps) { const j = p.indexOf('='); if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, ''); }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

// Uhrzeit in einer Zeitzone als Zeitpunkt (über Intl)
function zoned(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    return new Date(guess - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - guess));
  } catch {
    return new Date(y, mo - 1, d, h, mi, s);   // unbekannte Zone: als Ortszeit
  }
}

// DTSTART/DTEND/EXDATE-Wert → { date, allDay }
function parseDate(value, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || params.VALUE === 'DATE') return { date: new Date(+y, +mo - 1, +d), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))), allDay: false };
  const tz = params.TZID && (WIN_TZ[params.TZID] || params.TZID);
  return { date: tz ? zoned(+y, +mo, +d, +h, +mi, +(s || 0), tz) : new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0)), allDay: false };
}

function parseRule(v) {
  const r = Object.fromEntries(v.split(';').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, x]) => [k.toUpperCase(), x]));
  return {
    freq: r.FREQ, interval: Math.max(1, +r.INTERVAL || 1), count: +r.COUNT || 0,
    until: r.UNTIL ? parseDate(r.UNTIL)?.date : null,
    byDay: r.BYDAY ? r.BYDAY.split(',').map((x) => { const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x); return m && { n: m[1] ? +m[1] : 0, wd: DAYS.indexOf(m[2]) }; }).filter(Boolean) : [],
    byMonthDay: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number).filter(Boolean) : [],
  };
}

// ganze ICS-Datei → Termine
export function parseIcs(text) {
  const events = [];
  let ev = null;
  for (const line of unfold(String(text))) {
    if (line === 'BEGIN:VEVENT') { ev = { exdates: new Set() }; continue; }
    if (line === 'END:VEVENT') {
      if (ev?.start && !/^CANCELLED$/i.test(ev.status || '')) {
        ev.end ??= { date: new Date(ev.start.date.getTime() + (ev.start.allDay ? 864e5 : 36e5)), allDay: ev.start.allDay };
        events.push(ev);
      }
      ev = null;
      continue;
    }
    if (!ev) continue;
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'SUMMARY') ev.title = unesc(p.value).slice(0, 300);
    else if (p.name === 'LOCATION') ev.location = unesc(p.value).slice(0, 300);
    else if (p.name === 'DESCRIPTION') ev.desc = unesc(p.value).slice(0, 4000);
    else if (p.name === 'UID') ev.uid = p.value.slice(0, 300);
    else if (p.name === 'STATUS') ev.status = p.value;
    else if (p.name === 'DTSTART') ev.start = parseDate(p.value, p.params);
    else if (p.name === 'DTEND') ev.end = parseDate(p.value, p.params);
    else if (p.name === 'RRULE') ev.rule = parseRule(p.value);
    else if (p.name === 'RECURRENCE-ID') ev.recurId = parseDate(p.value, p.params)?.date.getTime();
    else if (p.name === 'EXDATE') p.value.split(',').forEach((v) => { const d = parseDate(v, p.params); if (d) ev.exdates.add(d.date.getTime()); });
  }
  return events.filter((e) => e.start && e.end);
}

// Beginn-Zeitpunkte einer Wiederholung im Zeitraum (Uhrzeit bleibt die des ersten Termins)
function* starts(ev, to) {
  const s = ev.start.date, r = ev.rule;
  if (!r) { yield s; return; }
  const at = (y, mo, d) => new Date(y, mo, d, s.getHours(), s.getMinutes(), s.getSeconds());
  const end = r.until && r.until < to ? r.until : to;
  let n = 0, steps = 0;
  const emit = function* (d) { if (d >= s && d <= end && (!r.count || n < r.count)) { n++; yield d; } };
  // n-ter Wochentag im Monat (n < 0: von hinten)
  const nthWeekday = (y, mo, wd, k) => {
    if (k > 0) { const first = new Date(y, mo, 1).getDay(); return 1 + ((wd - first + 7) % 7) + (k - 1) * 7; }
    const last = new Date(y, mo + 1, 0); return last.getDate() - ((last.getDay() - wd + 7) % 7) + (k + 1) * 7;
  };
  for (let i = 0; steps < MAX_STEPS; i += r.interval, steps++) {
    let list = [];
    if (r.freq === 'DAILY') list = [at(s.getFullYear(), s.getMonth(), s.getDate() + i)];
    else if (r.freq === 'WEEKLY') {
      const monday = s.getDate() - ((s.getDay() + 6) % 7) + i * 7;
      const wds = r.byDay.length ? r.byDay.map((b) => b.wd) : [s.getDay()];
      list = wds.map((wd) => at(s.getFullYear(), s.getMonth(), monday + ((wd + 6) % 7))).sort((a, b) => a - b);
    } else if (r.freq === 'MONTHLY') {
      const y = s.getFullYear(), mo = s.getMonth() + i;
      if (r.byDay.length) list = r.byDay.map((b) => at(y, mo, nthWeekday(new Date(y, mo, 1).getFullYear(), new Date(y, mo, 1).getMonth(), b.wd, b.n || 1)));
      else list = (r.byMonthDay.length ? r.byMonthDay : [s.getDate()]).map((d) => (d > 0 ? at(y, mo, d) : at(y, mo + 1, d + 1)))
        .filter((d) => d.getMonth() === new Date(y, mo, 1).getMonth());
      list.sort((a, b) => a - b);
    } else if (r.freq === 'YEARLY') list = [at(s.getFullYear() + i, s.getMonth(), s.getDate())].filter((d) => d.getDate() === s.getDate());
    else { yield s; return; }
    for (const d of list) yield* emit(d);
    if (list.length && list[0] > end) return;
    if (r.count && n >= r.count) return;
  }
}

// Termine → einzelne Vorkommen im Zeitraum [from, to]
export function expand(events, from, to) {
  const moved = new Set(events.filter((e) => e.recurId).map((e) => `${e.uid}|${e.recurId}`));
  const out = [];
  for (const ev of events) {
    const dur = ev.end.date - ev.start.date;
    for (const st of starts(ev, to)) {
      const t = st.getTime();
      if (!ev.recurId && (ev.exdates.has(t) || moved.has(`${ev.uid}|${t}`))) continue;
      const en = new Date(t + dur);
      if (en < from) continue;
      out.push({ title: ev.title || '(ohne Titel)', location: ev.location || '', desc: ev.desc || '', start: st, end: en, allDay: ev.start.allDay });
      if (out.length > 20000) return out;
    }
  }
  return out;
}
