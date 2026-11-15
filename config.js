// config.js — Faz 8 Phase D revize: technical_style sadece kamera, sound'a no_music/rare_music
import { safeJSON } from "./db.js";
import { invalidatePromptCache } from "./llm.js";

const TWO_STAGE_NOTE = "İKİ AŞAMALI: (1) ÖNCE slug listesinden en az birini seç — filtre eşleşmesi bunlarla yapılır. (2) SONRA istediğin kadar serbest açıklama ekleyebilirsin — bunlar filtrelenmez, kartta bilgi olarak gösterilir.";

const DEFAULT_FILTER_INFO = {
  "filter_info.season": `[YZ bağlamı]
Hikâyenin geçtiği mevsim.
- winter: Hikâye kışın geçiyor.
- summer: Hikâye yazın geçiyor.
- spring: Hikâye ilkbaharda geçiyor.
- autumn: Hikâye sonbaharda geçiyor.
${TWO_STAGE_NOTE}`,

  "filter_info.reality": `[YZ bağlamı]
Hikâyenin gerçeklik düzeyi.
- true: Gerçek olaylara birebir sadık.
- mostly_true: Gerçek olaylara dayalı, sanatsal özgürlük var.
- inspired: Gerçek olaylardan esinlenmiş.
- realistic: Kurgusal ama gerçekçi.
- fictional: Tamamen kurgusal.
- utopic: Ütopik/distopik gelecek.
${TWO_STAGE_NOTE}`,

  "filter_info.narrative_style": `[YZ bağlamı]
FİLTRE ADI: Hikâye anlatım tarzı — ANLATI YAPISI.
- multi: Farklı hikâyelerin ayrı ayrı anlatımı (mozaik/parçalı anlatı).
- reverse: Sondan başa doğru giden hikâye.
- linear: Baştan sona doğrusal giden hikâye.
- flashback: Ara ara geriye dönüşler yapan hikâye.
- end_first: Sonu önce anlatılıp başı sonra anlatılan hikâye.
- mid_first: Ortası önce anlatılıp öncesi ve sonrası sonra anlatılan hikâye.
- no_end: Sonu olmayan (açık uçlu) hikâye.
- alt_end: Alternatif sonlu hikâye.
- alt_narr: Alternatif anlatımlı hikâye.
DİKKAT: Anlatının TEMPOSU (hızlı/yavaş) buraya DEĞİL, narrative_pace alanına girer. Anlatı yapısı (linear, flashback) ile tempo (fast, slow) farklı kavramlardır.
${TWO_STAGE_NOTE}`,

  "filter_info.narrative_pace": `[YZ bağlamı]
FİLTRE ADI: Anlatının temposu.
- fast: Çok fazla olayın olduğu hareketli hikâye. Hızlı kurgu, yüksek olay yoğunluğu, sürekli aksiyon.
- slow: Çok az olayın olduğu durgun hikâye. Yavaş tempolu, uzun planlar, minimal olay örgüsü.
DİKKAT: Anlatının YAPISI (linear, reverse, flashback, multi vb.) buraya DEĞİL, narrative_style alanına girer. Tempo (hız/yavaşlık) ve yapı (kronoloji) farklı kavramlardır. Örn: "Sondan başa anlatılan yavaş bir film" → narrative_style=reverse + narrative_pace=slow.
${TWO_STAGE_NOTE}`,

  "filter_info.production_category": `[YZ bağlamı]
FİLTRE ADI: Yapım kategorisi ve ideolojik işlev.
- amateur: Amatör yapım, çok düşük bütçe, öğrenci/amatör ekip.
- indie: Bağımsız film, stüdyo dışı, küçük bütçeli.
- big: Büyük prodüksiyon, 100M$+ bütçe, geniş ekip.
- bmovie: Düşük bütçeli tür sineması (B movie).
- studio: Klasik stüdyo filmi (Hollywood/benzeri).
- propaganda: İdeolojik/propaganda amaçlı film. Filmin ÜRETİM BİÇİMİ değil, ideolojik ve iletişimsel İŞLEVİ vurgulanır. Politik/ideolojik mesaj iletmek için üretilmiş yapımlar.
DİKKAT: Sanat filmi, avangart, Dogme 95 gibi sinemasal akımlar/yaklaşımlar buraya DEĞİL, cinema_approach alanına girer. El kamerası, müziksiz film gibi teknikler buraya DEĞİL, technical_style ve sound alanlarına girer.
${TWO_STAGE_NOTE}`,

  "filter_info.cinema_approach": `[YZ bağlamı]
FİLTRE ADI: Sinemasal akım, gelenek veya yaklaşım.
- art: Sanat filmi, deneysel anlatım, festival odaklı, "art-house" geleneği.
- avant: Avangart film, deneysel/anti-anlatı, biçimsel yenilik arayışı.
- dogme: Dogme 95 manifestosuna uygun (Lars von Trier & Thomas Vinterberg, 1995), sade üretim kurallarına bağlı.
DİKKAT: Film TÜRÜ (dram, komedi) ve yapım BÜYÜKLÜĞÜ (indie, big) buraya DEĞİL. Bir teknik (el kamerası) tek başına bu alana kanıt DEĞİLDİR; belirli bir akıma (Dogme 95) üyelik ayrıca değerlendirilmelidir.
${TWO_STAGE_NOTE}`,

  "filter_info.technical_style": `[YZ bağlamı]
FİLTRE ADI: Teknik ve biçimsel tercihler — KAMERA KULLANIM TEKNİKLERİ.
- handheld: El kamerası — kameranın operatör tarafından elde taşınması (found footage, cinéma vérité, mockumentary vb.).
- static_camera: Sabit kamera — kameranın sabit konumda kullanılması, hareket etmemesi.
- tracking_shot: Takip çekimi — kameranın karakteri veya nesneyi takip etmesi.
- steadicam: Steadicam — hareket sırasında dengeli ve akıcı görüntü elde edilmesi.
- crane_shot: Vinç çekimi — kameranın vinç veya jib sistemiyle yükselip alçalması.
- aerial_shot: Havadan çekim — drone, helikopter veya benzeri araçlarla yapılan çekim.
- zoom: Zoom kullanımı — optik yakınlaştırma ve uzaklaştırmanın belirgin kullanımı.
- pan_tilt: Pan / tilt — kameranın yatay veya dikey eksende döndürülmesi.
SINIFLANDIRMA İLKESİ: Bir tekniğin filmde yalnızca bir defa görülmesi, filmin o teknikle sınıflandırılması için yeterli sayılmamalı. Tekniğin filmin genel görsel anlatımında belirgin ve tekrarlanan bir kullanımının bulunması aranmalı. Gerektiğinde birden fazla teknik aynı filme atanabilir.
DİKKAT: SADECE KAMERA kullanım teknikleri. Ses/müzik buraya DEĞİL, sound alanına girer.
${TWO_STAGE_NOTE}`,

  "filter_info.sound": `[YZ bağlamı]
FİLTRE ADI: Filmde ses ve müzik kullanımı.
- ambient: Sürekli doğal ortam gürültüsü.
- music: Yoğun müzik kullanımı — film boyunca belirgin ve sürekli müzik.
- rare_music: Nadir/az müzikli film — müzik sadece kritik anlarda kullanılmış.
- no_music: Müziksiz film — film boyunca hiç müzik kullanılmamış (ses var: diyalog, efekt, ambient).
- effects: Yoğun gürültülü efekt kullanımı.
- voiceover_ext: Dış ses kullanımı (anlatıcı).
- voiceover_int: İç ses kullanımı (karakterin düşünceleri).
- silent: Sessiz film — hiç ses yok (no_music'ten FARKLI; no_music'te ses var ama müzik yok).
- dubbed: Ses dublajı çoğunlukla stüdyoda yapılmış.
DİKKAT: silent (hiç ses yok) ile no_music (ses var, müzik yok) FARKLIDIR. Kamera teknikleri buraya DEĞİL, technical_style alanına girer.
${TWO_STAGE_NOTE}`,

  "filter_info.story_geography": `[YZ bağlamı]
Hikâyenin coğrafyası.
- city: Şehir.
- town: Kasaba.
- village: Köy.
- mountain: Dağlık ve yüksek kesimler.
- desert: Çöl.
- steppe: Bozkır.
- forest: Orman.
- seaside: Deniz kenarı.
- riverside: Nehir kenarı.
- opensea: Açık deniz.
- air: Havada geçen.
${TWO_STAGE_NOTE}`,

  "filter_info.character_traits": `[YZ bağlamı]
FİLTRE ADI: Hikâyedeki karakter niteliği.
İKİ AŞAMALI:
1) ÖNCE zorunlu 17 slug listesinden en az birini seç — filtre eşleşmesi bunlarla yapılır:
   male_main, female_main, child_main, lgbt_main, male_support, female_support, child_support, lgbt_support, male_extra, female_extra, child_extra, lgbt_extra, young_main, middle_main, old_main, disabled_main, animal
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin (örn: "erkek dedektif", "yozlaşmış polis", "kadın avukat") — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  "filter_info.story_dimensions": `[YZ bağlamı]
FİLTRE ADI: Filmin diğer filmlerle ilgisi.
İKİ AŞAMALI:
1) ÖNCE şu 12 slug listesinden en az birini seç — filtre eşleşmesi bunlarla yapılır:
   has_sequel, is_sequel, series_sequel, series_prequel, series_spinoff, concept, reboot, film_franchise, remake, similar_script_version, same_plot_diff_script, same_plot_diff_angle
