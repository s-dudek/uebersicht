// Supabase Edge Function "send-reminders"
// Wird jede Minute vom Zeitplan aufgerufen und verschickt fällige Erinnerungen als Push-Mitteilung.
// Benötigte Secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (z. B. mailto:du@beispiel.at), CRON_SECRET
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('nicht erlaubt', { status: 401 });
  }

  const { data: due, error } = await sb
    .from('items')
    .select('id, type, title, body, owner_id, category_id, meta, remind_at')
    .lte('remind_at', new Date().toISOString())
    .eq('reminded', false)
    .eq('done', false)
    .limit(100);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const item of due ?? []) {
    // Eintrag zuerst als erinnert markieren, damit nichts doppelt verschickt wird.
    // Jährliche Termine (Geburtstage) stattdessen aufs nächste Jahr stellen.
    const meta = (item.meta ?? {}) as Record<string, string>;
    const yearly = item.type === 'event' && (meta.kind === 'birthday' || meta.repeat === 'yearly');
    let patch: Record<string, unknown> = { reminded: true };
    if (yearly) {
      const t = new Date(item.remind_at);
      while (t.getTime() <= Date.now()) t.setUTCFullYear(t.getUTCFullYear() + 1);
      patch = { remind_at: t.toISOString(), reminded: false };
    }
    const { data: claimed } = await sb.from('items').update(patch).eq('id', item.id).eq('reminded', false).eq('remind_at', item.remind_at).select('id');
    if (!claimed?.length) continue;

    // Empfänger: Besitzer, Personen mit direkter Freigabe, alle in der gemeinsamen Kategorie
    const users = new Set<string>([item.owner_id]);
    const { data: shares } = await sb.from('item_shares').select('user_id').eq('item_id', item.id);
    shares?.forEach((s) => users.add(s.user_id));
    if (item.category_id) {
      const { data: cat } = await sb.from('categories').select('owner_id').eq('id', item.category_id).maybeSingle();
      if (cat) users.add(cat.owner_id);
      const { data: members } = await sb.from('category_members').select('user_id').eq('category_id', item.category_id);
      members?.forEach((m) => users.add(m.user_id));
    }

    const { data: subs } = await sb.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', [...users]);
    let title = item.title || (item.type === 'note' ? 'Notiz' : 'Todo');
    let body = item.type === 'note' ? (item.body || '').slice(0, 140) : 'Erinnerung zu deinem Todo';
    if (item.type === 'event') {
      const when = meta.remind === '1' ? 'Morgen' : meta.remind === '7' ? 'In einer Woche' : meta.remind === 'h' ? 'In einer Stunde' : 'Heute';
      title = meta.kind === 'birthday' ? `🎂 ${item.title || 'Jemand'} hat Geburtstag` : item.title || 'Termin';
      body = when + (meta.kind !== 'birthday' && meta.time ? ` um ${meta.time} Uhr` : '') + (item.body ? ' · ' + item.body.slice(0, 80) : '');
    }
    const payload = JSON.stringify({
      title,
      body,
      tag: 'item-' + item.id,
      id: item.id,
    });
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);   // Gerät abgemeldet
      }
    }
  }
  return new Response(JSON.stringify({ due: due?.length ?? 0, sent }), { headers: { 'Content-Type': 'application/json' } });
});
