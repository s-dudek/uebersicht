// Bereich Todos: Übersicht und geöffnete Liste
import { catById, esc, state } from './core.js';
import { dueLabel } from './dates.js';
import { dropTray, folderIc, itemTint, todoLists } from './folders.js';
import { blocksHtml } from './groups.js';
import { ICON } from './icons.js';
import { groupBySection } from './meals.js';

export const todosIn = (lid) => state.items.filter((i) => i.type === 'todo' && (lid ? i.category_id === lid : !i.category_id || !catById(i.category_id)));

export const byDue = (a, b) => {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return b.created_at.localeCompare(a.created_at);
};

export function renderTodos() {
  if (state.list !== null && (state.list === '' || catById(state.list))) return renderTodoList(state.list);
  state.list = null;
  const card = (l) => {
    const mine = todosIn(l.id);
    const open = mine.filter((i) => !i.done);
    const due = open.filter((i) => i.due_date && dueLabel(i.due_date).overdue).length;
    return `<button class="fcard" data-act="open-list" data-id="${l.id}" data-drop="${l.id}" ${l.id ? `data-cdrag="${l.id}"` : ''}>
      ${folderIc(l)}
      <span class="fc-n">${esc(l.name)}</span>
      <span class="fc-s">${open.length ? `${open.length} offen` : mine.length ? 'alles erledigt' : 'leer'}${due ? ` · <em>${due} überfällig</em>` : ''}</span>
      ${l.shared ? `<span class="fc-sh" title="gemeinsam">${ICON.share}</span>` : ''}
      <span class="fc-c ${open.length ? '' : 'zero'}">${open.length}</span>
    </button>`;
  };
  return `<div class="fgrid" data-cgrid="todos">${todoLists().map(card).join('')}
    <button class="fcard fnew" data-act="new-list"><span class="fc-ic">${ICON.plus}</span><span class="fc-n">Neue Liste</span></button>
  </div>
  <p class="hint xhint">Liste lange drücken, um sie an eine andere Stelle zu ziehen.</p>`;
}

function renderTodoList(lid) {
  const mine = todosIn(lid);
  const open = mine.filter((i) => !i.done).sort(byDue);
  const done = mine.filter((i) => i.done).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const showDone = state.doneOpen.has(lid);
  const row = (i) => `
    <div class="trow ${i.done ? 'done' : ''} ${i.meta?.color ? 'tinted' : ''}" data-drag="${i.id}" data-gid="${esc(i.meta?.group || '')}"${itemTint(i)}>
      <button class="tcheck ${i.done ? 'on' : ''}" data-act="toggle" data-id="${i.id}" aria-label="${i.done ? 'Wieder öffnen' : 'Erledigt'}">${i.done ? ICON.check : ''}</button>
      <button class="tname" data-act="open" data-id="${i.id}"><span>${esc(i.title) || '<span class="muted">Ohne Titel</span>'}</span></button>
      ${i.meta?.amount ? `<span class="kamt">${esc(i.meta.amount)}</span>` : ''}
      ${!i.done && i.remind_at && !i.reminded ? `<span class="tbell" title="Erinnerung">${ICON.bell}</span>` : ''}
      ${!i.done ? dueTag(i) : ''}
    </div>`;
  const rows = (list) => `<div class="trows">${list.map(row).join('')}</div>`;
  return `<section class="tbig" data-drop="${lid}">
    <form class="addrow tadd" data-list="${lid}"><span class="xic">${ICON.plus}</span><input name="title" placeholder="Neues Todo …" autocomplete="off" enterkeyhint="done"></form>
    ${open.length ? (open.some((i) => i.meta?.section) ? groupBySection(open, row).replaceAll('class="krows"', 'class="trows"') : blocksHtml(lid, 'todo', row)) : '<p class="kempty">Alles erledigt.</p>'}
    ${done.length ? `<button class="done-toggle" data-act="toggle-done" data-id="${lid}" aria-expanded="${showDone}">
      <span class="chev ${showDone ? 'open' : ''}">${ICON.chevron}</span>${done.length} erledigt</button>
      ${showDone ? rows(done) : ''}` : ''}
  </section>
  ${dropTray(todoLists(), lid)}
  <p class="hint xhint">Lange drücken und ziehen: nach oben oder unten verschieben, auf ein anderes Todo halten für eine Gruppe, unten in eine andere Liste.</p>`;
}

// Kompakte Zeile in Kacheln: etwas luftiger als die Liste, aber gleiche Infos
const dueTag = (i) => {
  if (!i.due_date) return '';
  const d = dueLabel(i.due_date);
  return `<span class="kdue ${d.overdue && !i.done ? 'overdue' : ''}">${esc(d.text)}</span>`;
};
