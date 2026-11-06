// sources.js — TMDB, OMDb, Wikidata, FilmMap, Metatake, Commons ve altyazı kaynakları.
import { safeJSON, movieKey, yearOf, norm, getFilmmapCache, putFilmmapCache, getMetatakeExtendedCache, putMetatakeExtendedCache, putFieldRowsBatch } from "./db.js";

const TMDB_BASE = "https://api.themoviedb.org/3";
const USER_AGENT = "FilmKesifMotoru/1.0 (https://github.com/VefaEser/film-proxy; contact: vefaeser@ornitonerenk.com)";

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
    if (res.status === 429) { const retryAfter = Number(res.headers.get("retry-after") || 0); err.retryAfterMs = retryAfter > 0 ? retryAfter * 1000 : 60000; }
    throw err;
  }
  if (!data) throw new Error(`${label}: JSON yanıtı alınamadı`);
  return data;
}
export async function tmdb(env, path, params = {}, outerSignal) {
  if (!env.TMDB_API_KEY) throw new Error("TMDB_API_KEY tanımlı değil.");
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", env.TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  return fetchJSON(url.toString(), {}, "TMDB", 18000, outerSignal);
}
export async function omdb(env, params, outerSignal) {
  if (!env.OMDB_API_KEY) throw new Error("OMDB_API_KEY tanımlı değil.");
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", env.OMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const data = await fetchJSON(url.toString(), {}, "OMDb", 18000, outerSignal);
  if (data.Response === "False") throw new Error(data.Error || "OMDb sonucu bulunamadı.");
  return data;
}
async function omdbBest(env, movie, outerSignal) {
  const title = movie.original_title || movie.title || "";
  const year = String(yearOf(movie) || "");
  let lastErr = null;
  if (title) { try { return await omdb(env, { t: title, y: year }, outerSignal); } catch (e) { lastErr = e; } }
  if (movie.imdb_id) { try { return await omdb(env, { i: movie.imdb_id }, outerSignal); } catch (e) { lastErr = e; } }
  throw lastErr || new Error("OMDb: arama yapılamadı");
}

