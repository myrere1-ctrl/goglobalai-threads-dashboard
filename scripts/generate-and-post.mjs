import fs from 'node:fs/promises';
import path from 'node:path';
import { generatePost } from './lib/claude.mjs';
import { postThread, postReply, verifyToken } from './lib/threads.mjs';

const SLOTS = [
  '06.00', '07.30', '09.00', '10.30', '12.00',
  '13.30', '15.00', '17.00', '19.00', '21.00',
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
    'Peluang WNI di Australia: 9+ jenis pekerjaan, gaji Rp28-140jt/bln, termasuk mining FIFO. Butuh bahasa Inggris + sertifikasi diakui + CV format Australia.',
  Jerman:
    'Peluang WNI di Jerman: 9 jenis pekerjaan, gaji Rp13-112jt/bln, ada program Ausbildung (kerja sambil belajar). Bahasa Jerman + pengakuan ijazah penting.',
  Kanada:
    'Peluang WNI di Kanada: 9 jenis pekerjaan, gaji Rp26-109jt/bln. Sistem Express Entry, butuh skill assessment + CV/LinkedIn gaya Kanada.',
  'United Kingdom':
    'Peluang WNI di UK: 5 jenis pekerjaan, gaji Rp36-120jt/bln. Skilled Worker visa (butuh sponsor employer). Full bahasa Inggris. Sektor: healthcare (NHS), hospitality, tech, care worker.',
  'Amerika Serikat':
    'Peluang WNI di Amerika Serikat: 4 jenis pekerjaan, via visa J1 (exchange/internship) & H-2A (seasonal agriculture). Kompetitif, butuh sponsor + dokumen kuat + bahasa Inggris.',
  Remote:
    'Peluang remote / AI trainer: 5+ jenis pekerjaan, kerja dari Indonesia, gaji USD. Termasuk AI trainer, data annotator, digital roles. Butuh skill digital + portfolio + CV/LinkedIn gaya internasional.',
  'Kapal Pesiar':
    'Peluang kapal pesiar: 5+ posisi, gaji USD + akomodasi & makan gratis, keliling dunia. Kompetitif — butuh CV & interview bahasa Inggris yang kuat.',
};

const DAILY_TYPES = ['pain', 'tips', 'story', 'hook', 'promo', 'pain', 'tips'];

const TONES = ['santai', 'inspiratif', 'edukatif', 'humor'];

// CTA reply pool — ditaruh di REPLY (bukan post utama) biar post utama bersih dari link = reach tinggi.
// Positioning: TOOL buat nyiapin diri, bukan agen kerja. {country} diisi otomatis.
const CTA_REPLIES = [
  'btw semua tools buat nyiapin diri ke {country} (cek gaji real, visa, CV, deteksi scam) ada di goglobal-ai.app — gratis buat mulai 🌏',
  'aku riset {country} + 14 negara lain lewat goglobal-ai.app. ada Kalkulator Gaji & Scam Detector gratis, cek aja 👆',
  'kalau CV kamu masih format Indonesia, coba upgrade pakai CV Builder di goglobal-ai.app biar lolos standar {country}. mulai gratis',
  'sebelum ngelamar ke {country}, cek dulu peluang + gaji real-nya di goglobal-ai.app. gratis, ga perlu daftar ribet',
  'mau interview buat posisi di {country}? ada Interview AI di goglobal-ai.app buat latihan. link di bio 🎯',
  'info lengkap {country} (visa, gaji, jenis kerja) + tools nyiapin diri ada di goglobal-ai.app. mulai dari yang gratis dulu',
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
  if (out.slot === null || Number.isNaN(out.slot) || out.slot < 0 || out.slot > 9) {
    throw new Error('Usage: node generate-and-post.mjs --slot=<0-9> [--dry-run]');
  }
  return out;
}

function pickContent({ slot }) {
  const now = new Date();
  const dayIndex = Math.floor(now.getTime() / 86400000);
  const dow = now.getUTCDay();
  const country = COUNTRIES[(dayIndex + slot) % COUNTRIES.length];
  return {
    type: DAILY_TYPES[dow],
    country,
    tone: TONES[slot % TONES.length],
    note: '',
    countryContext: COUNTRY_CONTEXT[country] || '',
  };
}

async function appendLog(entry) {
  let log = [];
  try {
    const raw = await fs.readFile(LOG_PATH, 'utf8');
    log = JSON.parse(raw);
  } catch {}
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
  const ctaReply = pickCtaReply(choice.country);
  console.log('--- MAIN POST ---');
  console.log(post.full);
  console.log('--- REPLY (CTA + link) ---');
  console.log(ctaReply);
  console.log('---');

  if (dryRun) {
    console.log('[dry-run] skip Threads post');
    return;
  }

  await verifyToken({ token });
  const threadId = await postThread({ userId, token, text: post.full });
  console.log('Posted main:', threadId);

  // Auto-reply CTA+link. Kalau gagal, JANGAN batalin main post — log aja.
  let replyThreadId = null;
  try {
    replyThreadId = await postReply({ userId, token, text: ctaReply, replyToId: threadId });
    console.log('Posted reply:', replyThreadId);
  } catch (e) {
    console.error('Reply gagal (main post tetap aman):', e.message);
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
    ctaReply,
    replyThreadId,
  });
  console.log('Logged');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
