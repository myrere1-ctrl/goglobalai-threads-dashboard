const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

export const TYPE_LABEL = {
  pain: 'pain point dan solusi',
  tips: 'tips karir global',
  promo: 'promosi fitur Pro GoGlobal AI',
  story: 'kisah sukses',
  hook: 'hook dan pertanyaan penasaran',
};

export const TONE_LABEL = {
  santai: 'Santai & ngobrol',
  inspiratif: 'Inspiratif',
  edukatif: 'Edukatif',
  humor: 'Humor ringan',
};

// Random angle injection — biar tiap post sudut pandang/struktur beda, bukan template seragam
const ANGLES = [
  {
    name: 'story_alumni',
    instruction:
      'Mulai dengan cerita SINGKAT alumni/teman/seseorang yang spesifik (sebut profesi/umur, tapi tanpa nama). Format: "[Profesi/umur] yang... [pengalaman spesifik]". Akhiri dengan twist atau insight tak terduga.',
  },
  {
    name: 'myth_busting',
    instruction:
      'Mulai dengan kalimat "katanya..." atau "myth:" yang debunk anggapan umum. Lalu kasih reality yang lebih nuanced. Hindari kata "padahal" yang sudah klise.',
  },
  {
    name: 'hook_question',
    instruction:
      'Buka dengan PERTANYAAN spesifik yang langsung relate ke target audience (misal: "pernah kepikiran gak..."). Jangan general — harus specific scenario.',
  },
  {
    name: 'stat_surprising',
    instruction:
      'Mulai dengan ANGKA atau fakta mengejutkan (boleh estimasi realistis, misal: "70% pekerja Indonesia di sana sebelumnya ga punya pengalaman..."). Lalu jelaskan implikasinya.',
  },
  {
    name: 'personal_anecdote',
    instruction:
      'Tulis sebagai sudut pandang ORANG PERTAMA ("gue", "aku"). Cerita pengalaman pribadi terkait topik. Casual, vulnerable, jujur — bukan polished.',
  },
  {
    name: 'controversial_take',
    instruction:
      'Mulai dengan opini yang sedikit kontroversial atau counter-intuitive ("sebenernya...", "honest opinion..."). Bukan toxic, tapi yang bikin orang berhenti scroll dan mikir.',
  },
  {
    name: 'mini_list',
    instruction:
      'Format: 1-2 baris intro, lalu list 2-3 poin singkat (pakai pipe | sebagai pemisah baris, bisa pakai "•" atau "—" di depan poin). Akhiri dengan kesimpulan/observasi.',
  },
  {
    name: 'comparison',
    instruction:
      'Bandingkan 2 hal: misalnya "X vs Y" atau "dulu vs sekarang" atau "ekspektasi vs realita". Singkat dan tajam.',
  },
  {
    name: 'observation_quirky',
    instruction:
      'Observasi tentang detail kecil yang menarik dari topik (kebiasaan, budaya, hal yang ga-obvious). Bikin orang nodding "iya juga ya".',
  },
];

function pickAngle() {
  return ANGLES[Math.floor(Math.random() * ANGLES.length)];
}

export function buildPrompt({ type, country, tone, note, angle = pickAngle() }) {
  return `Kamu content creator Threads untuk GoGlobal AI, app untuk orang Indonesia yang mau kerja di luar negeri.

Buat 1 post Threads Bahasa Indonesia:
- Tipe: ${TYPE_LABEL[type] || type}
- Negara/destinasi: ${country}
- Tone: ${TONE_LABEL[tone] || tone}
- Catatan: ${note || '-'}

ANGLE WAJIB (ini paling penting — jangan default ke formula umum):
**${angle.name}** — ${angle.instruction}

Format:
- 3-5 baris pendek (bisa lebih kalau format list)
- Bahasa santai seperti ngobrol sama teman
- JANGAN pakai pembukaan klise seperti "Banyak yang...", "Tau gak...", "Pernah ga..."
- JANGAN pakai kata menakutkan atau terlalu jualan
- Akhiri dengan CTA ngegantung natural (variasi: "mau cerita?", "pernah ngerasain?", "lanjut?", "ada yang relate?", "gimana menurut lo?", "share dong pengalaman lo?")
- BATAS KARAKTER KETAT: total teks + CTA MAX 450 karakter (Threads limit 500, buffer 50). Jangan overshoot. Kalau ide panjang, potong. Punchy > verbose.

GoGlobal AI info: App PWA karir internasional. Gratis: Explore, Chat AI, Visa, Gaji, Scam Detector. Pro Rp299rb: CV Builder, Interview AI, Cover Letter, Job Finder, Roadmap. SEBUTKAN brand HANYA jika natural fit (tidak forced).

PENTING - format output WAJIB persis seperti ini (pakai tag, BUKAN JSON):
<teks>baris1|baris2|baris3</teks>
<cta>mau cerita?</cta>

Gunakan pipe | untuk jeda baris dalam teks. JANGAN pakai newline asli di dalam teks. JANGAN pakai quote dobel. JANGAN tulis apapun di luar tag.`;
}

function extractField(raw, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = raw.match(re);
  return m ? m[1].trim() : null;
}

function parseResponse(raw) {
  // Strategy 1: XML-style tags (preferred new format)
  let teks = extractField(raw, 'teks');
  let cta = extractField(raw, 'cta');
  if (teks && cta) return { teks, cta };

  // Strategy 2: JSON parse (fallback for old format)
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (parsed.teks && parsed.cta) return { teks: parsed.teks, cta: parsed.cta };
    } catch {}
  }

  // Strategy 3: Regex from JSON-like text (handle unescaped quotes)
  const teksMatch = raw.match(/"teks"\s*:\s*"([\s\S]*?)"\s*,\s*"cta"/);
  const ctaMatch = raw.match(/"cta"\s*:\s*"([\s\S]*?)"\s*[},]/);
  if (teksMatch && ctaMatch) {
    return { teks: teksMatch[1], cta: ctaMatch[1] };
  }

  throw new Error('Cannot parse response: ' + raw.slice(0, 500));
}

const THREADS_LIMIT = 500;
const MAX_RETRIES = 3;

async function callClaude({ apiKey, prompt }) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      temperature: 1.0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(data)}`);
  return data.content?.[0]?.text || '';
}

export async function generatePost({ apiKey, type, country, tone, note }) {
  const angle = pickAngle();
  let lastFull = '';
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    const shortenNote = attempt > 1
      ? `${note ? note + ' ' : ''}[RETRY ${attempt}: post sebelumnya ${lastFull.length} karakter — LEBIH PENDEK, max 400 total]`
      : note;
    const prompt = buildPrompt({ type, country, tone, note: shortenNote, angle });
    const raw = await callClaude({ apiKey, prompt });
    const { teks, cta } = parseResponse(raw);
    const text = teks.replace(/\|/g, '\n');
    const full = `${text}\n\n${cta}`;
    lastFull = full;

    if (full.length <= THREADS_LIMIT) {
      if (attempt > 1) console.log(`Retry ${attempt} succeeded (${full.length} chars)`);
      return { text, cta, angle: angle.name, full };
    }
    console.log(`Attempt ${attempt}: post too long (${full.length} chars > ${THREADS_LIMIT}), retrying...`);
  }

  // Fallback: truncate hard
  console.warn(`All ${MAX_RETRIES} retries exceeded limit. Hard truncating.`);
  const truncated = lastFull.slice(0, THREADS_LIMIT - 3) + '...';
  return { text: truncated, cta: '', angle: angle.name, full: truncated };
}