TANIMLAR:
- concept (Konsept filmi): Aynı konseptin farklı dönemlerde, farklı oyuncularla ve birbirinden BAĞIMSIZ hikâyelerle tekrar çekilmesi. James Bond, Godzilla, Sherlock Holmes gibi. Her film kendi başına bir hikâyedir; önceki filmin devamı DEĞİLDİR.
- is_sequel (Devam filmi): Hikâye bir önceki filmin doğrudan devamıdır; aynı ana karakterler ve genellikle aynı oyuncular vardır. Mission: Impossible 2, The Godfather Part II gibi.
- has_sequel: Bu filmin bir devam filmi çekilmiştir (kendisi ilk filmdir).
- reboot (Yeniden Başlatma): Bir film serisinin hikâyesini veya evrenini SIFIRDAN başlatan yeni başlangıç. Önceki filmlerin olaylarını görmezden gelir. Batman Begins (2005), Casino Royale (2006), Spider-Man: Homecoming (2017) gibi. DİKKAT: Reboot, devam filmi DEĞİLDİR; remake de DEĞİLDİR (belirli bir filmi değil, bir seriyi sıfırlar).
- film_franchise (Film Franchise / Film Serisi): Ortak evrende geçen, birbirine bağlı birden fazla filmden oluşan marka/seri. Marvel Cinematic Universe, Star Wars, Harry Potter, Fast & Furious gibi. DİKKAT: Franchise üyesi olmak otomatik olarak reboot, remake veya sequel olduğu anlamına GELMEZ.
- remake (Yeniden Çevrim): Belirli bir filmin RESMİ yeniden çevrimi. Aynı hikâye, aynı ülke sinemasında, yeni oyuncularla. A Star Is Born (2018), The Magnificent Seven (2016), Psycho (1998) gibi. DİKKAT: Remake, concept'ten farklıdır (concept bağımsız, remake belirli bir eserin resmi yeniden çevrimi); same_plot_diff_script'ten farklıdır (o daha genel bir ifade).
- series_sequel: Bir dizideki hikâyenin devamı.
- series_prequel: Bir dizideki hikâyenin öncesi.
- series_spinoff: Bir dizideki karakterlerin farklı bir hikâyesi.
- similar_script_version: Aynı hikâyeyi benzer bir senaryoyla anlatan başka bir film var.
- same_plot_diff_script: Aynı hikâyeyi farklı bir senaryoyla anlatan başka bir film var.
- same_plot_diff_angle: Aynı hikâyenin farklı bir yönünü anlatan başka bir film var.
2) SONRA istediğin kadar serbest açıklama ekleyebilirsin (örn: "üçlemenin ikinci filmi", "yeniden çevrim", "aynı yönetmenin önceki filmiyle bağlantılı") — bunlar filtrelenmez, kartta bilgi olarak gösterilir.`,

  "filter_info.story_period": `[YZ bağlamı]
