// llm.js — Gemini + Groq çağrıları, model zincirleri, failover ve prompt şablonları.
import { loadDeadKeys, isKeyDeadForModel, markDeadKey, logLlmCall, getDailyModelCalls, safeJSON } from "./db.js";

export const GEMINI_MODEL_CHAIN = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
export const GEMINI_MODEL_DEFAULT = "gemini-3.8-flash";
export const GROQ_MODEL_CHAIN = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
export const GROQ_MODEL_DEFAULT = "openai/gpt-oss-120b";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GOOGLE_INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GOOGLE_GENERATE = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_TPM_BUDGET = 7000;
const LLM_DEADLINE_MS = 60000;
let geminiRR = 0;
let groqRR = 0;
const geminiCallLog = new Map();
const promptCache = { stage1: { ts: 0, template: null }, stage2: { ts: 0, template: null } };

const DEFAULT_STAGE1 = [
  "Sen bir film sınıflandırma uzmanısın. Yalnızca verilen bilgilerden hareket et; emin değilsen unknown de, uydurma.",
  "",
  "ARANAN FİLM:",
  "{{FILTER_SENTENCE}}",
  "",
  "FİLTRE BAĞLAMLARI:",
  "{{FILTER_CONTEXT}}",
  "",
  "KARAR KURALI:",
  "- Film tanıma AÇIKÇA uymuyorsa no.",
  "- Film tanıma AÇIKÇA uyuyorsa yes.",
  "- Kısmen uyuyor ama emin değilsen unknown — bu durumda no DEME.",
  "",
  "Filmler:",
  "{{MOVIES}}",
  "",
  "Yanıt YALNIZCA geçerli JSON: [{'id': <film_id>, 'match': 'yes'|'no'|'unknown', 'reason': '<max 12 kelime>'}]"
].join("\n");
const DEFAULT_STAGE2 = [
  "Sen bir film veri uzmanısın. Aşağıdaki filmler hakkında veri doldur.",
  "Yalnızca kanıtlanabilir bilgiyi yaz; bilmiyorsan null bırak.",
  "",
  "Filmler:",
  "{{MOVIES}}",
  "",
  "Doldurulacak alanlar:",
  "{{RULES}}",
  "",
  "Yanıt YALNIZCA geçerli JSON: [{'id': <film_id>, '<alan>': <değer>}]"
].join("\n");

