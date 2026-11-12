// Editoryal AI Taslak Servisi — gemini-3.5-flash-lite
// Yalnızca yetkili yönetici için sade, sakin ve duru taslak önerileri üretir.
// Üretilen çıktılar doğrudan yayınlanmaz; yöneticinin onayına sunulan taslaktır.

const { EDITORIAL_LIMITS } = require('./domain.cjs');

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const EDITORIAL_TYPES = ['note', 'question', 'description'];

const SYSTEM_INSTRUCTION = `Sen "Sofra" adlı sakin dijital sanat ve düşünce sığınağının kıdemli editoryal asistanısın.
Görevin, yönetici için sakin, duru, derinlikli ve edebi Türkçe taslaklar üretmektir.

Temel Kurallar:
1. Dil: Türkçe; sakin, gösterişsiz, içten ve duru. Asla pazarlamacı dili, ünlemler veya klişe yapay zeka ifadeleri ("büyüleyici bir yolculuk", "göz alıcı bir şaheser") kullanma.
2. Taslak niteliği: Ürettiğin metin bir öneridir; doğrudan yayınlanmayacak, yönetici tarafından incelenip onaylanacaktır.
3. Görsel analizi iddiasında bulunmama: Asla görseli fiziksel olarak görmüş gibi renk, fırça darbesi veya kompozisyon uydurma. Yalnızca sana sağlanan metinsel başlık, oda veya tema bağlamını sakin bir hisle ele al.
4. Tarih ve biyografi: Bilinmeyen sanat tarihi, ressam biyografisi veya sahte tarihler uydurma.
5. Özgün Sofra Notu (Günün Sözü): Tamamen özgün bir Sofra düşüncesi olsun. Asla gerçek bir şair veya düşünüre ait olmayan sahte alıntılar atfetme.
6. Kesin JSON çıktısı: Yanıtını yalnızca {"draft": "..."} formatında ver.`;

function buildEditorialPrompt({ type, context = {} }) {
  const parts = [];
  if (context.title) parts.push(`Eser Başlığı: "${context.title}"`);
  if (context.room) parts.push(`Oda / Ruh Hâli: "${context.room}"`);
  if (context.theme) parts.push(`Tema: "${context.theme}"`);
  if (context.seed) parts.push(`Yöneticinin Notu / İpucu: "${context.seed}"`);
  const contextDesc = parts.length ? parts.join('\n') : 'Genel Sofra sığınağı ve akşam dinginliği teması.';

  if (type === 'note') {
    return `Sofra günün masası için özgün, kısa bir "Günün Sözü / Sofra Notu" taslağı hazırla.
Bağlam:
${contextDesc}

Koşullar:
- 1 veya en fazla 2 sakin, edebi cümle (kesinlikle en fazla 180 karakter).
- Gerçek bir kişiye alıntı atfetme; özgün bir Sofra tefekkürü olsun.
- Yanıtı kesinlikle {"draft": "..."} JSON formatında ver.`;
  }

  if (type === 'question') {
    return `Sofra gece masası veya eser altı için ziyaretçilerin kendi içlerine bakmalarını sağlayacak bir "Günün Sorusu" taslağı hazırla.
Bağlam:
${contextDesc}

Koşullar:
- Tek bir açık uçlu, sakin ve nazik soru (kesinlikle en fazla 160 karakter).
- Soru işareti (?) ile bitsin.
- Yanıtı kesinlikle {"draft": "..."} JSON formatında ver.`;
  }

  if (type === 'description') {
    return `Verilen eser başlığı ve odası için sakin bir "Eser Açıklaması" taslağı hazırla.
Bağlam:
${contextDesc}

Koşullar:
- 2-3 sakin, derinlikli cümle (kesinlikle en fazla 1200 karakter).
- Görseli görmüş gibi fiziksel detay uydurma; başlığın ve odanın hissettirdiği temaya odaklan.
- Yanıtı kesinlikle {"draft": "..."} JSON formatında ver.`;
  }

  throw new Error(`UNKNOWN_EDITORIAL_TYPE: ${type}`);
}

function parseEditorialOutput(rawText, type) {
  if (typeof rawText !== 'string') return null;
  const limits = (type && EDITORIAL_LIMITS[type]) || { min: 3, max: 180 };
  const trimmed = rawText.trim();
  // Strip optional markdown fencing if present
  const unquoted = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    const parsed = JSON.parse(unquoted);
    if (parsed && typeof parsed.draft === 'string') {
      const clean = parsed.draft.trim();
      if (clean.length >= limits.min && clean.length <= limits.max) return clean;
    }
  } catch {}
  return null;
}

function createEditorialService({
  apiKey,
  model = DEFAULT_MODEL,
  timeoutMs = 12000,
  fetchFn = globalThis.fetch
} = {}) {
  const isEnabled = () => {
    if (process.env.SOFRA_GEMINI_EDITORIAL_ENABLED === 'false') return false;
    const key = typeof apiKey === 'function' ? apiKey() : apiKey;
    return Boolean(key && key.trim());
  };

  async function generateDraft({ type, context }) {
    if (!isEnabled()) {
      return { draft: null, model, errorReason: 'disabled' };
    }
    if (!EDITORIAL_TYPES.includes(type)) {
      return { draft: null, model, errorReason: 'invalid-type' };
    }

    const key = (typeof apiKey === 'function' ? apiKey() : apiKey).trim();
    const prompt = buildEditorialPrompt({ type, context: context || {} });
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const body = {
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            draft: { type: 'STRING' }
          },
          required: ['draft']
        },
        temperature: 0.7,
        maxOutputTokens: 256
      }
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorReason = response.status === 429 ? 'quota-exceeded' : 'api-error';
        return { draft: null, model, errorReason };
      }

      const json = await response.json();
      if (json?.promptFeedback?.blockReason) {
        return { draft: null, model, errorReason: 'safety-blocked' };
      }
      const candidate = json?.candidates?.[0];
      if (!candidate) {
        return { draft: null, model, errorReason: 'no-candidate' };
      }
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        return { draft: null, model, errorReason: candidate.finishReason.toLowerCase() };
      }

      const rawText = candidate?.content?.parts?.[0]?.text;
      if (typeof rawText !== 'string') {
        return { draft: null, model, errorReason: 'no-content' };
      }
      let rawDraft = null;
      try {
        const trimmed = rawText.trim();
        const unquoted = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(unquoted);
        if (parsed && typeof parsed.draft === 'string') {
          rawDraft = parsed.draft.trim();
        }
      } catch {}

      if (!rawDraft) {
        return { draft: null, model, errorReason: 'parse-error' };
      }

      const limits = EDITORIAL_LIMITS[type] || { min: 3, max: 180 };
      if (rawDraft.length < limits.min || rawDraft.length > limits.max) {
        return { draft: null, model, errorReason: 'length-exceeded', length: rawDraft.length, maxLength: limits.max };
      }

      return { draft: rawDraft, model };
    } catch (err) {
      const isTimeout = err?.name === 'AbortError' || controller.signal.aborted;
      const errorReason = isTimeout ? 'timeout' : 'network-error';
      return { draft: null, model, errorReason };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    isEnabled,
    generateDraft,
    getModel: () => model
  };
}

module.exports = {
  DEFAULT_MODEL,
  EDITORIAL_TYPES,
  EDITORIAL_LIMITS,
  SYSTEM_INSTRUCTION,
  buildEditorialPrompt,
  parseEditorialOutput,
  createEditorialService
};
