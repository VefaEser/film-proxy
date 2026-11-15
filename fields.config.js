// fields.config.js — Faz A: taxonomy alanları eklendi
// SCHEMA_VERSION 12 → DEĞİŞMEDİ (ek rapor kararı).
// TAXONOMY_VERSION ayrı yönetilir (taxonomy.config.js).
import { TAXONOMY_VERSION } from "./taxonomy.config.js";

const days = (n) => n * 86400;
export const SCHEMA_VERSION = 12;

export const CHARACTER_TRAITS_LIST = [
  "male_main", "female_main", "child_main", "lgbt_main",
  "male_support", "female_support", "child_support", "lgbt_support",
  "male_extra", "female_extra", "child_extra", "lgbt_extra",
  "young_main", "middle_main", "old_main", "disabled_main", "animal"
];
export const STORY_DIMENSIONS_LIST = [
  "has_sequel", "is_sequel", "series_sequel", "series_prequel", "series_spinoff",
  "concept", "reboot", "film_franchise", "remake",
  "similar_script_version", "same_plot_diff_script", "same_plot_diff_angle"
];

export const FIELD_DEFS = {
  genres:                 { source: "tmdb", ttl: days(90), required: true },
  genres_ids:             { source: "tmdb", ttl: days(90), required: true },
  spoken_languages:       { source: "tmdb", ttl: days(90), required: true },
  spoken_languages_ids:   { source: "tmdb", ttl: days(90), required: true },
  original_language:      { source: "tmdb", ttl: days(90), required: true },
  production_countries:   { source: "tmdb", ttl: days(90), required: true },
  production_countries_ids: { source: "tmdb", ttl: days(90), required: true },
  runtime:                { source: "tmdb", ttl: days(90) },
  production_companies:   { source: "tmdb", ttl: days(90) },
  production_companies_ids: { source: "tmdb", ttl: days(90) },
  original_poster_path:   { source: "tmdb", ttl: days(90) },
  director:               { source: "tmdb", ttl: days(90) },
  director_ids:           { source: "tmdb", ttl: days(90) },
  writers:                { source: "tmdb", ttl: days(90) },
  writers_ids:            { source: "tmdb", ttl: days(90) },
  producers:              { source: "tmdb", ttl: days(90) },
  cast:                   { source: "tmdb", ttl: days(90) },
  cast_ids:               { source: "tmdb", ttl: days(90) },
  keywords:               { source: "tmdb", ttl: days(90) },
  keywords_ids:           { source: "tmdb", ttl: days(90) },
  story_locations:    { source: "llm", ttl: days(90), prefer: "metatake" },
  related_films:      { source: "llm", ttl: days(90), prefer: "metatake" },
  related_films_detail: { source: "llm", ttl: days(90), prefer: "metatake" },
  location_mode:      { source: "llm", ttl: days(90), prefer: "metatake" },
  location_count:     { source: "llm", ttl: days(90), prefer: "metatake" },
  story_period:       { source: "llm", ttl: days(90) },
  story_geography:    { source: "llm", ttl: days(90) },
  character_traits:   { source: "llm", ttl: days(90) },
  narrative_style:    { source: "llm", ttl: days(90) },
  narrative_pace:     { source: "llm", ttl: days(90) },
  production_category: { source: "llm", ttl: days(90) },
  cinema_approach:    { source: "llm", ttl: days(90) },
  technical_style:    { source: "llm", ttl: days(90) },
  sound:              { source: "llm", ttl: days(90) },
  reality:            { source: "llm", ttl: days(90) },
  story_dimensions:   { source: "llm", ttl: days(90) },
  family_content:     { source: "llm", ttl: days(90) },
  night_ratio:        { source: "llm", ttl: days(90) },
  day_ratio:          { source: "llm", ttl: days(90) },
  indoor_ratio:       { source: "llm", ttl: days(90) },
  dialogue_density:   { source: "llm", ttl: days(90) },
  color_ratio:        { source: "llm", ttl: days(90) },
  aspect_ratio:       { source: "llm", ttl: days(90) },
  season:             { source: "llm", ttl: days(90) },
  color_style:        { source: "llm", ttl: days(90) },
  // === FAZ A: Taxonomy alanları — source "llm" olarak KALIR (forceAll'dan ayrı kontrol) ===
  subgenres:          { source: "llm", ttl: days(90) },
  tropes:             { source: "llm", ttl: days(90) },
  themes:             { source: "llm", ttl: days(90) },
  imdbRating:         { source: "omdb", ttl: days(7) },
  imdbVotes:          { source: "omdb", ttl: days(7) },
  imdbID:             { source: "omdb", ttl: days(7) },
  omdb_directors:     { source: "omdb", ttl: days(7) },
  actors:             { source: "omdb", ttl: days(7) },
  rated:              { source: "omdb", ttl: days(7) },
  awards:             { source: "omdb", ttl: days(7) },
  metascore:          { source: "omdb", ttl: days(7) },
  boxOffice:          { source: "omdb", ttl: days(7) },
  omdb_poster:        { source: "omdb", ttl: days(7) },
  original_work:      { source: "wikidata", ttl: days(90) },
  filming_locations:  { source: "wikidata", ttl: days(90) },
  filming_countries:  { source: "wikidata", ttl: days(90) },
  awards_ids:         { source: "wikidata", ttl: days(90) },
  nominated_ids:      { source: "wikidata", ttl: days(90) },
  dialogue_density_subtitle: { source: "subtitles", ttl: days(90) },
  filmmap_locations:  { source: "filmmap", ttl: days(90) },
  metatake_locations: { source: "metatake", ttl: days(90) },
  metatake_confidence:{ source: "metatake", ttl: days(90) },
  commons_images:     { source: "commons", ttl: days(90) },
  web_evidence:       { source: "tavily", ttl: days(30) }
};

