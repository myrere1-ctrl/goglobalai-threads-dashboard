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

export function buildPrompt({ type, country, tone, note }) {
  return `Kamu content creator Threads untuk GoGlobal AI, app untuk orang Indonesia yang mau kerja di luar negeri.

Buat 1 post Threads Bahasa Indonesia:
- Tipe: ${TYPE_LABEL[type] || type}
- Negara/destinasi: ${country}
- Tone: ${TONE_LABEL[tone] || tone}
- Catatan: ${note || '-'}

Format WAJIB:
- 3-5 baris pendek
- Bahasa santai seperti ngobrol sama teman
- JANGAN pakai kata menakutkan atau terlalu jualan
- Akhiri dengan CTA ngegantung natural (contoh: "mau cerita?", "pernah ngerasain?", "lanjut?")

GoGlobal AI info: App PWA karir internasional. Gratis: Explore, Chat AI, Visa, Gaji, Scam Detector. Pro Rp299rb: CV Builder, Interview AI, Cover Letter, Job Finder, Roadmap.

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

export async function generatePost({ apiKey, type, country, tone, note }) {
  const prompt = buildPrompt({ type, country, tone, note });

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
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${JSON.stringify(data)}`);
  }

  const raw = data.content?.[0]?.text || '';
  const { teks, cta } = parseResponse(raw);
  const text = teks.replace(/\|/g, '\n');
  return {
    text,
    cta,
    full: `${text}\n\n${cta}`,
  };
}
