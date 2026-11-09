import fs from 'node:fs/promises';
import path from 'node:path';
import { generatePost } from './lib/claude.mjs';
import { postThread, postReply, verifyToken } from './lib/threads.mjs';

// 12 post/hari, sebar seharian (06.00–22.00). Konten mix acak semua negara di COUNTRIES.
const SLOTS = [
  '06.00', '08.00', '10.00', '11.30', '13.00', '14.30',
  '16.00', '17.30', '19.00', '20.00', '21.00', '22.00',
];

// Rotasi auto — fokus 9 destinasi utama app. Arab Saudi, Belanda, Polandia,
// Irlandia, Kazakhstan di-handle manual lewat dashboard (bukan bot).
const COUNTRIES = [
  'Jepang', 'Korea', 'Australia', 'Jerman', 'Kanada',
  'United Kingdom', 'Amerika Serikat', 'Remote', 'Kapal Pesiar',
];

// Grounding konteks per negara (biar AI ga ngarang, terutama negara niche).
// Cuma diisi untuk negara yang perlu grounding; sisanya AI sudah punya konteks cukup.
const COUNTRY_CONTEXT = {
  Jepang:
    'Peluang WNI di Jepang: 10+ jenis pekerjaan, gaji Rp18-45jt/bln, usia 18-50 th. Butuh persiapan bahasa (JLPT) + format CV/rirekisho khas Jepang.',
  Korea:
    'Peluang WNI di Korea: 8 jenis pekerjaan, gaji Rp26-68jt/bln, banyak via jalur EPS-TOPIK (butuh lulus ujian bahasa Korea). Persiapan bahasa + dokumen krusial.',
  Australia:
    'Peluang WNI di Australia: 9+ jenis pekerjaan, gaji Rp28-140jt/bln, termasuk mining FIFO. Butuh bahasa Inggris + sertifikasi diakui + CV format Australia. UPDATE WHV (Work & Holiday subclass 462): sejak 1 Juli 2026 biaya visa grant pertama naik dari $670 ke $840. Sistem BALLOT untuk Indonesia SUDAH DISETUJUI (diumumkan 15 Juli 2026) TAPI BELUM AKTIF — saat ini masih kuota 5.000/th + SDUWHV; ballot AKAN diberlakukan (masih disiapkan, belum ada tanggal). JANGAN klaim ballot sudah berlaku sekarang.',
  Jerman:
    'Peluang WNI di Jerman: 9 jenis pekerjaan, gaji Rp13-112jt/bln, ada program Ausbildung (kerja sambil belajar). Bahasa Jerman + pengakuan ijazah penting.',
  Kanada:
    'Peluang WNI di Kanada: 9 jenis pekerjaan, gaji Rp26-109jt/bln. Sistem Express Entry, butuh skill assessment + CV/LinkedIn gaya Kanada.',
  'United Kingdom':
    'Peluang WNI di UK: 5 jenis pekerjaan, gaji Rp36-120jt/bln. Skilled Worker visa (butuh sponsor employer). PENTING (update, berlaku sejak 8 Jan 2026): syarat Bahasa Inggris NAIK dari B1 ke B2 (CEFR, upper-intermediate) untuk pelamar baru dari luar UK. Sektor: healthcare (NHS), hospitality, tech, care worker. Banyak yang baru sadar skor Inggrisnya belum sampai B2 pas udah mepet apply.',
  'Amerika Serikat':
    'Peluang WNI di Amerika Serikat: 4 jenis pekerjaan, via visa J1 (exchange/internship) & H-2A (seasonal agriculture). Kompetitif, butuh sponsor + dokumen kuat + bahasa Inggris.',
  Remote:
    'Peluang remote / AI trainer: 5+ jenis pekerjaan, kerja dari Indonesia, gaji USD. Termasuk AI trainer, data annotator, digital roles. Butuh skill digital + portfolio + CV/LinkedIn gaya internasional.',
  'Kapal Pesiar':
    'Peluang kapal pesiar: 5+ posisi, gaji USD + akomodasi & makan gratis, keliling dunia. Kompetitif — butuh CV & interview bahasa Inggris yang kuat.',
};

// Tipe konten dipilih PER-SLOT (bukan per-hari lagi) via sequence deterministic 10-slot:
// 4/10 = 40% promo fitur Pro, sisanya kebagi rata pain/tips/story/hook. dayIndex+slot
// biar variasi antar hari (slot yang sama ga selalu dapet tipe yang sama tiap hari).
const TYPE_SEQUENCE = ['promo', 'pain', 'tips', 'promo', 'story', 'hook', 'promo', 'pain', 'tips', 'promo'];

function pickType({ dayIndex, slot }) {
  return TYPE_SEQUENCE[(dayIndex + slot) % TYPE_SEQUENCE.length];
}

