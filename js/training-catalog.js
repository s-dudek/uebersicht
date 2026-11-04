// Training: Übungs-Datenbank mit festen Nummern und kurze Codes daraus.
// Nummern NIE ändern oder neu vergeben (alte Codes verweisen darauf) – neue Übungen und Einheiten nur anhängen.
//
// Code:  TR-JJMMTT-<Tag>-<Tag>-…   ab dem Datum ein Eintrag je Tag (ein Tag oder eine ganze Woche)
//   Tag:  0                     frei
//         E3                    fertige Einheit Nr. 3
//         301.302x4x8.405x3x30s Übungen (Nr., wahlweise x Sätze x Wiederholungen, „s“ = Sekunden, @40 = 40 kg)
// Beispiel: TR-261109-E3-0-E5-0-301x4x8@12.401-0-E12

// Bereiche der Nummern: 1xx Beine/Po, 2xx Brust/Schultern/Arme, 3xx Rücken, 4xx Rumpf, 5xx Ausdauer, 6xx Mobilität/Dehnen
export const GROUPS = { 1: 'Beine & Po', 2: 'Brust, Schultern & Arme', 3: 'Rücken', 4: 'Rumpf', 5: 'Ausdauer', 6: 'Mobilität & Dehnen' };
const KIND = { 1: 'kraft', 2: 'kraft', 3: 'kraft', 4: 'kraft', 5: 'ausdauer', 6: 'mobilitaet' };

// [Nr, Name, Sätze, Wdh. (oder Dauer mit „s“/„Min.“), Pause, Hinweis]
const EX = [
  [101, 'Kniebeugen', 3, '12', '75 s', 'Fersen am Boden, Knie über den Zehen'],
  [102, 'Ausfallschritte', 3, '10 je Seite', '60 s', 'Oberkörper aufrecht'],
  [103, 'Rumänisches Kreuzheben (Kurzhanteln)', 3, '10', '75 s', 'Hüfte nach hinten schieben, Rücken gerade'],
  [104, 'Glute Bridge', 3, '15', '45 s', 'Oben 2 s halten'],
  [105, 'Bulgarische Split-Kniebeuge', 3, '8 je Seite', '75 s', 'hinterer Fuß auf der Bank'],
  [106, 'Wadenheben', 3, '15', '45 s', 'langsam absenken'],
  [107, 'Seitliches Gehen mit Band', 2, '12 Schritte je Seite', '30 s', 'Band über den Knien'],
  [108, 'Wandsitzen', 3, '40 s', '45 s', 'Knie im rechten Winkel'],
  [201, 'Liegestütz', 3, '10', '60 s', 'Körper gerade halten; leichter: Knie am Boden'],
  [202, 'Kurzhantel-Bankdrücken', 3, '10', '75 s', 'Schulterblätter zusammen'],
  [203, 'Schulterdrücken (Kurzhanteln)', 3, '10', '75 s', 'nicht ins Hohlkreuz'],
  [204, 'Seitheben', 3, '12', '45 s', 'leichtes Gewicht, Ellbogen leicht gebeugt'],
  [205, 'Bizeps-Curls', 3, '12', '45 s', 'Ellbogen am Körper'],
  [206, 'Trizeps-Dips an der Bank', 3, '10', '60 s', 'Schultern weg von den Ohren'],
  [207, 'Fliegende (Kurzhanteln)', 3, '12', '60 s', 'Arme leicht gebeugt'],
  [301, 'Rudern vorgebeugt (Kurzhanteln)', 3, '10', '75 s', 'Rücken gerade, Schulterblätter zusammenziehen'],
  [302, 'Einarmiges Rudern auf der Bank', 3, '10 je Seite', '60 s', 'Ellbogen nah am Körper nach hinten'],
  [303, 'Face Pull mit Band', 3, '15', '45 s', 'Hände auf Augenhöhe, Daumen nach hinten'],
  [304, 'Superman', 3, '12', '45 s', 'Arme und Beine leicht heben, 2 s halten'],
  [305, 'Band-Latzug', 3, '12', '60 s', 'Band oben befestigen, zur Brust ziehen'],
  [306, 'Reverse Flys (Kurzhanteln)', 3, '12', '45 s', 'vorgebeugt, leichtes Gewicht'],
  [307, 'Klimmzüge (oder mit Band)', 3, '6', '90 s', 'volle Streckung unten'],
  [308, 'Band Pull-Apart', 3, '15', '30 s', 'Arme gestreckt auf Schulterhöhe'],
  [309, 'Rückenstrecken am Boden (Y-T-W)', 2, '8 je Buchstabe', '45 s', 'Stirn auf dem Handtuch, langsam'],
  [401, 'Unterarmstütz', 3, '40 s', '30 s', 'Po nicht nach oben'],
  [402, 'Unterarmstütz seitlich', 2, '30 s je Seite', '30 s', 'Hüfte oben halten'],
  [403, 'Vogel-Hund (Bird Dog)', 3, '8 je Seite', '30 s', 'Becken ruhig, langsam'],
  [404, 'Dead Bug', 3, '10', '30 s', 'unterer Rücken bleibt am Boden'],
  [405, 'Russian Twist', 3, '16', '30 s', 'Füße am Boden für leichter'],
  [406, 'Beinheben liegend', 3, '10', '45 s', 'Hände unter dem Po'],
  [407, 'Pallof Press mit Band', 3, '10 je Seite', '30 s', 'nicht mitdrehen'],
  [501, 'Lockerer Lauf', 1, '30 Min.', '', 'Puls um 140, man kann noch reden'],
  [502, 'Intervall-Lauf', 6, '1 Min. schnell / 2 Min. locker', '', 'davor 10 Min. einlaufen'],
  [503, 'Radfahren locker', 1, '45 Min.', '', 'gleichmäßig, flach'],
  [504, 'Zügiges Gehen', 1, '40 Min.', '', ''],
  [505, 'Seilspringen', 5, '1 Min.', '45 s', 'locker aus den Fußgelenken'],
  [506, 'Schwimmen', 1, '30 Min.', '', 'abwechselnd Brust und Kraul'],
  [601, 'Katze-Kuh', 2, '10', '', 'mit der Atmung bewegen'],
  [602, 'Weltbeste Dehnung', 2, '5 je Seite', '', 'Ausfallschritt, Arm zur Decke'],
  [603, 'Kindhaltung', 1, '1 Min.', '', 'in den Rücken atmen'],
  [604, 'Hüftbeuger dehnen (Kniestand)', 1, '45 s je Seite', '', 'Po anspannen'],
  [605, 'Brustdehnung im Türrahmen', 1, '30 s je Seite', '', ''],
  [606, 'Brustwirbelsäule drehen (Vierfüßler)', 2, '8 je Seite', '', 'Blick folgt der Hand'],
  [607, 'Nacken seitlich dehnen', 1, '30 s je Seite', '', 'Schulter sinken lassen'],
  [608, 'Knie zur Brust (liegend)', 1, '1 Min.', '', ''],
  [609, 'Oberschenkel hinten dehnen', 1, '45 s je Seite', '', 'Rücken lang'],
  [610, 'Schultern kreisen', 1, '10 vor, 10 zurück', '', ''],
];
export const EXERCISES = new Map(EX.map(([nr, name, sets, reps, rest, note]) => [nr, { nr, name, sets, reps, rest, note }]));

