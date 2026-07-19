/**
 * Name → Katakana transliteration API (Cloudflare Worker)
 *
 * Refines the site's rule-based katakana conversion with Claude for
 * names the dictionary doesn't cover (any language / spelling).
 *
 * Deploy (no build tools needed):
 *   1. Cloudflare dashboard → Workers → Create → paste this file
 *   2. Settings → Variables → add secret ANTHROPIC_API_KEY
 *      (get a key at console.anthropic.com)
 *   3. Put the worker URL into CONFIG.kanaApiUrl in index.html
 *
 * Cost control: responses are cached per-name at Cloudflare's edge for
 * 30 days, so each unique name is paid for once (~a fraction of a yen).
 * To trade quality for cost, change MODEL to "claude-haiku-4-5".
 *
 * This is a plain-fetch implementation because dashboard-pasted Workers
 * can't use npm packages; if you move to a Wrangler project, switch to
 * the official @anthropic-ai/sdk instead.
 */

const MODEL = "claude-opus-4-8";
const ALLOWED_ORIGIN = "*"; // tighten to "https://your-domain" in production

const SYSTEM = `You transliterate personal names into Japanese katakana, the way the name is actually pronounced in its language of origin (e.g. "Jorge" from Spanish is ホルヘ, "Guillaume" from French is ギヨーム).
Rules:
- Reply with ONLY the katakana, nothing else.
- Separate multiple name parts with "・".
- Use standard Japanese media transliteration conventions.
- If the input is not a plausible personal name, reply with an empty string.`;

export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") {
      return json({ error: "POST only" }, 405, cors);
    }

    let name;
    try {
      ({ name } = await request.json());
    } catch {
      return json({ error: "invalid JSON" }, 400, cors);
    }
    name = (name || "").trim().slice(0, 80);
    if (!name || !/^[\p{L}\p{M}'\-. ]+$/u.test(name)) {
      return json({ kana: "" }, 200, cors);
    }

    // edge cache: one API call per unique name
    const cacheKey = new Request(
      "https://kana-cache.internal/" + encodeURIComponent(name.toLowerCase()),
    );
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      const body = await cached.text();
      return new Response(body, { headers: { ...cors, "content-type": "application/json" } });
    }

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 100,
        system: SYSTEM,
        messages: [{ role: "user", content: name }],
      }),
    });
    if (!apiRes.ok) return json({ kana: "" }, 200, cors);

    const data = await apiRes.json();
    const text = data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    // accept only katakana output — anything else falls back to the client engine
    const kana = /^[ァ-ヶー・\s]+$/.test(text) ? text : "";

    const body = JSON.stringify({ kana });
    const resp = new Response(body, {
      headers: {
        ...cors,
        "content-type": "application/json",
        "Cache-Control": "public, max-age=2592000",
      },
    });
    if (kana) ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
