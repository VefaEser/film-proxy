// research.js — Faz C fix: handleMovieDetails forceTaxonomy parametresi
import { FIELD_DEFS, FIELD_RULES, SEMANTIC_FIELDS, LLM_FIELDS, CHARACTER_TRAITS_LIST, STORY_DIMENSIONS_LIST, TAXONOMY_LLM_FIELDS } from "./fields.config.js";
import { isValidSlugForCategory } from "./taxonomy.config.js";
import { getProfileRowsBatch, getFieldRowsBatch, getFieldRows, putFieldRowsBatch, putProfileRowsBatch, putFieldRows, putProfileRow, getProfileRow, findStaleFields, movieKey, yearOf, getVerdictsBatch, putVerdictsBatch, getFilmmapCache, getMetatakeExtendedCache, getSiteRatingForMovie, getSiteRatingsBatch } from "./db.js";
import { callLLMWithFallback, getPromptTemplate } from "./llm.js";
import { enrichClassic, sanitizePeopleField } from "./enrich.js";
import { filmmapLocations, metatakeExtended, wikidataBatch, fetchSubtitleDensity } from "./sources.js";
import { buildFilterSentence, buildFilterContext, semanticSignature, hasSemanticFilters, ratioFieldsNeeded, locationFieldsNeeded, taxonomyFieldsNeeded, evaluateFilters, getLocationCount } from "./filters.js";
import { getAllConfig, getMovieLists } from "./config.js";

const FILMMAP_LIMIT = 3;
const VALID_CHARACTER_TRAITS = new Set(CHARACTER_TRAITS_LIST);
const VALID_STORY_DIMENSIONS = new Set(STORY_DIMENSIONS_LIST);

const ARRAY_NORMALIZE_LLM_FIELDS = new Set([
  "season", "reality",
  "narrative_style", "narrative_pace",
  "production_category", "cinema_approach", "technical_style",
  "sound", "story_geography", "story_period", "color_style", "location_mode", "aspect_ratio",
  "subgenres", "tropes", "themes"
]);

const NUMERIC_BOUNDS = {
  day_ratio: [0, 100],
  night_ratio: [0, 100],
  indoor_ratio: [0, 100],
  dialogue_density: [0, 100],
  dialogue_density_subtitle: [0, 100],
  location_count: [1, 100]
};

const MAX_STAGE2_GROUPS = 3;

const CONFIDENCE = {
  STATIC: 0.95,
  WIKIDATA: 0.9,
  SUBTITLES: 0.9,
  LLM: 0.7
};

function buildStage2Rules(fields) { const rules = []; for (const f of fields) { if (FIELD_RULES[f]) rules.push(FIELD_RULES[f]); else if (f === "day_ratio") rules.push(`day_ratio: 0-100 tam sayı`); else if (f === "night_ratio") rules.push(`night_ratio: 0-100 tam sayı`); else if (f === "indoor_ratio") rules.push(`indoor_ratio: 0-100 tam sayı`); else if (f === "dialogue_density") rules.push(`dialogue_density: 0-100 tam sayı`); else if (f === "family_content") rules.push(`family_content: {"main_characters": <int>, "supporting_characters": <int>, "extras": <int>, "<trait>": {"intensity": "none|few|side|main", "approach": "bad|neutral|legit"}}`); else if (f === "story_period") rules.push(`story_period: string[]`); else if (f === "story_locations") rules.push(`story_locations: string[]`); else if (f === "aspect_ratio") rules.push(`aspect_ratio: string[]`); else if (f === "color_style") rules.push(`color_style: string[]`); else if (f === "dialogue_density_subtitle") rules.push(`dialogue_density_subtitle: 0-100 tam sayı`); else if (f === "location_count") rules.push(`location_count: 1-100 tam sayı`); else rules.push(`${f}: uygun değer`); } return rules.join("\n"); }
function extractJSONArray(text) { const clean = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim(); const start = clean.indexOf("["), end = clean.lastIndexOf("]"); if (start < 0 || end < start) return null; try { return JSON.parse(clean.slice(start, end + 1)); } catch { return null; } }
function extractJSON(text) { const clean = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim(); const start = clean.indexOf("{"), end = clean.lastIndexOf("}"); if (start < 0 || end < start) throw new Error("LLM geçerli JSON döndürmedi."); return JSON.parse(clean.slice(start, end + 1)); }

async function classifyBatch(env, movies, filterSentence, filterContext, useSearch, signal, context = {}) { const payload = movies.map(m => ({ id: m.id, title: m.original_title || m.title || "", year: yearOf(m), overview: (m.overview || "").slice(0, 300) })); const template = await getPromptTemplate(env, "prompt_template.stage1"); const prompt = template.replace(/\{\{FILTER_SENTENCE\}\}/g, filterSentence).replace(/\{\{FILTER_CONTEXT\}\}/g, filterContext || "(bağlam yok)").replace(/\{\{MOVIES\}\}/g, JSON.stringify(payload)); const raw = await callLLMWithFallback(env, prompt, 800, useSearch, signal, { ...context, method: "stage1", hasSemantic: true, maxAttempts: 3 }); const arr = extractJSONArray(raw) || []; const byId = new Map(); for (const item of arr) { if (!item || item.id == null) continue; const match = String(item.match || "").toLowerCase(); byId.set(String(item.id), { verdict: ["yes","no","unknown"].includes(match) ? match : "unknown", reason: String(item.reason || "").slice(0, 200) }); } return byId; }

