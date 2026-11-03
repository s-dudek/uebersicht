// Steuerknopf (Smartphone/Tablet): auf der Startseite groß mit den Bereichen, sonst unten rechts (tippen = zurück)
import { $app } from './core.js';
import { ICON, LOGO_MARK } from './icons.js';
import { NAV, navigate } from './nav.js';

// Steuerknopf wird erst beim Start erzeugt (braucht das fertige DOM)
export let ctl = null;

function createControl() {
  const R = 160;          // Radius des Rads
  const MOVE = 24;        // px Bewegung: kein Tippen, sondern Wischen -> nichts tun
  const SIZE = 64, EDGE = 16;

  const el = document.createElement('div');
  el.className = 'ctl';
  el.hidden = true;
  el.innerHTML = `
    <div class="ctl-veil"></div>
    <div class="ctl-label" aria-live="polite"></div>
    ${NAV.map((w, i) => `<button class="wi ${w.soon ? 'soon' : ''}" data-go="${w.key}" style="--d:${i * 28}ms" tabindex="-1" aria-label="${w.label}">${ICON[w.icon]}</button>`).join('')}
    <div class="ctl-burst">${Array.from({ length: 10 }, (_, i) => `<i style="--a:${i * 36}deg"></i>`).join('')}</div>
    <button class="ctl-btn" aria-label="Zurück zum Menü">${LOGO_MARK}</button>`;
  document.body.appendChild(el);

  const btn = el.querySelector('.ctl-btn');
  const label = el.querySelector('.ctl-label');
  const items = [...el.querySelectorAll('.wi')];
  let pos = [];
  let mode = 'idle', hovered = null, start = null;
  let anchorEl = null;   // 'center' auf der Home-Seite: Knopf groß in der Bildschirmmitte
  let active = NAV;    // aktuell sichtbare Ziele

  // ---- Position: Startseite mittig, sonst fest unten rechts ----
  const vw = () => document.documentElement.clientWidth;
  const vh = () => document.documentElement.clientHeight;
  const applyPos = () => {
    el.classList.toggle('big', !!anchorEl);
    if (anchorEl) {
      el.style.left = (vw() / 2 - el.offsetWidth / 2) + 'px';
      el.style.top = (vh() / 2 - el.offsetHeight / 2) + 'px';
      return;
    }
    const insetB = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
    // Unterseiten: fest unten rechts im Eck, neben der Leiste
    const x = vw() - SIZE - EDGE, y = vh() - SIZE - 14 - insetB;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  };
  window.addEventListener('resize', applyPos);

  // ---- Rad: öffnet Richtung Bildschirmmitte ----
  const layout = () => {
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const base = anchorEl ? 90 : 225;
    const span = anchorEl ? 170 : 92;
    active = anchorEl ? NAV.filter((w) => w.key !== 'home') : NAV;
    items.forEach((b) => { b.hidden = !active.some((w) => w.key === b.dataset.go); });
    // Unterseiten: Viertelkreis vom Eck unten rechts nach links oben
    const rr = anchorEl ? Math.min(R, vw() / 2 - 44) : Math.min(250, cx - 40, cy - 60);
    const arc = (d) => active.map((w, i) => {
      const a = (d - span / 2 + i * span / (active.length - 1)) * Math.PI / 180;
      return { x: Math.round(rr * Math.cos(a)), y: Math.round(rr * Math.sin(a)) };
    });
    // Rad so weit drehen, bis alle Ziele auf dem Bildschirm liegen
    const fits = (p) => p.every(({ x, y }) => cx + x > 30 && cx + x < vw() - 30 && cy + y > 30 && cy + y < vh() - 30);
    let dir = base;
    for (let k = 0; k <= 36; k++) {
      const cand = [base + k * 5, base - k * 5].find((d) => fits(arc(d)));
      if (cand !== undefined) { dir = cand; break; }
    }
    pos = arc(dir);
    active.forEach((w, i) => { const b = items.find((x) => x.dataset.go === w.key); b.style.setProperty('--x', pos[i].x + 'px'); b.style.setProperty('--y', pos[i].y + 'px'); });
    // Hinweis: auf Home unter dem Knopf, sonst oben in der Bildschirmmitte
    label.style.top = anchorEl ? Math.round(r.top - 62) + 'px' : '';
  };

  const setHover = (k) => {
    if (hovered === k) return;
    hovered = k;
    items.forEach((b) => b.classList.toggle('hot', b.dataset.go === k));
    const w = NAV.find((x) => x.key === k);
    label.textContent = w ? (w.soon ? `${w.label} (bald)` : w.label) : (anchorEl ? '' : 'Bereich antippen');
    el.classList.toggle('has-hot', !!w);
    if (k) navigator.vibrate?.(8);
  };
  const open = () => {
    mode = 'open';
    layout();
    el.classList.add('open', 'burst');
    setTimeout(() => el.classList.remove('burst'), 520);
    hovered = undefined;
    setHover(null);
    navigator.vibrate?.(14);
  };
  const close = () => {
    el.classList.remove('burst', 'pulse');
    if (anchorEl) { mode = 'pinned'; setHover(null); return; }   // Home: Bereiche bleiben stehen
    mode = 'idle';
    el.classList.remove('open', 'pinned');
    setHover(null);
  };
  const pin = (first) => {
    mode = 'pinned';
    layout();
    el.classList.add('open', 'pinned');
    if (first) { el.classList.add('burst'); setTimeout(() => el.classList.remove('burst'), 520); }
    hovered = undefined;
    setHover(null);
  };

  // Kreis wird größer und deckt die neue Seite auf
  const reveal = (fn) => {
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !$app.animate) return fn();
    const ghost = $app.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.className = 'reveal-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(ghost, $app);
    el.classList.add('revealing');
    $app.classList.add('revealing');
    fn();
    const far = Math.hypot(Math.max(cx, vw() - cx), Math.max(cy, vh() - cy)) + 20;
    const start0 = Math.max(r.width / 2, 20);
    $app.animate(
      [{ clipPath: `circle(${start0}px at ${cx}px ${cy}px)` }, { clipPath: `circle(${far}px at ${cx}px ${cy}px)` }],
      { duration: 560, easing: 'cubic-bezier(.65,0,.25,1)' }
    ).finished.finally(() => {
      ghost.remove();
      $app.classList.remove('revealing');
      el.classList.remove('revealing');
    });
  };
  const go = (k) => { close(); navigate(k, reveal); };
  const nearest = (e) => {
    const r = btn.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    let best = null, bd = 1e9;
    pos.forEach((p, i) => { const d = Math.hypot(dx - p.x, dy - p.y); if (d < bd) { bd = d; best = active[i].key; } });
    return bd < 40 ? best : null;
  };

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (mode === 'open') return;
    try { btn.setPointerCapture(e.pointerId); } catch {}
    start = { x: e.clientX, y: e.clientY };
    mode = 'press';   // Startseite: Ziel beim Loslassen; Unterseiten: kurz tippen = zurück zum Menü
  });
  btn.addEventListener('pointermove', (e) => {
    if (mode === 'open' || (anchorEl && mode === 'press')) return setHover(nearest(e));
    if (mode === 'press' && !anchorEl && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE) {
      mode = 'idle';                   // weggezogen -> abbrechen
    }
  });
  btn.addEventListener('pointerup', (e) => {
    if (mode === 'press' && anchorEl) {
      const k = nearest(e);
      if (k) return go(k);
      mode = 'pinned';
      el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
      return;
    }
    if (mode === 'press') { mode = 'idle'; navigator.vibrate?.(10); return go('home'); }
    if (mode === 'open') { const k = nearest(e); if (k) go(k); else label.textContent = 'Ziel antippen'; }
  });
  btn.addEventListener('pointercancel', () => { if (mode !== 'open') close(); });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (!anchorEl) go('home'); }
    if (e.key === 'Escape' && !anchorEl) { e.preventDefault(); go('home'); }
    if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); open(); items[0].focus(); }
  });
  btn.addEventListener('click', (e) => e.preventDefault());
  items.forEach((b) => {
    b.addEventListener('click', () => go(b.dataset.go));
    const on = () => mode === 'open' || mode === 'pinned';
    b.addEventListener('pointerenter', () => { if (on()) setHover(b.dataset.go); });
    b.addEventListener('pointerleave', () => { if (on()) setHover(null); });
    b.addEventListener('focus', () => { if (on()) setHover(b.dataset.go); });
    b.addEventListener('blur', () => { if (on()) setHover(null); });
  });
  el.querySelector('.ctl-veil').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode === 'open') close(); });

  document.fonts?.ready.then(() => { if (!el.hidden) applyPos(); });
  document.addEventListener('scroll', () => { if (anchorEl && !el.hidden) applyPos(); }, true);
  return {
    show: (v, anchor = null) => {
      const wasPinned = el.classList.contains('pinned');
      anchorEl = v ? anchor : null;
      el.hidden = !v;
      if (!v) return close();
      applyPos();
      if (anchorEl) pin(!wasPinned); else close();
    },
  };
}

export function startControl() { ctl = createControl(); }