function geminiMinGapMs(model) { return /lite/i.test(model) ? 4000 : 12000; }
function geminiTryAcquire(model, keyIndex) {
  const k = `${model}|${keyIndex}`;
  const now = Date.now();
  const last = geminiCallLog.get(k) || 0;
  if (now - last < geminiMinGapMs(model)) return false;
  geminiCallLog.set(k, now);
  return true;
}
function estimateTokens(text) { return Math.ceil(String(text || "").length / 4); }
function normalizeModelName(m) { return String(m || "").trim().toLowerCase().replace(/^models\//, ""); }
function rotateKeys(keys, counter) {
  if (keys.length <= 1) return keys;
  const i = counter % keys.length;
  return [...keys.slice(i), ...keys.slice(0, i)];
}
export function buildGroqChain(env) {
  const seen = new Set(), chain = [];
  const push = (m) => { const n = normalizeModelName(m); if (!n || seen.has(n)) return; seen.add(n); chain.push(n); };
  push(env.GROQ_MODEL); for (const m of GROQ_MODEL_CHAIN) push(m); return chain;
}
export function buildGeminiChain(env) {
  const seen = new Set(), chain = [];
  const push = (m) => { const n = normalizeModelName(m); if (!n || seen.has(n)) return; seen.add(n); chain.push(n); };
  push(env.GEMINI_MODEL); for (const m of GEMINI_MODEL_CHAIN) push(m); return chain;
}
function orderGeminiModels(chain) {
  const lite = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
  const flash = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"];
  const seen = new Set(), result = [];
  for (const m of [...lite, ...flash]) if (chain.includes(m) && !seen.has(m)) { seen.add(m); result.push(m); }
  for (const m of chain) if (!seen.has(m)) { seen.add(m); result.push(m); }
  return result;
}
function orderGroqModels(chain, promptLen) {
  const short = promptLen < 2500;
  const first = short ? ["openai/gpt-oss-20b"] : ["openai/gpt-oss-120b"];
  const second = short ? ["openai/gpt-oss-120b"] : ["openai/gpt-oss-20b"];
  const seen = new Set(), result = [];
  for (const m of [...first, ...second]) if (chain.includes(m) && !seen.has(m)) { seen.add(m); result.push(m); }
  for (const m of chain) if (!seen.has(m)) { seen.add(m); result.push(m); }
  return result;
}
function classifyError(msg) {
  if (/HTTP 40[13]|invalid.?key|forbidden|unauthor/i.test(msg)) return { type: "invalid", cooldown: 3600, modelWide: false };
  if (/HTTP 429|rate.?limit|quota|exceeded/i.test(msg)) {
    if (/per day|daily|RPD|requests per day/i.test(msg)) return { type: "ratelimit-daily", cooldown: null, modelWide: false };
    if (/per minute|RPM|requests per minute/i.test(msg)) return { type: "ratelimit-minute", cooldown: 60, modelWide: false };
    return { type: "ratelimit", cooldown: null, modelWide: false };
  }
  if (/HTTP 400|invalid_argument|unknown parameter/i.test(msg)) return { type: "invalid-param", cooldown: 300, modelWide: true };
  if (/HTTP 503|service_unavailable|high demand/i.test(msg)) return { type: "model_down", cooldown: 300, modelWide: true };
  if (/aborted due to timeout|timed? ?out|network|fetch failed|socket/i.test(msg)) return { type: "network", cooldown: 60, modelWide: false };
  return { type: "unknown", cooldown: 120, modelWide: false };
}
function extractGeminiText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.text === "string") return data.text;
  const cand = data?.candidates?.[0];
  if (cand) {
    const parts = cand?.content?.parts || [];
    const texts = parts.map(p => typeof p?.text === "string" ? p.text : "").filter(Boolean);
    if (texts.length) return texts.join("\n");
  }
  const outputs = data?.outputs || data?.output || [];
  const list = Array.isArray(outputs) ? outputs : [outputs];
  const texts = [];
  const walk = (obj, depth = 0) => {
    if (!obj || depth > 6) return;
    if (typeof obj === "string") { if (obj) texts.push(obj); return; }
    if (Array.isArray(obj)) { for (const x of obj) walk(x, depth + 1); return; }
    if (typeof obj === "object") for (const k of ["text","content","output","parts","result","response","value","message"]) if (obj[k] !== undefined) walk(obj[k], depth + 1);
  };
  for (const o of list) walk(o);
  const steps = data?.steps;
  if (Array.isArray(steps)) for (const s of steps) walk(s);
  return texts.length ? texts.join("\n") : "";
}
async function fetchJSON(url, options = {}, label = "Uzak servis", timeoutMs = 18000, outerSignal) {
  const signals = [];
  if (outerSignal) signals.push(outerSignal);
  if (timeoutMs) signals.push(AbortSignal.timeout(timeoutMs));
  let signal;
  if (signals.length === 0) signal = undefined;
  else if (signals.length === 1) signal = signals[0];
  else signal = AbortSignal.any ? AbortSignal.any(signals) : (() => { const ac = new AbortController(); for (const s of signals) { if (s.aborted) { ac.abort(); break; } s.addEventListener("abort", () => ac.abort(), { once: true }); } return ac.signal; })();
  const res = await fetch(url, { ...options, signal });
  const body = await res.text();
  const data = safeJSON(body, null);
  if (!res.ok) {
    const err = new Error(`${label}: HTTP ${res.status} ${body.slice(0, 300)}`);
    err.status = res.status;
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") || 0);
      err.retryAfterMs = retryAfter > 0 ? retryAfter * 1000 : 60000;
    }
    throw err;
  }
  if (!data) throw new Error(`${label}: JSON yanıtı alınamadı`);
  return data;
}
async function callGeminiInteractions(env, key, model, prompt, outerSignal) {
  const data = await fetchJSON(GOOGLE_INTERACTIONS, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ model, input: prompt })
  }, `Gemini Interactions ${model}`, 20000, outerSignal);
  const text = extractGeminiText(data);
  if (!text) throw new Error(`Gemini Interactions ${model} yanıtında metin yok.`);
  return text;
}
async function callGeminiGenerate(env, key, model, prompt, outerSignal) {
  const url = `${GOOGLE_GENERATE}/${encodeURIComponent(model)}:generateContent`;
  const data = await fetchJSON(url, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  }, `Gemini generateContent ${model}`, 20000, outerSignal);
  const text = extractGeminiText(data);
  if (!text) throw new Error(`Gemini generateContent ${model} yanıtında metin yok.`);
  return text;
}
async function callGeminiModel(env, key, model, prompt, outerSignal) {
  const errors = [];
  try { return await callGeminiInteractions(env, key, model, prompt, outerSignal); }
  catch (e) {
    const msg = String(e.message || e);
    const cls = classifyError(msg);
    errors.push(`interactions: ${msg.slice(0, 150)}`);
    if (cls.type === "invalid" || cls.type === "model_down" || cls.type === "ratelimit") throw e;
  }
  try { return await callGeminiGenerate(env, key, model, prompt, outerSignal); }
  catch (e) { errors.push(`generateContent: ${String(e.message || e).slice(0, 150)}`); throw new Error(errors.join(" | ")); }
}
async function callGroq(env, key, model, prompt, maxOutputTokens, useSearch, outerSignal) {
  const promptTokens = estimateTokens(prompt);
  const safeOutput = Math.max(256, Math.min(maxOutputTokens, GROQ_TPM_BUDGET - promptTokens));
  const content = /json/i.test(prompt) ? prompt : `${prompt}\n\nYanıtı yalnızca geçerli JSON formatında ver.`;
  const body = { model, messages: [{ role: "user", content }], temperature: 0.2, max_completion_tokens: safeOutput };
  if (useSearch) { body.tools = [{ type: "browser_search" }]; body.tool_choice = "required"; }
  else { body.response_format = { type: "json_object" }; }
  const data = await fetchJSON(`${GROQ_BASE}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify(body)
  }, `Groq ${model}`, 30000, outerSignal);
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error(`Groq ${model} yanıtında metin yok.`);
  return text;
}
async function callGroqModel(env, key, model, prompt, maxOutputTokens, useSearch, outerSignal) {
  if (!useSearch) return callGroq(env, key, model, prompt, maxOutputTokens, false, outerSignal);
  try { return await callGroq(env, key, model, prompt, maxOutputTokens, true, outerSignal); }
  catch (e) {
    console.warn(`groq: search başarısız, no-search denenecek — ${String(e.message || e).slice(0, 120)}`);
    return await callGroq(env, key, model, prompt, maxOutputTokens, false, outerSignal);
  }
}
export async function callLLMWithFallback(env, prompt, maxOutputTokens, useSearch, outerSignal, context = {}) {
  const deadlineMs = context.timeoutMs ? Math.min(context.timeoutMs, LLM_DEADLINE_MS) : LLM_DEADLINE_MS;
  const deadline = Date.now() + deadlineMs;
  const errors = [];
  const promptLen = estimateTokens(prompt);
  const dead = await loadDeadKeys(env);
  const nowSec = () => Math.floor(Date.now() / 1000);
  const maxAttempts = Math.max(1, Math.min(context.maxAttempts ?? 4, 6));
  let attempts = 0;

  const geminiKeys = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3].map((k, i) => ({ key: k, index: i + 1 })).filter(x => x.key);
  const rotatedG = rotateKeys(geminiKeys, geminiRR++);
  const geminiModels = orderGeminiModels(buildGeminiChain(env));

  outer: for (const model of geminiModels) {
    if (Date.now() > deadline || attempts >= maxAttempts) break;
    let rpdSkip = false;
    try {
      const daily = await getDailyModelCalls(env, "gemini", model);
      const rpdLimit = /lite/i.test(model) ? 500 : 20;
      if (daily >= rpdLimit - 2) rpdSkip = true;
    } catch {}
    if (rpdSkip) continue;
    let modelWideIssue = false;
    for (const { key, index } of rotatedG) {
      if (attempts >= maxAttempts) break outer;
      if (modelWideIssue || isKeyDeadForModel(dead, model, index)) continue;
      if (Date.now() > deadline) break outer;
      if (outerSignal?.aborted) throw new Error("İstemci isteği iptal etti.");
      if (!geminiTryAcquire(model, index)) continue;
      attempts++;
      const start = Date.now();
      try {
        const result = await callGeminiModel(env, key, model, prompt, outerSignal);
        logLlmCall(env, "gemini", model, index, true, Date.now() - start, null, { ...context, method: context.method || "unknown" });
        return result;
      } catch (e) {
        const msg = String(e.message || e);
        const cls = classifyError(msg);
        logLlmCall(env, "gemini", model, index, false, Date.now() - start, msg.slice(0, 200), context);
        errors.push(`gemini ${model} key=${index}: ${msg.slice(0, 120)}`);
        if (cls.modelWide) { modelWideIssue = true; errors.push(`[${model} ${cls.type} model-wide]`); }
        else if (cls.type === "ratelimit-daily") {
          const tomorrow = new Date(); tomorrow.setUTCHours(0, 0, 0, 0); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          await markDeadKey(env, "gemini", index, Math.floor(tomorrow.getTime() / 1000) + 3600, msg.slice(0, 200), model);
        } else if (cls.type === "ratelimit-minute" || cls.type === "ratelimit") {
          const waitSec = e.retryAfterMs ? Math.ceil(e.retryAfterMs / 1000) : 60;
          await markDeadKey(env, "gemini", index, nowSec() + waitSec, msg.slice(0, 200), model);
        } else if (cls.cooldown) await markDeadKey(env, "gemini", index, nowSec() + cls.cooldown, msg.slice(0, 200), model);
      }
    }
  }

  const groqKeys = [env.GROQ_API_KEY_1, env.GROQ_API_KEY_2, env.GROQ_API_KEY_3].map((k, i) => ({ key: k, index: i + 1 })).filter(x => x.key);
  const rotatedQ = rotateKeys(groqKeys, groqRR++);
  const groqModels = orderGroqModels(buildGroqChain(env), promptLen);

  if (groqKeys.length) {
    outerQ: for (const model of groqModels) {
      if (attempts >= maxAttempts) break;
      if (Date.now() > deadline) break;
      for (const { key, index } of rotatedQ) {
        if (attempts >= maxAttempts) break outerQ;
        if (dead.groq.has(index)) continue;
        if (Date.now() > deadline) break outerQ;
        if (outerSignal?.aborted) throw new Error("İstemci isteği iptal etti.");
        attempts++;
        const start = Date.now();
        try {
          const result = await callGroqModel(env, key, model, prompt, maxOutputTokens, useSearch, outerSignal);
          logLlmCall(env, "groq", model, index, true, Date.now() - start, null, context);
          return result;
        } catch (e) {
          const msg = String(e.message || e);
          const cls = classifyError(msg);
          logLlmCall(env, "groq", model, index, false, Date.now() - start, msg.slice(0, 200), context);
          errors.push(`groq ${model} key=${index}: ${msg.slice(0, 120)}`);
          if (cls.type === "ratelimit-daily") {
            const tomorrow = new Date(); tomorrow.setUTCHours(0, 0, 0, 0); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            await markDeadKey(env, "groq", index, Math.floor(tomorrow.getTime() / 1000) + 3600, msg.slice(0, 200));
          } else if (cls.type === "ratelimit-minute" || cls.type === "ratelimit") {
            const waitSec = e.retryAfterMs ? Math.ceil(e.retryAfterMs / 1000) : 60;
            await markDeadKey(env, "groq", index, nowSec() + waitSec, msg.slice(0, 200));
          } else if (cls.cooldown) await markDeadKey(env, "groq", index, nowSec() + cls.cooldown, msg.slice(0, 200));
        }
      }
    }
  }

  throw new Error(`LLM tüm modellerde başarısız: ${errors.join(" | ")}`);
}

export async function getPromptTemplate(env, key) {
  const cache = promptCache[key === "prompt_template.stage2" ? "stage2" : "stage1"];
  const now = Date.now();
  if (now - cache.ts < 60000 && cache.template) return cache.template;
  const fallback = key === "prompt_template.stage2" ? DEFAULT_STAGE2 : DEFAULT_STAGE1;
  if (!env.DB) return fallback;
  try {
    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = ?").bind(key).first();
    if (row?.value) { cache.ts = now; cache.template = row.value; return row.value; }
  } catch (e) { console.warn("prompt read:", e.message); }
  return fallback;
}
export function invalidatePromptCache(key) {
  if (key === "prompt_template.stage1") promptCache.stage1.ts = 0;
  if (key === "prompt_template.stage2") promptCache.stage2.ts = 0;
} 