export async function filmmapLocations(env, movie, outerSignal) {
  const movieId = movieKey(movie);
  const cached = await getFilmmapCache(env, movieId);
  if (cached) return { locations: cached, fromCache: true };
  const title = movie.original_title || movie.title || "";
  if (!title) return { locations: [], fromCache: false };
  try {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "where_was_it_filmed", arguments: { title, limit: 100 } } };
    const signal = AbortSignal.any ? AbortSignal.any([outerSignal, AbortSignal.timeout(10000)].filter(Boolean)) : undefined;
    const res = await fetch("https://moviescenemap.com/mcp", {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify(body), signal
    });
    if (!res.ok) return { locations: [], fromCache: false, error: `HTTP ${res.status}` };
    const raw = await res.text();
    let data = safeJSON(raw, null);
    if (!data) { for (const l of raw.split(/\r?\n/).filter(l => l.startsWith("data: "))) { const parsed = safeJSON(l.slice(6), null); if (parsed) { data = parsed; break; } } }
    if (!data) return { locations: [], fromCache: false, error: "parse fail" };
    if (data.error) return { locations: [], fromCache: false, error: data.error.message || "rpc error" };
    let payload = null;
    const content = data?.result?.content;
    if (Array.isArray(content)) for (const c of content) if (c?.type === "text" && typeof c.text === "string") { const arr = safeJSON(c.text, null); if (arr) { payload = arr; break; } }
    if (!payload && data?.result) payload = data.result;
    if (!payload) return { locations: [], fromCache: false, error: "no payload" };
    const rawPlaces = payload.places || payload.locations || payload.films || payload.results || payload.data || [];
    const places = Array.isArray(rawPlaces) ? rawPlaces : [];
    const locations = places.map(p => ({
      name: String(p.place || p.name || p.location || p.title || "").trim(),
      country: String(p.country || "").trim(),
      city: String(p.city || "").trim(),
      relation: String(p.relation || p.layer || "filmed"),
      confidence: p.confidence != null ? Number(p.confidence) : null,
      lat: p.lat != null ? Number(p.lat) : (p.latitude != null ? Number(p.latitude) : null),
      lng: p.lng != null ? Number(p.lng) : (p.longitude != null ? Number(p.longitude) : null)
    })).filter(l => l.name);
    const seen = new Set(); const unique = [];
    for (const loc of locations) {
      const key = `${norm(loc.name)}|${norm(loc.country)}`;
      if (seen.has(key)) continue;
      seen.add(key); unique.push(loc);
    }
    await putFilmmapCache(env, movieId, unique);
    return { locations: unique, fromCache: false, countriesOnly: payload.countries_only || [] };
  } catch (e) { console.warn("filmmap:", e.message); return { locations: [], fromCache: false, error: e.message }; }
}
export async function metatakeExtended(env, movie, outerSignal) {
  const movieId = movieKey(movie);
  const cached = await getMetatakeExtendedCache(env, movieId);
  if (cached) return cached;
  const title = movie.original_title || movie.title || "";
  if (!title) return null;
  const headers = { "Accept": "application/json", "User-Agent": USER_AGENT };
  try {
    const searchData = await fetchJSON(`https://metatake.net/api/v1/films?q=${encodeURIComponent(title)}&limit=5`, { headers }, "Metatake search", 10000, outerSignal);
    const films = Array.isArray(searchData?.films) ? searchData.films : [];
    if (!films.length) return null;
    const year = yearOf(movie);
    const match = (year && films.find(f => Number(f.year) === Number(year))) || films[0];
    const slug = match.slug;
    if (!slug) return null;
    let film = null;
    try { film = await fetchJSON(`https://metatake.net/api/v1/films/${encodeURIComponent(slug)}`, { headers }, "Metatake film", 10000, outerSignal); } catch (e) { console.warn("metatake film:", e.message); }
    let locations = [];
    try {
      const locData = await fetchJSON(`https://metatake.net/api/v1/locations?film=${encodeURIComponent(slug)}&limit=100`, { headers }, "Metatake locations", 10000, outerSignal);
      const locList = Array.isArray(locData?.locations) ? locData.locations : [];
      locations = locList.map(loc => ({
        name: String(loc.name || "").trim(), country: String(loc.country || "").trim(), city: "",
        layer: String(loc.layer || "filmed"), kind: String(loc.role || ""),
        lat: loc.lat != null ? Number(loc.lat) : null, lng: loc.lng != null ? Number(loc.lng) : null,
        precision: loc.precision || null
      })).filter(l => l.name);
    } catch (e) { console.warn("metatake locations:", e.message); }
    const settings = locations.filter(l => String(l.layer).toLowerCase() === "setting").map(l => l.name);
    const filmingPlaces = locations.filter(l => String(l.layer).toLowerCase() !== "setting").map(l => l.name);
    const kindred = Array.isArray(film?.kindred) ? film.kindred.map(k => ({ title: String(k.title || "").trim(), year: k.year != null ? Number(k.year) : null, slug: k.slug || null })).filter(k => k.title) : [];
    const takescore = film?.takescore || null;
    const lowConfidence = takescore?.low_confidence === true;
    const confidence = takescore ? (lowConfidence ? 0.4 : 0.85) : (match.analyzed ? 0.6 : null);
    const result = {
      narrative_setting: settings, filming_places: filmingPlaces,
      kindred_films: kindred.map(k => k.title), kindred_full: kindred,
      awards: [], confidence, low_confidence: lowConfidence, locations,
      takescore: takescore ? { score: takescore.score ?? null, value: takescore.value ?? null, cost: takescore.cost ?? null, risk: takescore.risk ?? null } : null,
      url: film?.url || match.url || null, cite_as: film?.cite_as || null
    };
    await putMetatakeExtendedCache(env, movieId, result);
    return result;
  } catch (e) { console.warn("metatake extended:", e.message); return null; }
}

