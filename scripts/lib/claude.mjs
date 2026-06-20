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

BALAS HANYA JSON VALID, tanpa markdown fence. Gunakan pipe | untuk jeda baris dalam teks, BUKAN newline asli:
{"teks":"baris1|baris2|baris3","cta":"mau cerita?"}`;
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
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in response: ' + raw);

  const parsed = JSON.parse(raw.slice(start, end + 1));
  if (!parsed.teks || !parsed.cta) throw new Error('Missing teks/cta: ' + raw);

  return {
    text: parsed.teks.replace(/\|/g, '\n'),
    cta: parsed.cta,
    full: `${parsed.teks.replace(/\|/g, '\n')}\n\n${parsed.cta}`,
  };
}
