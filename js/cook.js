// Kochmodus: Rezept Schritt für Schritt im Vollbild – Schritt 1 ist immer „Alle Zutaten herrichten“ (zum Abhaken),
// danach steht in jedem Schritt die Menge gleich bei der Zutat (z. B. „Mehl 160 g“).
// Timer aus den Zeitangaben im Schritt (z. B. „40–50 Minuten“ → Knöpfe 40 und 50 Min.) und eine Stoppuhr.
// Wischen oder Pfeiltasten blättern; der Bildschirm bleibt an, solange der Kochmodus offen ist.
import { esc } from './core.js';
import { ICON } from './icons.js';

const DURATION = /(\d+)(?:\s*[–-]\s*(\d+))?\s*(Minuten|Minute|Min\.?|Stunden|Stunde|Std\.?)/gi;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- Mengen im Schritt: Wörter, die zu einer Zutat passen, bekommen ihre Menge dazu ----------
// passt, wenn das Wort ein Wort der Zutat ist oder es abschließt („Mehl“ → „Weizenmehl glatt“, „Öl“ → „Sonnenblumenöl“)
const STOP = new Set(['in', 'an', 'um', 'zu', 'es', 'so', 'ab', 'da', 'im', 'am', 'ca', 'den', 'dem', 'der', 'die', 'das', 'und', 'mit', 'eine', 'einen', 'alles', 'nur', 'bis', 'sich', 'nun', 'dann', 'gut']);
const wordsOf = (s) => String(s).toLowerCase().split(/[^a-zäöüß]+/).filter((w) => w.length >= 3);
function findIng(word, ings, used) {
  const w = word.toLowerCase();
  if (w.length < 2 || STOP.has(w)) return -1;
  return ings.findIndex((x, i) => !used.has(i) && x.q && wordsOf(x.n).some((t) => t === w || (t.endsWith(w) && t.length > w.length)));
}
// Schritt als HTML: Text maskiert, passende Zutat einmal mit ihrer Menge hervorgehoben
export function stepHtml(text, ings) {
  const used = new Set();
  return String(text).split(/([A-Za-zÄÖÜäöüß]+)/).map((part, i) => {
    if (i % 2 === 0) return esc(part);
    const k = findIng(part, ings, used);
    if (k < 0) return esc(part);
    used.add(k);
    return `<span class="ck-amt">${esc(part)} <em>${esc(ings[k].q)}</em></span>`;
  }).join('');
}

// Zeitangaben eines Schritts in Minuten (ohne Doppelte)
function durations(text) {
  const out = new Set();
  for (const m of String(text).matchAll(DURATION)) {
    const k = /^st/i.test(m[3]) ? 60 : 1;
    out.add(+m[1] * k);
    if (m[2]) out.add(+m[2] * k);
  }
  return [...out].filter((v) => v > 0 && v <= 600);
}

// kurzer Ton (drei Pieptöne) und Vibration, wenn der Timer abgelaufen ist
let audio = null;
function alarm() {
  navigator.vibrate?.([300, 150, 300, 150, 300]);
  if (!audio) return;
  [0, .35, .7].forEach((t) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(.25, audio.currentTime + t);
    g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + t + .3);
    o.connect(g).connect(audio.destination);
    o.start(audio.currentTime + t);
    o.stop(audio.currentTime + t + .3);
  });
}