async function fillDetailsBatch(env, movies, staleFields, signal, context = {}, outConfidences = null) {
  const out = new Map();
  if (!staleFields.length || !movies.length) return out;
  const template = await getPromptTemplate(env, "prompt_template.stage2");
  const moviePayload = movies.map(m => ({ id: m.id, title: m.title, original_title: m.original_title, year: yearOf(m), overview: (m.overview || "").slice(0, 400) }));
  const rules = buildStage2Rules(staleFields);
  const prompt = template.replace(/\{\{MOVIES\}\}/g, JSON.stringify(moviePayload)).replace(/\{\{RULES\}\}/g, rules);
  let raw;
  try { raw = await callLLMWithFallback(env, prompt, 2000, false, signal, { ...context, method: "stage2", hasSemantic: true, maxAttempts: 3, timeoutMs: context.timeoutMs }); }
  catch (e) { console.warn("fillDetailsBatch:", String(e.message || e).slice(0, 200)); return out; }
  const arr = extractJSONArray(raw) || (() => { try { const o = extractJSON(raw); return o.movies || []; } catch { return []; } })();
  for (const item of arr) {
    if (!item || item.id == null) continue;
    const updates = {};
    const confidences = {};
    for (const f of staleFields) {
      const val = item[f];
      if (val === undefined || val === null) continue;
      if (f === "character_traits") {
        const arrVal = Array.isArray(val) ? val : [val];
        const valid = arrVal.map(x => String(x).trim()).filter(x => x.length > 0);
        if (valid.length) {
          updates[f] = valid;
          confidences[f] = CONFIDENCE.LLM;
          const slugCount = valid.filter(x => VALID_CHARACTER_TRAITS.has(x)).length;
          if (slugCount === 0) console.warn(`[fillDetails] character_traits: hiç slug yok (${valid.join(", ")}) — filtre eşleşmeyebilir, kart yine de gösterecek`);
          else if (slugCount < valid.length) console.log(`[fillDetails] character_traits: ${slugCount} slug + ${valid.length - slugCount} serbest metin`);
        }
        continue;
      }
      if (f === "story_dimensions") {
        const arrVal = Array.isArray(val) ? val : [val];
        const valid = arrVal.map(x => String(x).trim()).filter(x => x.length > 0);
        if (valid.length) {
          updates[f] = valid;
          confidences[f] = CONFIDENCE.LLM;
          const slugCount = valid.filter(x => VALID_STORY_DIMENSIONS.has(x)).length;
          if (slugCount === 0) console.warn(`[fillDetails] story_dimensions: hiç slug yok (${valid.join(", ")}) — filtre eşleşmeyebilir, kart yine de gösterecek`);
          else if (slugCount < valid.length) console.log(`[fillDetails] story_dimensions: ${slugCount} slug + ${valid.length - slugCount} serbest metin`);
        }
        continue;
      }
      if (f === "subgenres" || f === "tropes" || f === "themes") {
        const arrVal = Array.isArray(val) ? val : [val];
        const valid = arrVal.map(x => String(x).trim()).filter(x => x.length > 0 && isValidSlugForCategory(x, f));
        const rejected = arrVal.length - valid.length;
        if (rejected > 0) console.warn(`[fillDetails] ${f}: ${rejected} geçersiz slug reddedildi (whitelist dışı)`);
        if (valid.length) { updates[f] = valid; confidences[f] = CONFIDENCE.LLM; }
        continue;
      }
      if (ARRAY_NORMALIZE_LLM_FIELDS.has(f)) {
        const arrVal = Array.isArray(val) ? val : [val];
        const valid = arrVal.map(x => String(x).trim()).filter(x => x.length > 0);
        if (valid.length) { updates[f] = valid; confidences[f] = CONFIDENCE.LLM; }
        continue;
      }
      if (NUMERIC_BOUNDS[f]) {
        const n = Number(val);
        if (!Number.isFinite(n)) {
          console.warn(`[fillDetails] ${f}: geçersiz sayısal değer (${JSON.stringify(val)}) — atlandı`);
          continue;
        }
        const [min, max] = NUMERIC_BOUNDS[f];
        const clamped = Math.max(min, Math.min(max, Math.round(n)));
        if (clamped !== Math.round(n)) {
          console.warn(`[fillDetails] ${f}: ${n} → ${clamped} (${min}-${max} aralığına kırpıldı)`);
        }
        updates[f] = clamped;
        confidences[f] = CONFIDENCE.LLM;
        continue;
      }
      updates[f] = val;
      confidences[f] = CONFIDENCE.LLM;
    }
    if (Object.keys(updates).length) {
      out.set(String(item.id), updates);
      if (outConfidences) outConfidences.set(String(item.id), confidences);
    }
  }
  return out;
}

