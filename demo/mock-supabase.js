// Nachbau von Supabase für die Vorschau: Daten liegen nur in diesem Browser.
// Die Zugriffsregeln entsprechen denen aus supabase-setup.sql.
(function () {
  const DB_KEY = 'uebersicht-demo-db-v6';
  const SESSION_KEY = 'uebersicht-demo-session-v1';
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10); };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2));

  function seed() {
    const S = 'u-simon', A = 'u-anna';
    return {
      profiles: [
        { id: S, email: 'simon@demo.at', name: 'Simon' },
        { id: A, email: 'anna@demo.at', name: 'Anna' },
      ],
      categories: [
        { id: 'c-haushalt', owner_id: S, name: 'Haushalt', color: '#0C3741', created_at: ago(200) },
        { id: 'c-arbeit', owner_id: S, name: 'Arbeit', color: '#2f6fd1', created_at: ago(190) },
        { id: 'c-urlaub', owner_id: A, name: 'Urlaub 2027', color: '#e0662f', created_at: ago(150) },
        { id: 'c-einkauf', owner_id: S, name: 'Einkaufen', color: '#7FA08A', todo_list: true, created_at: ago(120) },
      ],
      category_members: [
        { category_id: 'c-haushalt', user_id: A },
        { category_id: 'c-urlaub', user_id: S },
        { category_id: 'c-einkauf', user_id: A },
      ],
      items: [
        { id: 'i1', owner_id: S, type: 'todo', title: 'Folie für Schaufenster bestellen', body: '', done: false, due_date: day(-1), category_id: 'c-arbeit', created_at: ago(30), updated_at: ago(30) },
        { id: 'i2', owner_id: A, type: 'todo', title: 'Waschmittel kaufen', body: '', done: false, due_date: day(0), category_id: 'c-haushalt', created_at: ago(20), updated_at: ago(20) },
        { id: 'i3', owner_id: S, type: 'todo', icon: 'car', remind_at: new Date(Date.now() + 26 * 3600e3).toISOString(), reminded: false, title: 'Reifenwechsel ausmachen', body: 'Werkstatt anrufen, Winterreifen sind im Keller', done: false, due_date: day(3), category_id: null, created_at: ago(18), updated_at: ago(18) },
        { id: 'i4', owner_id: S, type: 'todo', title: 'Logo-Entwurf an Kunden schicken', body: '', done: false, due_date: null, category_id: 'c-arbeit', created_at: ago(10), updated_at: ago(10) },
        { id: 'i5', owner_id: S, type: 'todo', title: 'Müll rausbringen', body: '', done: true, due_date: null, category_id: 'c-haushalt', created_at: ago(50), updated_at: ago(5) },
        { id: 'i6', owner_id: A, type: 'todo', title: 'Fährzeiten Gardasee nachschauen', body: '', done: false, due_date: day(10), category_id: 'c-urlaub', created_at: ago(8), updated_at: ago(8) },
        { id: 'e1', owner_id: S, type: 'todo', title: 'Milch', body: '', done: false, due_date: null, category_id: 'c-einkauf', created_at: ago(6), updated_at: ago(6) },
        { id: 'e2', owner_id: A, type: 'todo', title: 'Brot', body: '', done: false, due_date: null, category_id: 'c-einkauf', created_at: ago(5), updated_at: ago(5) },
        { id: 'e3', owner_id: S, type: 'todo', title: 'Kaffeebohnen', body: '', done: true, due_date: null, category_id: 'c-einkauf', created_at: ago(30), updated_at: ago(3) },
        { id: 'n1', owner_id: S, type: 'note', icon: 'bulb', title: 'Ideen Dashboard', body: 'Startseite mit Tagesübersicht\nFitnessplan einbauen\nFußball-Ergebnisse', done: false, due_date: null, category_id: null, created_at: ago(70), updated_at: ago(4) },
        { id: 'n2', owner_id: A, type: 'note', icon: 'plane', title: 'Unterkünfte', body: 'Ferienwohnung am Gardasee, 4 Nächte. Alternativ Hotel in Riva.', done: false, due_date: null, category_id: 'c-urlaub', created_at: ago(60), updated_at: ago(6) },
        { id: 'e1', owner_id: S, type: 'event', icon: null, title: 'Mama', body: 'Blumen besorgen', done: false, due_date: (1965) + day(1).slice(4), category_id: null, meta: { kind: 'birthday', repeat: 'yearly', remind: '1' }, remind_at: (() => { const x = new Date(); x.setHours(18, 0, 0, 0); return x.toISOString(); })(), reminded: false, created_at: ago(30), updated_at: ago(30) },
        { id: 'e2', owner_id: A, type: 'event', icon: null, title: 'Zahnarzt', body: '', done: false, due_date: day(3), category_id: 'c-haushalt', meta: { kind: 'event', time: '14:30', remind: 'h' }, created_at: ago(20), updated_at: ago(20) },
        { id: 'n3', owner_id: S, type: 'note', icon: 'gift', title: 'Geschenkideen', body: 'Fotobuch, Konzertkarten', done: false, due_date: null, category_id: null, created_at: ago(40), updated_at: ago(12) },
      ],
      item_shares: [{ item_id: 'n3', user_id: A }],
      calendars: [{ id: 'cal-outlook', owner_id: S, name: 'Outlook Arbeit', url: 'https://outlook.example/kalender.ics', color: '#7A5AA6', created_at: ago(5) }],
    };
  }

  let db = (() => { try { return JSON.parse(ls.get(DB_KEY)) || seed(); } catch { return seed(); } })();
  db.ink_pages ||= [];   // Handschrift-Seiten (auch für ältere Vorschau-Daten)
  db.calendars ||= [];   // verknüpfte Kalender (ICS-Abos)
  const save = () => ls.set(DB_KEY, JSON.stringify(db));
  let session = (() => { try { return JSON.parse(ls.get(SESSION_KEY)); } catch { return null; } })();
  const me = () => session?.user?.id || null;

  // ---------- Zugriffsregeln ----------
  const canCat = (cid) => db.categories.some((c) => c.id === cid && c.owner_id === me()) ||
    db.category_members.some((m) => m.category_id === cid && m.user_id === me());
  const isCatOwner = (cid) => db.categories.some((c) => c.id === cid && c.owner_id === me());
  const sharedWithMe = (iid) => db.item_shares.some((s) => s.item_id === iid && s.user_id === me());
  const isItemOwner = (iid) => db.items.some((i) => i.id === iid && i.owner_id === me());
  const canItem = (i) => i.owner_id === me() || sharedWithMe(i.id) || (i.category_id && canCat(i.category_id));
  const partners = () => {
    const ids = new Set([me()]);
    db.categories.filter((c) => canCat(c.id)).forEach((c) => {
      ids.add(c.owner_id);
      db.category_members.filter((m) => m.category_id === c.id).forEach((m) => ids.add(m.user_id));
    });
    db.items.forEach((i) => {
      if (i.owner_id === me()) db.item_shares.filter((s) => s.item_id === i.id).forEach((s) => ids.add(s.user_id));
      if (sharedWithMe(i.id)) ids.add(i.owner_id);
    });
    return ids;
  };
  const visible = {
    profiles: () => true,   // alle Konten sichtbar (zum Teilen auswählen)
    categories: (r) => canCat(r.id),
    category_members: (r) => canCat(r.category_id),
    items: (r) => canItem(r),
    item_shares: (r) => r.user_id === me() || isItemOwner(r.item_id),
    ink_pages: (r) => (r.category_id ? canCat(r.category_id) : r.owner_id === me()),
    calendars: (r) => r.owner_id === me(),
  };
  const mayUpdate = {
    profiles: (r) => r.id === me(),
    categories: (r) => r.owner_id === me(),
    items: (r) => canItem(r),
    ink_pages: (r) => (r.category_id ? canCat(r.category_id) : r.owner_id === me()),
  };
  const mayDelete = {
    categories: (r) => r.owner_id === me(),
    category_members: (r) => r.user_id === me() || isCatOwner(r.category_id),
    items: (r) => r.owner_id === me() || (r.category_id && canCat(r.category_id)),
    item_shares: (r) => r.user_id === me() || isItemOwner(r.item_id),
    ink_pages: (r) => (r.category_id ? canCat(r.category_id) : r.owner_id === me()),
    calendars: (r) => r.owner_id === me(),
  };

  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => setTimeout(fn, 50));
  const err = (message) => ({ data: null, error: { message } });

  function query(table) {
    let op = 'select', payload = null;
    const filters = [];
    const api = {
      select() { return api; },
      order() { return api; },
      insert(p) { op = 'insert'; payload = p; return api; },
      update(p) { op = 'update'; payload = p; return api; },
      delete() { op = 'delete'; return api; },
      eq(k, v) { filters.push([k, v]); return api; },
      is(k, v) { filters.push([k, v]); return api; },
      single() { return run().then((r) => (r.error ? r : { data: r.data[0] ?? null, error: null })); },
      then(res, rej) { return run().then(res, rej); },
    };
    const match = (r) => filters.every(([k, v]) => (r[k] ?? null) === v);

    async function run() {
      await new Promise((r) => setTimeout(r, 60)); // wie eine kurze Netzwerkanfrage
      if (!me()) return err('Nicht angemeldet');
      const rows = db[table];
      if (op === 'select') return { data: rows.filter((r) => visible[table](r) && match(r)).map((r) => structuredClone(r)), error: null };

      if (op === 'insert') {
        const now = new Date().toISOString();
        let row;
        const list = Array.isArray(payload) ? payload : [payload];
        const out = [];
        for (const pl of list) {
          let row;
          if (table === 'items') {
            row = { id: uuid(), owner_id: me(), title: '', body: '', done: false, due_date: null, category_id: null, meta: {}, created_at: now, updated_at: now, ...pl };
            if (row.category_id && !canCat(row.category_id)) return err('Keine Berechtigung für diese Kategorie');
          } else if (table === 'ink_pages') {
            const cid = pl.category_id || null;
            if (cid && !canCat(cid)) return err('Keine Berechtigung');
            if (pl.parent_id && !rows.some((r) => r.id === pl.parent_id && (r.category_id || null) === cid && visible.ink_pages(r))) return err('Keine Berechtigung');
            if (!pl.parent_id && rows.some((r) => !r.parent_id && (r.category_id || null) === cid && (cid || r.owner_id === me()))) return err('duplicate key value');
            row = { id: uuid(), owner_id: me(), parent_id: null, title: null, data: { v: 1, items: [] }, created_at: now, updated_at: now, ...structuredClone(pl) };
          } else if (table === 'calendars') {
            if (pl.owner_id && pl.owner_id !== me()) return err('Keine Berechtigung');
            row = { id: uuid(), owner_id: me(), color: null, created_at: now, ...pl };
          } else if (table === 'categories') {
            row = { id: uuid(), owner_id: me(), color: '#2f7d5b', created_at: now, ...pl };
          } else return err('Nicht erlaubt');
          rows.push(row); out.push({ ...row });
        }
        save(); if (table !== 'ink_pages') notify();
        return { data: out, error: null };
      }

      if (op === 'update') {
        const targets = rows.filter((r) => match(r) && visible[table](r) && mayUpdate[table]?.(r));
        if (table === 'items' && payload.category_id && !canCat(payload.category_id)) return err('Keine Berechtigung für diese Kategorie');
        targets.forEach((r) => Object.assign(r, structuredClone(payload), table === 'items' ? { updated_at: new Date().toISOString() } : {}));
        save(); if (table !== 'ink_pages') notify();
        return { data: [], error: null };
      }

      if (op === 'delete') {
        const gone = rows.filter((r) => match(r) && visible[table](r) && mayDelete[table]?.(r));
        db[table] = rows.filter((r) => !gone.includes(r));
        if (table === 'categories') gone.forEach((c) => {
          db.category_members = db.category_members.filter((m) => m.category_id !== c.id);
          db.items.forEach((i) => { if (i.category_id === c.id) i.category_id = null; });
        });
        if (table === 'items') gone.forEach((i) => { db.item_shares = db.item_shares.filter((s) => s.item_id !== i.id); });
        if (table === 'ink_pages') {   // Unterseiten mitlöschen (wie "on delete cascade")
          const ids = new Set(gone.map((r) => r.id));
          let grew = true;
          while (grew) { grew = false; db.ink_pages.forEach((r) => { if (r.parent_id && ids.has(r.parent_id) && !ids.has(r.id)) { ids.add(r.id); grew = true; } }); }
          db.ink_pages = db.ink_pages.filter((r) => !ids.has(r.id));
        }
        save(); notify();
        return { data: [], error: null };
      }
    }
    return api;
  }

  async function rpc(name, args) {
    await new Promise((r) => setTimeout(r, 60));
    const email = String(args.target_email || '').trim().toLowerCase();
    const target = db.profiles.find((p) => p.email === email);
    if (name === 'share_category') {
      if (!isCatOwner(args.cid)) return { data: 'not_allowed', error: null };
      if (!target) return { data: 'not_found', error: null };
      if (target.id === me()) return { data: 'self', error: null };
      if (!db.category_members.some((m) => m.category_id === args.cid && m.user_id === target.id)) db.category_members.push({ category_id: args.cid, user_id: target.id });
    } else if (name === 'share_item') {
      if (!isItemOwner(args.iid)) return { data: 'not_allowed', error: null };
      if (!target) return { data: 'not_found', error: null };
      if (target.id === me()) return { data: 'self', error: null };
      if (!db.item_shares.some((s) => s.item_id === args.iid && s.user_id === target.id)) db.item_shares.push({ item_id: args.iid, user_id: target.id });
    } else return err('Unbekannte Funktion');
    save(); notify();
    return { data: 'ok', error: null };
  }

  // Bilder der Handschrift: nur im Speicher dieses Tabs (gehen beim Neuladen verloren)
  const files = new Map();
  const mayFile = (path) => {
    const [a, b] = path.split('/');
    return !!me() && (a === me() || (a === 'u' && b === me()) || (a === 'c' && canCat(b)));
  };
  const storage = {
    async upload(path, blob) {
      if (!mayFile(path)) return err('Keine Berechtigung');
      files.set(path, blob); return { data: { path }, error: null };
    },
    async download(path) {
      if (!mayFile(path) || !files.has(path)) return err('Nicht gefunden');
      return { data: files.get(path), error: null };
    },
    async list(prefix) { return { data: [...files.keys()].filter((p) => p.startsWith(prefix + '/') && mayFile(p)).map((p) => ({ name: p.slice(prefix.length + 1) })), error: null }; },
    async remove(paths) { paths.forEach((p) => { if (mayFile(p)) files.delete(p); }); return { data: [], error: null }; },
  };

  const authCallbacks = new Set();
  const setSession = (s, event) => {
    session = s;
    if (s) ls.set(SESSION_KEY, JSON.stringify(s)); else ls.del(SESSION_KEY);
    authCallbacks.forEach((cb) => cb(event, s));
  };

  // Edge Function "calendar-feed": Beispiel-Kalender um heute (wöchentliche Besprechung, Termin, Urlaub)
  async function invokeFn(name, { body } = {}) {
    await new Promise((r) => setTimeout(r, 120));
    if (name !== 'calendar-feed' || !me()) return { data: null, error: { message: 'nicht erlaubt' } };
    if (!db.calendars.some((c) => c.id === body?.id && c.owner_id === me())) return { data: null, error: { message: 'Kalender nicht gefunden' } };
    const d = (k) => { const x = new Date(); x.setDate(x.getDate() + k); return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`; };
    const ev = (uid, title, start, end, extra = '') => `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${title}\r\nDTSTART;TZID=W. Europe Standard Time:${start}\r\nDTEND;TZID=W. Europe Standard Time:${end}\r\n${extra}END:VEVENT\r\n`;
    const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'
      + ev('w1', 'Teambesprechung', `${d(-14)}T093000`, `${d(-14)}T103000`, 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH\r\nLOCATION:Büro\r\n')
      + ev('k1', 'Kundentermin Druckerei', `${d(1)}T140000`, `${d(1)}T153000`, 'DESCRIPTION:Andruck prüfen\\nMuster mitnehmen\r\n')
      + `BEGIN:VEVENT\r\nUID:u1\r\nSUMMARY:Urlaub\r\nDTSTART;VALUE=DATE:${d(3)}\r\nDTEND;VALUE=DATE:${d(6)}\r\nEND:VEVENT\r\n`
      + 'END:VCALENDAR\r\n';
    return { data: ics, error: null };
  }

  const client = {
    auth: {
      onAuthStateChange(cb) {
        authCallbacks.add(cb);
        setTimeout(() => cb('INITIAL_SESSION', session), 0);
        return { data: { subscription: { unsubscribe: () => authCallbacks.delete(cb) } } };
      },
      async getSession() { return { data: { session } }; },
      async signInWithPassword({ email }) {
        const p = db.profiles.find((x) => x.email === String(email).trim().toLowerCase());
        if (!p) return { data: {}, error: { message: 'Invalid login credentials' } };
        setSession({ user: { id: p.id, email: p.email } }, 'SIGNED_IN');
        return { data: {}, error: null };
      },
      async signUp({ email, options }) {
        email = String(email).trim().toLowerCase();
        if (db.profiles.some((x) => x.email === email)) return { data: {}, error: { message: 'User already registered' } };
        const p = { id: uuid(), email, name: options?.data?.name || email.split('@')[0] };
        db.profiles.push(p); save();
        setSession({ user: { id: p.id, email } }, 'SIGNED_IN');
        return { data: { session }, error: null };
      },
      async signOut() { setSession(null, 'SIGNED_OUT'); return { error: null }; },
    },
    from: query,
    rpc,
    storage: { from: () => storage },
    functions: { invoke: invokeFn },
    channel() {
      let fn = null;
      const ch = {
        on(_e, _f, cb) { fn = cb; return ch; },
        subscribe() { if (fn) listeners.add(fn); ch._fn = fn; return ch; },
      };
      return ch;
    },
    removeChannel(ch) { if (ch?._fn) listeners.delete(ch._fn); },
  };

  window.__mockSupabase = { createClient: () => client };
  window.__resetDemo = () => { db = seed(); save(); setSession(null, 'SIGNED_OUT'); };
  // Beispiel-Wochenplan im Format des Skills "Wochenplan"
  window.__DEMO_PLAN = () => {
    const m = new Date(); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    const d = (k) => { const x = new Date(m); x.setDate(x.getDate() + k); return x.toISOString().slice(0, 10).replace(/(\d+)-(\d+)-(\d+)/, (_, y, mo, da) => `${y}-${mo}-${da}`); };
    const day = (k) => { const x = new Date(m); x.setDate(x.getDate() + k); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; };
    return {
      version: 1, woche: day(0), personen: 2,
      gerichte: [
        { datum: day(0), mahlzeit: 'mittag', kochen_am: day(0), titel: 'Hähnchen-Reis-Bowl mit Brokkoli', symbol: 'meat', portionen: 2, dauer_min: 30, tags: ['proteinreich', 'fettarm'],
          naehrwerte: { kcal: 560, eiweiss: 48, fett: 9, kohlenhydrate: 68 },
          zutaten: ['300 g Hähnchenbrust', '150 g Basmatireis (roh)', '1 Brokkoli', '1 rote Paprika', '2 EL Sojasauce', '1 TL Sesam'],
          zubereitung: ['Reis nach Packung kochen.', 'Hähnchen in Streifen schneiden, in wenig Öl scharf anbraten, salzen und pfeffern.', 'Brokkoli in Röschen 4 Minuten dämpfen, Paprika in Streifen schneiden.', 'Alles in Schüsseln anrichten, mit Sojasauce und Sesam abschmecken.'] },
        { datum: day(1), mahlzeit: 'mittag', kochen_am: day(0), titel: 'Hähnchen-Reis-Bowl (vorgekocht)', symbol: 'meat', portionen: 2, tags: ['proteinreich', 'fettarm', 'Meal Prep'],
          naehrwerte: { kcal: 560, eiweiss: 48, fett: 9, kohlenhydrate: 68 }, hinweis: 'Am Montag doppelte Menge kochen und in zwei Boxen kühl stellen.',
          zutaten: ['siehe Montag (doppelte Menge)'], zubereitung: ['In der Mikrowelle 3 Minuten erwärmen.'] },
        { datum: day(2), mahlzeit: 'mittag', titel: 'Linsen-Bolognese mit Vollkornspaghetti', symbol: 'pot', portionen: 2, dauer_min: 35, tags: ['proteinreich', 'vegetarisch'],
          naehrwerte: { kcal: 610, eiweiss: 34, fett: 11, kohlenhydrate: 88 },
          zutaten: ['200 g Vollkornspaghetti', '120 g rote Linsen', '1 Dose passierte Paradeiser (500 g)', '1 Zwiebel', '2 Karotten', '1 Knoblauchzehe', '30 g Parmesan'],
          zubereitung: ['Zwiebel, Knoblauch und Karotten fein würfeln und anschwitzen.', 'Linsen und Paradeiser dazugeben, 15 Minuten köcheln, würzen.', 'Spaghetti kochen und mit der Sauce und Parmesan servieren.'] },
        { datum: day(3), mahlzeit: 'mittag', titel: 'Lachs mit Ofenerdäpfeln und Fisolen', symbol: 'meat', portionen: 2, dauer_min: 35, tags: ['proteinreich'],
          naehrwerte: { kcal: 640, eiweiss: 40, fett: 24, kohlenhydrate: 58 },
          zutaten: ['2 Lachsfilets (ca. 280 g)', '600 g festkochende Erdäpfel', '300 g Fisolen', '1 Zitrone', 'Olivenöl, Rosmarin'],
          zubereitung: ['Erdäpfel spalten, mit Öl und Rosmarin 25 Minuten bei 200 °C backen.', 'Lachs die letzten 12 Minuten mit aufs Blech legen.', 'Fisolen 6 Minuten kochen, mit Zitrone servieren.'] },
        { datum: day(4), mahlzeit: 'mittag', titel: 'Topfenpalatschinken mit Beeren', symbol: 'heart', portionen: 2, dauer_min: 25, tags: ['süß', 'proteinreich'],
          naehrwerte: { kcal: 520, eiweiss: 32, fett: 12, kohlenhydrate: 66 },
          zutaten: ['3 Eier', '120 g Mehl', '250 ml Milch', '250 g Magertopfen', '200 g Beeren (TK)', '1 EL Honig'],
          zubereitung: ['Teig aus Eiern, Mehl und Milch rühren, 10 Minuten rasten lassen.', 'Dünne Palatschinken backen.', 'Mit Topfen-Honig-Creme füllen, Beeren erwärmen und darübergeben.'] },
        { datum: day(0), mahlzeit: 'fruehstueck', titel: 'Topfen mit Haferflocken und Banane', portionen: 2, tags: ['proteinreich'], naehrwerte: { kcal: 380, eiweiss: 30, fett: 4, kohlenhydrate: 52 },
          zutaten: ['250 g Magertopfen', '80 g Haferflocken', '2 Bananen'] },
        { datum: day(2), mahlzeit: 'abend', titel: 'Vollkornbrot mit Hüttenkäse und Gemüse', portionen: 2, tags: ['fettarm'], naehrwerte: { kcal: 420, eiweiss: 28, fett: 8, kohlenhydrate: 54 },
          zutaten: ['4 Scheiben Vollkornbrot', '200 g Hüttenkäse', '1 Gurke', '2 Paradeiser'] },
      ],
      training: [
        { datum: day(0), titel: 'Ganzkörper Kraft', art: 'kraft', dauer_min: 45, fuer: 'Simon',
          aufwaermen: ['5 Min. Seilspringen', 'Schulterkreisen, Hüftkreisen'],
          uebungen: [
            { name: 'Kniebeugen', saetze: 3, wdh: '10', gewicht: '40 kg', pause: '90 s' },
            { name: 'Liegestütz', saetze: 3, wdh: '12', pause: '60 s', hinweis: 'Körper gerade halten' },
            { name: 'Rudern mit Kurzhanteln', saetze: 3, wdh: '10', gewicht: '2 × 12 kg', pause: '60 s' },
            { name: 'Unterarmstütz', saetze: 3, dauer: '40 s', pause: '30 s' },
          ],
          abschluss: ['5 Min. Dehnen'] },
        { datum: day(2), titel: 'Lockerer Lauf', art: 'ausdauer', dauer_min: 30, fuer: 'Simon', hinweis: 'Puls um 140, man soll noch reden können.' },
        { datum: day(4), titel: 'Mobilität & Rumpf', art: 'mobilitaet', dauer_min: 25,
          uebungen: [{ name: 'Katze-Kuh', saetze: 2, wdh: '10' }, { name: 'Weltbeste Dehnung', saetze: 2, wdh: '5 je Seite' }, { name: 'Dead Bug', saetze: 3, wdh: '10' }] },
      ],
      einkauf: [
        { name: 'Brokkoli', menge: '2 Stück', abteilung: 'Obst & Gemüse', fuer: 'Mo/Di' },
        { name: 'Paprika rot', menge: '2 Stück', abteilung: 'Obst & Gemüse', fuer: 'Mo/Di' },
        { name: 'Karotten', menge: '2 Stück', abteilung: 'Obst & Gemüse', fuer: 'Mi' },
        { name: 'Zwiebel', menge: '1 Stück', abteilung: 'Obst & Gemüse', fuer: 'Mi' },
        { name: 'Erdäpfel festkochend', menge: '600 g', abteilung: 'Obst & Gemüse', fuer: 'Do' },
        { name: 'Fisolen', menge: '300 g', abteilung: 'Obst & Gemüse', fuer: 'Do' },
        { name: 'Zitrone', menge: '1 Stück', abteilung: 'Obst & Gemüse', fuer: 'Do' },
        { name: 'Bananen', menge: '2 Stück', abteilung: 'Obst & Gemüse', fuer: 'Frühstück' },
        { name: 'Gurke', menge: '1 Stück', abteilung: 'Obst & Gemüse', fuer: 'Abend' },
        { name: 'Paradeiser', menge: '2 Stück', abteilung: 'Obst & Gemüse', fuer: 'Abend' },
        { name: 'Vollkornbrot', menge: '1 Laib', abteilung: 'Brot & Backwaren', fuer: 'Abend' },
        { name: 'Magertopfen', menge: '500 g', abteilung: 'Kühlregal', fuer: 'Fr, Frühstück' },
        { name: 'Hüttenkäse', menge: '200 g', abteilung: 'Kühlregal', fuer: 'Abend' },
        { name: 'Eier', menge: '6 Stück', abteilung: 'Kühlregal', fuer: 'Fr' },
        { name: 'Milch', menge: '0,5 l', abteilung: 'Kühlregal', fuer: 'Fr' },
        { name: 'Parmesan', menge: '30 g', abteilung: 'Kühlregal', fuer: 'Mi' },
        { name: 'Hähnchenbrust', menge: '600 g', abteilung: 'Fleisch & Fisch', fuer: 'Mo/Di' },
        { name: 'Lachsfilet', menge: '2 Stück (280 g)', abteilung: 'Fleisch & Fisch', fuer: 'Do' },
        { name: 'Beeren TK', menge: '200 g', abteilung: 'Tiefkühl', fuer: 'Fr' },
        { name: 'Basmatireis', menge: '300 g', abteilung: 'Trockenware & Konserven', fuer: 'Mo/Di' },
        { name: 'Vollkornspaghetti', menge: '200 g', abteilung: 'Trockenware & Konserven', fuer: 'Mi' },
        { name: 'Rote Linsen', menge: '120 g', abteilung: 'Trockenware & Konserven', fuer: 'Mi' },
        { name: 'Passierte Paradeiser', menge: '1 Dose', abteilung: 'Trockenware & Konserven', fuer: 'Mi' },
        { name: 'Haferflocken', menge: '80 g', abteilung: 'Trockenware & Konserven', fuer: 'Frühstück' },
      ],
    };
  };
  window.__DEMO = true;
  window.__DEMO_TILES = { todos: ['c-einkauf', ''], notes: ['c-urlaub'], categories: ['c-haushalt'] };
  window.APP_CONFIG = { SUPABASE_URL: 'https://demo.local', SUPABASE_KEY: 'demo' };
})();
