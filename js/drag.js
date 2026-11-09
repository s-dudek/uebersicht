// Ziehen und Ablegen: Einträge verschieben, sortieren, gruppieren; Ordner umsortieren
import { $app, catById, itemById, state, toast } from './core.js';
import { saveItem } from './data.js';
import { saveCatOrder } from './folders.js';
import { closeMenu, openMenuFor } from './menu.js';
import { applyNoteOrder, flatOrder } from './groups.js';
import { render } from './render.js';

export function initCategorySort() {
  // ---------- Ordner in der Übersicht umsortieren: lange drücken und an eine andere Stelle ziehen ----------
  // Am Touchscreen öffnet langes Drücken erst das Menü (wie Rechtsklick); wer dann weiterzieht, sortiert um.
  const HOLD = 380, SLOP = 8;
  let press = null, g = null, swallow = false;
  const begin = () => {
    const el = press.el.isConnected ? press.el : document.querySelector(`[data-cdrag="${press.el.dataset.cdrag}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.className = el.className + ' fghost';
    ghost.removeAttribute('data-cdrag');
    Object.assign(ghost.style, { width: r.width + 'px', height: r.height + 'px', left: r.left + 'px', top: r.top + 'px' });
    document.body.appendChild(ghost);
    el.classList.add('fdragging');
    document.body.classList.add('is-dragging', 'cat-sorting');
    render.hold = true;
    g = { el, ghost, id: el.dataset.cdrag, kind: el.closest('[data-cgrid]').dataset.cgrid, dx: press.x - r.left, dy: press.y - r.top, target: null, after: false };
    navigator.vibrate?.(12);
  };
  const mark = (t, after) => {
    if (g.target === t && g.after === after) return;
    g.target?.classList.remove('ins-l', 'ins-r');
    g.target = t; g.after = after;
    t?.classList.add(after ? 'ins-r' : 'ins-l');
  };
  const move = (x, y) => {
    g.ghost.style.left = (x - g.dx) + 'px';
    g.ghost.style.top = (y - g.dy) + 'px';
    const t = document.elementFromPoint(x, y)?.closest('[data-cgrid] [data-cdrag]');
    if (!t || t === g.el) return mark(null, false);
    const r = t.getBoundingClientRect();
    mark(t, x > r.left + r.width / 2);
    const m = document.querySelector('.main'), mr = m.getBoundingClientRect();
    if (y < mr.top + 60) m.scrollTop -= 10; else if (y > mr.bottom - 60) m.scrollTop += 10;
  };
  const finish = (cancel) => {
    const d = g; g = null;
    render.hold = false;
    document.body.classList.remove('is-dragging', 'cat-sorting');
    d.el.classList.remove('fdragging');
    d.target?.classList.remove('ins-l', 'ins-r');
    d.ghost.remove();
    if (cancel || !d.target) { if (render.pending) { render.pending = false; render(); } return; }
    const ids = [...document.querySelectorAll(`[data-cgrid="${d.kind}"] [data-cdrag]`)].map((x) => x.dataset.cdrag).filter((x) => x !== d.id);
    let at = ids.indexOf(d.target.dataset.cdrag) + (d.after ? 1 : 0);
    ids.splice(at, 0, d.id);
    render.pending = false;
    saveCatOrder(d.kind, ids);
  };
  $app.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = e.target.closest('[data-cgrid] [data-cdrag]');
    if (!el || e.target.closest('input, textarea, .tcheck, .mt-size, .mt-ink')) return;   // Bedienelemente in Karten nicht als Ziehen werten
    const touch = e.pointerType !== 'mouse';
    const hold = el.closest('.editing') ? 120 : HOLD;   // Kacheln im Bearbeiten-Modus: fast sofort ziehen
    press = { el, x: e.clientX, y: e.clientY, menu: false, t: setTimeout(() => {
      if (!press) return;
      if (touch && openMenuFor(press.el, press.x, press.y)) { press.menu = true; press.el.classList.remove('pressing'); navigator.vibrate?.(10); }
      else begin();
    }, hold) };
    el.classList.add('pressing');
  });
  document.addEventListener('pointermove', (e) => {
    if (g) { e.preventDefault(); return move(e.clientX, e.clientY); }
    // Menü offen und Finger zieht weiter: Menü zu, Umsortieren beginnt
    if (press?.menu) { if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP * 2) { closeMenu(); begin(); press = null; } return; }
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) { clearTimeout(press.t); press.el.classList.remove('pressing'); press = null; }
  }, { passive: false });
  const up = (cancel) => () => {
    if (press?.menu) { swallow = true; setTimeout(() => (swallow = false), 400); }   // Loslassen öffnet den Ordner nicht
    if (press) { clearTimeout(press.t); press.el.classList.remove('pressing'); press = null; }
    if (g) { swallow = true; setTimeout(() => (swallow = false), 60); finish(cancel); }
  };
  document.addEventListener('pointerup', up(false));
  document.addEventListener('pointercancel', up(true));
  document.addEventListener('touchmove', (e) => { if (g) e.preventDefault(); }, { passive: false });
  $app.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-cdrag]')) e.preventDefault(); });
  document.addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); swallow = false; } }, true);
}

export function initItemDrag() {
  // ---------- Verschieben: Eintrag lange drücken (oder am Griff ziehen) und auf einen Ordner ziehen ----------
  const HOLD = 380, SLOP = 8;
  let press = null, drag = null, swallowClick = false;
  const scroller = () => document.querySelector('.main');
  const dropAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop]');

  const begin = (p) => {
    // Falls inzwischen neu gezeichnet wurde: aktuelles Element suchen
    const el = p.el.isConnected ? p.el : document.querySelector(`[data-drag="${p.el.dataset.drag}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-drag');
    const gw = Math.min(r.width, 270);   // kompakter Geist, schwebt über dem Finger
    ghost.style.width = gw + 'px';
    ghost.style.left = r.left + 'px';
    ghost.style.top = r.top + 'px';
    document.body.appendChild(ghost);
    el.classList.add('dragging');
    document.body.classList.add('is-dragging');
    render.hold = true;   // während des Ziehens nicht neu zeichnen
    const sortable = el.closest('[data-sortable]');
    drag = { id: el.dataset.drag, el, ghost, dx: Math.min(p.x - r.left, gw - 30), dy: r.height + 14, from: el.closest('[data-drop]')?.dataset.drop ?? '', over: null, y: p.y, x: p.x, raf: 0,
      sortable, ins: null, merge: null, mergeT: 0, mergeCand: null };
    navigator.vibrate?.(12);
    const loop = () => {
      if (!drag) return;
      const m = scroller(); const mr = m.getBoundingClientRect();
      if (drag.over?.classList.contains('dt')) { /* über dem Ablagefeld nicht scrollen */ }
      else if (drag.y < mr.top + 70) m.scrollTop -= 12;
      else if (drag.y > mr.bottom - 70) m.scrollTop += 12;
      move(drag.x, drag.y);
      drag.raf = requestAnimationFrame(loop);
    };
    drag.raf = requestAnimationFrame(loop);
  };
  const move = (x, y) => {
    drag.x = x; drag.y = y;
    drag.ghost.style.left = (x - drag.dx) + 'px';
    drag.ghost.style.top = (y - drag.dy) + 'px';
    const g = dropAt(x, y);
    if (g !== drag.over) {
      drag.over?.classList.remove('over');
      drag.over = g;
      if (g && g.dataset.drop !== drag.from) g.classList.add('over');
    }
    if (drag.sortable) sortMove(x, y);
  };
  // Innerhalb einer Notizliste: Einfügestelle (oben/unten) oder Gruppe bilden (in der Mitte halten)
  const MERGE_HOLD = 550;
  const clearMarks = () => {
    drag.ins?.el.classList.remove('ins-before', 'ins-after');
    drag.ins = null;
  };
  const setMerge = (el) => {
    if (drag.merge === el) return;
    drag.merge?.classList.remove('merge');
    drag.merge = el;
    if (el) { el.classList.add('merge'); navigator.vibrate?.(8); }
  };
  const sortMove = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    const inList = hit && drag.sortable.contains(hit);
    const t = inList ? hit.closest('.trow[data-drag], .ngrp-h, .tend') : null;
    if (!t || t === drag.el) {
      clearMarks(); setMerge(null); clearTimeout(drag.mergeT); drag.mergeCand = null;
      return;
    }
    const r = t.getBoundingClientRect();
    const rel = (y - r.top) / r.height;
    const center = !t.classList.contains('tend') && rel > 0.28 && rel < 0.72;
    if (center) {
      clearMarks();
      if (drag.mergeCand !== t) {
        clearTimeout(drag.mergeT); setMerge(null); drag.mergeCand = t;
        drag.mergeT = setTimeout(() => { if (drag && drag.mergeCand === t) setMerge(t); }, MERGE_HOLD);
      }
      return;
    }
    clearTimeout(drag.mergeT); drag.mergeCand = null; setMerge(null);
    const after = t.classList.contains('tend') ? false : rel >= 0.5;
    if (drag.ins?.el === t && drag.ins.after === after) return;
    clearMarks();
    drag.ins = { el: t, after };
    t.classList.add(after ? 'ins-after' : 'ins-before');
  };
  const sortFinish = (d) => {
    const fid = d.sortable.dataset.sortable, type = d.sortable.dataset.stype || 'note';
    const flat = flatOrder(fid, type);
    const me = flat.find((f) => f.id === d.id);
    if (!me) return false;
    const rest = flat.filter((f) => f.id !== d.id);
    const idxOf = (id) => rest.findIndex((f) => f.id === id);
    if (d.merge) {
      const m = d.merge;
      if (m.classList.contains('ngrp-h')) {           // auf Gruppenkopf: ans Ende der Gruppe
        const gid = m.dataset.ghead;
        const last = rest.map((f) => f.group).lastIndexOf(gid);
        const gname = rest.find((f) => f.group === gid)?.gname;
        rest.splice(last + 1, 0, { id: d.id, group: gid, gname });
      } else {
        const tid = m.dataset.drag, ti = idxOf(tid), tf = rest[ti];
        let gid = tf.group, gname = tf.gname;
        if (!gid) { gid = 'g' + Date.now().toString(36); gname = 'Gruppe'; rest[ti] = { ...tf, group: gid, gname }; }
        rest.splice(ti + 1, 0, { id: d.id, group: gid, gname });
      }
      applyNoteOrder(fid, rest);
      toast('Gruppe gebildet – Namen antippen zum Umbenennen');
      return true;
    }
    if (!d.ins) return false;
    const { el, after } = d.ins;
    let at, group = null, gname;
    if (el.classList.contains('tend')) at = rest.length;
    else if (el.classList.contains('ngrp-h')) {        // vor/nach einem Gruppenkopf
      const gid = el.dataset.ghead;
      const first = rest.findIndex((f) => f.group === gid);
      if (after) { at = first; group = gid; gname = rest[first]?.gname; }   // als erste Notiz in die Gruppe
      else at = first;                                                       // vor die Gruppe
    } else {
      const ti = idxOf(el.dataset.drag), tf = rest[ti];
      at = after ? ti + 1 : ti;
      if (tf.group) {
        const firstOfGroup = rest.findIndex((f) => f.group === tf.group) === ti;
        if (after || !firstOfGroup) { group = tf.group; gname = tf.gname; }
      }
    }
    rest.splice(at, 0, { id: d.id, group, gname });
    const changed = rest.some((f, i) => f.id !== flat[i].id || (f.group || null) !== (flat[i].group || null));
    if (changed) applyNoteOrder(fid, rest);
    return changed;
  };
  const finish = async (cancel) => {
    const d = drag; drag = null;
    render.hold = false;
    const redo = render.pending; render.pending = false;
    if (redo) setTimeout(render, 0);
    cancelAnimationFrame(d.raf);
    document.body.classList.remove('is-dragging');
    d.over?.classList.remove('over');
    d.el.classList.remove('dragging');
    clearTimeout(d.mergeT);
    d.merge?.classList.remove('merge');
    d.ins?.el.classList.remove('ins-before', 'ins-after');
    const target = !cancel && d.over ? d.over.dataset.drop : null;
    if (!cancel && d.sortable && !d.over?.classList.contains('dt') && sortFinish(d)) { d.ghost.remove(); return; }
    if (target === null || target === d.from) {
      d.ghost.classList.add('back');
      const r = d.el.getBoundingClientRect();
      d.ghost.style.left = r.left + 'px'; d.ghost.style.top = r.top + 'px';
      setTimeout(() => d.ghost.remove(), 220);
      return;
    }
    d.ghost.remove();
    const { error } = await saveItem(d.id, { category_id: target || null });
    if (!error) {
      const c = catById(target);
      toast(c ? `Nach „${c.name}“ verschoben` : 'Kategorie entfernt');
      document.querySelector(`[data-drag="${d.id}"]`)?.classList.add('landed');
    }
  };

  $app.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = e.target.closest('[data-drag]');
    if (!el || e.target.closest('.check, .xcheck, .tcheck, input')) return;
    const p = { el, x: e.clientX, y: e.clientY, id: e.pointerId, t: 0 };
    if (e.target.closest('[data-grip]')) { e.preventDefault(); press = p; return begin(p); }
    p.t = setTimeout(() => { if (press === p) begin(p); }, HOLD);
    press = p;
    el.classList.add('pressing');
  });
  document.addEventListener('pointermove', (e) => {
    if (drag) { e.preventDefault(); return move(e.clientX, e.clientY); }
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) {   // bewegt = scrollen, kein Verschieben
      clearTimeout(press.t); press.el.classList.remove('pressing'); press = null;
    }
  }, { passive: false });
  const up = (cancel) => () => {
    if (press) { clearTimeout(press.t); press.el.classList.remove('pressing'); press = null; }
    if (drag) { swallowClick = true; setTimeout(() => (swallowClick = false), 60); finish(cancel); }
  };
  document.addEventListener('pointerup', up(false));
  document.addEventListener('pointercancel', up(true));
  // Während des Ziehens nicht scrollen lassen (iPhone) und kein Kontextmenü
  document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  $app.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-drag]')) e.preventDefault(); });
  document.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);

  // Tastatur: Griff fokussieren, Pfeil hoch/runter wechselt den Ordner
  $app.addEventListener('keydown', async (e) => {
    const grip = e.target.closest?.('[data-grip]');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const order = [...state.categories.map((c) => c.id), ''];
    const n = itemById(grip.dataset.grip);
    const cur = order.indexOf(n.category_id && catById(n.category_id) ? n.category_id : '');
    const next = order[(cur + (e.key === 'ArrowDown' ? 1 : -1) + order.length) % order.length];
    await saveItem(n.id, { category_id: next || null });
    document.querySelector(`[data-grip="${n.id}"]`)?.focus();
  });
}
