/**
 * Every string the interface shows, in both languages it speaks.
 *
 * English is the source of truth and Indonesian is typed against it, so adding
 * a key to one and forgetting the other is a compile error rather than a word
 * of English appearing halfway down an Indonesian page.
 *
 * `{placeholders}` are filled by `t(key, vars)`. They are named rather than
 * positional because the two languages do not order a sentence the same way,
 * and a translator has to be free to move them.
 */
export const LANGUAGES = ["en", "id"] as const;

export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  id: "Bahasa Indonesia",
};

/** Shown on the compact toggle, where there is no room for the full name. */
export const LANGUAGE_SHORT: Record<Language, string> = {
  en: "EN",
  id: "ID",
};

const en = {
  "app.title": "Cable Tray Hanger",

  "common.loading": "Loading...",
  "common.cancel": "Cancel",
  "common.logout": "Log out",
  "common.email": "Email",
  "common.password": "Password",
  "common.back": "Back",
  "common.none": "—",
  "common.language": "Language",
  "common.theme": "Theme",
  "common.theme.toLight": "Switch to light theme",
  "common.theme.toDark": "Switch to dark theme",
  "common.showPassword": "Show password",
  "common.hidePassword": "Hide password",
  "common.signedInAs": "Signed in as {email}",

  "setup.title": "Supabase is not configured",
  "setup.body":
    "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild. Locally that is .env.local; " +
    "on Vercel it is Settings → Environment Variables followed by a redeploy.",
  "setup.keyWarning":
    "These are separate from the server-side SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Use the " +
    "anon key here, never the service role.",

  "login.title": "Sign in",
  "login.subtitle": "This workspace is private. Sign in to continue.",
  "login.submit": "Sign in",
  "login.submitting": "Signing in...",
  "login.adminOnly":
    "There is no sign-up. Accounts are created by an administrator in Supabase " +
    "(Authentication → Users) — ask them to add your email address.",
  "login.failed": "Sign-in failed: {message}",
  "login.checking": "Checking your session...",

  "dash.subtitle": "Recent hanger configurations",
  "dash.scanned": "{project} — last scanned from {view}, {count} trays",
  "dash.unnamedView": "an unnamed view",
  "dash.apiKeys": "API keys",
  "dash.newConfig": "New config",
  "dash.loadError": "Could not load your configurations: {message}",
  "dash.empty": "No configs yet. Push one to Revit to see it here.",

  "history.trays": "Cable trays",
  "history.family": "Hanger family",
  "history.height": "Height",
  "history.total": "Total hangers",
  "history.status": "Status",
  "history.created": "Created",
  "history.more": "{name} +{count} more",
  "history.status.SYNCED": "Synced",
  "history.status.PENDING": "Pending",
  "history.status.FAILED": "Failed",

  "config.title": "New hanger config",
  "config.loadingScan": "Loading the latest scan from Revit...",
  "config.scanError": "Could not load the latest scan: {message}",
  "config.noScan":
    "No scan from Revit yet. Open a view showing the cable tray run, press Scan Cable Tray on the " +
    "Cable Tray Hanger ribbon, then reload this page.",
  "config.scanSummary":
    "Scanned from {view} in {project} — {trays} trays, {elbows} elbows, {families} hanger families.",
  "config.noFamilies":
    "No Cable Tray Fitting families are loaded in this project, so there is nothing to place. Load " +
    "the hanger family, then scan again.",
  "config.keywordMissed":
    'No family name contains "{keyword}", so all {count} Cable Tray Fitting families are listed ' +
    "below rather than just the hangers. Pick yours — but also set a keyword that matches it in " +
    "the add-in's Settings and scan again, because the same keyword is how a scan recognises " +
    "hangers already in the model: until it matches, every tray below is listed as empty whether " +
    "it is or not. Sync will still refuse to place a hanger where one already stands — it knows " +
    "the family it is placing — so you will get fewer hangers than the count here, not duplicates.",

  "config.skipped.title": "{skipped} of {total} cable trays already have hangers",
  "config.skipped.body":
    "They are left out of this config entirely — nothing is added to them and nothing on them is " +
    "changed, so a height you revised in Revit survives. Only the empty trays below get hangers.",
  "config.skipped.item": "{name} — {count} hangers",
  "config.skipped.itemAtHeight": "{name} — {count} hangers at {height}mm",

  "config.trays": "Cable trays to hang ({count})",
  "config.trays.tray": "Tray",
  "config.trays.length": "Length",
  "config.trays.width": "Width",
  "config.trays.hangers": "Hangers",
  "config.trays.empty": "No trays to place — every scanned tray already has hangers.",
  "config.trays.note":
    "Every empty tray in the scan is included. Hanger width follows each tray's own width.",

  "config.family": "Hanger family",
  "config.family.placeholder": "Select hanger family...",
  "config.family.none": "No Cable Tray Fitting families scanned yet",
  "config.family.note":
    "Cable Tray Fitting families loaded in this project — that is what a cable tray hanger is " +
    "built as.",
  "config.family.types": "{count} types",
  "config.family.type": "{count} type",

  "config.spacing": "Hanger spacing (mm)",
  "config.spacing.note": "The spacing is the whole rule — a bend gets a hanger only where it puts one.",
  "config.spacing.invalid": "Enter a spacing of at least {min}mm to preview placement.",

  "config.height": "Hanger height (mm)",
  "config.height.note":
    "Written onto the hangers this config creates. Hangers already in the model keep the height " +
    "they have, so a revision made in Revit is never overwritten.",
  "config.height.invalid": "Enter a height greater than 0.",

  "config.stats.total": "Total hangers",
  "config.stats.spacing": "At spacing",
  "config.stats.ends": "Start/end",

  "config.trayDetail": "{count} hangers, {length}m",
  "config.preview.position": "Position (mm)",
  "config.preview.reason": "Reason",
  "config.reason.START": "Start",
  "config.reason.END": "End",
  "config.reason.ELBOW": "Elbow",
  "config.reason.SPACING": "Spacing",
  "config.viz.placeholder": "Select a cable tray to preview placement",

  "config.push": "Push {count} hangers to Revit",
  "config.pushing": "Pushing...",
  "config.pushError": "Error: {message}",

  "keys.title": "API keys",
  "keys.subtitle": "For the Revit add-in. Paste one into its Settings dialog.",
  "keys.freshTitle": "Copy this key now — it will not be shown again",
  "keys.copy": "Copy",
  "keys.copied": "Copied",
  "keys.freshNote":
    "In Revit: Cable Tray Hanger → Settings, paste into API key, then Save. Only the hash is " +
    "stored here, so we cannot recover it for you.",
  "keys.freshHide": "I've saved it — hide",
  "keys.new": "New key",
  "keys.labelPlaceholder": "Which machine is this for? e.g. Workstation BIM 02",
  "keys.generate": "Generate",
  "keys.generating": "Generating...",
  "keys.empty": "No keys yet. Generate one above, then paste it into the add-in.",
  "keys.label": "Label",
  "keys.key": "Key",
  "keys.created": "Created",
  "keys.lastUsed": "Last used",
  "keys.revoke": "Revoke",
  "keys.revoked": "revoked",
  "keys.revokeConfirm": 'Revoke "{label}"? Any Revit add-in using it stops working.',
  "keys.revokedNotice": 'Revoked "{label}".',
  "keys.clipboardFailed": "Could not reach the clipboard — select the key and copy it.",
  "keys.unknownError": "Unknown error",
} as const;