// ingredients: [{ q Menge (schon umgerechnet), n Name }]
export function openCook({ title, steps: given, ingredients }) {
  if (!given.length) return;
  const PREP = Symbol('Zutaten herrichten');
  const steps = ingredients.length ? [PREP, ...given] : given;
  const ready = new Set();   // im ersten Schritt abgehakte Zutaten
  const line = (x) => [x.q, x.n].filter(Boolean).join(' ');
  let k = 0, lock = null, tick = 0;
  const timer = { end: 0, left: 0, total: 0, run: false, done: false };   // Timer (Countdown)
  const watch = { start: 0, acc: 0, run: false };                         // Stoppuhr
  const el = document.createElement('div');
  el.className = 'cookmode';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', `Kochmodus: ${title}`);
  document.body.appendChild(el);
  navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});

  const timerLeft = () => (timer.run ? Math.max(0, (timer.end - Date.now()) / 1000) : timer.left);
  const watchTime = () => (watch.acc + (watch.run ? Date.now() - watch.start : 0)) / 1000;

  function draw() {
    const step = steps[k], last = k === steps.length - 1;
    el.innerHTML = `<div class="ck-head"><b>${esc(title)}</b>
        <button class="ck-x" data-ck="close" aria-label="Kochmodus schließen">${ICON.close}</button></div>
      <div class="ck-prog">${steps.map((_, i) => `<i class="${i < k ? 'done' : i === k ? 'on' : ''}"></i>`).join('')}</div>
      <div class="ck-main">
        <small>Schritt ${k + 1} von ${steps.length}</small>
        ${step === PREP ? `<p class="ck-step">Alle Zutaten herrichten</p>
          <div class="ck-prep">${ingredients.map((x, i) => `<button class="ck-pi ${ready.has(i) ? 'on' : ''}" data-ck="ready" data-i="${i}">
            <span class="ck-box">${ready.has(i) ? ICON.check : ''}</span><b>${esc(x.q)}</b><span>${esc(x.n)}</span></button>`).join('')}</div>`
          : `<p class="ck-step">${stepHtml(step, ingredients)}</p>
        ${durations(step).length ? `<div class="ck-sug">${durations(step).map((m) => `<button class="chip" data-ck="timer" data-min="${m}">${ICON.clock} Timer ${m} Min.</button>`).join('')}</div>` : ''}`}
      </div>
      <div class="ck-tools">
        <div class="ck-clock ${timer.total ? '' : 'idle'} ${timer.done ? 'ring' : ''}" id="ck-timer">
          <span>Timer</span><b>${timer.total ? mmss(timerLeft()) : '–'}</b>
          ${timer.total ? `<button class="cbtn" data-ck="tpause" aria-label="${timer.run ? 'Pause' : 'Weiter'}">${timer.run ? '❚❚' : '▶'}</button><button class="cbtn" data-ck="tstop" aria-label="Timer beenden">${ICON.close}</button>` : ''}
        </div>
        <div class="ck-clock" id="ck-watch"><span>Stoppuhr</span><b>${mmss(watchTime())}</b>
          <button class="cbtn" data-ck="wtoggle" aria-label="${watch.run ? 'Anhalten' : 'Starten'}">${watch.run ? '❚❚' : '▶'}</button>
          ${watchTime() > 0 && !watch.run ? `<button class="cbtn" data-ck="wreset" aria-label="Zurücksetzen">${ICON.undo}</button>` : ''}</div>
        ${ingredients.length && step !== PREP ? `<button class="chip ck-ingbtn" data-ck="ings">${ICON.list} Zutaten</button>` : ''}
      </div>
      <div class="ck-nav">
        <button class="btn secondary" data-ck="prev" ${k ? '' : 'disabled'}>${ICON.chevL} Zurück</button>
        <button class="btn" data-ck="${last ? 'close' : 'next'}">${last ? `${ICON.check} Fertig` : `Weiter ${ICON.chevR}`}</button>
      </div>
      <div class="ck-ings" hidden><div class="ck-ings-in"><b>Zutaten</b><ul>${ingredients.map((x) => `<li>${esc(line(x))}</li>`).join('')}</ul>
        <button class="btn block" data-ck="ings">Schließen</button></div></div>`;
  }
  // nur die Uhren aktualisieren (jede Viertelsekunde), nicht alles neu zeichnen
  function update() {
    const t = el.querySelector('#ck-timer b'), w = el.querySelector('#ck-watch b');
    if (timer.total && t) t.textContent = mmss(timerLeft());
    if (w) w.textContent = mmss(watchTime());
    if (timer.run && timerLeft() <= 0) { timer.run = false; timer.left = 0; timer.done = true; alarm(); draw(); }
  }
  tick = setInterval(update, 250);

  const go = (d) => { k = Math.max(0, Math.min(steps.length - 1, k + d)); draw(); };
  function close() {
    clearInterval(tick);
    lock?.release?.().catch(() => {});
    document.removeEventListener('keydown', onKey);
    el.remove();
  }
  const onKey = (e) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ck]');
    if (!b) { if (timer.done && e.target.closest('#ck-timer')) { timer.done = false; timer.total = 0; draw(); } return; }
    const a = b.dataset.ck;
    if (a === 'close') return close();
    if (a === 'next') go(1);
    else if (a === 'prev') go(-1);
    else if (a === 'ings') el.querySelector('.ck-ings').hidden = !el.querySelector('.ck-ings').hidden;
    else if (a === 'ready') { const i = +b.dataset.i; if (ready.has(i)) ready.delete(i); else ready.add(i); draw(); }
    else if (a === 'timer') {
      try { audio ??= new window.AudioContext(); audio.resume(); } catch { audio = null; }   // Ton erst nach einem Tippen erlaubt
      Object.assign(timer, { total: +b.dataset.min * 60, end: Date.now() + +b.dataset.min * 60000, run: true, done: false });
      draw();
    } else if (a === 'tpause') {
      if (timer.run) Object.assign(timer, { run: false, left: timerLeft() });
      else Object.assign(timer, { run: true, end: Date.now() + timer.left * 1000 });
      draw();
    } else if (a === 'tstop') { Object.assign(timer, { total: 0, run: false, done: false }); draw(); }
    else if (a === 'wtoggle') {
      if (watch.run) Object.assign(watch, { run: false, acc: watch.acc + Date.now() - watch.start });
      else Object.assign(watch, { run: true, start: Date.now() });
      draw();
    } else if (a === 'wreset') { Object.assign(watch, { acc: 0, run: false }); draw(); }
  });
  // wischen: nach links = weiter, nach rechts = zurück
  let sx = null;
  el.addEventListener('touchstart', (e) => { sx = e.target.closest('.ck-main') ? e.touches[0].clientX : null; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    sx = null;
  }, { passive: true });
  draw();
}
