// config.js — Uygulama konfigürasyonu, LLM istatistikleri, statik seçenekler, film listeleri.
import { safeJSON } from "./db.js";
import { invalidatePromptCache } from "./llm.js";

const DEFAULT_FILTER_INFO = {
  "filter_info.season": "[YZ bağlamı]\n- winter: Hikâye kışın geçiyor.\n- summer: Hikâye yazın geçiyor.\n- spring: Hikâye ilkbaharda geçiyor.\n- autumn: Hikâye sonbaharda geçiyor.",
  "filter_info.reality": "[YZ bağlamı]\n- true: Gerçek olaylara birebir sadık.\n- mostly_true: Gerçek olaylara dayalı, sanatsal özgürlük var.\n- inspired: Gerçek olaylardan esinlenmiş.\n- realistic: Kurgusal ama gerçekçi.\n- fictional: Tamamen kurgusal.\n- utopic: Ütopik/distopik gelecek.",
  "filter_info.production_process": "[YZ bağlamı]\n- amateur: Çok düşük bütçe.\n- indie: Stüdyo dışı bağımsız.\n- art: Deneysel anlatım.\n- big: 100M$+ bütçe.\n- bmovie: Düşük bütçeli tür sineması.\n- avant: Avangart.\n- studio: Klasik Hollywood.\n- no_music: Müzik yok.\n- rare_music: Az müzik.\n- handheld: El kamerası.\n- propaganda: İdeolojik mesaj.\n- dogme: Dogme 95.",
  "filter_info.narrative_style": "[YZ bağlamı]\n- multi: Bağımsız hikâyeler.\n- reverse: Sondan başa.\n- linear: Düz.\n- flashback: Geri dönüşlü.\n- end_first: Sonu önce.\n- mid_first: Orta önce.\n- fast: Hızlı tempolu.\n- slow: Durgun.\n- no_end: Açık uçlu.\n- alt_end: Alternatif son.\n- alt_narr: Alternatif anlatım.",
  "filter_info.sound": "[YZ bağlamı]\n- ambient: Doğal ortam sesi.\n- music: Yoğun müzik.\n- effects: Yoğun efekt.\n- voiceover_ext: Dış ses.\n- voiceover_int: İç ses.\n- silent: Sessiz film.\n- dubbed: Dublaj.",
  "filter_info.story_geography": "[YZ bağlamı]\n- city: Şehir.\n- town: Kasaba.\n- village: Köy.\n- mountain: Dağlık.\n- desert: Çöl.\n- steppe: Bozkır.\n- forest: Orman.\n- seaside: Deniz kenarı.\n- riverside: Nehir kenarı.\n- opensea: Açık deniz.\n- air: Havada.",
  "filter_info.character_traits": "[YZ bağlamı]\nKarakter ana/yan/figüran + cinsiyet/yaş/engel kombinasyonu.",
  "filter_info.story_dimensions": "[YZ bağlamı]\n- has_sequel: Devam filmi var.\n- is_sequel: Devam filmi.\n- series_sequel: Bir dizideki hikayenin devamı.\n- series_prequel: Bir dizideki hikayenin öncesi.\n- series_spinoff: Bir dizideki karakterlerin farklı bir hikayesi.\n- concept: Konsept filmi.\n- similar_script_version: Aynı hikayeyi benzer bir senaryoyla anlatan başka bir film var.\n- same_plot_diff_script: Aynı hikayeyi farklı bir senaryoyla anlatan başka bir film var.\n- same_plot_diff_angle: Aynı hikayenin farklı bir yönünü anlatan başka bir film var.",
  "filter_info.story_period": "[YZ bağlamı]\nHikâyenin geçtiği tarihsel dönem. Kodlar: bc = milattan önce; c1..c19 = 1.-19. yüzyıl; d1900 = 1900'ler; d1910 = 1910'lar; d1920 = 1920'ler; d1930 = 1930'lar; d1940 = 1940'lar; d1950 = 1950'ler; d1960 = 1960'lar; d1970 = 1970'ler; d1980 = 1980'lar; d1990 = 1990'lar; d2000 = 2000'ler; d2010 = 2010'lar; d2020 = 2020'ler; future = gelecek.",
  "filter_info.story_locations": "[YZ bağlamı]\n- city: Şehir.\n- town: Kasaba.\n- village: Köy.\n- mountain: Dağlık.\n- desert: Çöl.\n- steppe: Bozkır.\n- forest: Orman.\n- seaside: Deniz kenarı.\n- riverside: Nehir kenarı.\n- opensea: Açık deniz.\n- air: Havada.",
  "filter_info.family_content": "[YZ bağlamı]\nintensity: none=hiç yok, few=birkaç sahne, side=yan konu, main=ana konu. approach: bad=kötü, neutral=tarafsız, legit=meşrulaştırıyor.",
  "filter_info.color": "[YZ bağlamı]\n- black_white: Tamamen siyah beyaz.\n- color: Tamamen renkli.\n- mostly_color: Çoğunlukla renkli.\n- mostly_bw: Çoğunlukla siyah beyaz.\n- blue_filter: Baskın mavi tonlu.\n- yellow_filter: Baskın sarı tonlu.\n- selective_color: Seçici renk.\n- colorized: Sonradan renklendirilmiş.\n- limited_palette: Sınırlı renk paleti.\n- sepia: Sepya tonu.\n- mono_tint: Tek renk monokrom.\n- bw_red_accent: Siyah beyaz + kırmızı vurgu.\n- mixed_bw_color: Renkli ve siyah beyaz karışık.",
  "filter_info.dialogue_density_subtitle": "Diyalog yoğunluğu altyazı metninden hesaplanır: karakter sayısı / süre_dk / 10 = yüzde."
};

