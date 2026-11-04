// Code einfügen: Gerichte (mit Einkaufsliste) und/oder Training – für einen Tag oder eine ganze Woche.
// Den Code stellt Claude im Chat zusammen; das Format steht in CLAUDE.md („Codes für Gerichte und Training“).
import { esc, state, toast } from './core.js';
import { dayName, mondayOf, parseYmd } from './dates.js';
import { ICON } from './icons.js';
import { importPlan } from './meals.js';
import { render } from './render.js';
import { closeSheet, openSheet } from './sheet.js';
import { importTraining, validTraining } from './training.js';

function parseCode(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Kein Code gefunden. Bitte den ganzen Code aus dem Chat einfügen.');
  let plan;
  try { plan = JSON.parse(text.slice(a, b + 1)); } catch { throw new Error('Der Code ist unvollständig oder beschädigt. Bitte noch einmal komplett kopieren.'); }
  const meals = Array.isArray(plan.gerichte) ? plan.gerichte.filter((g) => g && g.datum && g.titel) : [];
  const shop = Array.isArray(plan.einkauf) ? plan.einkauf.filter((e) => e && e.name) : [];
  const training = validTraining(plan.training);
  if (!meals.length && !shop.length && !training.length) throw new Error('Im Code sind weder Gerichte noch Einkäufe noch Training.');
  return { plan, meals, shop, training };
}

// Zeitraum als kurzer Text: „Mo 10.11.“ oder „Mo 10.11. bis So 16.11.“
function span(dates) {
  const d = [...new Set(dates)].sort();
  if (!d.length) return '';
  const f = (s) => dayName(s, { weekday: 'short', day: 'numeric', month: 'numeric' });
  return d.length === 1 ? f(d[0]) : `${f(d[0])} bis ${f(d[d.length - 1])}`;
}

export function openPlanImport() {
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Code einfügen</h2><button class="link-btn" data-close>Fertig</button></div>
    <p class="hint" style="margin:0 2px 12px">Den Code, den dir Claude für Essen oder Training zusammenstellt, hier komplett einfügen – für einen Tag oder eine ganze Woche.</p>
    <textarea class="textarea" id="imp-text" rows="7" placeholder="PLAN { … }"></textarea>
    <div id="imp-preview"></div>
    <div class="row-inline" style="margin-top:12px">
      ${window.__DEMO ? '<button class="btn secondary" id="imp-demo" type="button">Beispiel</button>' : ''}
      <button class="btn" id="imp-go" type="button" style="flex:1" disabled>Übernehmen</button>
    </div>`);
  const $t = sheet.querySelector('#imp-text'), $p = sheet.querySelector('#imp-preview'), $go = sheet.querySelector('#imp-go');
  let code = null;
  const check = () => {
    code = null; $go.disabled = true;
    if (!$t.value.trim()) { $p.innerHTML = ''; return; }
    try {
      code = parseCode($t.value);
      const { meals, shop, training } = code;
      const lines = [];
      if (meals.length || shop.length) lines.push(`<b>${meals.length} Gerichte, ${shop.length} Einkäufe</b><small>${esc(span(meals.map((g) => g.datum)))}</small><small>Gerichte an denselben Tagen und Mahlzeiten werden ersetzt, abgehakte Einkäufe gelöscht.</small>`);
      if (training.length) lines.push(`<b>${training.length} Trainingseinheiten</b><small>${esc(span(training.map((t) => t.datum)))}</small><small>Deine bisherigen Einheiten an diesen Tagen werden ersetzt.</small>`);
      $p.innerHTML = `<div class="imp-ok">${ICON.check}<div>${lines.join('<hr>')}</div></div>`;
      $go.disabled = false;
    } catch (err) { $p.innerHTML = `<div class="imp-err">${esc(err.message)}</div>`; }
  };
  $t.addEventListener('input', check);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('#imp-demo')?.addEventListener('click', () => { $t.value = JSON.stringify(window.__DEMO_PLAN(), null, 1); check(); });
  $go.addEventListener('click', async () => {
    if (!code) return;
    $go.disabled = true; $go.textContent = 'Übernehme …';
    try {
      const msg = [];
      let first = null, tab = state.tab;
      if (code.meals.length || code.shop.length) {
        const r = await importPlan(code.plan);
        msg.push(`${r.meals} Gerichte, ${r.added} Einkäufe`);
        first = r.firstDate; tab = 'meals';
      }
      if (code.training.length) {
        const r = await importTraining(code.training);
        msg.push(`${r.units} Trainingseinheiten`);
        first ??= r.firstDate;
        if (!code.meals.length || state.tab === 'training') tab = 'training';
      }
      closeSheet();
      if (first) state.weekStart = mondayOf(parseYmd(first));
      state.tab = tab;
      render();
      toast(`${msg.join(' und ')} übernommen`, 4000);
    } catch (err) { toast('Fehler: ' + err.message, 6000); $go.disabled = false; $go.textContent = 'Übernehmen'; }
  });
  setTimeout(() => $t.focus(), 60);
}
