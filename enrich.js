// enrich.js — clean(): "" de null olsun; imdb_id her zaman tt önekiyle OMDb'ye gitsin
import { tmdb, omdbBest } from "./sources.js";

export async function enrichClassic(env, movie, staleFields, outerSignal) {
  const need = new Set(staleFields); const updates = {}; const covered = new Set();
  const errors = [];
  if (movie.id) {
    try {
      const detail = await tmdb(env, `/movie/${movie.id}`, { language: "tr-TR", append_to_response: "credits,images,keywords,external_ids" }, outerSignal);
      const genres = Array.isArray(detail.genres) ? detail.genres : [];
      if (need.has("genres") && genres.length) { updates.genres = genres.map(g => g.name); covered.add("genres"); }
      if (need.has("genres_ids") && genres.length) { updates.genres_ids = genres.map(g => g.id); covered.add("genres_ids"); }
      const langs = Array.isArray(detail.spoken_languages) ? detail.spoken_languages : [];
      if (need.has("spoken_languages")) { updates.spoken_languages = langs.map(l => l.name || l.english_name || l.iso_639_1); covered.add("spoken_languages"); }
      if (need.has("spoken_languages_ids")) { updates.spoken_languages_ids = langs.map(l => l.iso_639_1); covered.add("spoken_languages_ids"); }
      const originalLang = detail.original_language || "";
      if (need.has("original_language") && originalLang) { updates.original_language = originalLang; covered.add("original_language"); }
      const countries = Array.isArray(detail.production_countries) ? detail.production_countries : [];
      if (need.has("production_countries")) { updates.production_countries = countries.map(c => c.name || c.iso_3166_1); covered.add("production_countries"); }
      if (need.has("production_countries_ids")) { updates.production_countries_ids = countries.map(c => c.iso_3166_1); covered.add("production_countries_ids"); }
      if (need.has("runtime")) { updates.runtime = Number(detail.runtime) || null; covered.add("runtime"); }
      const companies = Array.isArray(detail.production_companies) ? detail.production_companies : [];
      if (need.has("production_companies")) { updates.production_companies = companies.map(c => c.name); covered.add("production_companies"); }
      if (need.has("production_companies_ids")) { updates.production_companies_ids = companies.map(c => c.id); covered.add("production_companies_ids"); }
      const isTurkishFilm = originalLang === "tr";
      const posters = detail.images?.posters || [];
      const trPosterPath = detail.poster_path || "";
      const detailPosterEntry = posters.find(p => p.file_path === trPosterPath);
      const detailPosterIsTurkish = detailPosterEntry?.iso_639_1 === "tr";
      const pickOriginalPoster = () => {
        if (isTurkishFilm) return posters.find(p => p.iso_639_1 === "tr") || posters.find(p => !p.iso_639_1) || (detailPosterIsTurkish ? { file_path: trPosterPath } : null) || (posters[0] ? { file_path: posters[0].file_path } : null);
        return posters.find(p => p.iso_639_1 === originalLang && p.iso_639_1 !== "tr") || posters.find(p => p.iso_639_1 === "en") || posters.find(p => !p.iso_639_1) || posters.find(p => p.iso_639_1 && p.iso_639_1 !== "tr");
      };
      if (need.has("original_poster_path")) {
        const op = pickOriginalPoster();
        if (op) { updates.original_poster_path = op.file_path; covered.add("original_poster_path"); }
        else if (isTurkishFilm) { updates.original_poster_path = null; covered.add("original_poster_path"); }
        else if (detailPosterIsTurkish) updates.poster_path = null;
      }
      const kw = detail.keywords?.keywords || [];
      if (need.has("keywords")) { updates.keywords = kw.map(k => k.name); covered.add("keywords"); }
      if (need.has("keywords_ids")) { updates.keywords_ids = kw.map(k => k.id); covered.add("keywords_ids"); }
      const credits = detail.credits;
      if (credits) {
        const crew = credits.crew || [];
        const sanitizePerson = (c) => {
          const name = typeof c?.name === "string" ? c.name.trim() : "";
          if (!name) return null;
          if (/^(nm|tt)\d+$/i.test(name) || /^\d+$/.test(name) || /^[QP]\d+$/.test(name) || /^\[object /i.test(name)) return null;
          return { name, profile_path: c.profile_path || null };
        };
        if (need.has("director")) { updates.director = crew.filter(c => c.job === "Director").map(sanitizePerson).filter(Boolean); covered.add("director"); }
        if (need.has("director_ids")) { updates.director_ids = crew.filter(c => c.job === "Director").map(c => c.id); covered.add("director_ids"); }
        if (need.has("writers")) { updates.writers = crew.filter(c => c.department === "Writing" || c.job === "Writer").map(sanitizePerson).filter(Boolean); covered.add("writers"); }
        if (need.has("writers_ids")) { updates.writers_ids = crew.filter(c => c.department === "Writing" || c.job === "Writer").map(c => c.id); covered.add("writers_ids"); }
        if (need.has("producers")) { updates.producers = crew.filter(c => c.job === "Producer").map(sanitizePerson).filter(Boolean); covered.add("producers"); }
        if (need.has("cast")) { updates.cast = (credits.cast || []).slice(0, 8).map(sanitizePerson).filter(Boolean); covered.add("cast"); }
        if (need.has("cast_ids")) { updates.cast_ids = (credits.cast || []).slice(0, 20).map(c => c.id); covered.add("cast_ids"); }
      }
      // imdb_id her zaman tt önekiyle set edilsin
      if (!movie.imdb_id && detail.imdb_id) movie.imdb_id = detail.imdb_id;
      if (!movie.imdb_id && detail.external_ids?.imdb_id) movie.imdb_id = detail.external_ids.imdb_id;
      if (!movie.imdb_id && detail.imdb_id) movie.imdb_id = detail.imdb_id;
      // Son çare: external_ids
      if (!movie.imdb_id && detail.external_ids?.imdb_id) movie.imdb_id = detail.external_ids.imdb_id;
    } catch (e) { console.warn("tmdb detail enrich:", e.message); errors.push({ source: "tmdb", error: String(e.message || e) }); }
  }
  if (["imdbRating","imdbVotes","imdbID","omdb_directors","actors","rated","awards","metascore","boxOffice","omdb_poster"].some(f => need.has(f))) {
    try {
      const data = await omdbBest(env, movie, outerSignal);
      // === YENİ: "" de null olsun ===
      const clean = (v) => (v === "N/A" || v === "" || v === undefined || v === null ? null : v);
      if (need.has("imdbRating")) { updates.imdbRating = clean(data.imdbRating); covered.add("imdbRating"); }
      if (need.has("imdbVotes")) { updates.imdbVotes = clean(data.imdbVotes); covered.add("imdbVotes"); }
      if (need.has("imdbID")) {
        const v = clean(data.imdbID);
        updates.imdbID = v;
        if (v) updates.imdb_id = v;
        covered.add("imdbID");
        if (v) covered.add("imdb_id");
      }
      if (need.has("omdb_directors")) { updates.omdb_directors = clean(data.Director); covered.add("omdb_directors"); }
      if (need.has("actors")) { updates.actors = data.Actors && data.Actors !== "N/A" ? data.Actors.split(",").map(s => s.trim()).filter(Boolean) : []; covered.add("actors"); }
      if (need.has("rated")) { updates.rated = clean(data.Rated); covered.add("rated"); }
      if (need.has("awards")) { updates.awards = clean(data.Awards); covered.add("awards"); }
      if (need.has("metascore")) { updates.metascore = clean(data.Metascore); covered.add("metascore"); }
      if (need.has("boxOffice")) { updates.boxOffice = clean(data.BoxOffice); covered.add("boxOffice"); }
      if (need.has("omdb_poster")) { updates.omdb_poster = clean(data.Poster); covered.add("omdb_poster"); }
    } catch (e) { console.warn("omdb enrich:", e.message); errors.push({ source: "omdb", error: String(e.message || e) }); }
  }
  return { updates, covered, errors };
}
export function personNameFromObj(it) {
  if (!it || typeof it !== "object") return "";
  const candidates = [it.name, it.original_name, it.full_name, it.title, it.label];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const t = c.trim();
    if (!t) continue;
    if (/^(nm|tt)\d+$/i.test(t) || /^\d+$/.test(t) || /^[QP]\d+$/i.test(t) || /^id[\/_-]?\d+$/i.test(t) || /^\[object /i.test(t)) continue;
    return t;
  }
  return "";
}
export function sanitizePeopleField(val) {
  if (!Array.isArray(val)) return val;
  const out = [];
  for (const it of val) {
    if (it == null) continue;
    if (typeof it === "number" || typeof it === "boolean") continue;
    if (typeof it === "string") {
      let t = it.trim();
      if (!t) continue;
      if (/<a\b/i.test(t)) { const m = t.match(/>([^<>]+)</); if (m && m[1]) t = m[1].trim(); }
      t = t.replace(/\s*\((?:person|nm|tt|id)[\s\/_-]*\d+\)\s*$/i, "").trim();
      if (!t || /^(nm|tt)\d+$/i.test(t) || /^\d+$/.test(t) || /^[QP]\d+$/i.test(t) || /^person[\/_-]\d+$/i.test(t) || /^id[\/_-]?\d+$/i.test(t) || /^@\d+$/.test(t) || /^\[object /i.test(t) || /^\{/.test(t) || /^\[/.test(t) || /":\s*"/.test(t) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) continue;
      out.push({ name: t, profile_path: null });
    } else if (typeof it === "object") {
      const n = personNameFromObj(it);
      if (!n) continue;
      out.push({ name: n, profile_path: it.profile_path || null });
    }
  }
  return out;
                                }
