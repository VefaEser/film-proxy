
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8",
};
const MODEL_DEFAULT = "gemini-3.8-flash";
const GEMINI_MIN_INTERVAL_MS = 12000;
let lastGeminiStart = 0;
let geminiQueue = Promise.resolve();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {status, headers: {...CORS, ...extraHeaders}});
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function queuedGemini(task) {
  const run = geminiQueue.then(async () => {
    const wait = GEMINI_MIN_INTERVAL_MS - (Date.now() - lastGeminiStart);
    if (lastGeminiStart && wait > 0) await sleep(wait);
    lastGeminiStart = Date.now();
    return task();
  });
  geminiQueue = run.then(() => undefined, () => undefined);
  return run;
}
function uniqueKeys(env) {
  const values = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3, env.GEMINI_API_KEY]
    .filter(v => typeof v === "string" && v.trim());
  return [...new Set(values.map(v => v.trim()))];
}
async function tmdbFetch(path, params, env, ctx) {
  if (!env.TMDB_API_KEY) throw new Error("TMDB_API_KEY Cloudflare Secret olarak tanımlanmamış.");
  const u = new URL(`https://api.themoviedb.org/3/${path}`);
  for (const [k,v] of params) u.searchParams.set(k,v);
  u.searchParams.set("api_key", env.TMDB_API_KEY);
  const response = await fetch(u.toString(), {
    headers: {Accept:"application/json"},
    cf: {cacheTtl: path.includes("images") || path.includes("genre/") || path.includes("configuration/") ? 86400 : 1800, cacheEverything:true}
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body.status_message || `TMDB HTTP ${response.status}`);
    err.status = response.status; err.details = body;
    throw err;
  }
  return body;
}
async function fetchImageBase64(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {signal:controller.signal, cf:{cacheTtl:86400,cacheEverything:true}});
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!type.startsWith("image/")) return null;
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > 450000) return null;
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i=0;i<bytes.length;i+=chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i+chunk, bytes.length)));
    }
    return {data:btoa(binary), mime_type:type === "image/jpg" ? "image/jpeg" : type};
  } catch { return null; }
  finally { clearTimeout(timer); }
}
function outputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  if (typeof data.outputText === "string") return data.outputText;
  return (data.steps || [])
    .filter(s => s.type === "model_output")
    .flatMap(s => s.content || [])
    .filter(c => c.type === "text")
    .map(c => c.text || "").join("\n");
}
async function callGemini(payload, env) {
  const keys = uniqueKeys(env);
  if (!keys.length) {
    const e = new Error("GEMINI_API_KEY_1, _2 veya _3 Cloudflare Secret olarak tanımlanmamış.");
    e.status = 500; throw e;
  }
  let last = null;
  const attempts = [];
  for (let i=0;i<keys.length;i++) {
    let response, body;
    try {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-goog-api-key":keys[i]},
        body:JSON.stringify(payload)
      });
      body = await response.json().catch(() => ({}));
      if (response.ok) return {body, attempts};
      const detail = body.error?.message || body.message || `HTTP ${response.status}`;
      attempts.push({keyNumber:i+1,status:response.status,message:detail});
      last = {status:response.status,message:detail,body};
      // Sadece kota/geçici sunucu hatasında sıradaki farklı projeye geç.
      if (response.status !== 429 && response.status !== 503 && response.status < 500) break;
    } catch (e) {
      attempts.push({keyNumber:i+1,status:0,message:e.message || "Bağlantı hatası"});
      last = {status:502,message:e.message || "Gemini bağlantı hatası"};
    }
  }
  const err = new Error(last?.message || "Gemini anahtarlarının hiçbiri yanıt vermedi.");
  err.status = last?.status || 502; err.attempts = attempts; err.details = last?.body;
  throw err;
}
async function analyseMovies(movies, target, env, ctx) {
  if (!Array.isArray(movies) || movies.length === 0) throw Object.assign(new Error("movies dizisi boş."),{status:400});
  if (movies.length > 4) throw Object.assign(new Error("Tek istekte en fazla 4 film analiz edilebilir."),{status:400});
  const key = env.TMDB_API_KEY;
  if (!key) throw Object.assign(new Error("TMDB_API_KEY tanımlanmamış."),{status:500});
  const input = [];
  const metadata = [];
  for (const item of movies) {
    const id = Number(item.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    let imageData = {backdrops:[]};
    try {
      imageData = await tmdbFetch(`movie/${id}/images`, new URLSearchParams({include_image_language:"en,null"}), env, ctx);
    } catch {}
    const backdrops = (imageData.backdrops || []).slice(0,2);
    const images = [];
    for (const backdrop of backdrops) {
      if (!backdrop.file_path) continue;
      const img = await fetchImageBase64(`https://image.tmdb.org/t/p/w300${backdrop.file_path}`);
      if (img) images.push(img);
    }
    metadata.push({
      id,title:String(item.title || item.original_title || "Bilinmeyen film"),
      turkish_title:String(item.turkish_title || ""),year:String(item.year || ""),
      overview:String(item.overview || ""),images:images.length
    });
    input.push({type:"text",text:`Film ID ${id}: ${item.title || item.original_title || ""} (${item.year || "yıl bilinmiyor"}). Bu film için sıradaki görsellerdir.`});
    for (const img of images) input.push({type:"image",data:img.data,mime_type:img.mime_type});
  }
  if (!metadata.length) throw Object.assign(new Error("Analiz edilecek geçerli film ID'si yok."),{status:400});
  const withImages = metadata.filter(m=>m.images>0);
  if (!withImages.length) throw Object.assign(new Error("TMDB'den analiz için sahne görseli alınamadı. Bu filmler için TMDB görsellerini kontrol et."),{status:502});
  const prompt = `Sen film sahnelerinin ışık koşullarını görsel örneklemeye göre tahmin eden bir analiz aracısın. Yalnızca bu istekte sağlanan TMDB sahne görsellerini kullan; Google Search veya harici web araştırması yapma. Her film için görsellerin gündüz/gece hissini değerlendir. Görseller tüm filmin istatistiksel örneklemi değildir; sonuçların tahmin olduğunu açıkça belirt. Gece yüzdesi 0-100 tam sayı; gündüz yüzdesi 100-gece. Görsel ton ve kısa ışık özeti ekle. Görseli bulunmayan filmleri analyses dizisine ekleme. Hedef gece oranı: ${Math.max(0,Math.min(100,Number(target)||50))}%. Filmler: ${JSON.stringify(metadata.map(m=>({id:m.id,title:m.title,year:m.year,images:m.images})))}.`;
  input.unshift({type:"text",text:prompt});
  const schema = {
    type:"object",
    properties:{analyses:{type:"array",items:{
      type:"object",
      properties:{
        id:{type:"integer"},night:{type:"integer"},day:{type:"integer"},
        confidence:{type:"string"},visual_tone:{type:"string"},lighting_summary:{type:"string"}
      },
      required:["id","night","day","confidence","visual_tone","lighting_summary"]
    }}},
    required:["analyses"]
  };
  const payload = {
    model:env.MODEL_NAME || MODEL_DEFAULT,
    input,
    response_format:{type:"text",mime_type:"application/json",schema}
  };
  const result = await queuedGemini(() => callGemini(payload, env));
  const text = outputText(result.body);
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw Object.assign(new Error("Gemini yanıtı geçerli JSON değil."),{status:502,details:{response:text.slice(0,1000)}}); }
  const allowed = new Set(withImages.map(m=>m.id));
  const analyses = (parsed.analyses || []).filter(a=>allowed.has(Number(a.id))).map(a=>{
    const night = Math.max(0,Math.min(100,Math.round(Number(a.night)||0)));
    return {id:Number(a.id),night,day:100-night,confidence:a.confidence||"düşük",visual_tone:a.visual_tone||"",lighting_summary:a.lighting_summary||""};
  });
  return {analyses, model:env.MODEL_NAME || MODEL_DEFAULT, imagesProvided:withImages.reduce((n,m)=>n+m.images,0), attempts:result.attempts};
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname.replace(/\/+$/,"") || "/";
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:CORS});
    try {
      if (request.method === "GET" && (path === "/" || path === "/health")) {
        return json({ok:true,service:"film-proxy",tmdbConfigured:Boolean(env.TMDB_API_KEY),geminiKeysConfigured:uniqueKeys(env).length,model:env.MODEL_NAME||MODEL_DEFAULT,endpoints:["GET /tmdb/discover/movie","GET /tmdb/search/movie","GET /tmdb/genre/movie/list","GET /tmdb/configuration/languages","GET /tmdb/configuration/countries","GET /tmdb/movie/details?id=123","POST /gemini-interactions"]});
      }
      if (request.method === "GET" && path.startsWith("/tmdb/")) {
        let tmdbPath, params = new URLSearchParams(url.searchParams);
        if (path === "/tmdb/discover/movie") tmdbPath = "discover/movie";
        else if (path === "/tmdb/search/movie") tmdbPath = "search/movie";
        else if (path === "/tmdb/genre/movie/list") tmdbPath = "genre/movie/list";
        else if (path === "/tmdb/configuration/languages") { tmdbPath = "configuration/languages"; params = new URLSearchParams(); }
        else if (path === "/tmdb/configuration/countries") { tmdbPath = "configuration/countries"; params = new URLSearchParams(); }
        else if (path === "/tmdb/movie/details") {
          const id = Number(url.searchParams.get("id"));
          if (!Number.isInteger(id) || id <= 0) return json({error:"Geçerli bir film id parametresi gerekli."},400);
          tmdbPath = `movie/${id}`;
          params.delete("id");
        } else return json({error:"TMDB uç noktası bulunamadı.",path},404);
        try {
          const data = await tmdbFetch(tmdbPath,params,env,ctx);
          return json(data,200,{"Cache-Control":"public, max-age=300"});
        } catch(e) { return json({error:e.message,details:e.details||null},e.status||502); }
      }
      if (request.method === "POST" && path === "/gemini-interactions") {
        let body;
        try { body = await request.json(); } catch { return json({error:"İstek gövdesi geçerli JSON değil."},400); }
        // Film görseli analizi: {movies:[{id,title,year,overview}], night_target:50}
        if (Array.isArray(body.movies)) {
          try { return json(await analyseMovies(body.movies,body.night_target,env,ctx)); }
          catch(e) { return json({error:e.message||"Gemini analizi başarısız.",details:e.details||null,attempts:e.attempts||[]},e.status||500); }
        }
        // İsteğe bağlı metin analizi geriye dönük uyumluluk için desteklenir; Google Search aracı eklenmez.
        const prompt = body.input;
        if (typeof prompt !== "string" || !prompt.trim()) return json({error:"movies dizisi veya input metni gönderilmelidir."},400);
        const result = await queuedGemini(()=>callGemini({model:env.MODEL_NAME||MODEL_DEFAULT,input:prompt.trim()},env));
        const text = outputText(result.body);
        return json({ok:true,model:env.MODEL_NAME||MODEL_DEFAULT,text,outputText:text,interaction:{outputText:text},attempts:result.attempts});
      }
      return json({error:"Endpoint bulunamadı.",path,availableEndpoints:["GET /health","GET /tmdb/discover/movie","GET /tmdb/search/movie","GET /tmdb/genre/movie/list","GET /tmdb/configuration/languages","GET /tmdb/configuration/countries","GET /tmdb/movie/details?id=123","POST /gemini-interactions"]},404);
    } catch(e) {
      return json({error:e.message||"Worker içinde beklenmeyen hata."},e.status||500);
    }
  }
};