function filmingNamesFromFilmmap(locations) {
  if (!Array.isArray(locations)) return [];
  const out = []; const seen = new Set();
  for (const loc of locations) {
    const name = String(loc?.name || loc?.city || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(name);
  }
  return out;
}

export async function handleResearchStream(env, body, controller, signal) {
  const enc = new TextEncoder();
  const send = (obj) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
  try {
    const filters = body.filters || {};
    const needFilmMap = !!(filters.filming_locations?.include?.length || filters.filming_locations?.exclude?.length || filters.locationMin != null || filters.locationMax != null);
    const needMetatakeForNarrative = !!(filters.story_locations?.include?.length || filters.story_locations?.exclude?.length || filters.related_films?.include?.length || filters.related_films?.exclude?.length);
    const needMetatake = needMetatakeForNarrative;
    const externalPerMovie = ((needFilmMap ? 1 : 0) + (needMetatake ? 3 : 0));
    const perMovie = 2 + externalPerMovie;
    const budget = 45, fixedOverhead = 7;
    const maxSafeBatch = Math.max(3, Math.floor((budget - fixedOverhead) / Math.max(1, perMovie)));
    const effectiveBatch = Math.min(10, maxSafeBatch);
    const movies = Array.isArray(body.movies) ? body.movies.slice(0, effectiveBatch) : [];
    const total = movies.length;
    if (!total) { send({ type: "done", movies: [] }); return; }
    const settings = { useAI: body.useAI === true || body.forceAll === true, useWebResearch: body.useWebResearch === true };
    const forceRefresh = body.refresh === true || body.forceAll === true;
    const forceAll = body.forceAll === true;
    send({ type: "start", total });
    const allMovieIds = movies.map(m => movieKey(m)).filter(Boolean);
    const profilesMap = await getProfileRowsBatch(env, allMovieIds);
    const fieldsMap = await getFieldRowsBatch(env, allMovieIds);
    const prepared = [];
    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i]; const movieId = movieKey(movie);
      const title = movie.original_title || movie.title || movieId;
      send({ type: "step", index: i, total, title, stage: "okunuyor" });
      const existing = profilesMap.get(movieId); const fieldRows = fieldsMap.get(movieId) || [];
      const profile = existing?.data || {};
      if (!profile.vote_average && movie.vote_average != null) profile.vote_average = movie.vote_average;
      if (!profile.vote_count && movie.vote_count != null) profile.vote_count = movie.vote_count;
      if (!profile.overview && movie.overview) profile.overview = movie.overview;
      if (profile.poster_path === undefined && movie.poster_path) profile.poster_path = movie.poster_path;
      if (!profile.release_date && movie.release_date) profile.release_date = movie.release_date;
      if (!profile.imdb_id && movie.imdb_id) profile.imdb_id = movie.imdb_id;
      if (!profile.imdbID && movie.imdbID) profile.imdbID = movie.imdbID;
      if (!profile.original_title && movie.original_title) profile.original_title = movie.original_title;
      if (!profile.title && movie.title) profile.title = movie.title;
      if (!profile.runtime && movie.runtime != null) profile.runtime = movie.runtime;
      if (!profile.imdbRating && movie.imdbRating != null) profile.imdbRating = movie.imdbRating;
      if (!profile.imdbVotes && movie.imdbVotes != null) profile.imdbVotes = String(movie.imdbVotes);
      if (!profile.genres && Array.isArray(movie.genres)) profile.genres = movie.genres;
      if (!profile.director && Array.isArray(movie.director)) profile.director = movie.director;
      if (!profile.user_rating && movie.user_rating != null) profile.user_rating = movie.user_rating;
      if (!movie.imdb_id && profile.imdb_id) movie.imdb_id = profile.imdb_id;
      if (!movie.imdb_id && profile.imdbID) movie.imdb_id = profile.imdbID;
      const mgInit = Array.isArray(movie.genre_ids) ? movie.genre_ids : [];
      if (mgInit.length) { const pgInit = Array.isArray(profile.genres_ids) ? profile.genres_ids : []; const combined = new Set([...pgInit.map(String), ...mgInit.map(String)]); profile.genres_ids = [...combined].map(x => { const n = Number(x); return Number.isFinite(n) ? n : x; }); }
      prepared.push({ movie, movieId, profile, fieldRows, staleDeterministic: [], filmmap: null, metatakeLocations: null, dirty: false, sourceErrors: [] });
    }
    const filmmapTargets = needFilmMap ? prepared : prepared.slice(0, FILMMAP_LIMIT);
    if (filmmapTargets.length) {
      await Promise.all(filmmapTargets.map(async (p) => {
        if (signal?.aborted) return;
        try {
          const fm = await filmmapLocations(env, p.movie, signal);
          p.filmmap = fm.locations || [];
          if (fm.error) p.sourceErrors.push({ source: "filmmap", error: fm.error });
          if (p.filmmap.length && (!p.profile.filming_locations || !p.profile.filming_locations.length)) {
            const names = filmingNamesFromFilmmap(p.filmmap);
            if (names.length) { p.profile.filming_locations = names; p.dirty = true; }
          }
        } catch (e) { console.warn("filmmap fail:", e.message); p.filmmap = []; p.sourceErrors.push({ source: "filmmap", error: String(e.message || e) }); }
      }));
    }
    if (needMetatake) await Promise.all(prepared.map(async (p) => { if (signal?.aborted) return; try { const mt = await metatakeExtended(env, p.movie, signal); if (mt) { if (mt.narrative_setting?.length && (!p.profile.story_locations || !p.profile.story_locations.length)) p.profile.story_locations = mt.narrative_setting; if (mt.kindred_films?.length && (!p.profile.related_films || !p.profile.related_films.length)) p.profile.related_films = mt.kindred_films; if (mt.awards?.length) { const s = new Set(p.profile.awards_ids || []); for (const a of mt.awards) s.add(String(a)); p.profile.awards_ids = [...s]; } if (mt.locations?.length) p.metatakeLocations = mt.locations; } } catch (e) { console.warn("metatake fail:", e.message); p.sourceErrors.push({ source: "metatake", error: String(e.message || e) }); } }));
    for (const p of prepared) {
      let stale = findStaleFields(p.profile, p.fieldRows, forceRefresh);
      if (forceAll) stale = Object.keys(FIELD_DEFS).filter(f => !TAXONOMY_LLM_FIELDS.includes(f));
      p.staleDeterministic = stale.filter(f => FIELD_DEFS[f]?.source !== "llm");
      const forced = new Set(p.staleDeterministic);
      if (filters.company && (!Array.isArray(p.profile.production_companies_ids) || p.profile.production_companies_ids.length === 0)) forced.add("production_companies_ids");
      if (filters.director && (!Array.isArray(p.profile.director_ids) || p.profile.director_ids.length === 0)) forced.add("director_ids");
      if (filters.writers && (!Array.isArray(p.profile.writers_ids) || p.profile.writers_ids.length === 0)) forced.add("writers_ids");
      if (filters.cast && (!Array.isArray(p.profile.cast_ids) || p.profile.cast_ids.length === 0)) forced.add("cast_ids");
      if (filters.keywords && (!Array.isArray(p.profile.keywords_ids) || p.profile.keywords_ids.length === 0)) forced.add("keywords_ids");
      p.staleDeterministic = [...forced];
    }
    const ENRICH_CONCURRENCY = 4; const allCoveredFields = [];
    for (let i = 0; i < prepared.length; i += ENRICH_CONCURRENCY) { if (signal?.aborted) return; const group = prepared.slice(i, i + ENRICH_CONCURRENCY); await Promise.all(group.map(async (p, j) => { if (signal?.aborted) return; const idx = i + j; send({ type: "step", index: idx, total, title: p.movie.original_title || p.movie.title, stage: p.staleDeterministic.length ? "zenginleştiriliyor" : "önbellekten", fields: p.staleDeterministic.slice(0, 6) }); try { const classic = await enrichClassic(env, p.movie, p.staleDeterministic, signal); Object.assign(p.profile, classic.updates); if (classic.errors?.length) p.sourceErrors.push(...classic.errors); const covered = [...classic.covered].filter(f => p.profile[f] !== undefined && p.profile[f] !== null); if (covered.length) { p.dirty = true; for (const f of covered) allCoveredFields.push({ movieId: p.movieId, field: f, source: FIELD_DEFS[f]?.source || "unknown", confidence: CONFIDENCE.STATIC }); } } catch (e) { console.warn("enrich fail:", p.movieId, e.message); p.sourceErrors.push({ source: "enrich", error: String(e.message || e) }); } })); }
    if (allCoveredFields.length) await putFieldRowsBatch(env, allCoveredFields);
    for (const p of prepared) { if (p.profile.imdbID && !p.profile.imdb_id) p.profile.imdb_id = p.profile.imdbID; if (p.movie.imdb_id && !p.profile.imdb_id) p.profile.imdb_id = p.movie.imdb_id; }
    if (filters.dialogueDensityMin != null) { const subtitleTargets = prepared.filter(p => p.profile.dialogue_density == null || !settings.useAI); if (subtitleTargets.length) { const subFields = []; await Promise.all(subtitleTargets.slice(0, 5).map(async (p) => { try { const r = await fetchSubtitleDensity(env, p.movie, signal); if (r && r.density != null) { p.profile.dialogue_density_subtitle = r.density; p.dirty = true; subFields.push({ movieId: p.movieId, field: "dialogue_density_subtitle", source: r.source || "subtitles", confidence: CONFIDENCE.SUBTITLES }); } } catch (e) { console.warn("subtitle fail:", p.movieId, e.message); p.sourceErrors.push({ source: "subtitles", error: String(e.message || e) }); } })); if (subFields.length) await putFieldRowsBatch(env, subFields); } }
    for (const p of prepared) { const mg = Array.isArray(p.movie.genre_ids) ? p.movie.genre_ids : []; if (mg.length) { const pg = Array.isArray(p.profile.genres_ids) ? p.profile.genres_ids : []; const combined = new Set([...pg.map(String), ...mg.map(String)]); p.profile.genres_ids = [...combined].map(x => { const n = Number(x); return Number.isFinite(n) ? n : x; }); } }
    const needWiki = !!(filters.original_work?.include?.length || filters.original_work?.exclude?.length || filters.filming_locations?.include?.length || filters.filming_locations?.exclude?.length || filters.award?.include?.length || filters.award?.exclude?.length);
    if (needWiki) { const wikiNeeded = prepared.filter(p => ["original_work", "filming_locations", "filming_countries", "awards_ids", "nominated_ids"].some(f => p.staleDeterministic.includes(f))); if (wikiNeeded.length) { const wikiResults = await wikidataBatch(env, wikiNeeded.map(p => p.movie), signal); const wikiCovered = []; for (const p of wikiNeeded) { const rec = wikiResults.get(String(p.movie.id)); if (!rec) continue; if (rec.originalWork) { p.profile.original_work = rec.originalWork; wikiCovered.push({ movieId: p.movieId, field: "original_work", source: "wikidata", confidence: CONFIDENCE.WIKIDATA }); } if (rec.filmingLocations?.length) { p.profile.filming_locations = rec.filmingLocations; wikiCovered.push({ movieId: p.movieId, field: "filming_locations", source: "wikidata", confidence: CONFIDENCE.WIKIDATA }); } if (rec.filmingCountries?.length) { p.profile.filming_countries = rec.filmingCountries; wikiCovered.push({ movieId: p.movieId, field: "filming_countries", source: "wikidata", confidence: CONFIDENCE.WIKIDATA }); } if (rec.awards?.length) { p.profile.awards_ids = rec.awards; wikiCovered.push({ movieId: p.movieId, field: "awards_ids", source: "wikidata", confidence: CONFIDENCE.WIKIDATA }); } if (rec.nominations?.length) { p.profile.nominated_ids = rec.nominations; wikiCovered.push({ movieId: p.movieId, field: "nominated_ids", source: "wikidata", confidence: CONFIDENCE.WIKIDATA }); } if (wikiCovered.length) p.dirty = true; } if (wikiCovered.length) await putFieldRowsBatch(env, wikiCovered); } }
    const afterLocal = prepared.filter(p => evaluateFilters(p.profile, filters, null, null, null).match);
    const taxonomyRequested = taxonomyFieldsNeeded(filters);
    const stage2bFields = (() => {
      if (forceAll && settings.useAI) return LLM_FIELDS;
      const fields = new Set(ratioFieldsNeeded(filters));
      for (const f of locationFieldsNeeded(filters)) fields.add(f);
      if (filters.story_locations && (filters.story_locations.include?.length || filters.story_locations.exclude?.length)) if (afterLocal.some(p => !p.profile.story_locations || !p.profile.story_locations.length)) fields.add("story_locations");
      if (filters.related_films && (filters.related_films.include?.length || filters.related_films.exclude?.length)) if (afterLocal.some(p => !p.profile.related_films || !p.profile.related_films.length)) fields.add("related_films");
      if (filters.color_style && (filters.color_style.include?.length || filters.color_style.exclude?.length)) if (afterLocal.some(p => !p.profile.color_style || !p.profile.color_style.length)) fields.add("color_style");
      if (taxonomyRequested.length) {
        for (const f of taxonomyRequested) {
          if (afterLocal.some(p => {
            const val = p.profile[f];
            const isEmpty = !val || (Array.isArray(val) && !val.length);
            if (isEmpty) return true;
            const st = findStaleFields(p.profile, p.fieldRows || [], forceRefresh);
            return st.includes(f);
          })) fields.add(f);
        }
      }
      return Array.from(fields);
    })();
    const useStage2b = settings.useAI && stage2bFields.length > 0;
    const useStage1 = settings.useAI && hasSemanticFilters(filters) && !useStage2b;
    const stage1UseSearch = settings.useWebResearch;
    let semanticVerdicts = new Map(); let stage1Error = null;
    if (useStage2b) {
      send({ type: "step", index: 0, total: afterLocal.length, title: "Oransal/semantik alanlar dolduruluyor", stage: "sınıflandırılıyor", fields: stage2bFields.slice(0, 6) });
      const needMap = new Map();
      for (const p of afterLocal) {
        const stale = findStaleFields(p.profile, p.fieldRows || [], forceRefresh);
        const need = stage2bFields.filter(f => {
          if (forceAll) return true;
          const val = p.profile[f];
          const isEmpty = !val || (Array.isArray(val) && !val.length);
          if (isEmpty) return true;
          if (FIELD_DEFS[f]?.source === "llm" && stale.includes(f)) return true;
          return false;
        });
        if (need.length) needMap.set(p.movieId, need);
      }
      if (needMap.size > 0 && !signal?.aborted) {
        const groupsBySignature = new Map();
        for (const p of afterLocal) {
          const need = needMap.get(p.movieId);
          if (!need) continue;
          const sig = [...need].sort().join("|");
          if (!groupsBySignature.has(sig)) groupsBySignature.set(sig, { fields: need, movies: [] });
          groupsBySignature.get(sig).movies.push(p);
        }
        let groupsToProcess;
        if (groupsBySignature.size <= MAX_STAGE2_GROUPS) {
          groupsToProcess = [...groupsBySignature.values()];
          console.log(`[stage2] ${groupsToProcess.length} grup işlenecek: ${groupsToProcess.map(g => `${g.movies.length}f×${g.fields.length}a`).join(", ")}`);
        } else {
          const allFields = [...new Set([].concat(...[...needMap.values()]))];
          const allMovies = afterLocal.filter(p => needMap.has(p.movieId));
          groupsToProcess = [{ fields: allFields, movies: allMovies }];
          console.log(`[stage2] ${groupsBySignature.size} farklı ihtiyaç grubu → tek union gruba indirildi (${allFields.length} alan, ${allMovies.length} film)`);
        }
        for (const group of groupsToProcess) {
          if (signal?.aborted) break;
          try {
            const llmConf = new Map();
            const results = await fillDetailsBatch(env, group.movies.map(p => p.movie), group.fields, signal, { method: "stage2" }, llmConf);
            const llmCovered = [];
            for (const p of group.movies) {
              if (signal?.aborted) break;
              const updates = results.get(String(p.movie.id)) || {};
              if (!Object.keys(updates).length) continue;
              Object.assign(p.profile, updates);
              const confMap = llmConf.get(String(p.movie.id)) || {};
              const covered = Object.keys(updates).filter(f => p.profile[f] !== undefined && p.profile[f] !== null);
              if (covered.length) {
                p.dirty = true;
                for (const f of covered) llmCovered.push({ movieId: p.movieId, field: f, source: "llm", confidence: confMap[f] ?? CONFIDENCE.LLM });
              }
            }
            if (llmCovered.length) await putFieldRowsBatch(env, llmCovered);
          } catch (e) {
            console.warn(`[stage2 group fail] fields=${group.fields.join(",")}:`, String(e.message || e).slice(0, 200));
          }
        }
      }
    }
    else if (useStage1 && afterLocal.length) { send({ type: "step", index: 0, total: afterLocal.length, title: "Semantik filtre uygulanıyor", stage: "sınıflandırılıyor", fields: [] }); const signature = semanticSignature(filters); const cachedVerdicts = await getVerdictsBatch(env, afterLocal.map(p => p.movieId), signature); const cacheMisses = []; for (const p of afterLocal) { const cached = cachedVerdicts.get(p.movieId); if (cached && cached.verdict !== "unknown" && !forceRefresh) semanticVerdicts.set(p.movieId, cached); else cacheMisses.push(p); } if (cacheMisses.length) { const newVerdicts = []; try { const configAll = await getAllConfig(env); const sentence = buildFilterSentence(filters); const context = buildFilterContext(filters, configAll); const batchSize = Math.min(5, cacheMisses.length); for (let start = 0; start < cacheMisses.length; start += batchSize) { if (signal?.aborted) break; const chunk = cacheMisses.slice(start, start + batchSize); try { const verdicts = await classifyBatch(env, chunk.map(p => p.movie), sentence, context, stage1UseSearch, signal, { movie_id: chunk[0].movieId }); for (const p of chunk) { const v = verdicts.get(String(p.movie.id)) || { verdict: "unknown", reason: "LLM yanıt vermedi" }; semanticVerdicts.set(p.movieId, v); if (v.verdict !== "unknown") newVerdicts.push({ movieId: p.movieId, verdict: v.verdict, reason: v.reason }); } } catch (e) { console.warn("stage1 chunk:", e.message); stage1Error = e.message; for (const p of chunk) if (!semanticVerdicts.has(p.movieId)) semanticVerdicts.set(p.movieId, { verdict: "unknown", reason: "LLM başarısız" }); } } } catch (e) { console.warn("stage1 fail:", e.message); stage1Error = e.message; } if (newVerdicts.length) await putVerdictsBatch(env, newVerdicts, signature); } }
    const movieIds = afterLocal.map(p => p.movieId); const listsMap = await getMovieLists(env, movieIds);
    let siteRatingMap = new Map();
    try {
      if (afterLocal.length) {
        siteRatingMap = await getSiteRatingsBatch(env, afterLocal.map(p => ({ id: p.movie.id, imdbID: p.profile.imdbID || p.profile.imdb_id })));
      }
    } catch (e) { console.warn("site-rating batch:", e.message); }
    const profileUpdates = []; const results = [];
    for (const p of afterLocal) {
      try {
        const verdict = semanticVerdicts.get(p.movieId) || null;
        const evalResult = evaluateFilters(p.profile, filters, verdict, p.metatakeLocations, p.filmmap);
        if (p.dirty || p.staleDeterministic.length) profileUpdates.push({ movieId: p.movieId, title: p.movie.title || p.profile.title || p.profile.original_title, year: yearOf(p.movie), data: p.profile });
        const movieLists = listsMap.get(p.movieId) || [];
        const locInfo = getLocationCount(p.profile, p.metatakeLocations, p.filmmap);
        const siteRating = siteRatingMap.get(String(p.movie.id)) || { avg: null, count: 0 };
        const result = {
          id: p.movie.id, ...p.movie, ...p.profile,
          filter_match: evalResult.match,
          filter_reasons: evalResult.reasons,
          unknown: evalResult.unknown,
          conflicts: evalResult.conflicts,
          semantic_used: useStage1,
          semantic_ok: useStage1 && !!verdict && verdict.verdict !== "unknown",
          stage1_error: stage1Error,
          stage2b_used: useStage2b,
          web_used: (useStage1 || useStage2b) && stage1UseSearch,
          web_ok: false,
          ai_model_used: useStage1 || useStage2b ? "Gemini 3.x Flash / Groq GPT-OSS" : null,
          location_count: locInfo.count,
          location_count_estimated: locInfo.estimated,
          location_count_source: locInfo.source,
          related_films_detail: Array.isArray(p.profile.related_films_detail) ? p.profile.related_films_detail : (Array.isArray(p.profile.related_films) ? p.profile.related_films : []),
          color_style: Array.isArray(p.profile.color_style) ? p.profile.color_style : null,
          movie_lists: movieLists,
          site_rating: siteRating.avg,
          site_rating_count: siteRating.count,
          _fromCache: p.staleDeterministic.length === 0,
          _source_errors: p.sourceErrors.length ? p.sourceErrors : null
        };
        for (const f of ["director","writers","cast","producers","actors"]) if (result[f] !== undefined) result[f] = sanitizePeopleField(result[f]);
        results.push(result);
        send({ type: "movie", index: results.length - 1, total, movie: result });
      } catch (perMovieErr) {
        console.error(`[research] per-movie fail (${p.movieId}):`, perMovieErr.stack || perMovieErr.message);
        try { const fallback = { id: p.movie.id, ...p.movie, ...p.profile, filter_match: false, filter_reasons: ["İşleme hatası: " + perMovieErr.message], unknown: true, conflicts: false, _source_errors: [{ source: "internal", error: String(perMovieErr.message) }] }; results.push(fallback); send({ type: "movie", index: results.length - 1, total, movie: fallback }); } catch {}
      }
    }
    if (profileUpdates.length) await putProfileRowsBatch(env, profileUpdates, forceRefresh);
    send({ type: "done", movies: results });
  } catch (err) { console.error("handleResearchStream fatal:", err); try { controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", message: String(err.message || err) })}\n\n`)); } catch {} } finally { try { controller.close(); } catch {} }
}

export async function handleMovieDetails(env, body, signal) {
  const movie = body?.movie; if (!movie || !movie.id) throw Object.assign(new Error("movie gerekli"), { status: 400 });
  const forceAll = body.forceAll === true;
  // ✅ YENİ: forceTaxonomy — manuel yenilemede taxonomy alanlarını doldurur
  const forceTaxonomy = body.forceTaxonomy === true;
  const movieId = movieKey(movie);
  const existing = await getProfileRow(env, movieId); const fieldRows = await getFieldRows(env, movieId);
  const profile = existing?.data || {};
  if (!profile.vote_average && movie.vote_average != null) profile.vote_average = movie.vote_average;
  if (!profile.vote_count && movie.vote_count != null) profile.vote_count = movie.vote_count;
  if (!profile.overview && movie.overview) profile.overview = movie.overview;
  if (profile.poster_path === undefined && movie.poster_path) profile.poster_path = movie.poster_path;
  if (!profile.release_date && movie.release_date) profile.release_date = movie.release_date;
  if (!profile.imdb_id && movie.imdb_id) profile.imdb_id = movie.imdb_id;
  if (!movie.imdb_id && profile.imdb_id) movie.imdb_id = profile.imdb_id;
  if (!movie.imdb_id && profile.imdbID) movie.imdb_id = profile.imdbID;
  if (Array.isArray(movie.genre_ids) && movie.genre_ids.length) { const pg = Array.isArray(profile.genres_ids) ? profile.genres_ids : []; const combined = new Set([...pg.map(String), ...movie.genre_ids.map(String)]); profile.genres_ids = [...combined].map(x => { const n = Number(x); return Number.isFinite(n) ? n : x; }); }
  const fmCache = await getFilmmapCache(env, movieId); const mtCache = await getMetatakeExtendedCache(env, movieId);
  let metatakeLocations = null; let filmmapLocationsList = fmCache || []; let mt = mtCache;
  if (!fmCache || !mtCache) { const tasks = []; if (!fmCache) tasks.push(filmmapLocations(env, movie, signal).catch(e => { console.warn("filmmap details:", e.message); return { locations: [] }; })); else tasks.push(Promise.resolve({ locations: fmCache })); if (!mtCache) tasks.push(metatakeExtended(env, movie, signal).catch(e => { console.warn("metatake details:", e.message); return null; })); else tasks.push(Promise.resolve(mtCache)); const [fmRes, mtRes] = await Promise.all(tasks); filmmapLocationsList = fmRes?.locations || filmmapLocationsList; mt = mtRes || mt; }
  let dirty = false;
  if (filmmapLocationsList?.length && (!profile.filming_locations || !profile.filming_locations.length)) {
    const names = filmingNamesFromFilmmap(filmmapLocationsList);
    if (names.length) { profile.filming_locations = names; dirty = true; }
  }
  if (mt) { if (mt.narrative_setting?.length && (!profile.story_locations || !profile.story_locations.length)) profile.story_locations = mt.narrative_setting; if (mt.kindred_films?.length && (!profile.related_films || !profile.related_films.length)) profile.related_films = mt.kindred_films; if (mt.awards?.length) { const s = new Set(profile.awards_ids || []); for (const a of mt.awards) s.add(String(a)); profile.awards_ids = [...s]; } if (mt.locations?.length) metatakeLocations = mt.locations; }
  const stale = findStaleFields(profile, fieldRows, forceAll);
  const staleDet = stale.filter(f => FIELD_DEFS[f]?.source !== "llm");
  const staleLLM = stale.filter(f => FIELD_DEFS[f]?.source === "llm");
  const sourceErrors = [];
  if (staleDet.length) { const classic = await enrichClassic(env, movie, staleDet, signal); Object.assign(profile, classic.updates); if (classic.errors?.length) sourceErrors.push(...classic.errors); const covered = [...classic.covered].filter(f => profile[f] !== undefined && profile[f] !== null); if (covered.length) dirty = true; const confLookup = {}; for (const f of covered) confLookup[f] = CONFIDENCE.STATIC; await putFieldRows(env, movieId, covered, Object.fromEntries(covered.map(f => [f, FIELD_DEFS[f]?.source || "unknown"])), confLookup); }
  if (Array.isArray(movie.genre_ids) && movie.genre_ids.length) { const pg = Array.isArray(profile.genres_ids) ? profile.genres_ids : []; const combined = new Set([...pg.map(String), ...movie.genre_ids.map(String)]); profile.genres_ids = [...combined].map(x => { const n = Number(x); return Number.isFinite(n) ? n : x; }); }
  if (staleLLM.length || forceAll) {
    const llmFieldsToFill = (forceAll ? LLM_FIELDS : staleLLM).filter(f => !TAXONOMY_LLM_FIELDS.includes(f));
    if (llmFieldsToFill.length) {
      try {
        const llmConf = new Map();
        const updates = await fillDetailsBatch(env, [movie], llmFieldsToFill, signal, { movie_id: movieId, maxAttempts: 3, timeoutMs: 30000 }, llmConf);
        const u = updates.get(String(movie.id)) || {};
        Object.assign(profile, u);
        const confMap = llmConf.get(String(movie.id)) || {};
        const covered = Object.keys(u).filter(f => profile[f] !== undefined && profile[f] !== null);
        if (covered.length) dirty = true;
        const confLookup = {}; for (const f of covered) confLookup[f] = confMap[f] ?? CONFIDENCE.LLM;
        await putFieldRows(env, movieId, covered, Object.fromEntries(covered.map(f => [f, "llm"])), confLookup);
      } catch (e) { console.warn("stage2 details fail:", e.message); sourceErrors.push({ source: "llm", error: String(e.message || e) }); }
    }
  }
  // ✅ YENİ: forceTaxonomy veya stale taxonomy varsa doldur
  const staleTaxonomy = (forceTaxonomy || forceAll)
    ? stale.filter(f => TAXONOMY_LLM_FIELDS.includes(f))
    : stale.filter(f => TAXONOMY_LLM_FIELDS.includes(f));
  if (staleTaxonomy.length) {
    try {
      const llmConf = new Map();
      const updates = await fillDetailsBatch(env, [movie], staleTaxonomy, signal, { movie_id: movieId, maxAttempts: 3, timeoutMs: 30000 }, llmConf);
      const u = updates.get(String(movie.id)) || {};
      Object.assign(profile, u);
      const confMap = llmConf.get(String(movie.id)) || {};
      const covered = Object.keys(u).filter(f => profile[f] !== undefined && profile[f] !== null);
      if (covered.length) dirty = true;
      const confLookup = {}; for (const f of covered) confLookup[f] = confMap[f] ?? CONFIDENCE.LLM;
      await putFieldRows(env, movieId, covered, Object.fromEntries(covered.map(f => [f, "llm"])), confLookup);
    } catch (e) { console.warn("taxonomy details fail:", e.message); sourceErrors.push({ source: "llm-taxonomy", error: String(e.message || e) }); }
  }
  if (profile.dialogue_density_subtitle == null || forceAll) { try { const r = await fetchSubtitleDensity(env, movie, signal); if (r && r.density != null) { profile.dialogue_density_subtitle = r.density; dirty = true; await putFieldRows(env, movieId, ["dialogue_density_subtitle"], { dialogue_density_subtitle: r.source || "subtitles" }, { dialogue_density_subtitle: CONFIDENCE.SUBTITLES }); } } catch (e) { console.warn("subtitle details fail:", e.message); } }
  if (profile.imdbID && !profile.imdb_id) profile.imdb_id = profile.imdbID;
  if (movie.imdb_id && !profile.imdb_id) profile.imdb_id = movie.imdb_id;
  if (dirty || forceAll) await putProfileRow(env, movieId, movie.title || profile.title || profile.original_title, yearOf(movie), profile, forceAll);
  const merged = { ...movie, ...profile };
  for (const f of ["director","writers","cast","producers","actors"]) if (merged[f] !== undefined) merged[f] = sanitizePeopleField(merged[f]);
  const locInfo = getLocationCount(profile, metatakeLocations, filmmapLocationsList);
  merged.location_count = locInfo.count; merged.location_count_estimated = locInfo.estimated; merged.location_count_source = locInfo.source;
  merged.related_films_detail = Array.isArray(profile.related_films_detail) ? profile.related_films_detail : (Array.isArray(profile.related_films) ? profile.related_films : []);
  merged.color_style = Array.isArray(profile.color_style) ? profile.color_style : null;
  merged.dialogue_density_subtitle = profile.dialogue_density_subtitle ?? null;
  try { const sr = await getSiteRatingForMovie(env, { movieId, tmdbId: movie.id, imdbId: merged.imdbID || merged.imdb_id }); merged.site_rating = sr.avg; merged.site_rating_count = sr.count; } catch {}
  if (sourceErrors.length) merged._source_errors = sourceErrors;
  return { movie: merged };
  } 