// Fertige Einheiten: [Nr, Titel, Art, Minuten, Aufwärmen, Übungen (Nr. oder [Nr., Sätze, Wdh.]), Abschluss, Hinweis]
const WARM = ['3 Min. lockeres Gehen oder Seilspringen', 'Schultern und Hüfte kreisen'];
const COOL = ['5 Min. Dehnen'];
const UNITS = [
  [1, 'Ganzkörper A', 'kraft', 45, WARM, [101, 201, 301, 104, 401], COOL, ''],
  [2, 'Ganzkörper B', 'kraft', 45, WARM, [102, 203, 302, 103, 404], COOL, ''],
  [3, 'Rücken stärken', 'kraft', 40, [...WARM, 'Katze-Kuh, 10 Wiederholungen'], [301, 302, 303, 304, 403, 402], ['Kindhaltung 1 Min.', 'Brustdehnung im Türrahmen'], 'Bei Schmerzen im unteren Rücken die Übung auslassen.'],
  [4, 'Rücken sanft (Haltung)', 'mobilitaet', 25, ['Schultern kreisen'], [601, 606, 309, 403, 308, 603], [], 'Ruhig und langsam, gut gegen Verspannungen vom Sitzen.'],
  [5, 'Beine & Po', 'kraft', 45, WARM, [101, 105, 103, 104, 106, 107], ['Hüftbeuger und Oberschenkel dehnen'], ''],
  [6, 'Oberkörper', 'kraft', 45, WARM, [202, 301, 203, 305, 204, 205, 206], COOL, ''],
  [7, 'Rumpf kompakt', 'kraft', 20, ['Katze-Kuh'], [401, 402, 404, 405, 407], [], ''],
  [8, 'Lockerer Lauf', 'ausdauer', 35, ['5 Min. zügig gehen'], [501], ['Waden und Oberschenkel dehnen'], ''],
  [9, 'Intervall-Lauf', 'ausdauer', 35, ['10 Min. einlaufen'], [502], ['5 Min. auslaufen, dehnen'], ''],
  [10, 'Radfahren locker', 'ausdauer', 45, [], [503], [], ''],
  [11, 'Mobilität', 'mobilitaet', 20, [], [601, 602, 606, 604, 609, 603], [], ''],
  [12, 'Dehnen am Abend', 'mobilitaet', 15, [], [607, 605, 604, 609, 608, 603], [], 'Jede Dehnung ruhig halten, nicht wippen.'],
  [13, 'Schulter & Nacken (Büro)', 'mobilitaet', 15, [], [610, 607, 605, 308, 303], [], 'Gut für zwischendurch am Arbeitsplatz.'],
  [14, 'Aktive Erholung', 'ruhe', 40, [], [504, 603], [], 'Locker bleiben, nur bewegen.'],
];
export const UNITS_BY_NR = new Map(UNITS.map(([nr, title, kind, minutes, warmup, exercises, cooldown, note]) => [nr, { nr, title, kind, minutes, warmup, exercises, cooldown, note }]));

