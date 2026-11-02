// Anmeldung und Registrierung
import { ctl } from './control.js';
import { $app, esc, sb, state } from './core.js';
import { loadAll, subscribe, unsubscribe } from './data.js';
import { ICON, LOGO_MARK, LOGO_WORD } from './icons.js';
import { closeSheet } from './sheet.js';

// ====================================================================
// Anmeldung
// ====================================================================
let authMode = 'login';

function renderAuth(message = '', isError = false) {
  ctl.show(false);
  const signup = authMode === 'signup';
  $app.innerHTML = `
  <div class="lg-page">
    <header class="band lg-band">
      <div class="lg-logos">
        <span class="ln"></span><span class="sl"></span>
        <span class="lg-mark">${LOGO_MARK}${LOGO_WORD}</span>
        <span class="sl r"></span><span class="ln"></span>
      </div>
    </header>
    <main class="lg-main">
      <h1>${signup ? 'Registrieren' : 'Login'}</h1>
      <form id="auth-form" class="lg-form" novalidate>
        <div class="lbox">
          ${signup ? `<input id="f-name" name="name" placeholder="Name" autocomplete="name" required><hr>` : ''}
          <input id="f-email" name="email" type="email" placeholder="E-Mail" autocomplete="email" autocapitalize="off" required>
          <hr>
          <input id="f-pass" name="password" type="password" placeholder="Passwort" autocomplete="${signup ? 'new-password' : 'current-password'}" required>
        </div>
        <div class="lg-msg ${isError ? 'err' : ''}" role="status">${esc(message)}</div>
        <button class="lg-go" type="submit" aria-label="${signup ? 'Konto erstellen' : 'Anmelden'}">${ICON.arrow}</button>
      </form>
      <button class="lg-switch" data-mode="${signup ? 'login' : 'signup'}">${signup ? 'Zurück zum Login' : 'Noch kein Konto? Registrieren'}</button>
      ${window.__DEMO ? `<div class="lg-demo">
        <button class="tipl" id="demo-toggle" type="button">Demo-Zugänge</button>
        <div class="demo-list" id="demo-list" hidden>
          <button type="button" data-demo="simon@demo.at">Simon</button>
          <button type="button" data-demo="anna@demo.at">Anna</button>
        </div>
      </div>` : ''}
    </main>
    <footer class="band lg-ftr"></footer>
  </div>`;

  $app.querySelector('.lg-switch').addEventListener('click', (e) => { authMode = e.currentTarget.dataset.mode; renderAuth(); });
  $app.querySelector('#demo-toggle')?.addEventListener('click', () => { const l = $app.querySelector('#demo-list'); l.hidden = !l.hidden; });
  $app.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
    authMode = 'login';
    sb.auth.signInWithPassword({ email: b.dataset.demo, password: 'demo123' });
  }));
  $app.querySelector('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = String(f.get('email') || '').trim();
    const password = String(f.get('password') || '');
    const name = String(f.get('name') || '').trim();
    if (signup && !name) return renderAuth('Bitte gib deinen Namen ein.', true);
    if (!email || !email.includes('@')) return renderAuth('Bitte gib eine gültige E-Mail-Adresse ein.', true);
    if (password.length < 6) return renderAuth('Das Passwort braucht mindestens 6 Zeichen.', true);
    e.target.querySelector('.lg-go').disabled = true;
    if (signup) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
      if (error) return renderAuth(translateAuthError(error), true);
      if (!data.session) { authMode = 'login'; return renderAuth('Konto erstellt. Bitte bestätige den Link in deiner E-Mail und melde dich dann an.'); }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return renderAuth(translateAuthError(error), true);
    }
  });
}

function translateAuthError(e) {
  const m = (e.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-Mail oder Passwort falsch.';
  if (m.includes('not confirmed')) return 'Bitte zuerst die E-Mail bestätigen.';
  if (m.includes('already registered')) return 'Diese E-Mail ist schon registriert.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'Registrierung ist deaktiviert.';
  if (m.includes('password')) return 'Das Passwort braucht mindestens 6 Zeichen.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Keine Verbindung. Bitte Internet prüfen.';
  if (m.includes('rate limit')) return 'Zu viele Versuche. Bitte kurz warten.';
  return e.message;
}

export function initAuth() {
  sb.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id || null;
    if (uid === state.me) return;
    state.me = uid;
    if (uid) {
      $app.innerHTML = '<div class="center">Lädt …</div>';
      // ausserhalb des Auth-Callbacks starten (vermeidet Blockieren in supabase-js)
      setTimeout(() => { loadAll(); subscribe(); }, 0);
    } else {
      unsubscribe();
      closeSheet();
      state.loaded = false;
      renderAuth();
    }
  });

  // Start: falls keine Sitzung vorhanden ist, Login zeigen
  sb.auth.getSession().then(({ data }) => { if (!data.session) renderAuth(); });
}
