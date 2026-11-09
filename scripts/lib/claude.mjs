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
      'Mulai dengan "katanya..." atau "myth:" yang debunk anggapan tentang PROSES/PENGALAMAN (cara nyiapin diri, mindset), BUKAN klaim fakta absolut soal kondisi pasar kerja terkini. HINDARI klaim time-sensitive yang gampang dibantah (mis. "100% pakai bahasa Inggris", "gampang masuknya"). Kalau nyebut fakta, kasih nuance + konteks. Reality-nya boleh mengarah ke "yang bikin beda itu PERSIAPAN kamu".',
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
  {
    name: 'day_in_life',
    instruction:
      'Gambarkan POV sehari-hari orang Indonesia yang udah kerja/tinggal di negara itu — jam bangun, ritme kerja, hal kecil yang beda dari Indonesia. Konkret & relatable, bukan brosur. Tutup dengan insight soal PERSIAPAN mental/skill.',
  },
  {
    name: 'reverse_advice',
    instruction:
      'Angle kontrarian: hal yang JUSTRU ga usah dilakuin / buang-buang waktu pas nyiapin diri. Format "berhenti [X], mending [Y]". Bikin orang re-think prioritas persiapan.',
  },
  {
    name: 'reader_scenario',
    instruction:
      'Skenario langsung ke pembaca: "kalau kamu [situasi spesifik: fresh grad / udah kerja 5 th / bahasa pas-pasan], ini yang paling worth disiapin duluan". Praktis, 1 fokus.',
  },
  {
    name: 'skill_gap',
    instruction:
      'Angkat 1 skill/hal yang sering keteteran orang Indonesia (mis. CV format, interview STAR, small talk, dokumen) + cara nutupnya. Spesifik, actionable, bukan umum.',
  },
  {
    name: 'before_after',
    instruction:
      'Kontras transformasi PROSES: "beberapa bulan lalu [kondisi awal] → sekarang [kondisi siap]" tentang persiapan (skill/dokumen/mindset), BUKAN janji hasil. Fokus effort yang bikin beda.',
  },
  {
    name: 'micro_checklist',
    instruction:
      'Checklist super singkat 3 langkah konkret buat 1 aspek persiapan (mis. "3 hal biar CV kamu lolos screening"). Pakai pipe | tiap poin. Padat, langsung bisa dipraktekin.',
  },
];

function pickAngle() {
  return ANGLES[Math.floor(Math.random() * ANGLES.length)];
}

// Narrator identity — ditambahin 2026-10-13, hasil diskusi "individual empire".
// GoGlobal AI bukan akun personal (ga ada wajah di baliknya), jadi trust dibangun
// lewat KARAKTER/SUARA yang konsisten (bukan brand generik yang promosi).
// Dipake di buildPrompt & buildAffiliatePrompt biar 1 identitas yang sama di semua post.
const NARRATOR_IDENTITY = `Kamu adalah suara di balik akun Threads GoGlobal AI — bukan brand yang promosi, tapi kayak kakak yang udah liat ratusan orang coba kerja/kuliah ke luar negeri (ada yang berhasil, ada yang gagal), dan sekarang cerita blak-blakan soal apa yang BENERAN dibutuhin. Kamu bukan calo/agen yang jual mimpi atau janji manis — kamu yang ngomong jujur walau pahit.

POV kamu, harus konsisten KERASA di gaya ngomongnya (ga perlu diucapkan eksplisit tiap post):
- Persiapan ngalahin keberuntungan — yang nentuin orang lolos itu seberapa niat dia nyiapin diri, bukan nasib/rejeki semata.
- Skeptis sama jalan pintas, "dijamin lolos", calo yang maksa bayar duluan, atau siapapun yang jual harapan kosong.
- Kamu ngomong dari pengalaman liat banyak orang coba — ada yang berhasil karena persiapan matang, ada yang gagal karena remehin hal kecil.`;

// Data Pro plan — HARGA & FITUR WAJIB AKURAT, verified dari pricing page 2026-11-10.
// JANGAN pernah sebut angka lain (299rb/promo lama sudah berakhir, BUKAN 6 jutaan).
const PRO_PLAN_INFO = `GoGlobal AI Pro — harga SEKARANG: Rp616.800, SEKALI BAYAR, akses SELAMANYA (bukan langganan). Harga promo lama (Rp299rb) sudah BERAKHIR, JANGAN pernah sebut angka itu lagi.
Fitur Pro: semua fitur Starter (unlimited) + Visa Pathway AI (unlimited), CV Builder AI, Interview AI + Voice, Cover Letter Generator, Job Finder AI, Roadmap Generator, prioritas support.
Fitur Starter (gratis): Explore Countries (unlimited), Ask GoGlobal AI (10x/hari), Kalkulator Gaji (unlimited), cek skor IELTS/TOEFL, belajar Bahasa Jepang & Bahasa Arab (BETA).
Value point yang boleh dipakai (variasikan, JANGAN list semua fitur tiap post, pilih 1-2 aja per post):
- Dibanding pakai jasa agen/sponsor konvensional yang bisa Rp25-60 juta, Pro cuma Rp616.800 sekali bayar buat akses selamanya.
- CV & Cover Letter bisa langsung jadi dalam BAHASA NEGARA TUJUAN (auto-translate bawaan) — ga perlu translate manual atau beli template CV terpisah.
- Semua fitur (CV Builder, Interview AI + Voice, Cover Letter, Job Finder, Roadmap, Visa Pathway) dalam 1 harga sekali bayar, bukan beli satuan, bukan langganan bulanan.`;

