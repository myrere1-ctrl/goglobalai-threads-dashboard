# GoGlobal Threads Bot

Full-auto Threads posting untuk GoGlobal AI. Cron jalan 10x/hari, generate konten via Claude API, post ke Threads via Meta Graph API. Token auto-refresh tiap minggu.

## Meta App

Parent Meta app: `996897829932452` (display name `Threads`).
**Threads app ID** (untuk OAuth): `1382518007054116`
**Threads app secret**: ada di Meta Console → app → Use cases → Access the Threads API → Settings → klik "Show"

App Secret: jangan hardcode di file. Selalu pakai env var atau GitHub Secret.

## Setup (one-time)

### 1. GitHub Secrets

Di repo Settings → Secrets and variables → Actions, tambahkan:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |
| `THREADS_ACCESS_TOKEN` | Long-lived token (lihat step 2) |
| `THREADS_USER_ID` | Numeric user id |
| `GH_PAT_REPO_SECRETS` | Fine-grained PAT, scope: Actions secrets read/write pada repo ini |

### 2. Dapat Long-lived Threads Token

App ID: `1382518007054116`
Redirect URI: `https://localhost/` (pastikan sudah di-set di Meta Console → Use cases → Threads API → Settings → Redirect Callback URLs)

**a.** Buka URL ini di browser (login pakai akun Threads target):
```
https://threads.net/oauth/authorize?client_id=1382518007054116&redirect_uri=https://localhost/&scope=threads_basic,threads_content_publish&response_type=code
```

**b.** Setelah login, di-redirect ke `https://localhost/?code=XXXXX#_`. Copy nilai `code` (buang `#_` di belakang).

**c.** Exchange code → short → long-lived (sekali jalan):

PowerShell:
```powershell
$env:THREADS_APP_SECRET="paste_app_secret_dari_meta"
$env:CODE="paste_code_dari_step_b"
node scripts/exchange-token.mjs
```

Bash:
```bash
THREADS_APP_SECRET=paste_app_secret_dari_meta CODE=paste_code_dari_step_b node scripts/exchange-token.mjs
```

Output:
```
short_token user_id: 1234567890
LONG TOKEN: THAA...
Expires in days: 60
```

**d.** Set 2 GitHub Secrets:
- `THREADS_ACCESS_TOKEN` = long token
- `THREADS_USER_ID` = user_id dari output

### 3. Verifikasi token

```bash
curl "https://graph.threads.net/v1.0/me?fields=id,username&access_token=$TOKEN"
```

Harus return `{"id":"...", "username":"..."}`.

### 4. Test post manual

GitHub → Actions → **Post to Threads** → Run workflow → input `slot=0`, `dry_run=true` dulu untuk lihat hasil generate tanpa post. Kalau OK, jalankan lagi dengan `dry_run=false`.

### 5. Aktifkan cron

Cron otomatis jalan setelah workflow ada di branch `main`/`master`. Jadwal di [.github/workflows/post-threads.yml](.github/workflows/post-threads.yml).

| Slot | WIB | UTC |
|---|---|---|
| 0 | 06.00 | 23.00 (hari prev) |
| 1 | 07.30 | 00.30 |
| 2 | 09.00 | 02.00 |
| 3 | 10.30 | 03.30 |
| 4 | 12.00 | 05.00 |
| 5 | 13.30 | 06.30 |
| 6 | 15.00 | 08.00 |
| 7 | 17.00 | 10.00 |
| 8 | 19.00 | 12.00 |
| 9 | 21.00 | 14.00 |

> GitHub Actions cron sering telat 5-15 menit (best-effort). Untuk Threads itu fine.

## Cara kerja

- `scripts/generate-and-post.mjs` dipanggil per cron, baca `--slot=N`, rotasi tipe+negara+tone berdasarkan tanggal + slot, generate 1 post via Claude (`claude-sonnet-4-6`), post ke Threads (container → wait 30s → publish), append ke [data/posted-log.json](data/posted-log.json), commit balik.
- `scripts/refresh-token.mjs` cek [data/token-meta.json](data/token-meta.json). Kalau sisa < 14 hari, refresh via `th_refresh_token`, update GitHub Secret pakai libsodium sealed_box, update meta file.

## Local development

```bash
npm install
# Dry-run (generate only):
ANTHROPIC_API_KEY=sk-ant-... npm run post:dry
# Real post:
ANTHROPIC_API_KEY=sk-ant-... \
THREADS_ACCESS_TOKEN=THAA... \
THREADS_USER_ID=123456 \
npm run post -- --slot=0
```

## Troubleshooting

- `Container failed` → cek scope token (`threads_basic` + `threads_content_publish`), cek user_id benar
- `Publish failed` → tunggu lebih lama, naikkan `waitMs` di [scripts/lib/threads.mjs](scripts/lib/threads.mjs)
- Token refresh gagal → PAT `GH_PAT_REPO_SECRETS` expired atau scope salah
- Workflow ga jalan otomatis → branch default harus `main` atau `master`, repo harus active (bukan archived)

## Customize

- Tambah negara: [scripts/generate-and-post.mjs](scripts/generate-and-post.mjs) `COUNTRIES`
- Ganti rotasi tipe: `DAILY_TYPES` (Mon-Sun)
- Ubah jadwal: edit cron di [.github/workflows/post-threads.yml](.github/workflows/post-threads.yml) **DAN** `case` resolver di-bawahnya
- Tweak prompt: [scripts/lib/claude.mjs](scripts/lib/claude.mjs) `buildPrompt`