export async function getAllConfig(env) {
  const obj = { ...DEFAULT_FILTER_INFO };
  if (!env.DB) return obj;
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM app_config ORDER BY key").all();
    for (const r of results || []) obj[r.key] = r.value;
    return obj;
  } catch (e) { console.warn("config read all:", e.message); return obj; }
}
export async function getLlmStats(env) {
  if (!env.DB) return [];
  try {
    const since = Math.floor(Date.now() / 1000) - 86400;
    const { results } = await env.DB.prepare(
      `SELECT provider, model, SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS fail, MAX(ts) AS last_ts
       FROM llm_calls WHERE ts > ? GROUP BY provider, model ORDER BY provider, model`
    ).bind(since).all();
    return results || [];
  } catch (e) { console.warn("stats:", e.message); return []; }
}
export async function getActiveDeadKeys(env) {
  if (!env.DB) return [];
  try {
    const now = Math.floor(Date.now() / 1000);
    const { results } = await env.DB.prepare("SELECT provider, key_index, model, until_ts, reason FROM dead_keys WHERE until_ts > ? ORDER BY provider, key_index").bind(now).all();
    return results || [];
  } catch { return []; }
}
export async function getFilterInfoAll(env) {
  if (!env.DB) return {};
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM app_config WHERE key LIKE 'filter_info.%'").all();
    const obj = {};
    for (const r of results || []) obj[r.key] = r.value;
    return obj;
  } catch { return {}; }
}
export async function getAllStaticOptions(env) {
  if (!env.DB) return {};
  try {
    const { results } = await env.DB.prepare("SELECT field, id, label, extra_json, sort_order FROM static_options ORDER BY field, sort_order, label").all();
    const byField = {};
    for (const r of results || []) { if (!byField[r.field]) byField[r.field] = []; byField[r.field].push({ id: r.id, label: r.label, extra: safeJSON(r.extra_json, null) }); }
    return byField;
  } catch { return {}; }
}
export async function getMovieLists(env, movieIds) {
  if (!env.DB || !movieIds.length) return new Map();
  try {
    const placeholders = movieIds.map(() => "?").join(",");
    const { results } = await env.DB.prepare(`SELECT movie_id, list_name, position FROM movie_lists WHERE movie_id IN (${placeholders})`).bind(...movieIds).all();
    const byId = new Map();
    for (const r of results || []) { if (!byId.has(r.movie_id)) byId.set(r.movie_id, []); byId.get(r.movie_id).push({ name: r.list_name, position: r.position }); }
    return byId;
  } catch { return new Map(); }
}
export async function setConfig(env, key, value) {
  if (!env.DB) throw new Error("DB yok");
  invalidatePromptCache(key);
  await env.DB.prepare(
    `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, value, Math.floor(Date.now() / 1000)).run();
  } 