const TONES = ['santai', 'inspiratif', 'edukatif', 'humor'];

// CTA reply pool — ditaruh di REPLY (bukan post utama) biar post utama bersih dari link = reach tinggi.
// Sejak 2026-10-13: TANPA link. Upgrade akses lewat DM / WA (nomornya ada di app),
// bukan self-serve link lagi — {country} diisi otomatis. Khusus tipe NON-promo — post
// promo (2026-11-10) udah self-contained, pitch-nya ada di body jadi ga perlu reply lagi.
const CTA_REPLIES = [
  'mau upgrade akses buat {country}? DM aja, atau WA ke nomor yang ada di app 📲',
  'yang mau akses lebih lengkap soal {country} — DM aku ya, atau langsung WA (no-nya ada di dalam app)',
  'DM aku kalau mau upgrade & akses penuh buat persiapan ke {country}. bisa juga WA ke nomor di app',
  'penasaran lebih jauh soal {country}? DM aja buat upgrade akses — atau WA ke nomor di app, lebih cepet aku bales',
  'buat yang mau nyiapin diri ke {country} lebih serius — DM aku buat upgrade, atau WA ke nomor di app ya',
];

function pickCtaReply(country) {
  const t = CTA_REPLIES[Math.floor(Math.random() * CTA_REPLIES.length)];
  return t.replace(/\{country\}/g, country);
}

const LOG_PATH = path.resolve('data/posted-log.json');

function parseArgs() {
  const out = { slot: null, dryRun: false };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--slot=')) out.slot = Number(a.split('=')[1]);
    if (a === '--dry-run') out.dryRun = true;
  }
  if (out.slot === null || Number.isNaN(out.slot) || out.slot < 0 || out.slot >= SLOTS.length) {
    throw new Error(`Usage: node generate-and-post.mjs --slot=<0-${SLOTS.length - 1}> [--dry-run]`);
  }
  return out;
}

function pickContent({ slot }) {
  const now = new Date();
  const dayIndex = Math.floor(now.getTime() / 86400000);
  const country = COUNTRIES[(dayIndex + slot) % COUNTRIES.length];
  return {
    type: pickType({ dayIndex, slot }),
    country,
    tone: TONES[slot % TONES.length],
    note: '',
    countryContext: COUNTRY_CONTEXT[country] || '',
  };
}

async function loadLog() {
  try {
    return JSON.parse(await fs.readFile(LOG_PATH, 'utf8'));
  } catch {
    return [];
  }
}

async function appendLog(entry) {
  const log = await loadLog();
  log.push(entry);
  await fs.writeFile(LOG_PATH, JSON.stringify(log, null, 2) + '\n');
}

async function main() {
  const { slot, dryRun } = parseArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const token = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;

  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  if (!token) throw new Error('THREADS_ACCESS_TOKEN missing');
  if (!userId) throw new Error('THREADS_USER_ID missing');

  const choice = pickContent({ slot });
  console.log('Slot:', slot, SLOTS[slot], 'WIB');
  console.log('Pick:', choice);
  const post = await generatePost({ apiKey, ...choice });

  // Promo fitur Pro = pitch-nya udah self-contained di body, ga perlu reply lagi.
  // Tipe lain tetep reach-preserving: body bersih, CTA/upgrade-ask di reply.
  const isPromo = choice.type === 'promo';
  const reply = isPromo ? null : pickCtaReply(choice.country);

  console.log('--- MAIN POST ---', isPromo ? '(PROMO)' : '');
  console.log(post.full);
  if (reply) {
    console.log('--- REPLY (CTA upgrade) ---');
    console.log(reply);
  }
  console.log('---');

  if (dryRun) {
    console.log('[dry-run] skip Threads post');
    return;
  }

  await verifyToken({ token });
  const threadId = await postThread({ userId, token, text: post.full });
  console.log('Posted main:', threadId);

  // Auto-reply CTA (kalau ada). Kalau gagal, JANGAN batalin main post — log aja.
  let replyThreadId = null;
  if (reply) {
    try {
      replyThreadId = await postReply({ userId, token, text: reply, replyToId: threadId });
      console.log('Posted reply:', replyThreadId);
    } catch (e) {
      console.error('Reply gagal (main post tetap aman):', e.message);
    }
  }

  await appendLog({
    timestamp: new Date().toISOString(),
    slot,
    slotTimeWib: SLOTS[slot],
    type: choice.type,
    country: choice.country,
    tone: choice.tone,
    angle: post.angle,
    body: post.text,
    cta: post.cta,
    text: post.full,
    threadId,
    ctaReply: reply,
    replyThreadId,
  });
  console.log('Logged');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
