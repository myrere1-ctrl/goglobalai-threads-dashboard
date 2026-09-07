import fs from 'node:fs/promises';
import path from 'node:path';
import { generatePost, generateAffiliatePost } from './lib/claude.mjs';
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
    'Peluang WNI di UK: 5 jenis pekerjaan, gaji Rp36-120jt/bln. Skilled Worker visa (butuh sponsor employer). PENTING (update, berlaku sejak 8 Jan 2026): syarat Bahasa Inggris NAIK dari B1 ke B2 (CEFR, upper-intermediate) untuk pelamar baru dari luar UK. Sektor: healthcare (NHS), hospitality, tech, care worker. Cocok diarahkan ke cek skor Inggris gratis di score.goglobal-ai.app.',
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
// 2 tool: score.goglobal-ai.app (cek skor Inggris IELTS/TOEFL/CEFR GRATIS selamanya)
// + goglobal-ai.app (gaji real, visa, CV Builder, Scam Detector, Interview AI).
// Mix seimbang, score tool menonjol karena relevan buat hampir semua destinasi.
const CTA_REPLIES = [
  // --- score tool (gratis selamanya) ---
  'mau ke {country}? cek dulu level Bahasa Inggris kamu (estimasi IELTS/TOEFL/CEFR) GRATIS di score.goglobal-ai.app — 2 menit, ga perlu daftar 🎯',
  'banyak yang gagal ke {country} bukan karena skill, tapi Bahasa Inggris. tes level kamu gratis (selamanya) di score.goglobal-ai.app 📊',
  'penasaran Inggrismu udah cukup belum buat {country}? assessment gratis di score.goglobal-ai.app, langsung dapet estimasi IELTS & TOEFL',
  // --- app utama ---
  'tools lengkap buat nyiapin diri ke {country} (gaji real, visa, CV, scam detector) ada di goglobal-ai.app — mulai gratis 🌏',
  'aku riset {country} + 14 negara lain lewat goglobal-ai.app. ada Kalkulator Gaji, CV Builder & Interview AI. cek aja 👆',
  // --- dua-duanya ---
  'cek peluang + gaji real {country} di goglobal-ai.app, terus tes skor Inggris kamu gratis di score.goglobal-ai.app. dua-duanya gratis buat mulai',
  'nyiapin diri ke {country}: 1) cek skor Inggris gratis di score.goglobal-ai.app, 2) riset gaji/visa/CV di goglobal-ai.app. step by step 🚀',
];

function pickCtaReply(country) {
  const t = CTA_REPLIES[Math.floor(Math.random() * CTA_REPLIES.length)];
  return t.replace(/\{country\}/g, country);
}

// Affiliate: min 2 slot/hari (dari 12 total) rekomendasiin gear persiapan LN nyata
// (data/products.json), bukan konten karir/visa biasa. Sisanya tetap normal.
const AFFILIATE_SLOTS = [3, 9]; // 11.30 & 20.00 WIB

const AFFILIATE_REPLY_TEMPLATES = [
  '{blurb}\n\nlink: {link}\n#ad',
  'buat yang mau langsung cek, ini link-nya: {link}\n({blurb})\n#ad',
  '{blurb} — cek link: {link}\n#ad',
  'link-nya di sini: {link}\n#ad',
];

const PRODUCTS_PATH = path.resolve('data/products.json');

async function loadProducts() {
  try {
    const raw = await fs.readFile(PRODUCTS_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.products) ? data.products : [];
  } catch {
    return [];
  }
}

function pickAffiliateItem({ products, dayIndex, positionInSlots }) {
  if (!products.length) return null;
  return products[(dayIndex + positionInSlots) % products.length];
}

function buildAffiliateReply(item) {
  const t = AFFILIATE_REPLY_TEMPLATES[Math.floor(Math.random() * AFFILIATE_REPLY_TEMPLATES.length)];
  return t.replace(/\{blurb\}/g, item.blurb).replace(/\{link\}/g, item.link).replace(/\{name\}/g, item.name);
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

  const now = new Date();
  const dayIndex = Math.floor(now.getTime() / 86400000);
  const isAffiliateSlot = AFFILIATE_SLOTS.includes(slot);

  let post = null;
  let item = null;
  let choice = null;

  if (isAffiliateSlot) {
    const products = await loadProducts();
    if (products.length) {
      const positionInSlots = AFFILIATE_SLOTS.indexOf(slot);
      item = pickAffiliateItem({ products, dayIndex, positionInSlots });
      console.log('Slot:', slot, SLOTS[slot], 'WIB · AFFILIATE');
      console.log('Produk:', item.name);
      const log = await loadLog();
      const recentPosts = log.slice(-12).map((e) => e.body || e.text || '');
      post = await generateAffiliatePost({ apiKey, item, recentPosts });
    } else {
      console.log('Slot affiliate tapi products.json kosong — fallback ke konten normal.');
    }
  }

  if (!post) {
    choice = pickContent({ slot });
    console.log('Slot:', slot, SLOTS[slot], 'WIB');
    console.log('Pick:', choice);
    post = await generatePost({ apiKey, ...choice });
  }

  const reply = item ? buildAffiliateReply(item) : pickCtaReply(choice.country);
  console.log('--- MAIN POST ---');
  console.log(post.full);
  console.log('--- REPLY', item ? '(affiliate link)' : '(CTA + link)', '---');
  console.log(reply);
  console.log('---');

  if (dryRun) {
    console.log('[dry-run] skip Threads post');
    return;
  }

  await verifyToken({ token });
  const threadId = await postThread({ userId, token, text: post.full });
  console.log('Posted main:', threadId);

  // Auto-reply CTA/affiliate+link. Kalau gagal, JANGAN batalin main post — log aja.
  let replyThreadId = null;
  try {
    replyThreadId = await postReply({ userId, token, text: reply, replyToId: threadId });
    console.log('Posted reply:', replyThreadId);
  } catch (e) {
    console.error('Reply gagal (main post tetap aman):', e.message);
  }

  await appendLog({
    timestamp: new Date().toISOString(),
    slot,
    slotTimeWib: SLOTS[slot],
    isAffiliate: !!item,
    affiliateProduct: item ? item.name : null,
    type: choice?.type ?? null,
    country: choice?.country ?? null,
    tone: choice?.tone ?? null,
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