// ============================================================
// FAZ A: TAXONOMY_LLM_FIELDS — forceAll'dan AYRI tutulur.
// Bu alanlar SADECE kullanıcı ilgili taksonomi filtresini aktif ettiğinde
// AI'ya gönderilir. forceAll çağrısında DAHİL EDİLMEZ.
// ============================================================
export const TAXONOMY_LLM_FIELDS = ["subgenres", "tropes", "themes"];

// Mevcut LLM_FIELDS — taxonomy HARİÇ tutulur.
export const LLM_FIELDS = Object.entries(FIELD_DEFS)
  .filter(([, d]) => d.source === "llm")
  .map(([k]) => k)
  .filter(k => !TAXONOMY_LLM_FIELDS.includes(k));

export const VALID_SOURCES = [...new Set(Object.values(FIELD_DEFS).map(d => d.source))];

// Taxonomy sürümü tek noktadan export (research.js / filters.js ihtiyaç duyarsa)
export { TAXONOMY_VERSION };

const _CHAR_TRAITS_JSON = CHARACTER_TRAITS_LIST.map(x => `"${x}"`).join(",");
const _STORY_DIMS_JSON = STORY_DIMENSIONS_LIST.map(x => `"${x}"`).join(",");

export const FIELD_RULES = {
  narrative_style: `narrative_style: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["multi","reverse","linear","flashback","end_first","mid_first","no_end","alt_end","alt_narr"]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.
DİKKAT: Anlatı YAPISI ile TEMPO ayrıdır. "hızlı" / "yavaş" / "tempo" buraya DEĞİL, narrative_pace alanına girer.`,

  narrative_pace: `narrative_pace: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["fast","slow"]
- fast: Çok fazla olayın olduğu hareketli hikâye. Hızlı kurgu, yüksek olay yoğunluğu.
- slow: Çok az olayın olduğu durgun hikâye. Yavaş tempolu, uzun planlar.
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.
DİKKAT: Anlatının YAPISI (linear, flashback, multi vb.) buraya DEĞİL, narrative_style alanına girer.`,

  production_category: `production_category: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["amateur","indie","big","bmovie","studio","propaganda"]
- amateur: Amatör yapım, çok düşük bütçe, öğrenci/amatör ekip.
- indie: Bağımsız film, stüdyo dışı, küçük bütçeli.
- big: Büyük prodüksiyon, 100M$+ bütçe, geniş ekip.
- bmovie: Düşük bütçeli tür sineması (B movie).
- studio: Klasik stüdyo filmi (Hollywood/benzeri).
- propaganda: İdeolojik/propaganda amaçlı film.
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.
DİKKAT: Sanat filmi, avangart, Dogme 95 gibi sinemasal akımlar buraya DEĞİL, cinema_approach alanına girer.`,

  cinema_approach: `cinema_approach: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["art","avant","dogme"]
- art: Sanat filmi, deneysel anlatım, festival odaklı, "art-house" geleneği.
- avant: Avangart film, deneysel/anti-anlatı, biçimsel yenilik arayışı.
- dogme: Dogme 95 manifestosuna uygun (Lars von Trier & Thomas Vinterberg, 1995).
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.
DİKKAT: Film TÜRÜ (dram, komedi) ve yapım BÜYÜKLÜĞÜ (indie, big) buraya DEĞİL.`,

  technical_style: `technical_style: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["handheld","static_camera","tracking_shot","steadicam","crane_shot","aerial_shot","zoom","pan_tilt"]
- handheld: El kamerası — kameranın operatör tarafından elde taşınması.
- static_camera: Sabit kamera — kameranın sabit konumda kullanılması.
- tracking_shot: Takip çekimi — kameranın karakteri veya nesneyi takip etmesi.
- steadicam: Steadicam — hareket sırasında dengeli ve akıcı görüntü.
- crane_shot: Vinç çekimi — kameranın vinç veya jib sistemiyle yükselip alçalması.
- aerial_shot: Havadan çekim — drone, helikopter veya benzeri araçlarla çekim.
- zoom: Zoom kullanımı — optik yakınlaştırma/uzaklaştırmanın belirgin kullanımı.
- pan_tilt: Pan / tilt — kameranın yatay veya dikey eksende döndürülmesi.
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.
DİKKAT: SADECE KAMERA kullanım teknikleri. Ses/müzik buraya DEĞİL, sound alanına girer.
SINIFLANDIRMA İLKESİ: Bir tekniğin filmde yalnızca bir kez görülmesi yeterli DEĞİLDİR.`,

  sound: `sound: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["ambient","music","rare_music","no_music","effects","voiceover_ext","voiceover_int","silent","dubbed"]
- ambient: Sürekli doğal ortam gürültüsü.
- music: Yoğun müzik kullanımı.
- rare_music: Nadir/az müzikli film — müzik sadece kritik anlarda kullanılmış.
- no_music: Müziksiz film — film boyunca hiç müzik yok.
- effects: Yoğun gürültülü efekt kullanımı.
- voiceover_ext: Dış ses kullanımı.
- voiceover_int: İç ses kullanımı.
- silent: Sessiz film — hiç ses yok (no_music'ten FARKLI; no_music'te ses var ama müzik yok).
- dubbed: Ses dublajı çoğunlukla stüdyoda yapılmış.
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.
DİKKAT: silent (hiç ses yok) ile no_music (ses var, müzik yok) FARKLIDIR.`,

  season: `season: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["winter","summer","spring","autumn"]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  reality: `reality: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["true","mostly_true","inspired","realistic","fictional","utopic"]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  story_geography: `story_geography: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["city","town","village","mountain","desert","steppe","forest","seaside","riverside","opensea","air"]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  story_period: `story_period: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["bc","c1"..."c19","d1900"..."d2020","future"]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  character_traits: `character_traits: string[] — İKİ AŞAMALI:
1) ÖNCE zorunlu 17 slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): [${_CHAR_TRAITS_JSON}]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin (örn: "erkek dedektif", "yozlaşmış polis", "kadın avukat") — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  story_dimensions: `story_dimensions: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): [${_STORY_DIMS_JSON}]
TANIMLAR:
- concept: Konsept filmi.
- is_sequel: Kendisi bir devam filmi.
- has_sequel: Bu filmin bir devam filmi çekilmiştir.
- reboot: Bir film serisinin hikâyesini veya evrenini SIFIRDAN başlatan yeni başlangıç.
- film_franchise: Ortak evrende geçen, birbirine bağlı birden fazla filmden oluşan marka/seri.
- remake: Belirli bir filmin RESMİ yeniden çevrimi.
- series_sequel / series_prequel / series_spinoff: Dizi bağlantıları.
- similar_script_version / same_plot_diff_script / same_plot_diff_angle: Aynı hikâyeyi farklı anlatan filmler.
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  color_style: `color_style: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["black_white","color","mostly_color","mostly_bw","blue_filter","yellow_filter","selective_color","colorized","limited_palette","sepia","mono_tint","bw_red_accent","mixed_bw_color"]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  location_mode: `location_mode: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["single","mostly_single","few","many"]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  aspect_ratio: `aspect_ratio: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["1:1","1.33:1","1.37:1","1.66:1","1.78:1","1.85:1","2.00:1","2.20:1","2.35:1","2.39:1","2.76:1"]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  // === FAZ A: Taxonomy alanları ===
  subgenres: `subgenres: string[] — Filmin TMDB ana türünün daha özel bir alt kategorisi (ör: Heist, Neo-Noir, Folk Horror, Cyberpunk).