async function opensubtitlesDensity(env, movie, outerSignal) {
  if (!env.OPENSUBTITLES_API_KEY) return null;
  const imdbId = String(movie.imdbID || movie.imdb_id || "").replace(/^tt/, "");
  const runtime = Number(movie.runtime) || 0;
  if (!imdbId || !runtime) return null;
  try {
    const base = "https://api.opensubtitles.com/api/v1";
    const headers = { "Api-Key": env.OPENSUBTITLES_API_KEY, "User-Agent": USER_AGENT, "Accept": "application/json" };
    const search = await fetchJSON(`${base}/subtitles?imdb_id=${encodeURIComponent(imdbId)}&languages=en`, { headers }, "OpenSubtitles search", 15000, outerSignal);
    const items = Array.isArray(search?.data) ? search.data : [];
    if (!items.length) return null;
    items.sort((a, b) => Number((b.attributes?.download_count) || 0) - Number((a.attributes?.download_count) || 0));
    const fileId = items[0]?.attributes?.files?.[0]?.file_id;
    if (!fileId) return null;
    if (!env.OPENSUBTITLES_USERNAME || !env.OPENSUBTITLES_PASSWORD) return null;
    const login = await fetchJSON(`${base}/login`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ username: env.OPENSUBTITLES_USERNAME, password: env.OPENSUBTITLES_PASSWORD }) }, "OpenSubtitles login", 10000, outerSignal);
    const token = login?.token;
    if (!token) return null;
    const dl = await fetchJSON(`${base}/download`, { method: "POST", headers: { ...headers, "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ file_id: fileId }) }, "OpenSubtitles download", 15000, outerSignal);
    const link = dl?.link;
    if (!link) return null;
    const subRes = await fetch(link, { signal: AbortSignal.any ? AbortSignal.any([outerSignal, AbortSignal.timeout(15000)].filter(Boolean)) : undefined });
    if (!subRes.ok) return null;
    const text = await subRes.text();
    const plain = text.replace(/<[^>]+>/g, "").replace(/\\N/g, " ").replace(/[{][^}]*[}]/g, "").trim();
    const chars = plain.length;
    if (chars < 100) return null;
    const density = Math.max(0, Math.min(100, Math.round((chars / runtime) / 10)));
    return { density, chars, runtime, source: "opensubtitles" };
  } catch (e) { console.warn("opensubtitles:", e.message); return null; }
}
async function subsourceDensity(env, movie, outerSignal) {
  if (!env.SUBSOURCE_API_KEY) return null;
  const imdbId = String(movie.imdbID || movie.imdb_id || "").replace(/^tt/, "");
  const runtime = Number(movie.runtime) || 0;
  if (!imdbId || !runtime) return null;
  try {
    const headers = { "X-API-Key": env.SUBSOURCE_API_KEY, "User-Agent": USER_AGENT, "Accept": "application/json" };
    const search = await fetchJSON(`https://api.subsource.net/api/v1/search?imdb=${encodeURIComponent(imdbId)}&language=en`, { headers }, "SubSource search", 15000, outerSignal);
    const items = Array.isArray(search?.subtitles) ? search.subtitles : (Array.isArray(search?.data) ? search.data : []);
    if (!items.length) return null;
    const best = items[0];
    const downloadUrl = best?.download_url || best?.url;
    if (!downloadUrl) return null;
    const subRes = await fetch(downloadUrl, { headers, signal: AbortSignal.any ? AbortSignal.any([outerSignal, AbortSignal.timeout(15000)].filter(Boolean)) : undefined });
    if (!subRes.ok) return null;
    const text = await subRes.text();
    const plain = text.replace(/<[^>]+>/g, "").replace(/\\N/g, " ").replace(/[{][^}]*[}]/g, "").trim();
    const chars = plain.length;
    if (chars < 100) return null;
    const density = Math.max(0, Math.min(100, Math.round((chars / runtime) / 10)));
    return { density, chars, runtime, source: "subsource" };
  } catch (e) { console.warn("subsource:", e.message); return null; }
}
async function subdlDensity(env, movie, outerSignal) {
  if (!env.SUBDL_API_KEY) return null;
  const imdbId = String(movie.imdbID || movie.imdb_id || "").replace(/^tt/, "");
  const runtime = Number(movie.runtime) || 0;
  if (!imdbId || !runtime) return null;
  try {
    const headers = { "api_key": env.SUBDL_API_KEY, "User-Agent": USER_AGENT, "Accept": "application/json" };
    const search = await fetchJSON(`https://api.subdl.com/api/v1/subtitles?api_key=${encodeURIComponent(env.SUBDL_API_KEY)}&imdb_id=${encodeURIComponent(imdbId)}&languages=EN`, { headers }, "SubDL search", 15000, outerSignal);
    const items = Array.isArray(search?.subtitles) ? search.subtitles : (Array.isArray(search?.data) ? search.data : []);
    if (!items.length) return null;
    const best = items[0];
    const link = best?.url || best?.download_url;
    if (!link) return null;
    const fullUrl = link.startsWith("http") ? link : `https://dl.subdl.com${link}`;
    const subRes = await fetch(fullUrl, { signal: AbortSignal.any ? AbortSignal.any([outerSignal, AbortSignal.timeout(15000)].filter(Boolean)) : undefined });
    if (!subRes.ok) return null;
    const text = await subRes.text();
    const plain = text.replace(/<[^>]+>/g, "").replace(/\\N/g, " ").replace(/[{][^}]*[}]/g, "").trim();
    const chars = plain.length;
    if (chars < 100) return null;
    const density = Math.max(0, Math.min(100, Math.round((chars / runtime) / 10)));
    return { density, chars, runtime, source: "subdl" };
  } catch (e) { console.warn("subdl:", e.message); return null; }
}
export async function fetchSubtitleDensity(env, movie, outerSignal) {
  const chain = [subsourceDensity, subdlDensity, opensubtitlesDensity];
  for (const fn of chain) {
    try { const r = await fn(env, movie, outerSignal); if (r && r.density != null) return r; } catch (e) { /* devam */ }
  }
  return null;
}