const groupOf = (nr) => Math.floor(nr / 100);

// Übung aus der Datenbank, mit Sätzen/Wiederholungen/Gewicht aus dem Code
function exercise(nr, sets, reps, kg) {
  const e = EXERCISES.get(nr);
  if (!e) throw new Error(`Übung ${nr} gibt es (noch) nicht in der Übungs-Datenbank.`);
  const r = reps ?? e.reps;
  const timed = /s$|Min/.test(String(r));
  return { name: e.name, saetze: sets ?? e.sets, wdh: timed ? '' : String(r), dauer: timed ? String(r).replace(/^(\d+)s$/, '$1 s') : '', gewicht: kg ? `${kg} kg` : '', pause: e.rest, hinweis: e.note };
}

// Ein Tag aus Übungsnummern: Titel aus den Bereichen, Art der meisten Übungen, Dauer grob geschätzt
function customDay(datum, part) {
  const list = part.split('.').map((p) => {
    const m = p.match(/^(\d{3})(?:x(\d{1,2})x(\d{1,3}s?))?(?:@(\d{1,3}(?:[.,]\d)?))?$/i);
    if (!m) throw new Error(`„${p}“ ist im Code nicht lesbar.`);
    return { nr: +m[1], ex: exercise(+m[1], m[2] ? +m[2] : null, m[3] || null, m[4]?.replace('.', ',')) };
  });
  const groups = [...new Set(list.map((x) => groupOf(x.nr)))];
  const count = {};
  list.forEach((x) => { const k = KIND[groupOf(x.nr)]; count[k] = (count[k] || 0) + 1; });
  const kind = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  return { datum, titel: groups.map((g) => GROUPS[g]).join(' · '), art: kind, dauer_min: Math.round(10 + list.reduce((s, x) => s + (+x.ex.saetze || 1) * 2.5, 0)),
    aufwaermen: kind === 'kraft' ? WARM : [], uebungen: list.map((x) => x.ex), abschluss: kind === 'kraft' ? COOL : [] };
}

function unitDay(datum, nr) {
  const u = UNITS_BY_NR.get(nr);
  if (!u) throw new Error(`Einheit E${nr} gibt es (noch) nicht in der Übungs-Datenbank.`);
  return { datum, titel: u.title, art: u.kind, dauer_min: u.minutes, aufwaermen: u.warmup, abschluss: u.cooldown, hinweis: u.note,
    uebungen: u.exercises.map((x) => (Array.isArray(x) ? exercise(...x) : exercise(x))) };
}

const isoDay = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

// Code im Text finden und in Trainingseinheiten übersetzen (null: kein Trainings-Code im Text)
export function expandTrainingCode(text) {
  const m = String(text).match(/\bTR-(\d{2})(\d{2})(\d{2})((?:-[0-9A-Za-z.@,]+)+)/i);
  if (!m) return null;
  const start = new Date(2000 + +m[1], +m[2] - 1, +m[3]);
  if (start.getMonth() !== +m[2] - 1 || start.getDate() !== +m[3]) throw new Error('Das Datum im Code stimmt nicht.');
  const parts = m[4].slice(1).split('-');
  if (parts.length > 14) throw new Error('Ein Code reicht höchstens für zwei Wochen.');
  return parts.flatMap((part, k) => {
    const d = new Date(start); d.setDate(d.getDate() + k);
    if (part === '0') return [];
    const e = part.match(/^E(\d{1,3})$/i);
    return [e ? unitDay(isoDay(d), +e[1]) : customDay(isoDay(d), part)];
  });
}

// Für das Fenster „Übungen“: alles nach Bereichen, mit Nummern
export function catalogHtml(esc) {
  const ex = Object.entries(GROUPS).map(([g, name]) => `<div class="cat-g"><h3>${esc(name)}</h3><ul>${[...EXERCISES.values()].filter((e) => groupOf(e.nr) === +g)
    .map((e) => `<li><b>${e.nr}</b><span>${esc(e.name)}</span><small>${esc([e.sets > 1 ? `${e.sets} × ${e.reps}` : e.reps, e.rest && `Pause ${e.rest}`].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul></div>`).join('');
  const units = `<div class="cat-g"><h3>Fertige Einheiten</h3><ul>${[...UNITS_BY_NR.values()].map((u) => `<li><b>E${u.nr}</b><span>${esc(u.title)}</span><small>${u.minutes} Min. · ${u.exercises.map((x) => (Array.isArray(x) ? x[0] : x)).join(', ')}</small></li>`).join('')}</ul></div>`;
  return units + ex;
}
