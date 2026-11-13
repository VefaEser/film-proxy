// config.js — character_traits ve story_dimensions bağlam metinleri slug listeleriyle
import { safeJSON } from "./db.js";
import { invalidatePromptCache } from "./llm.js";

const DEFAULT_FILTER_INFO = {
  "filter_info.season": "[YZ bağlamı]\nHikâyenin geçtiği mevsim.\n- winter: Hikâye kışın geçiyor.\n- summer: Hikâye yazın geçiyor.\n- spring: Hikâye ilkbaharda geçiyor.\n- autumn: Hikâye sonbaharda geçiyor.",
  "filter_info.reality": "[YZ bağlamı]\nHikâyenin gerçeklik düzeyi.\n- true: Gerçek olaylara birebir sadık.\n- mostly_true: Gerçek olaylara dayalı, sanatsal özgürlük var.\n- inspired: Gerçek olaylardan esinlenmiş.\n- realistic: Kurgusal ama gerçekçi.\n- fictional: Tamamen kurgusal.\n- utopic: Ütopik/distopik gelecek.",
  "filter_info.production_process": "[YZ bağlamı]\nFİLTRE ADI: Filmin sanatsal veya sektörel konumu. Filmin yapım biçimini, bütçesini ve sektördeki yerini sınıflandırır.\n- amateur: Amatör yapım, çok düşük bütçe, öğrenci/amatör ekip.\n- indie: Bağımsız film, stüdyo dışı, küçük bütçeli.\n- art: Sanat filmi, deneysel anlatım, festival odaklı.\n- big: Büyük prodüksiyon, 100M$+ bütçe, geniş ekip.\n- bmovie: Düşük bütçeli tür sineması (B movie).\n- avant: Avangart film, deneysel/anti-anlatı.\n- studio: Klasik stüdyo filmi (Hollywood/benzeri).\n- no_music: Müziksiz film.\n- rare_music: Nadir/az müzikli film.\n- handheld: El kamerası/hareketli kamera baskın.\n- propaganda: İdeolojik/propaganda amaçlı.\n- dogme: Dogme 95 manifestosuna uygun.",
  "filter_info.narrative_style": "[YZ bağlamı]\nHikâye anlatım tarzı.\n- multi: Farklı hikâyelerin ayrı ayrı anlatımı.\n- reverse: Sondan başa doğru giden hikâye.\n- linear: Baştan sona giden hikâye.\n- flashback: Ara ara geriye dönüşler yapan hikâye.\n- end_first: Sonu önce anlatılıp başı sonra anlatılan hikâye.\n- mid_first: Ortası önce anlatılıp öncesi ve sonrası sonra anlatılan hikâye.\n- fast: Çok fazla olayın olduğu hareketli hikâye.\n- slow: Çok az olayın olduğu durgun hikâye.\n- no_end: Sonu olmayan hikâye.\n- alt_end: Alternatif sonlu hikâye.\n- alt_narr: Alternatif anlatımlı hikâye.",
  "filter_info.sound": "[YZ bağlamı]\nFilmde ses kullanımı.\n- ambient: Sürekli doğal ortam gürültüsü.\n- music: Yoğun müzik kullanımı.\n- effects: Yoğun gürültülü efekt kullanımı.\n- voiceover_ext: Dış ses kullanımı.\n- voiceover_int: İç ses kullanımı.\n- silent: Sessiz film.\n- dubbed: Ses dublajı çoğunlukla stüdyoda yapılmış.",
  "filter_info.story_geography": "[YZ bağlamı]\nHikâyenin coğrafyası.\n- city: Şehir.\n- town: Kasaba.\n- village: Köy.\n- mountain: Dağlık ve yüksek kesimler.\n- desert: Çöl.\n- steppe: Bozkır.\n- forest: Orman.\n- seaside: Deniz kenarı.\n- riverside: Nehir kenarı.\n- opensea: Açık deniz.\n- air: Havada geçen.",
  "filter_info.character_traits": "[YZ bağlamı]\nFİLTRE ADI: Hikâyedeki karakter niteliği. Sadece şu slug'lardan seç, serbest metin yazma:\n- male_main: Erkek ana karakter\n- female_main: Kadın ana karakter\n- child_main: Çocuk ana karakter\n- lgbt_main: LGBT+ ana karakter\n- male_support: Erkek yan karakter\n- female_support: Kadın yan karakter\n- child_support: Çocuk yan karakter\n- lgbt_support: LGBT+ yan karakter\n- male_extra: Erkek figüran\n- female_extra: Kadın figüran\n- child_extra: Çocuk figüran\n- lgbt_extra: LGBT+ figüran\n- young_main: Genç ana karakter\n- middle_main: Orta yaşlı ana karakter\n- old_main: Yaşlı ana karakter\n- disabled_main: Engelli ana karakter\n- animal: Ana veya yan karakter bir hayvan",
  "filter_info.story_dimensions": "[YZ bağlamı]\nFİLTRE ADI: Filmin diğer filmlerle ilgisi. Sadece şu slug'lardan seç:\n- has_sequel: Devam filmi var\n- is_sequel: Kendisi devam filmi\n- series_sequel: Bir dizideki hikayenin devamı\n- series_prequel: Bir dizideki hikayenin öncesi\n- series_spinoff: Bir dizideki karakterlerin farklı bir hikayesi\n- concept: Konsept filmi\n- similar_script_version: Aynı hikayeyi benzer bir senaryoyla anlatan başka bir film var\n- same_plot_diff_script: Aynı hikayeyi farklı bir senaryoyla anlatan başka bir film var\n- same_plot_diff_angle: Aynı hikayenin farklı bir yönünü anlatan başka bir film var",
  "filter_info.story_period": "[YZ bağlamı]\nHikâyenin geçtiği tarihsel dönem. Kodlar: bc = milattan önce; c1..c19 = 1.-19. yüzyıl; d1900..d2020 = 1900'ler..2020'ler; future = gelecek.",
  "filter_info.story_locations": "[YZ bağlamı]\nHikâyenin geçtiği yerler. Şehir, kasaba, köy, dağlık, çöl, bozkır, orman, deniz kenarı, nehir kenarı, açık deniz, hava.",
  "filter_info.family_content": "[YZ bağlamı]\nAile rehberi. Her içerik türü için intensity ve approach.\n- intensity: none=hiç yok, few=birkaç sahne, side=yan konu, main=ana konu.\n- approach: bad=kötü gösteriyor, neutral=tarafsız kalıyor, legit=meşrulaştırıyor.",
  "filter_info.color": "[YZ bağlamı]\nFilmin görsel renk stili.\n- black_white: Tamamen siyah beyaz.\n- color: Tamamen renkli.\n- mostly_color: Çoğunlukla renkli.\n- mostly_bw: Çoğunlukla siyah beyaz.\n- blue_filter: Baskın mavi tonlu.\n- yellow_filter: Baskın sarı tonlu.\n- selective_color: Seçici renk.\n- colorized: Sonradan renklendirilmiş.\n- limited_palette: Sınırlı renk paleti.\n- sepia: Sepya tonu.\n- mono_tint: Tek renk monokrom.\n- bw_red_accent: Siyah beyaz + kırmızı vurgu.\n- mixed_bw_color: Renkli ve siyah beyaz karışık.",
  "filter_info.aspect_ratio": "[YZ bağlamı]\nFilmin en-boy oranı. Örnekler: 1:1, 4:3, 16:9, 18:9, 21:9.",
  "filter_info.original_language": "[YZ bağlamı]\nFİLTRE ADI: Film dili. Kullanıcı 'Sadece ana dili dikkate al' seçeneğini işaretlerse yalnızca original_language dikkate alınır; aksi halde spoken_languages da eşleştirilir.",
  "filter_info.dialogue_density_subtitle": "Diyalog yoğunluğu altyazı metninden hesaplanır: karakter sayısı / süre_dk / 10 = yüzde.",
  "filter_info.award": "Büyük ödüller (Wikidata P166 kazanılan, P1411 aday gösterilen)."
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