async function commonsScenes(env, movie, outerSignal) {
  const title = movie.original_title || movie.title || "";
  if (!title) return [];
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query"); url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `filetype:bitmap "${title}" film still OR scene`);
  url.searchParams.set("gsrnamespace", "6"); url.searchParams.set("gsrlimit", "20");
  url.searchParams.set("prop", "imageinfo"); url.searchParams.set("iiprop", "url|extmetadata"); url.searchParams.set("iiurlwidth", "640");
  const data = await fetchJSON(url.toString(), { headers: { "User-Agent": USER_AGENT } }, "Wikimedia Commons", 18000, outerSignal);
  const pages = Object.values(data.query?.pages || {});
  return pages.map(p => {
    const i = p.imageinfo?.[0] || {}, meta = i.extmetadata || {};
    return { source: "commons", title: p.title || "", url: i.thumburl || i.url || "", pageUrl: i.descriptionurl || "", description: meta.ImageDescription?.value || "", categories: meta.Categories?.value || "", license: meta.LicenseShortName?.value || "", vote_average: 0 };
  }).filter(x => x.url && isLikelySceneImage(x));
}
function isLikelySceneImage(img) {
  const text = `${img.title || ""} ${img.description || ""} ${img.categories || ""}`.toLowerCase();
  if (/(poster|portrait|headshot|actor|actress|cast|logo|cover|selfie|signature)/.test(text)) return false;
  return /(still|scene|screenshot|frame|film)/.test(text);
}
async function tmdbBackdrops(env, movie, outerSignal) {
  if (!movie.id) return [];
  const data = await tmdb(env, `/movie/${movie.id}/images`, { include_image_language: "en,tr,null" }, outerSignal);
  const backdrops = Array.isArray(data.backdrops) ? data.backdrops : [];
  return backdrops.map(b => ({ source: "tmdb", title: movie.original_title || movie.title || "", url: `https://image.tmdb.org/t/p/w342${b.file_path}`, pageUrl: `https://www.themoviedb.org/movie/${movie.id}`, license: "TMDB", description: "", vote_average: b.vote_average || 0 })).filter(x => x.url);
}