İKİ AŞAMALI:
1) ÖNCE geçerli subgenre slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır). Örnek slug'lar: "heist", "neo_noir", "cyberpunk", "folk_horror", "time_travel".
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.
DİKKAT: Bu alan TMDB ana türünü (Drama, Comedy, Horror vb.) DEĞİŞTİRMEZ veya tekrarlamaz. TMDB ana türleri ayrı tutulur. Alt tür, ana türün daha özel bir alt sınıfıdır.`,
  tropes: `tropes: string[] — Filmde tanınabilir anlatı motifleri, olay örgüsü kalıpları, karakter arketipleri veya ilişki kalıpları (ör: One Last Job, Love Triangle, Unreliable Narrator, Time Loop).
İKİ AŞAMALI:
1) ÖNCE geçerli trope slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır). Örnek slug'lar: "one_last_job", "love_triangle", "unreliable_narrator", "time_loop", "plot_twist".
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.
DİKKAT: Bir motifin filmde yalnızca bir kez geçmesi otomatik olarak o klişenin bulunduğu anlamına GELMEZ. Motifin hikâyede anlamlı bir yeri olmalıdır. Tema ile karıştırılmamalıdır (tema düşünsel meseledir, trope anlatı aracıdır).`,
  themes: `themes: string[] — Filmin temel düşüncesi, insani meselesi, toplumsal veya felsefi konusu (ör: Family Bonds, Alienation, Justice, Freedom, Meaning of Life).
