# Übersicht-App – Einrichtung

Dauer: ca. 20 Minuten, am besten am PC.

## 1. Supabase (Datenbank + Login)

1. Auf supabase.com mit deinem GitHub-Konto anmelden.
2. "New project": Name z. B. `uebersicht`, Datenbank-Passwort vergeben (irgendwo notieren), Region "Central EU (Frankfurt)". Ca. 2 Minuten warten.
3. Links "SQL Editor" → neue Abfrage → kompletten Inhalt von `supabase-setup.sql` einfügen → "Run". Es sollte "Success" erscheinen.
4. Links "Authentication" → "Sign In / Providers" → "Email": "Confirm email" ausschalten und speichern. Sonst muss man nach der Registrierung erst einen Link in der E-Mail bestätigen.
5. "Project Settings" → "API Keys" (bzw. "API"): zwei Werte kopieren:
   - Project URL (https://….supabase.co)
   - Publishable Key (beginnt mit `sb_publishable_`) – bei älteren Projekten heißt er "anon public".
   Den "secret" bzw. "service_role" Key niemals verwenden.

## 2. config.js ausfüllen

Datei `config.js` mit einem Texteditor öffnen und die beiden Werte zwischen die Anführungszeichen setzen.
Der Publishable Key darf öffentlich sein – die Daten schützen die Zugriffsregeln in der Datenbank.

## 3. GitHub Pages

1. Auf github.com rechts oben "+" → "New repository", Name `uebersicht`, "Public", erstellen.
2. "uploading an existing file" anklicken und alle Dateien aus diesem Ordner hineinziehen, inklusive Ordner `icons`. Unten "Commit changes".
3. Im Repository "Settings" → "Pages" → bei "Branch" `main` und `/ (root)` wählen → "Save".
4. Nach 1–2 Minuten ist die App erreichbar unter `https://DEINNAME.github.io/uebersicht/`.

## 4. Adresse in Supabase eintragen

Supabase → "Authentication" → "URL Configuration" → "Site URL" auf die GitHub-Adresse aus Schritt 3 setzen und speichern.

## 5. Am iPhone und Mac installieren

1. Adresse in Safari öffnen.
2. Teilen-Symbol → "Zum Home-Bildschirm".
3. Die App vom Home-Bildschirm öffnen und dort registrieren bzw. anmelden. (Die Home-Bildschirm-App hat eine eigene Anmeldung, getrennt von Safari.)

Am Mac: Adresse in Safari öffnen → Ablage → "Zum Dock hinzufügen". Dann startet die App mit eigenem Icon im eigenen Fenster.

## 6. Freundin dazuholen

1. Sie öffnet dieselbe Adresse und registriert sich mit ihrer E-Mail.
2. Du legst unter Kategorien (Steuerknopf) eine Kategorie an (z. B. "Haushalt") und lädst sie per E-Mail ein. Alles in dieser Kategorie sehen und bearbeiten dann beide.
3. Einzelne Todos oder Notizen teilst du direkt im Eintrag unter "Geteilt".
4. Sobald alle registriert sind: Supabase → "Authentication" → "Sign In / Providers" → "Allow new users to sign up" ausschalten. Dann kann sich niemand Fremder mehr anmelden.

## 7. Mitteilungen (Erinnerungen auch bei geschlossener App)

Einmalig, ca. 10 Minuten. Du brauchst dafür die Datei `push-schluessel-GEHEIM.txt` (liegt NICHT in diesem Ordner und gehört nicht auf GitHub).

1. Supabase → "Edge Functions" → "Deploy a new function" → "Via Editor". Name: `send-reminders`. Den Inhalt von `supabase/functions/send-reminders/index.ts` einfügen und "Deploy" klicken.
2. In der Funktion unter "Details" bzw. "Settings": "Enforce JWT verification" ausschalten und speichern. (Die Funktion prüft stattdessen das CRON_SECRET.)
3. Supabase → "Edge Functions" → "Secrets": die vier Werte aus der Schlüssel-Datei anlegen (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT mit deiner E-Mail, CRON_SECRET).
4. Supabase → "SQL Editor": den Zeitplan-Teil aus der Schlüssel-Datei einfügen, PROJEKT-ID ersetzen, "Run". Ab jetzt prüft Supabase jede Minute, ob Erinnerungen fällig sind.
5. In der App auf jedem Gerät: Home → Einstellungen → "Erinnerungen als Mitteilung" einschalten und erlauben.
   - iPhone: nur in der App vom Home-Bildschirm (iOS 16.4 oder neuer), nicht im normalen Safari-Tab.
   - Mac: in der Dock-App (Safari → Ablage → "Zum Dock hinzufügen") oder in Chrome/Safari.

Erinnerungen an geteilte Einträge bekommen alle, die den Eintrag sehen.

## Wie die Daten geschützt sind

- Jeder sieht nur eigene Einträge, direkt mit ihm geteilte Einträge und Einträge in gemeinsamen Kategorien.
- Kategorien umbenennen, löschen und Leute einladen kann nur, wer sie erstellt hat. Eingeladene können eine Kategorie wieder verlassen.
- Teilen funktioniert nur mit E-Mail-Adressen, die bereits ein Konto in der App haben.

## Gut zu wissen

- Updates: geänderte Dateien bei GitHub einfach erneut hochladen (gleicher Name überschreibt).
- Supabase pausiert kostenlose Projekte nach 7 Tagen ohne Nutzung. Im Supabase-Dashboard lässt es sich mit einem Klick wieder starten, die Daten bleiben erhalten.
