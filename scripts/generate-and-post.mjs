import fs from 'node:fs/promises';
import path from 'node:path';
import { generatePost } from './lib/claude.mjs';
import { postThread, verifyToken } from './lib/threads.mjs';

const SLOTS = [
  '06.00', '07.30', '09.00', '10.30', '12.00',
  '13.30', '15.00', '17.00', '19.00', '21.00',
];

const COUNTRIES = [
  'Jepang', 'Kapal Pesiar', 'Australia', 'Remote', 'Korea', 'Jerman', 'Kanada', 'Eropa',
  'Belanda', 'Polandia', 'Irlandia', 'Kazakhstan',
];

// Grounding konteks per negara (biar AI ga ngarang, terutama negara niche).
// Cuma diisi untuk negara yang perlu grounding; sisanya AI sudah punya konteks cukup.
const COUNTRY_CONTEXT = {
  Belanda:
    'Peluang WNI di Belanda: tech/IT (banyak perusahaan pakai bahasa Inggris, ga wajib bahasa Belanda), healthcare/perawat, hospitality, logistik pelabuhan Rotterdam. Highly Skilled Migrant visa populer. Work-life balance bagus.',
  Polandia:
    'Peluang WNI di Polandia: manufaktur, logistik/warehouse, konstruksi, IT outsourcing. Gerbang masuk EU dengan biaya hidup lebih murah dari Eropa Barat. Work permit + visa Type D. Banyak pekerja Asia Tenggara di sana.',
  Irlandia:
    'Peluang WNI di Irlandia: tech (HQ Google/Meta/LinkedIn di Dublin), healthcare/perawat, pharma, hospitality. Full bahasa Inggris. Critical Skills Employment Permit untuk skilled worker. Komunitas internasional besar.',
  Kazakhstan:
    'Peluang WNI di Kazakhstan (BUKAN cuma mining): konstruksi & infrastruktur di Almaty/Astana, oil & gas technician, skilled professional. Gaji kisaran Rp11-48jt tergantung sektor. Work permit via sponsor employer (kuota tenaga asing). Tantangan: bahasa Rusia/Kazakh, cuaca ekstrem musim dingin.',
};

const DAILY_TYPES = ['pain', 'tips', 'story', 'hook', 'promo', 'pain', 'tips'];

const TONES = ['santai', 'inspiratif', 'edukatif', 'humor'];

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
  console.log('---');
  console.log(post.full);
  console.log('---');

  if (dryRun) {
    console.log('[dry-run] skip Threads post');
    return;
  }

  await verifyToken({ token });
  const threadId = await postThread({ userId, token, text: post.full });
  console.log('Posted:', threadId);

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
  });
  console.log('Logged');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
