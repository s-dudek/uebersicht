// Bereich Gerichte: Wochenplan, Einkaufsliste, Übernahme aus einem Code
import { canDeleteItem, debounce, esc, itemById, sb, state, toast } from './core.js';
import { deleteItem, insertCategory, loadAll, saveItem } from './data.js';
import { addDays, dayName, isoWeek, parseYmd, ymd } from './dates.js';
import { ICON } from './icons.js';
import { render } from './render.js';
import { closeSheet, openSheet } from './sheet.js';

export function groupBySection(items, row) {
  const groups = new Map();
  [...items].sort((a, b) => sectionIndex(a.meta?.section) - sectionIndex(b.meta?.section) || a.title.localeCompare(b.title, 'de'))
    .forEach((i) => { const k = SECTIONS[sectionIndex(i.meta?.section)][0]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  return [...groups].map(([name, list]) => `<div class="sec">
      <div class="sec-h">${ICON[SECTIONS[sectionIndex(name)][1]]}<span>${esc(name)}</span><i>${list.length}</i></div>
      <div class="krows">${list.map(row).join('')}</div>
    </div>`).join('');
}

// ---------- Wochenplan: Abteilungen, Mahlzeiten, Datum ----------
const SECTIONS = [
  ['Obst & Gemüse', 'leaf'], ['Brot & Backwaren', 'bread'], ['Kühlregal', 'milk'], ['Fleisch & Fisch', 'meat'],
  ['Tiefkühl', 'snow'], ['Trockenware & Konserven', 'jar'], ['Gewürze & Öle', 'spice'], ['Getränke', 'bottle'],
  ['Süßes & Snacks', 'candy'], ['Drogerie & Haushalt', 'spray'], ['Sonstiges', 'dots'],
];

const sectionIndex = (name) => { const i = SECTIONS.findIndex(([n]) => n === name); return i < 0 ? SECTIONS.length - 1 : i; };

export const SLOTS = [['fruehstueck', 'Frühstück'], ['mittag', 'Mittag'], ['abend', 'Abend']];

const slotLabel = (k) => (SLOTS.find(([s]) => s === k) || [k, k])[1];

const SHOP_NAME = 'Wocheneinkauf';

export const shopCat = () => state.categories.find((c) => c.name.trim().toLowerCase() === SHOP_NAME.toLowerCase());

export const mealsOn = (day) => state.items.filter((i) => i.type === 'meal' && i.due_date === day)
  .sort((a, b) => SLOTS.findIndex(([k]) => k === a.meta?.slot) - SLOTS.findIndex(([k]) => k === b.meta?.slot));

export const cookOn = (day) => state.items.filter((i) => i.type === 'meal' && i.meta?.cook_date === day && i.due_date !== day);

export function mealRow(m, { compact = false } = {}) {
  const n = m.meta?.nutrition || {};
  const pre = m.meta?.cook_date && m.meta.cook_date !== m.due_date;
  return `<button class="mrow slot-${esc(m.meta?.slot || '')}" data-act="open" data-id="${m.id}">
    <span class="m-slot">${esc(slotLabel(m.meta?.slot))}</span>
    <span class="m-main">
      <b>${m.icon && ICON[m.icon] ? `<span class="tic-in">${ICON[m.icon]}</span>` : ''}${esc(m.title)}</b>
      ${compact ? '' : `<span class="m-tags">
        ${(m.meta?.tags || []).slice(0, 3).map((t) => `<i>${esc(t)}</i>`).join('')}
        ${pre ? `<i class="pre">${ICON.pot} vorgekocht ${esc(dayName(m.meta.cook_date, { weekday: 'short' }))}</i>` : ''}
      </span>`}
    </span>
    ${n.kcal ? `<span class="m-kcal">${Math.round(n.kcal)}<small>kcal</small></span>` : ''}
  </button>`;
}

export function renderMeals() {
  const days = Array.from({ length: 7 }, (_, k) => addDays(state.weekStart, k));
  const today = ymd(new Date());
  const weekMeals = days.flatMap(mealsOn);
  const cat = shopCat();
  const openShop = cat ? state.items.filter((i) => i.type === 'todo' && i.category_id === cat.id && !i.done).length : 0;
  const lunches = weekMeals.filter((m) => m.meta?.slot === 'mittag');
  const kcal = lunches.map((m) => m.meta?.nutrition?.kcal).filter(Boolean);
  const summary = `<section class="tile wsum">
      <div class="wsum-h"><b>KW ${isoWeek(state.weekStart)}</b><span>${esc(parseYmd(state.weekStart).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' }))} – ${esc(parseYmd(addDays(state.weekStart, 6)).toLocaleDateString('de-AT', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
      <div class="wsum-row">
        <div><b>${lunches.length}</b><span>Mittagessen</span></div>
        <div><b>${weekMeals.length - lunches.length}</b><span>Frühstück / Abend</span></div>
        <div><b>${kcal.length ? Math.round(kcal.reduce((a, b) => a + b, 0) / kcal.length) : '–'}</b><span>kcal Mittag Ø</span></div>
      </div>
      <div class="wsum-act">
        ${cat ? `<button class="btn secondary" data-act="goto-shop">${ICON.cart} Wocheneinkauf · ${openShop} offen</button>` : ''}
        <button class="btn" data-act="import-plan">${ICON.plus} Code einfügen</button>
      </div>
    </section>`;
  if (!weekMeals.length) {
    return summary + `<section class="tile"><p class="empty">Für diese Woche ist noch nichts geplant. Stell dir mit Claude das Essen zusammen (für einen Tag oder die ganze Woche) und füge den Code hier ein.</p>
      ${window.__DEMO ? '<button class="btn block" data-act="demo-plan">Beispielwoche laden</button>' : ''}</section>`;
  }
  return summary + `<div class="tgrid days">${days.map((d) => {
    const list = mealsOn(d), cook = cookOn(d);
    if (!list.length && !cook.length) return `<section class="tile day empty-day"><div class="th"><b>${esc(dayName(d))}</b><small class="dd">${esc(dayName(d, { day: 'numeric', month: 'numeric' }))}</small></div><p class="kempty">Nichts geplant.</p></section>`;
    return `<section class="tile day ${d === today ? 'today' : ''}">
      <div class="th"><b>${esc(dayName(d))}</b><small class="dd">${esc(dayName(d, { day: 'numeric', month: 'numeric' }))}</small>${d === today ? '<span class="utag">Heute</span>' : ''}</div>
      ${cook.length ? `<div class="cook">${ICON.pot}<span>Heute auch vorkochen: <b>${cook.map((m) => `${esc(m.title)} (${esc(dayName(m.due_date, { weekday: 'short' }))})`).join(', ')}</b></span></div>` : ''}
      <div class="mrows">${list.map((m) => mealRow(m)).join('')}</div>
    </section>`;
  }).join('')}</div>`;
}

// ---------- Gericht ansehen ----------
export function openMeal(id) {
  const m = itemById(id);
  if (!m) return;
  const meta = m.meta || {};
  const n = meta.nutrition || {};
  const pre = meta.cook_date && meta.cook_date !== m.due_date;
  const sheet = openSheet(`
    <div class="sheet-head"><span class="status">${esc(slotLabel(meta.slot))} · ${esc(dayName(m.due_date, { weekday: 'long', day: 'numeric', month: 'long' }))}</span><button class="link-btn" data-close>Fertig</button></div>
    <div class="title-row"><span class="icon-pick has">${m.icon && ICON[m.icon] ? ICON[m.icon] : ICON.pot}</span><textarea class="title-input m-title" id="m-title" rows="2">${esc(m.title)}</textarea></div>
    <div class="m-badges">
      ${(meta.tags || []).map((t) => `<span class="utag light">${esc(t)}</span>`).join('')}
      ${meta.minutes ? `<span class="utag light">${ICON.clock} ${esc(meta.minutes)} Min.</span>` : ''}
      ${meta.servings ? `<span class="utag light">${esc(meta.servings)} Portionen</span>` : ''}
      ${pre ? `<span class="utag">${ICON.pot} vorkochen am ${esc(dayName(meta.cook_date, { weekday: 'long' }))}</span>` : ''}
    </div>
    ${n.kcal || n.protein || n.fat || n.carbs ? `<div class="nutri">
      <div><b>${n.kcal ? Math.round(n.kcal) : '–'}</b><span>kcal</span></div>
      <div><b>${n.protein != null ? Math.round(n.protein) + ' g' : '–'}</b><span>Eiweiß</span></div>
      <div><b>${n.fat != null ? Math.round(n.fat) + ' g' : '–'}</b><span>Fett</span></div>
      <div><b>${n.carbs != null ? Math.round(n.carbs) + ' g' : '–'}</b><span>Kohlenh.</span></div>
    </div><p class="hint">Schätzwerte pro Portion.</p>` : ''}
    ${(meta.ingredients || []).length ? `<div class="field"><label>Zutaten${meta.servings ? ` für ${esc(meta.servings)} Portionen` : ''}</label><ul class="ing">${meta.ingredients.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${(meta.steps || []).length ? `<div class="field"><label>Zubereitung</label><ol class="steps">${meta.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
    ${meta.note ? `<div class="field"><label>Hinweis</label><p class="m-note">${esc(meta.note)}</p></div>` : ''}
    <div class="row-inline" style="margin-bottom:14px">
      <div class="field" style="flex:1;margin:0"><label>Essen am</label><input class="input" type="date" id="m-date" value="${esc(m.due_date || '')}"></div>
      <div class="field" style="flex:1;margin:0"><label>Kochen am</label><input class="input" type="date" id="m-cook" value="${esc(meta.cook_date || m.due_date || '')}"></div>
    </div>
    ${canDeleteItem(m) ? '<button class="btn danger block" id="m-delete">Gericht entfernen</button>' : ''}`, { onClose: () => saveTitle.flush() });
  const saveTitle = debounce(() => { const v = sheet.querySelector('#m-title')?.value; if (v != null && v !== itemById(id)?.title) saveItem(id, { title: v }); }, 600);
  sheet.querySelector('#m-title').addEventListener('input', saveTitle);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('#m-date').addEventListener('change', (e) => { if (e.target.value) saveItem(id, { due_date: e.target.value }); });
  sheet.querySelector('#m-cook').addEventListener('change', (e) => saveItem(id, { meta: { ...(itemById(id).meta || {}), cook_date: e.target.value || null } }));
  sheet.querySelector('#m-delete')?.addEventListener('click', async () => { if (await deleteItem(id)) closeSheet(); });
}

// ---------- Wochenplan aus einem Code übernehmen (Fenster: plan-import.js) ----------
export async function importPlan(plan) {
  const gerichte = (plan.gerichte || []).filter((g) => g && g.datum && g.titel);
  const einkauf = (plan.einkauf || []).filter((e) => e && e.name);

  // 1. Kategorie "Wocheneinkauf" sicherstellen (als Todo-Liste)
  let cat = shopCat();
  if (!cat) {
    const { data, error } = await insertCategory({ name: SHOP_NAME, color: '#7FA08A', todo_list: true });
    if (error) throw error;
    state.categories.push(data); cat = data;
    toast('Liste „Wocheneinkauf“ angelegt. Teilen kannst du sie in den Todos über „Bearbeiten“.', 5000);
  } else if (!cat.todo_list && cat.owner_id === state.me) {
    await sb.from('categories').update({ todo_list: true }).eq('id', cat.id); cat.todo_list = true;
  }

  // 2. Abgehakte Einkäufe löschen
  for (const i of state.items.filter((x) => x.type === 'todo' && x.category_id === cat.id && x.done)) {
    await sb.from('items').delete().eq('id', i.id);
  }

  // 3. Gerichte: gleiche Tage + Mahlzeit ersetzen, dann neu anlegen
  for (const g of gerichte) {
    const slot = g.mahlzeit || 'mittag';
    for (const old of state.items.filter((x) => x.type === 'meal' && x.due_date === g.datum && x.meta?.slot === slot)) {
      await sb.from('items').delete().eq('id', old.id);
    }
  }
  const mealRows = gerichte.map((g) => {
    const ing = (g.zutaten || []).map(String), steps = (g.zubereitung || []).map(String);
    const nv = g.naehrwerte || {};
    return {
      type: 'meal', title: String(g.titel).slice(0, 140), category_id: cat.id, due_date: g.datum, icon: ICON[g.symbol] ? g.symbol : null,
      body: [ing.length ? 'Zutaten:\n' + ing.map((x) => '- ' + x).join('\n') : '', steps.length ? 'Zubereitung:\n' + steps.map((x, k) => `${k + 1}. ${x}`).join('\n') : ''].filter(Boolean).join('\n\n'),
      meta: {
        slot: g.mahlzeit || 'mittag', cook_date: g.kochen_am || g.datum, servings: g.portionen || null, minutes: g.dauer_min || null,
        tags: (g.tags || []).map(String).slice(0, 6), ingredients: ing, steps, note: g.hinweis || '',
        nutrition: { kcal: nv.kcal ?? null, protein: nv.eiweiss ?? null, fat: nv.fett ?? null, carbs: nv.kohlenhydrate ?? null },
      },
    };
  });
  if (mealRows.length) { const { error } = await sb.from('items').insert(mealRows); if (error) throw error; }

  // 4. Einkauf: gleiche offene Artikel zusammenführen, Rest neu
  const openByName = new Map(state.items.filter((x) => x.type === 'todo' && x.category_id === cat.id && !x.done).map((x) => [x.title.trim().toLowerCase(), x]));
  const newRows = []; let merged = 0;
  for (const e of einkauf) {
    const key = String(e.name).trim().toLowerCase();
    const meta = { amount: e.menge || '', section: SECTIONS.some(([n]) => n === e.abteilung) ? e.abteilung : 'Sonstiges', for: e.fuer || '' };
    const ex = openByName.get(key);
    if (ex) {
      merged++;
      const amount = [ex.meta?.amount, meta.amount].filter(Boolean).join(' + ');
      await sb.from('items').update({ meta: { ...(ex.meta || {}), ...meta, amount } }).eq('id', ex.id);
    } else newRows.push({ type: 'todo', title: String(e.name).slice(0, 120), category_id: cat.id, meta });
  }
  if (newRows.length) { const { error } = await sb.from('items').insert(newRows); if (error) throw error; }

  await loadAll();
  return { meals: mealRows.length, added: newRows.length, merged, firstDate: gerichte.map((g) => g.datum).sort()[0] };
}
