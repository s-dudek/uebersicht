-- =====================================================================
-- Übersicht-App: Datenbank-Setup für Supabase
-- Einmal komplett im SQL Editor einfügen und auf "Run" klicken.
-- =====================================================================

-- ---------- Profile (Name + E-Mail jedes Benutzers) ----------
create table if not exists public.profiles (
  id    uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name  text
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Kategorien ----------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#0C3741',
  todo_list  boolean not null default false,   -- als Todo-Liste anzeigen (z. B. Einkaufen)
  created_at timestamptz not null default now()
);
alter table public.categories add column if not exists todo_list boolean not null default false;
alter table public.categories add column if not exists icon text;   -- Symbol des Ordners
alter table public.profiles add column if not exists cat_order jsonb;   -- eigene Reihenfolge der Ordner

-- Wer zusätzlich zum Besitzer Zugriff auf eine Kategorie hat
create table if not exists public.category_members (
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  primary key (category_id, user_id)
);

-- ---------- Einträge (Todos und Notizen) ----------
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null check (type in ('todo', 'note')),
  title       text not null default '',
  body        text not null default '',
  done        boolean not null default false,
  due_date    date,
  category_id uuid references public.categories(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Symbol und Erinnerung (auch für bestehende Datenbanken)
alter table public.items add column if not exists icon      text;
alter table public.items add column if not exists remind_at timestamptz;
alter table public.items add column if not exists reminded  boolean not null default false;

-- Gerichte (Wochenplan) und Termine/Geburtstage als eigene Typen, Zusatzdaten (Menge, Abteilung, Rezept, Nährwerte) in meta
alter table public.items drop constraint if exists items_type_check;
alter table public.items add constraint items_type_check check (type in ('todo', 'note', 'meal', 'event'));
alter table public.items add column if not exists meta jsonb not null default '{}'::jsonb;

create index if not exists items_owner_idx    on public.items(owner_id);
create index if not exists items_category_idx on public.items(category_id);

-- Einzelne Einträge mit jemandem teilen
create table if not exists public.item_shares (
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (item_id, user_id)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_touch on public.items;
create trigger items_touch
  before update on public.items
  for each row execute function public.touch_updated_at();

-- ---------- Hilfsfunktionen für die Zugriffsregeln ----------
create or replace function public.can_access_category(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from categories c where c.id = cid and c.owner_id = auth.uid())
      or exists (select 1 from category_members m where m.category_id = cid and m.user_id = auth.uid());
$$;

create or replace function public.is_category_owner(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from categories c where c.id = cid and c.owner_id = auth.uid());
$$;

create or replace function public.is_item_owner(iid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from items i where i.id = iid and i.owner_id = auth.uid());
$$;

create or replace function public.item_shared_with_me(iid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from item_shares s where s.item_id = iid and s.user_id = auth.uid());
$$;

-- Gibt es irgendeine Verbindung (geteilte Kategorie oder geteilter Eintrag) zu dieser Person?
create or replace function public.is_partner(other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select
    exists (  -- gemeinsame Kategorie (Besitzer oder Mitglied, in beide Richtungen)
      select 1
      from categories c
      where (c.owner_id = auth.uid() or exists (select 1 from category_members m where m.category_id = c.id and m.user_id = auth.uid()))
        and (c.owner_id = other    or exists (select 1 from category_members m where m.category_id = c.id and m.user_id = other))
    )
    or exists (  -- geteilter Eintrag
      select 1
      from items i
      where (i.owner_id = auth.uid() and exists (select 1 from item_shares s where s.item_id = i.id and s.user_id = other))
         or (i.owner_id = other    and exists (select 1 from item_shares s where s.item_id = i.id and s.user_id = auth.uid()))
    );
$$;

-- ---------- Zugriffsregeln (Row Level Security) ----------
alter table public.profiles         enable row level security;
alter table public.categories       enable row level security;
alter table public.category_members enable row level security;
alter table public.items            enable row level security;
alter table public.item_shares      enable row level security;

-- Profile: alle angemeldeten Personen sehen alle Konten (Name + E-Mail), damit man beim Teilen auswählen kann.
-- Neue Registrierungen sind abgeschaltet, es gibt also nur eure Konten.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Kategorien: sehen alle Beteiligten, ändern/löschen nur der Besitzer
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select to authenticated
  using (owner_id = auth.uid() or public.can_access_category(id));   -- Besitzer direkt prüfen, sonst schlägt das Anlegen fehl

drop policy if exists categories_insert on public.categories;
create policy categories_insert on public.categories for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories for delete to authenticated
  using (owner_id = auth.uid());

-- Mitglieder: sehen alle Beteiligten, hinzufügen nur der Besitzer,
-- entfernen der Besitzer oder das Mitglied selbst (Kategorie verlassen)
drop policy if exists members_select on public.category_members;
create policy members_select on public.category_members for select to authenticated
  using (public.can_access_category(category_id));

drop policy if exists members_insert on public.category_members;
create policy members_insert on public.category_members for insert to authenticated
  with check (public.is_category_owner(category_id));

drop policy if exists members_delete on public.category_members;
create policy members_delete on public.category_members for delete to authenticated
  using (user_id = auth.uid() or public.is_category_owner(category_id));

-- Einträge: eigene, direkt geteilte und alle in gemeinsamen Kategorien
drop policy if exists items_select on public.items;
create policy items_select on public.items for select to authenticated
  using (
    owner_id = auth.uid()
    or public.item_shared_with_me(id)
    or (category_id is not null and public.can_access_category(category_id))
  );

drop policy if exists items_insert on public.items;
create policy items_insert on public.items for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (category_id is null or public.can_access_category(category_id))
  );

drop policy if exists items_update on public.items;
create policy items_update on public.items for update to authenticated
  using (
    owner_id = auth.uid()
    or public.item_shared_with_me(id)
    or (category_id is not null and public.can_access_category(category_id))
  )
  with check (category_id is null or public.can_access_category(category_id));

drop policy if exists items_delete on public.items;
create policy items_delete on public.items for delete to authenticated
  using (
    owner_id = auth.uid()
    or (category_id is not null and public.can_access_category(category_id))
  );

-- Geteilte Einträge: sieht der Besitzer und die Person, mit der geteilt wurde
drop policy if exists shares_select on public.item_shares;
create policy shares_select on public.item_shares for select to authenticated
  using (user_id = auth.uid() or public.is_item_owner(item_id));

drop policy if exists shares_delete on public.item_shares;
create policy shares_delete on public.item_shares for delete to authenticated
  using (user_id = auth.uid() or public.is_item_owner(item_id));

-- ---------- Teilen per E-Mail-Adresse ----------
-- Gibt 'ok', 'not_found', 'self' oder 'not_allowed' zurück
create or replace function public.share_category(cid uuid, target_email text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not exists (select 1 from categories where id = cid and owner_id = auth.uid()) then
    return 'not_allowed';
  end if;
  select id into target from profiles where email = lower(trim(target_email));
  if target is null then return 'not_found'; end if;
  if target = auth.uid() then return 'self'; end if;
  insert into category_members (category_id, user_id) values (cid, target) on conflict do nothing;
  return 'ok';
end;
$$;

create or replace function public.share_item(iid uuid, target_email text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not exists (select 1 from items where id = iid and owner_id = auth.uid()) then
    return 'not_allowed';
  end if;
  select id into target from profiles where email = lower(trim(target_email));
  if target is null then return 'not_found'; end if;
  if target = auth.uid() then return 'self'; end if;
  insert into item_shares (item_id, user_id) values (iid, target) on conflict do nothing;
  return 'ok';
end;
$$;

revoke execute on function public.share_category(uuid, text) from anon, public;
revoke execute on function public.share_item(uuid, text)     from anon, public;
grant  execute on function public.share_category(uuid, text) to authenticated;
grant  execute on function public.share_item(uuid, text)     to authenticated;

-- ---------- Live-Updates zwischen Geräten ----------
do $$
declare t text;
begin
  foreach t in array array['items', 'categories', 'category_members', 'item_shares'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------- Push-Mitteilungen: registrierte Geräte ----------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Handschrift: Seiten mit Stiftnotizen und Bildern ----------
-- Jede Person hat eine Startseite (parent_id leer). Ein markierter Titel führt zu einer Unterseite.
-- data: Striche, Bilder und Titel der Seite; title: die Striche des Titels (für die Kopfzeile der Unterseite).
-- Nur für den Besitzer sichtbar. Bewusst nicht in den Live-Updates, damit Speichern nicht alles neu lädt.
create table if not exists public.ink_pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id uuid references public.ink_pages on delete cascade,
  title jsonb,
  data jsonb not null default '{"v":1,"items":[]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ink_pages_parent on public.ink_pages (parent_id);
create unique index if not exists ink_pages_one_root on public.ink_pages (owner_id) where parent_id is null;

alter table public.ink_pages enable row level security;
drop policy if exists ink_select on public.ink_pages;
drop policy if exists ink_insert on public.ink_pages;
drop policy if exists ink_update on public.ink_pages;
drop policy if exists ink_delete on public.ink_pages;
create policy ink_select on public.ink_pages for select using (owner_id = auth.uid());
create policy ink_insert on public.ink_pages for insert with check (
  owner_id = auth.uid()
  and (parent_id is null or exists (select 1 from public.ink_pages p where p.id = ink_pages.parent_id and p.owner_id = auth.uid()))
);
create policy ink_update on public.ink_pages for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ink_delete on public.ink_pages for delete using (owner_id = auth.uid());

-- Bilder der Handschrift-Seiten: privater Speicher, jede Person nur im eigenen Ordner (<user-id>/...)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ink', 'ink', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists ink_img_select on storage.objects;
drop policy if exists ink_img_insert on storage.objects;
drop policy if exists ink_img_delete on storage.objects;
create policy ink_img_select on storage.objects for select to authenticated
  using (bucket_id = 'ink' and (storage.foldername(name))[1] = auth.uid()::text);
create policy ink_img_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ink' and (storage.foldername(name))[1] = auth.uid()::text);
create policy ink_img_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ink' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Handschrift in den Notiz-Ordnern ----------
-- Jeder Ordner (Kategorie) hat eine eigene Handschrift-Startseite, die alle Beteiligten des Ordners sehen.
-- Ohne Ordner ("Ohne Kategorie"): eine Startseite je Person, nur für sie sichtbar.
alter table public.ink_pages add column if not exists category_id uuid references public.categories on delete cascade;
drop index if exists public.ink_pages_one_root;
create unique index if not exists ink_root_own on public.ink_pages (owner_id) where parent_id is null and category_id is null;
create unique index if not exists ink_root_cat on public.ink_pages (category_id) where parent_id is null and category_id is not null;

create or replace function public.can_access_ink(cid uuid, oid uuid)
returns boolean language sql stable set search_path = public as $$
  select case when cid is null then oid = auth.uid() else public.can_access_category(cid) end;
$$;

drop policy if exists ink_select on public.ink_pages;
drop policy if exists ink_insert on public.ink_pages;
drop policy if exists ink_update on public.ink_pages;
drop policy if exists ink_delete on public.ink_pages;
create policy ink_select on public.ink_pages for select using (public.can_access_ink(category_id, owner_id));
create policy ink_insert on public.ink_pages for insert with check (
  owner_id = auth.uid()
  and public.can_access_ink(category_id, owner_id)
  and (parent_id is null or exists (
    select 1 from public.ink_pages p
    where p.id = ink_pages.parent_id and p.category_id is not distinct from ink_pages.category_id
      and public.can_access_ink(p.category_id, p.owner_id)))
);
create policy ink_update on public.ink_pages for update
  using (public.can_access_ink(category_id, owner_id))
  with check (public.can_access_ink(category_id, owner_id));
create policy ink_delete on public.ink_pages for delete using (public.can_access_ink(category_id, owner_id));

-- Bilder: u/<user-id>/… nur für die Person, c/<ordner-id>/… für alle Beteiligten des Ordners
create or replace function public.can_access_ink_file(path text)
returns boolean language sql stable set search_path = public as $$
  select case
    when (storage.foldername(path))[1] = auth.uid()::text then true            -- ältere Bilder (<user-id>/…)
    when (storage.foldername(path))[1] = 'u' then (storage.foldername(path))[2] = auth.uid()::text
    when (storage.foldername(path))[1] = 'c' and (storage.foldername(path))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_access_category(((storage.foldername(path))[2])::uuid)
    else false end;
$$;
drop policy if exists ink_img_select on storage.objects;
drop policy if exists ink_img_insert on storage.objects;
drop policy if exists ink_img_delete on storage.objects;
create policy ink_img_select on storage.objects for select to authenticated using (bucket_id = 'ink' and public.can_access_ink_file(name));
create policy ink_img_insert on storage.objects for insert to authenticated with check (bucket_id = 'ink' and public.can_access_ink_file(name));
create policy ink_img_delete on storage.objects for delete to authenticated using (bucket_id = 'ink' and public.can_access_ink_file(name));

-- ==========================================================================
-- Training: eigener Eintragstyp (Einheiten mit Übungen, per Code eingefügt)
-- ==========================================================================
alter table public.items drop constraint if exists items_type_check;
alter table public.items add constraint items_type_check check (type in ('todo', 'note', 'meal', 'event', 'training'));

-- ==========================================================================
-- Absicherung der Funktionen (Hinweise der Supabase-Sicherheitsprüfung)
-- Trigger-Funktionen ruft niemand direkt auf; die Hilfen der Zugriffsregeln nur angemeldete Personen.
-- (rls_auto_enable legt Supabase selbst an: schaltet für neue Tabellen automatisch die Zugriffsregeln ein.)
-- ==========================================================================
revoke execute on function public.handle_new_user() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
alter function public.touch_updated_at() set search_path = '';
revoke execute on function public.can_access_category(uuid) from public, anon;
revoke execute on function public.is_category_owner(uuid) from public, anon;
revoke execute on function public.is_item_owner(uuid) from public, anon;
revoke execute on function public.is_partner(uuid) from public, anon;
revoke execute on function public.item_shared_with_me(uuid) from public, anon;
revoke execute on function public.can_access_ink(uuid, uuid) from public, anon;
revoke execute on function public.can_access_ink_file(text) from public, anon;

-- ==========================================================================
-- Kalender: verknüpfte Kalender (Outlook, Google, iCloud … per Abo-Adresse/ICS) und Anzeige-Einstellungen
-- Die Abo-Adressen sind privat: nur die eigene Person sieht und ändert sie. Geholt werden sie
-- über die Edge Function "calendar-feed" (Browser dürfen fremde Kalender wegen CORS nicht direkt laden).
-- ==========================================================================
create table if not exists public.calendars (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  url        text not null check (char_length(url) between 10 and 2000),
  color      text,
  created_at timestamptz not null default now()
);
alter table public.calendars enable row level security;
drop policy if exists calendars_own on public.calendars;
create policy calendars_own on public.calendars for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Anzeige im Kalender und auf der Startseite: ausgeblendete Abschnitte { hide: [...], home: [...] }
alter table public.profiles add column if not exists cal_prefs jsonb;

-- ==========================================================================
-- Google-Kalender bearbeiten (Edge Function google-calendar)
-- Je Person ein verbundenes Google-Konto. Die Schlüssel liest und schreibt nur die Edge Function
-- (Dienstzugang); für Browser gibt es bewusst keine Regeln und keine Rechte.
-- ==========================================================================
create table if not exists public.google_links (
  user_id uuid primary key references auth.users on delete cascade,
  email text,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.google_links enable row level security;
revoke all on public.google_links from anon, authenticated;

-- ==========================================================================
-- Papierkorb: Gelöschtes wird nur markiert (deleted_at) und nach 30 Tagen endgültig gelöscht (App beim Laden).
-- Wiederherstellen = deleted_at wieder leeren. Rechte wie beim Bearbeiten (bestehende Regeln).
-- ==========================================================================
alter table public.items add column if not exists deleted_at timestamptz;
alter table public.categories add column if not exists deleted_at timestamptz;

-- Reine Canvas-Ordner: Notiz-Ordner öffnet direkt den Canvas (ohne Liste)
alter table public.categories add column if not exists canvas_only boolean not null default false;

-- (Termin an eine Person kopieren wurde ersetzt durch Kopieren in einen anderen Kalender-Abschnitt)
drop function if exists public.give_event(uuid, text, text, date, text, text, text);

-- Erinnerungen als eigener Eintrag (z. B. aus dem Canvas oder schnell gestellt)
alter table public.items drop constraint if exists items_type_check;
alter table public.items add constraint items_type_check check (type in ('todo', 'note', 'meal', 'event', 'training', 'reminder'));