Hikâyenin geçtiği tarihsel dönem.
- bc: Milattan önce.
- c1..c19: 1.-19. yüzyıl.
- d1900..d2020: 1900'ler..2020'ler.
- future: Gelecek.
${TWO_STAGE_NOTE}`,

  "filter_info.story_locations": `[YZ bağlamı]
Hikâyenin geçtiği yerler. Şehir, kasaba, köy, dağlık, çöl, bozkır, orman, deniz kenarı, nehir kenarı, açık deniz, hava.`,

  "filter_info.family_content": `[YZ bağlamı]
Aile rehberi. Her içerik türü için intensity ve approach.
- intensity: none=hiç yok, few=birkaç sahne, side=yan konu, main=ana konu.
- approach: bad=kötü gösteriyor, neutral=tarafsız kalıyor, legit=meşrulaştırıyor.`,

  "filter_info.color_style": `[YZ bağlamı]
Filmin görsel renk stili.
- black_white: Tamamen siyah beyaz.
- color: Tamamen renkli.
- mostly_color: Çoğunlukla renkli.
- mostly_bw: Çoğunlukla siyah beyaz.
- blue_filter: Baskın mavi tonlu.
- yellow_filter: Baskın sarı tonlu.
- selective_color: Seçici renk.
- colorized: Sonradan renklendirilmiş.
- limited_palette: Sınırlı renk paleti.
- sepia: Sepya tonu.
- mono_tint: Tek renk monokrom.
- bw_red_accent: Siyah beyaz + kırmızı vurgu.
- mixed_bw_color: Renkli ve siyah beyaz karışık.
${TWO_STAGE_NOTE}`,

  "filter_info.aspect_ratio": `[YZ bağlamı]
