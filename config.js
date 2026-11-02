// Hier die zwei Werte aus Supabase eintragen
// (Supabase → Project Settings → API / API Keys)
window.APP_CONFIG = {
  SUPABASE_URL: 'https://gerpilzxolufdnlsltxk.supabase.co',
  SUPABASE_KEY: 'sb_publishable_kFMwOXXxuFZ_XSkdJe9SCw_EY9yKHk2',  // "publishable" bzw. "anon public" Key – NICHT den secret/service_role Key
  VAPID_PUBLIC_KEY: 'BBt9WjN_QRBVIIfH4SGyRjimAGEqZNz5s3Aw6uVA3fgtti12-1m5sXXgvfvylR2ZG4ljCi7qUOiFjcx4rQnWEKQ'   // öffentlicher Schlüssel für Push-Mitteilungen (darf öffentlich sein)
};
