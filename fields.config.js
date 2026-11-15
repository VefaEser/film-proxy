// fields.config.js — Faz 8 Phase D revize: technical_style sadece kamera, sound'a no_music/rare_music
// SCHEMA_VERSION 11 → 12
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
export const LLM_FIELDS = Object.entries(FIELD_DEFS).filter(([, d]) => d.source === "llm").map(([k]) => k);
export const VALID_SOURCES = [...new Set(Object.values(FIELD_DEFS).map(d => d.source))];

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
- propaganda: İdeolojik/propaganda amaçlı film. Filmin üretim biçimi değil, ideolojik ve iletişimsel işlevi vurgulanır.
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.
DİKKAT: Sanat filmi, avangart, Dogme 95 gibi sinemasal akımlar buraya DEĞİL, cinema_approach alanına girer. El kamerası, müziksiz film gibi teknikler buraya DEĞİL, technical_style ve sound alanlarına girer.`,

  cinema_approach: `cinema_approach: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["art","avant","dogme"]
- art: Sanat filmi, deneysel anlatım, festival odaklı, "art-house" geleneği.
- avant: Avangart film, deneysel/anti-anlatı, biçimsel yenilik arayışı.
- dogme: Dogme 95 manifestosuna uygun (Lars von Trier & Thomas Vinterberg, 1995).
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.
DİKKAT: Film TÜRÜ (dram, komedi) ve yapım BÜYÜKLÜĞÜ (indie, big) buraya DEĞİL. Bir teknik (el kamerası) tek başına bu alana kanıt DEĞİLDİR.`,

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
DİKKAT: SADECE KAMERA kullanım teknikleri. Ses/müzik buraya DEĞİL, sound alanına girer. Bir teknik kullanım (el kamerası) TEK BAŞINA bir sinema akımına (Dogme 95) kanıt DEĞİLDİR.
SINIFLANDIRMA İLKESİ: Bir tekniğin filmde yalnızca bir kez görülmesi yeterli DEĞİLDİR. Filmin genel görsel anlatımında belirgin ve TEKRARLANAN kullanım aranmalıdır. Gerektiğinde birden fazla teknik aynı filme atanabilir.`,

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
DİKKAT: silent (hiç ses yok) ile no_music (ses var, müzik yok) FARKLIDIR. Kamera teknikleri buraya DEĞİL, technical_style alanına girer.`,

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
- concept: Konsept filmi. Aynı konseptin farklı dönemlerde, genellikle farklı oyuncu kadrosuyla ve birbirinden bağımsız hikâyelerle tekrar çekilmesi. Örn: James Bond serisi, Godzilla, Sherlock Holmes uyarlamaları.
- is_sequel: Kendisi bir devam filmi. Hikâye bir önceki filmin doğrudan devamıdır, aynı ana karakterler ve genellikle aynı oyuncular vardır. Örn: Mission: Impossible 2, The Godfather Part II.
- has_sequel: Bu filmin bir devam filmi çekilmiştir (kendisi ilk filmdir). Örn: Mission: Impossible (1996).
- reboot: Bir film serisinin hikâyesini veya evrenini SIFIRDAN başlatan yeni başlangıç. Önceki filmlerin olaylarını görmezden gelir. Örn: Batman Begins (2005), Casino Royale (2006). DİKKAT: Reboot, devam filmi DEĞİLDİR; remake de DEĞİLDİR.
- film_franchise: Ortak evrende geçen, birbirine bağlı birden fazla filmden oluşan marka/seri. Örn: Marvel Cinematic Universe, Star Wars, Harry Potter. DİKKAT: Franchise üyesi olmak otomatik olarak reboot, remake veya sequel olduğu anlamına GELMEZ.
- remake: Belirli bir filmin RESMİ yeniden çevrimi. Aynı hikâye, aynı ülke sinemasında, yeni oyuncularla. Örn: A Star Is Born (2018), Psycho (1998).
- series_sequel: Bir dizideki hikâyenin devamı.
- series_prequel: Bir dizideki hikâyenin öncesi.
- series_spinoff: Bir dizideki karakterlerin farklı bir hikâyesi.
- similar_script_version: Aynı hikâyeyi benzer bir senaryoyla anlatan başka bir film var.
- same_plot_diff_script: Aynı hikâyeyi farklı bir senaryoyla anlatan başka bir film var.
- same_plot_diff_angle: Aynı hikâyenin farklı bir yönünü anlatan başka bir film var.
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  color_style: `color_style: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["black_white","color","mostly_color","mostly_bw","blue_filter","yellow_filter","selective_color","colorized","limited_palette","sepia","mono_tint","bw_red_accent","mixed_bw_color"]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  location_mode: `location_mode: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["single","mostly_single","few","many"]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  aspect_ratio: `aspect_ratio: string[] — İKİ AŞAMALI:
1) ÖNCE şu slug listesinden en az birini seç (filtre eşleşmesi bunlarla yapılır): ["1:1","1.33:1","1.37:1","1.66:1","1.78:1","1.85:1","2.00:1","2.20:1","2.35:1","2.39:1","2.76:1"]
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`
};
export const SEMANTIC_FIELDS = [
  "story_period", "story_geography", "character_traits",
  "narrative_style", "narrative_pace", "production_category", "cinema_approach", "technical_style",
  "sound", "reality",
  "story_dimensions", "family_content", "season", "aspect_ratio",
  "original_work", "color_style", "location_mode"
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