Filmin gerçek en-boy oranı (sinema oranları).
- 1:1 (kare format)
- 1.33:1 (klasik 4:3 televizyon)
- 1.37:1 (Akademi oranı, 1932-1952 Hollywood)
- 1.66:1 (Avrupa geniş ekran)
- 1.78:1 (16:9 HDTV)
- 1.85:1 (Amerikan geniş ekran)
- 2.00:1 (Univisium / Netflix orijinal)
- 2.20:1 (70mm Todd-AO)
- 2.35:1 (CinemaScope, klasik anamorfik)
- 2.39:1 (modern anamorfik)
- 2.76:1 (Ultra Panavision 70, çok nadir)
Eşleşme toleransı: ±0.05 (örn. 2.39:1 filtre 2.35-2.43 aralığındaki filmleri yakalar)
${TWO_STAGE_NOTE}`,

  "filter_info.original_language": `[YZ bağlamı]
FİLTRE ADI: Film dili. Kullanıcı "Sadece ana dili dikkate al" seçeneğini işaretlerse yalnızca original_language dikkate alınır; aksi halde spoken_languages da eşleştirilir.`,

  "filter_info.dialogue_density_subtitle": `Diyalog yoğunluğu altyazı metninden hesaplanır: karakter sayısı / süre_dk / 10 = yüzde.`,

  "filter_info.award": `[YZ bağlamı]
FİLTRE ADI: Ödül KAZANMA. Film bu ödülü fiilen kazanmış olmalı.
Kaynak: Wikidata P166 (award received).
Seçilen ödül, film tarafından kazanılmışsa eşleşir. Sadece aday gösterilmiş filmler bu filtrede YER ALMAZ.
${TWO_STAGE_NOTE}`,

  "filter_info.award_nom": `[YZ bağlamı]
FİLTRE ADI: Ödüle ADAY GÖSTERİLME. Film bu ödüle aday gösterilmiş olmalı (kazanmış olması gerekmez).
Kaynak: Wikidata P1411 (nominated for).
Seçilen ödüle aday gösterilmiş filmler eşleşir. Ödülü kazanan filmler de adaylık listesinde yer alıyorsa eşleşir.
${TWO_STAGE_NOTE}`,

  "filter_info.includeUnknown": `Bilinmeyen veri politikası.
- Kapalı (varsayılan): Filtre için gerekli alan bilinmiyorsa film listeden çıkarılır (kesin filtre davranışı).
- Açık: Bilinmeyen veri "bilinmiyor" olarak işaretlenir ama film listeden ÇIKARILMAZ; kullanıcı "bilinmiyor" notu ile birlikte görür.
Öneri: Yüksek kesinlik gereken filtreler (rated, award, director vb.) için kapalı; gevşek keşif için açık.`
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