export function buildPrompt({ type, country, tone, note, countryContext = '', angle = pickAngle() }) {
  const contextBlock = countryContext
    ? `\nKONTEKS NEGARA (grounding — HANYA pakai fakta dari sini soal ${country}, JANGAN ngarang di luar ini):\n${countryContext}\n`
    : '';
  const isPromo = type === 'promo';
  return `${NARRATOR_IDENTITY}

POSITIONING PENTING (baca dulu):
GoGlobal AI itu APP/TOOL yang bantu orang Indonesia NYIAPIN DIRI buat kerja/kuliah di luar negeri — jelajahi peluang, tanya AI, kalkulator gaji, cek skor IELTS/TOEFL, belajar Bahasa Jepang & Arab, plus fitur Pro (CV Builder, Cover Letter, Interview AI+Voice, Job Finder, Roadmap, Visa Pathway). GoGlobal AI BUKAN agen penyalur kerja — TIDAK nyalurin lowongan.
Konten harus bikin orang mikir "aku harus NYIAPIN DIRI", BUKAN "mana lowongannya, salurin aku". HINDARI framing "ada lowongan X gaji Y" yang bikin orang ngira kamu penyalur kerja. Fokus ke PERSIAPAN, skill gap, dan cara bikin diri layak — bukan janji kerjaan.

Buat 1 post Threads Bahasa Indonesia:
- Tipe: ${TYPE_LABEL[type] || type}
- Negara/destinasi: ${country}
- Tone: ${TONE_LABEL[tone] || tone}
- Catatan: ${note || '-'}
${contextBlock}
${isPromo ? '' : `ANGLE WAJIB (ini paling penting — jangan default ke formula umum):
**${angle.name}** — ${angle.instruction}
`}
Format:
- 3-5 baris pendek (bisa lebih kalau format list)
- Bahasa santai seperti ngobrol sama teman
- JANGAN pakai pembukaan klise seperti "Banyak yang...", "Tau gak...", "Pernah ga..."
- VARIASIKAN gaya buka & struktur tiap post — jangan formula yang itu-itu terus (biar ga kerasa template/jenuh). Segar & spontan.
- HINDARI "Dulu gue kira X, ternyata Y" sebagai pembuka — ini sering kepake belakangan, jangan jadi default. Kalau mau cerita personal, boleh langsung masuk ke scene/momennya tanpa formula reversal itu.
- JANGAN pakai kata menakutkan atau terlalu jualan
- HINDARI klaim fakta absolut yang time-sensitive (mis. "100% pakai bahasa Inggris", "gampang masuk", "pasti diterima"). Kalau nyebut fakta, kasih nuance/konteks — jangan hitam-putih yang gampang dibantah.
${isPromo ? '' : '- SESEKALI (JANGAN tiap post, biar ga keulang-ulang/spammy) selipin semangat "ini bukan soal rejeki, ini soal persiapan" — boleh variasikan kalimatnya sendiri, ga perlu persis sama tiap kali.\n'}- BATAS KARAKTER KETAT: total teks + CTA MAX 450 karakter (Threads limit 500, buffer 50). Jangan overshoot. Kalau ide panjang, potong. Punchy > verbose.

${isPromo ? `INI POST PROMO FITUR PRO — beda dari tipe lain:
- BOLEH dan WAJIB sebut nama "GoGlobal AI Pro" secara natural di body post (tipe lain dilarang, tipe ini sengaja beda).
- SOFT-SELL: value-comparison yang jujur, BUKAN hard-sell. JANGAN "buru-buru beli sekarang!", JANGAN urgency palsu ("promo terbatas", "cuma hari ini") — promo emang udah berakhir, harga sekarang flat.
- Pilih 1-2 value point aja dari info Pro di bawah (JANGAN list semua fitur kayak brosur, variasikan yang di-highlight antar post — kadang harga/value, kadang fitur translate otomatis, kadang sekali-bayar-vs-agen).
${PRO_PLAN_INFO}
- Tutup dengan pertanyaan natural yang ngundang reply/opini (bukan "DM sekarang" atau CTA transaksional) — contoh gaya: "worth it ga menurut kamu?", "lumayan kan buat sekali bayar?", "kalian lebih milih mana?"
- JANGAN taruh link apapun di post ini (bio udah ada link, cukup).` : 'JANGAN sebut nama brand "GoGlobal AI" dan JANGAN taruh link apapun di post ini. Link + CTA ke app ditaruh di REPLY terpisah (otomatis). Post ini murni VALUE/cerita/insight biar reach-nya maksimal.'}

PENTING - format output WAJIB persis seperti ini (pakai tag, BUKAN JSON):
<teks>baris1|baris2|baris3</teks>
<cta>${isPromo ? 'worth it ga menurut kamu?' : 'mau cerita?'}</cta>

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

export async function generatePost({ apiKey, type, country, tone, note, countryContext = '' }) {
  const angle = pickAngle();
  let lastFull = '';
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    const shortenNote = attempt > 1
      ? `${note ? note + ' ' : ''}[RETRY ${attempt}: post sebelumnya ${lastFull.length} karakter — LEBIH PENDEK, max 400 total]`
      : note;
    const prompt = buildPrompt({ type, country, tone, note: shortenNote, countryContext, angle });
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