İKİ AŞAMALI:
1) ÖNCE geçerli theme slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır). Örnek slug'lar: "family_bonds", "alienation", "justice", "freedom", "meaning_of_life".
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.
DİKKAT: Tema ile olay örgüsü motifi birbirine karıştırılmamalıdır. Örn: "Yıllar sonra yeniden buluşan aile üyeleri" bir motif (reunion_after_years), "Aile bağlarının önemi" bir tema (family_bonds).`
};

export const SEMANTIC_FIELDS = [
  "story_period", "story_geography", "character_traits",
  "narrative_style", "narrative_pace", "production_category", "cinema_approach", "technical_style",
  "sound", "reality",
  "story_dimensions", "family_content", "season", "aspect_ratio",
  "original_work", "color_style", "location_mode",
  // === FAZ A: Taxonomy ===
  "subgenres", "tropes", "themes"
];
export const RATIO_FIELDS = ["day_ratio", "indoor_ratio", "dialogue_density"];
export const LOCATION_FIELDS = ["location_count"];
export const DETERMINISTIC_FILTERS = [
  "yearMin", "yearMax", "runtimeMin", "runtimeMax", "imdbMin", "imdbMax", "imdbVotesMin",
  "tmdbMin", "tmdbMax", "tmdbVotesMin", "genres", "original_language", "spoken_languages", "production_countries",
  "rated", "company", "keywords", "award", "director", "writers", "cast"
];
export const METATAKE_FIELDS = ["story_locations", "related_films", "related_films_detail", "location_mode", "location_count"];
export const FILMMAP_FIELDS = ["filmmap_locations", "filming_locations"];