export type TranslationKey = keyof typeof en;

const id: Record<TranslationKey, string> = {
  "app.title": "Cable Tray Hanger",

  "common.loading": "Memuat...",
  "common.cancel": "Batal",
  "common.logout": "Keluar",
  "common.email": "Email",
  "common.password": "Kata sandi",
  "common.back": "Kembali",
  "common.none": "—",
  "common.language": "Bahasa",
  "common.theme": "Tema",
  "common.theme.toLight": "Ganti ke tema terang",
  "common.theme.toDark": "Ganti ke tema gelap",
  "common.showPassword": "Tampilkan kata sandi",
  "common.hidePassword": "Sembunyikan kata sandi",
  "common.signedInAs": "Masuk sebagai {email}",

  "setup.title": "Supabase belum dikonfigurasi",
  "setup.body":
    "Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY, lalu build ulang. Di lokal berkasnya " +
    ".env.local; di Vercel lewat Settings → Environment Variables lalu redeploy.",
  "setup.keyWarning":
    "Keduanya berbeda dari SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY milik server. Pakai kunci " +
    "anon di sini, jangan pernah service role.",

  "login.title": "Masuk",
  "login.subtitle": "Ruang kerja ini tertutup. Masuk dulu untuk melanjutkan.",
  "login.submit": "Masuk",
  "login.submitting": "Sedang masuk...",
  "login.adminOnly":
    "Tidak ada pendaftaran mandiri. Akun dibuat oleh admin di Supabase " +
    "(Authentication → Users) — minta admin mendaftarkan alamat email Anda.",
  "login.failed": "Gagal masuk: {message}",
  "login.checking": "Memeriksa sesi Anda...",

  "dash.subtitle": "Konfigurasi hanger terbaru",
  "dash.scanned": "{project} — pemindaian terakhir dari {view}, {count} tray",
  "dash.unnamedView": "view tanpa nama",
  "dash.apiKeys": "Kunci API",
  "dash.newConfig": "Konfigurasi baru",
  "dash.loadError": "Konfigurasi Anda tidak bisa dimuat: {message}",
  "dash.empty": "Belum ada konfigurasi. Kirim satu ke Revit untuk melihatnya di sini.",

  "history.trays": "Cable tray",
  "history.family": "Family hanger",
  "history.height": "Ketinggian",
  "history.total": "Jumlah hanger",
  "history.status": "Status",
  "history.created": "Dibuat",
  "history.more": "{name} +{count} lainnya",
  "history.status.SYNCED": "Tersinkron",
  "history.status.PENDING": "Menunggu",
  "history.status.FAILED": "Gagal",

  "config.title": "Konfigurasi hanger baru",
  "config.loadingScan": "Memuat pemindaian terakhir dari Revit...",
  "config.scanError": "Pemindaian terakhir tidak bisa dimuat: {message}",
  "config.noScan":
    "Belum ada pemindaian dari Revit. Buka view yang menampilkan jalur cable tray, tekan Scan " +
    "Cable Tray pada ribbon Cable Tray Hanger, lalu muat ulang halaman ini.",
  "config.scanSummary":
    "Dipindai dari {view} pada {project} — {trays} tray, {elbows} elbow, {families} family hanger.",
  "config.noFamilies":
    "Tidak ada family Cable Tray Fitting yang dimuat di proyek ini, jadi tidak ada yang bisa " +
    "dipasang. Muat family hanger-nya, lalu pindai lagi.",
  "config.keywordMissed":
    'Tidak ada nama family yang mengandung "{keyword}", jadi seluruh {count} family Cable Tray ' +
    "Fitting ditampilkan di bawah, bukan hanya hanger-nya. Pilih milik Anda — tapi setel juga " +
    "kata kunci yang cocok di Settings add-in lalu pindai ulang, karena kata kunci yang sama " +
    "itulah yang dipakai pemindaian untuk mengenali hanger yang sudah ada di model: selama belum " +
    "cocok, semua tray di bawah terdaftar kosong entah benar kosong atau tidak. Sync tetap menolak " +
    "memasang hanger di tempat yang sudah ada hanger-nya — ia mengenali family yang sedang " +
    "dipasang — jadi hasilnya lebih sedikit dari angka di sini, bukan duplikat.",

  "config.skipped.title": "{skipped} dari {total} cable tray sudah punya hanger",
  "config.skipped.body":
    "Tray tersebut tidak diikutkan sama sekali — tidak ada yang ditambahkan dan tidak ada yang " +
    "diubah, jadi ketinggian yang sudah Anda revisi di Revit tetap aman. Hanya tray kosong di " +
    "bawah yang akan dipasangi hanger.",
  "config.skipped.item": "{name} — {count} hanger",
  "config.skipped.itemAtHeight": "{name} — {count} hanger pada {height}mm",

  "config.trays": "Cable tray yang akan dipasangi ({count})",
  "config.trays.tray": "Tray",
  "config.trays.length": "Panjang",
  "config.trays.width": "Lebar",
  "config.trays.hangers": "Hanger",
  "config.trays.empty": "Tidak ada tray yang perlu dipasangi — semua tray hasil pindai sudah punya hanger.",
  "config.trays.note":
    "Semua tray kosong dari pemindaian ikut serta. Lebar hanger mengikuti lebar tray masing-masing.",

  "config.family": "Family hanger",
  "config.family.placeholder": "Pilih family hanger...",
  "config.family.none": "Belum ada family Cable Tray Fitting yang dipindai",
  "config.family.note":
    "Family Cable Tray Fitting yang dimuat di proyek ini — itulah bentuk sebuah cable tray hanger.",
  "config.family.types": "{count} tipe",
  "config.family.type": "{count} tipe",

  "config.spacing": "Jarak antar hanger (mm)",
  "config.spacing.note":
    "Jarak inilah satu-satunya aturan — belokan hanya dapat hanger kalau jaraknya jatuh di situ.",
  "config.spacing.invalid": "Isi jarak minimal {min}mm untuk melihat pratinjau penempatan.",

  "config.height": "Ketinggian hanger (mm)",
  "config.height.note":
    "Ditulis hanya pada hanger yang dibuat konfigurasi ini. Hanger yang sudah ada di model tetap " +
    "memakai ketinggiannya sendiri, jadi revisi yang Anda buat di Revit tidak pernah ditimpa.",
  "config.height.invalid": "Isi ketinggian lebih dari 0.",

  "config.stats.total": "Total hanger",
  "config.stats.spacing": "Sesuai jarak",
  "config.stats.ends": "Ujung awal/akhir",

  "config.trayDetail": "{count} hanger, {length}m",
  "config.preview.position": "Posisi (mm)",
  "config.preview.reason": "Alasan",
  "config.reason.START": "Awal",
  "config.reason.END": "Akhir",
  "config.reason.ELBOW": "Belokan",
  "config.reason.SPACING": "Jarak",
  "config.viz.placeholder": "Pilih cable tray untuk melihat pratinjau penempatan",

  "config.push": "Kirim {count} hanger ke Revit",
  "config.pushing": "Mengirim...",
  "config.pushError": "Kesalahan: {message}",

  "keys.title": "Kunci API",
  "keys.subtitle": "Untuk add-in Revit. Tempelkan satu ke dialog Settings-nya.",
  "keys.freshTitle": "Salin kunci ini sekarang — tidak akan ditampilkan lagi",
  "keys.copy": "Salin",
  "keys.copied": "Tersalin",
  "keys.freshNote":
    "Di Revit: Cable Tray Hanger → Settings, tempel ke API key, lalu Save. Yang disimpan di sini " +
    "hanya hash-nya, jadi kami tidak bisa memulihkannya untuk Anda.",
  "keys.freshHide": "Sudah saya simpan — sembunyikan",
  "keys.new": "Kunci baru",
  "keys.labelPlaceholder": "Untuk komputer yang mana? mis. Workstation BIM 02",
  "keys.generate": "Buat",
  "keys.generating": "Membuat...",
  "keys.empty": "Belum ada kunci. Buat satu di atas, lalu tempelkan ke add-in.",
  "keys.label": "Label",
  "keys.key": "Kunci",
  "keys.created": "Dibuat",
  "keys.lastUsed": "Terakhir dipakai",
  "keys.revoke": "Cabut",
  "keys.revoked": "dicabut",
  "keys.revokeConfirm": 'Cabut "{label}"? Add-in Revit mana pun yang memakainya akan berhenti bekerja.',
  "keys.revokedNotice": '"{label}" dicabut.',
  "keys.clipboardFailed": "Papan klip tidak bisa diakses — pilih kuncinya lalu salin manual.",
  "keys.unknownError": "Kesalahan tidak dikenal",
};

export const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = { en, id };