async function wikidataBatchOnce(env, movies, timeoutMs, outerSignal) {
  const results = new Map();
  if (!movies.length) return results;
  const rows = movies.map(m => { const title = (m.original_title || m.title || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"'); return `("${title}"@en ${m.id})`; }).join(" ");
  const query = `
SELECT ?movieId ?item ?originalWorkLabel ?filmingLocationLabel ?filmingCountryLabel ?award ?awardLabel ?nominatedLabel WHERE {
  VALUES (?title ?movieId) { ${rows} }
  ?item rdfs:label ?title .
  ?item wdt:P31 wd:Q11424 .
  OPTIONAL { ?item wdt:P144 ?originalWork. }
  OPTIONAL { ?item wdt:P915 ?filmingLocation. }
  OPTIONAL { ?filmingLocation wdt:P17 ?filmingCountry. }
  OPTIONAL { ?item wdt:P166 ?award. }
  OPTIONAL { ?item wdt:P1411 ?nominated. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,tr". }
}
LIMIT 300`;
  const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query);
  const data = await fetchJSON(url, { headers: { "Accept": "application/sparql-results+json", "User-Agent": USER_AGENT } }, "Wikidata", timeoutMs, outerSignal);
  const bindings = data.results?.bindings || [];
  const byId = new Map();
  for (const b of bindings) {
    const id = b.movieId?.value || "";
    if (!byId.has(id)) byId.set(id, { originalWork: null, locations: new Set(), countries: new Set(), awards: new Set(), nominations: new Set() });
    const rec = byId.get(id);
    if (b.originalWorkLabel?.value) rec.originalWork = b.originalWorkLabel.value;
    if (b.filmingLocationLabel?.value) rec.locations.add(b.filmingLocationLabel.value);
    if (b.filmingCountryLabel?.value) rec.countries.add(b.filmingCountryLabel.value);
    const aq = b.award?.value || ""; if (aq) { const q = aq.split("/").pop(); if (/^Q\d+$/.test(q)) rec.awards.add(q); }
    const nq = b.nominated?.value || ""; if (nq) { const q = nq.split("/").pop(); if (/^Q\d+$/.test(q)) rec.nominations.add(q); }
  }
  for (const [id, rec] of byId) results.set(id, { originalWork: rec.originalWork, filmingLocations: [...rec.locations], filmingCountries: [...rec.countries], awards: [...rec.awards], nominations: [...rec.nominations] });
  return results;
}
export async function wikidataBatch(env, movies, outerSignal) {
  try { return await wikidataBatchOnce(env, movies, 25000, outerSignal); }
  catch (e) { console.warn("wikidata batch:", e.message); return new Map(); }
}

export async function handleImages(env, url, signal) {
  const id = url.searchParams.get("id");
  const title = url.searchParams.get("title") || "";
  const originalTitle = url.searchParams.get("original_title") || title;
  const movie = { id, title, original_title: originalTitle };
  const [tmdbList, commonsList] = await Promise.all([
    tmdbBackdrops(env, movie, signal).catch(e => { console.warn("tmdb backdrops:", e.message); return []; }),
    commonsScenes(env, movie, signal).catch(e => { console.warn("commons scenes:", e.message); return []; })
  ]);
  const tmdbSorted = [...tmdbList].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  const seen = new Set(); const merged = [];
  for (const img of [...tmdbSorted, ...commonsList]) {
    const key = String(img.url || "").split("/").pop().split("?")[0].toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key); merged.push(img);
    if (merged.length >= 8) break;
  }
  return { images: merged };
}

export async function tmdbRoute(env, url, signal) {
  const path = url.pathname.replace(/^\/tmdb/, "");
  if (path === "/genre/movie/list") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" }, signal);
  if (path === "/configuration/languages") return tmdb(env, path, {}, signal);
  if (path === "/configuration/countries") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR" }, signal);
  if (path === "/search/movie") return tmdb(env, path, { query: url.searchParams.get("query") || "", language: url.searchParams.get("language") || "tr-TR", page: url.searchParams.get("page") || 1, include_adult: "false" }, signal);
  if (path === "/search/person") return tmdb(env, path, { query: url.searchParams.get("query") || "", language: url.searchParams.get("language") || "tr-TR", page: url.searchParams.get("page") || 1, include_adult: "false" }, signal);
  if (path === "/search/company") return tmdb(env, path, { query: url.searchParams.get("query") || "", page: url.searchParams.get("page") || 1 }, signal);
  if (path === "/search/keyword") return tmdb(env, path, { query: url.searchParams.get("query") || "", page: url.searchParams.get("page") || 1 }, signal);
  if (path === "/person/popular") return tmdb(env, path, { language: url.searchParams.get("language") || "tr-TR", page: url.searchParams.get("page") || 1 }, signal);
  if (path === "/discover/movie") {
    const allowed = ["language","sort_by","vote_average.gte","vote_average.lte","vote_count.gte","page","primary_release_date.gte","primary_release_date.lte","with_genres","without_genres","with_original_language","with_origin_country","with_runtime.gte","with_runtime.lte","with_text_query","with_companies","with_keywords","without_companies","without_keywords"];
    const params = {};
    for (const k of allowed) if (url.searchParams.has(k)) params[k] = url.searchParams.get(k);
    return tmdb(env, path, params, signal);
  }
  throw Object.assign(new Error("Bilinmeyen TMDB uç noktası."), { status: 404 });
  }
