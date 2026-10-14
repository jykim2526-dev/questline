// QUESTLINE quest-master proxy.
// The browser never sees the API key: the page sends { prompt } with an access code,
// this Worker checks the origin and the code, calls Claude, and returns { text }.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000; // includes thinking; caps the cost of one request
const MAX_PROMPT_CHARS = 60000; // the app trims reference documents well below this

const SYSTEM =
  "You are the quest master of QUESTLINE, a gamified planner. " +
  "Answer with exactly one JSON value that follows the user's instructions, and nothing else: no explanation, no markdown, no code fences.";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "")
      .split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = originOk ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
    const reply = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
      });

    if (request.method === "OPTIONS") {
      if (!originOk) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Questline-Code",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/plan" || request.method !== "POST") return reply(404, { error: "not_found" });
    if (!originOk) return reply(403, { error: "bad_origin" });
    if (!env.ANTHROPIC_API_KEY || !env.ACCESS_CODE) return reply(500, { error: "not_configured" });
    if (!(await sameSecret(request.headers.get("X-Questline-Code") || "", env.ACCESS_CODE))) {
      return reply(401, { error: "bad_code" });
    }

    let prompt;
    try {
      ({ prompt } = await request.json());
    } catch {
      return reply(400, { error: "bad_request" });
    }
    if (typeof prompt !== "string" || !prompt.trim()) return reply(400, { error: "bad_request" });
    if (prompt.length > MAX_PROMPT_CHARS) return reply(413, { error: "too_long" });

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const message = await client.beta.messages
        .stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          // If Opus 5.5 declines, the API re-runs the request on Anthropic's recommended fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system: SYSTEM,
          messages: [{ role: "user", content: prompt }],
        })
        .finalMessage();

      console.log(
        JSON.stringify({
          stop: message.stop_reason,
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
        }),
      );
      if (message.stop_reason === "refusal") return reply(422, { error: "refused" });

      const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (!text.trim()) return reply(502, { error: "failed" });
      return reply(200, { text });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return reply(429, { error: "rate_limited" });
      if (err instanceof Anthropic.AuthenticationError) {
        console.error("Anthropic rejected the API key. Check the ANTHROPIC_API_KEY secret.");
        return reply(500, { error: "not_configured" });
      }
      if (err instanceof Anthropic.APIError && err.status === 529) return reply(503, { error: "busy" });
      if (err instanceof Anthropic.APIError) {
        // Low credit balance or a reached spend limit also lands here; the message says which.
        console.error(`Anthropic API error ${err.status}: ${err.message}`);
        return reply(502, { error: "failed" });
      }
      console.error(err);
      return reply(502, { error: "failed" });
    }
  },
};

// Compare without leaking how many leading characters matched.
async function sameSecret(given, expected) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}
