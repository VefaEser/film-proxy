// taxonomy.config.js — Birleştirici modül
// TAXONOMY_VERSION 2.0.0
// 76 alt tür + 155 klişe + 75 tema = 306 kavram
// 4 alt modülden beslenir, dışarıya tek bir API sunar.
import { SUBGENRES } from "./taxonomy.subgenres.js";
import { TROPES, TROPE_SUBTYPES } from "./taxonomy.tropes.js";
import { THEMES } from "./taxonomy.themes.js";
import { TMDB_KEYWORD_MAP, TMDB_KEYWORD_CANDIDATES, getKeywordIdsForSlug, hasKeywordForSlug } from "./taxonomy.keywords.js";

export const TAXONOMY_VERSION = "2.0.0";

// Re-export (mevcut kod uyumu için)
export { SUBGENRES, TROPES, THEMES, TROPE_SUBTYPES };
export { TMDB_KEYWORD_MAP, TMDB_KEYWORD_CANDIDATES, getKeywordIdsForSlug, hasKeywordForSlug };

// ============================================================
// KATEGORİ SETLERİ
// ============================================================
export const SUBGENRE_SLUGS = new Set(SUBGENRES.map(x => x.slug));
export const TROPE_SLUGS = new Set(TROPES.map(x => x.slug));
export const THEME_SLUGS = new Set(THEMES.map(x => x.slug));
export const ALL_TAXONOMY_SLUGS = new Set([...SUBGENRE_SLUGS, ...TROPE_SLUGS, ...THEME_SLUGS]);

// Kategori meta (frontend için)
export const TAXONOMY_CATEGORIES = [
  { key: "subgenres", label: "Alt türler",              count: SUBGENRES.length },
  { key: "tropes",    label: "Klişeler / anlatı motifleri", count: TROPES.length },
  { key: "themes",    label: "Temalar",                 count: THEMES.length }
];

// ============================================================
// YARDIMCILAR
// ============================================================

// Bir slug'ı bulur, hangi kategoride olduğunu döner.
export function findSlugCategory(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  if (SUBGENRE_SLUGS.has(s)) return "subgenres";
  if (TROPE_SLUGS.has(s)) return "tropes";
  if (THEME_SLUGS.has(s)) return "themes";
  return null;
}

// Slug geçerli mi (herhangi bir kategoride)?
export function isValidTaxonomySlug(slug) {
  return findSlugCategory(slug) !== null;
}

// Slug'ın kategoriye uygun olup olmadığını kontrol eder.
export function isValidSlugForCategory(slug, category) {
  const s = String(slug || "").trim();
  if (category === "subgenres") return SUBGENRE_SLUGS.has(s);
  if (category === "tropes") return TROPE_SLUGS.has(s);
  if (category === "themes") return THEME_SLUGS.has(s);
  return false;
}

// Name/alias araması — kullanıcı özel girişi için.
// Dönen: { category, slug, matchType } | null
export function matchUserInputToTaxonomy(input) {
  const q = String(input || "").trim().toLowerCase();
  if (!q) return null;
  const normStr = (s) => String(s || "").toLowerCase().trim();

  const tryMatch = (arr, category) => {
    // 1) Tam slug
    for (const e of arr) if (normStr(e.slug) === q) return { category, slug: e.slug, matchType: "slug" };
    // 2) Tam TR/EN ad
    for (const e of arr) {
      if (normStr(e.name_tr) === q || normStr(e.name_en) === q) return { category, slug: e.slug, matchType: "name" };
    }
    // 3) Alias
    for (const e of arr) {
      const all = [...(e.aliases_tr || []), ...(e.aliases_en || [])];
      if (all.some(a => normStr(a) === q)) return { category, slug: e.slug, matchType: "alias" };
    }
    // 4) Kısmi eşleşme (ad içinde)
    for (const e of arr) {
      if (normStr(e.name_tr).includes(q) || normStr(e.name_en).includes(q)) return { category, slug: e.slug, matchType: "partial" };
    }
    return null;
  };

  return tryMatch(SUBGENRES, "subgenres") ||
         tryMatch(TROPES, "tropes") ||
         tryMatch(THEMES, "themes");
}

// Bir kategorideki tüm slug'ları liste olarak döner.
export function getSlugsForCategory(category) {
  if (category === "subgenres") return [...SUBGENRE_SLUGS];
  if (category === "tropes") return [...TROPE_SLUGS];
  if (category === "themes") return [...THEME_SLUGS];
  return [];
}

// Bir slug'ın tüm detaylarını getirir.
export function getTaxonomyEntry(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  const cat = findSlugCategory(s);
  if (!cat) return null;
  const arr = cat === "subgenres" ? SUBGENRES : cat === "tropes" ? TROPES : THEMES;
  return arr.find(e => e.slug === s) || null;
}

// Sözlük bütünlüğü doğrulaması — startup'ta opsiyonel çağrılabilir.
export function validateTaxonomy() {
  const errors = [];
  const seenSlugs = new Set();
  const all = [...SUBGENRES, ...TROPES, ...THEMES];
  for (const e of all) {
    if (!e.slug) { errors.push(`Boş slug: ${JSON.stringify(e).slice(0, 60)}`); continue; }
    if (seenSlugs.has(e.slug)) errors.push(`Duplicate slug: ${e.slug}`);
    seenSlugs.add(e.slug);
    if (!e.name_tr || !e.name_en) errors.push(`Eksik isim: ${e.slug}`);
    if (!e.definition_tr || !e.definition_en) errors.push(`Eksik tanım: ${e.slug}`);
    if (e.subtype && !TROPE_SUBTYPES.has(e.subtype)) errors.push(`Geçersiz subtype: ${e.slug} → ${e.subtype}`);
  }
  for (const t of TROPES) if (!t.subtype) errors.push(`Subtype eksik: ${t.slug}`);
  for (const e of all) {
    for (const rel of (e.related_slugs || [])) {
      if (!seenSlugs.has(rel)) errors.push(`Geçersiz related_slug: ${e.slug} → ${rel}`);
    }
  }
  return {
    ok: errors.length === 0,
    totalSubgenres: SUBGENRES.length,
    totalTropes: TROPES.length,
    totalThemes: THEMES.length,
    total: all.length,
    keywordMapped: Object.keys(TMDB_KEYWORD_MAP).length,
    keywordCandidates: Object.keys(TMDB_KEYWORD_CANDIDATES).length,
    errors
  };
    }d_slugs: ["supernatural_horror", "witch_horror", "migration_displacement"] },
  { slug: "body_horror", name_tr: "Beden korkusu", name_en: "Body Horror",
    definition_tr: "Bedenin fiziksel dönüşümü, çürümesi veya işgali etrafında gelişen korku filmleri.",
    definition_en: "Horror films centered on bodily transformation, decay or invasion.",
    aliases_tr: ["beden korku", "vücut korku"], aliases_en: ["body horror film"], related_slugs: ["monster_horror", "mortality"] },
  { slug: "found_footage_horror", name_tr: "Buluntu görüntü korkusu", name_en: "Found Footage Horror",
    definition_tr: "Kaydedilmiş görüntü estetiğiyle (kamera, telefon, güvenlik kaydı) anlatılan korku filmleri.",
    definition_en: "Horror films told through recovered footage aesthetics (camera, phone, security recording).",
    aliases_tr: ["buluntu film", "found footage"], aliases_en: ["found footage film"], related_slugs: ["slasher", "supernatural_horror"] },
  { slug: "supernatural_horror", name_tr: "Doğaüstü korku", name_en: "Supernatural Horror",
    definition_tr: "Hayaletler, ruhlar, iblisler ve açıklanamayan doğaüstü olaylar etrafında gelişen korku filmleri.",
    definition_en: "Horror films centered on ghosts, spirits, demons and unexplained supernatural events.",
    aliases_tr: ["doğaüstü korku"], aliases_en: ["supernatural film"], related_slugs: ["vampire_horror", "witch_horror", "faith_and_doubt"] },
  { slug: "dark_comedy", name_tr: "Kara komedi", name_en: "Dark Comedy",
    definition_tr: "Ölüm, hastalık, suç gibi hassas veya ciddi konuları mizahi bir tonla işleyen komedi filmleri.",
    definition_en: "Comedy films that treat sensitive or serious subjects (death, illness, crime) with humor.",
    aliases_tr: ["siyah komedi"], aliases_en: ["black comedy"], related_slugs: ["absurdist_comedy", "political_satire"] },
  { slug: "romantic_comedy", name_tr: "Romantik komedi", name_en: "Romantic Comedy",
    definition_tr: "Merkezinde romantik bir ilişkinin gelişimi ve bu süreçteki komik durumlar olan filmler.",
    definition_en: "Films centered on the development of a romantic relationship and the comedic situations arising from it.",
    aliases_tr: ["rom-com"], aliases_en: ["romcom", "rom-com"], related_slugs: ["romantic_drama", "love_and_commitment"] },
  { slug: "absurdist_comedy", name_tr: "Absürt komedi", name_en: "Absurdist Comedy",
    definition_tr: "Anlamsızlık, mantık dışılık ve gerçeklik algısını kıran gülünç durumlarla işleyen komedi filmleri.",
    definition_en: "Comedy films built on meaninglessness, absurdity and reality-breaking humorous situations.",
    aliases_tr: ["absürd komedi"], aliases_en: ["absurd comedy", "surreal comedy"], related_slugs: ["dark_comedy"] },
  { slug: "political_satire", name_tr: "Politik hiciv", name_en: "Political Satire",
    definition_tr: "Siyasi kurumları, politikacıları veya ideolojileri alaycı ve eleştirel bir tonla işleyen filmler.",
    definition_en: "Films that criticize political institutions, politicians or ideologies through satirical and critical tone.",
    aliases_tr: ["siyasi hiciv"], aliases_en: ["political parody"], related_slugs: ["dark_comedy", "corruption", "power"] },
  { slug: "mockumentary", name_tr: "Sahte belgesel", name_en: "Mockumentary",
    definition_tr: "Belgesel estetiğiyle kurgusal olaylar anlatan, kimi zaman hicivsel komedi türü.",
    definition_en: "Fictional narratives presented in documentary style, often for satirical or comedic effect.",
    aliases_tr: ["sahte belgesel"], aliases_en: ["mock documentary", "fake documentary"], related_slugs: ["absurdist_comedy", "political_satire"] },
  { slug: "dystopian_scifi", name_tr: "Distopik bilim kurgu", name_en: "Dystopian Sci-Fi",
    definition_tr: "Baskıcı, adaletsiz veya totaliter gelecek toplumlarını merkeze alan bilim kurgu filmleri.",
    definition_en: "Sci-fi films centered on oppressive, unjust or totalitarian future societies.",
    aliases_tr: ["distopya"], aliases_en: ["dystopian film", "dystopia"], related_slugs: ["post_apocalyptic", "oppression_authoritarianism", "freedom"] },
  { slug: "post_apocalyptic", name_tr: "Kıyamet sonrası", name_en: "Post-Apocalyptic",
    definition_tr: "Büyük bir felaket veya çöküş sonrası dünyada hayatta kalmaya çalışan karakterleri merkeze alan filmler.",
    definition_en: "Films set in a world after a catastrophic event, following survivors rebuilding or struggling in the aftermath.",
    aliases_tr: ["kıyamet sonrası"], aliases_en: ["post-apocalypse"], related_slugs: ["dystopian_scifi", "survival", "humanity_and_nature"] },
  { slug: "psychological_drama", name_tr: "Psikolojik dram", name_en: "Psychological Drama",
    definition_tr: "Karakterlerin içsel çatışmaları, zihinsel süreçleri ve duygusal derinliklerine odaklanan dram filmleri.",
    definition_en: "Dramas focused on characters' inner conflicts, mental processes and emotional depths.",
    aliases_tr: ["psikolojik dram"], aliases_en: ["psychological drama film"], related_slugs: ["guilt", "memory_and_forgetting", "self_discovery"] },
  { slug: "period_drama", name_tr: "Tarihî dram", name_en: "Period Drama",
    definition_tr: "Belirli bir tarihsel dönemde geçen, dönemin atmosferini ve yaşam biçimini yansıtan dram filmleri.",
    definition_en: "Dramas set in a specific historical period, reflecting the atmosphere and way of life of that era.",
    aliases_tr: ["tarihi dram"], aliases_en: ["historical drama"], related_slugs: ["costume_drama", "confronting_the_past"] },
  { slug: "costume_drama", name_tr: "Kostüm dramı", name_en: "Costume Drama",
    definition_tr: "Özellikle 18-19. yüzyıl Avrupa'sında geçen, dönemin kıyafetleri ve sosyal yapısı etrafında gelişen dram filmleri.",
    definition_en: "Dramas particularly set in 18th-19th century Europe, centered on period costumes and social structures.",
    aliases_tr: ["kostüm filmi"], aliases_en: ["costume film", "period piece"], related_slugs: ["period_drama", "class_inequality"] },
  { slug: "biographical_drama", name_tr: "Biyografik dram", name_en: "Biographical Drama",
    definition_tr: "Gerçek bir kişinin hayatının önemli bir bölümünü veya tamamını konu edinen dram filmleri.",
    definition_en: "Dramas depicting all or a significant portion of a real person's life.",
    aliases_tr: ["biyografi filmi"], aliases_en: ["biopic", "biography film"], related_slugs: ["period_drama", "self_discovery"] },
  { slug: "family_drama", name_tr: "Aile dramı", name_en: "Family Drama",
    definition_tr: "Aile üyeleri arasındaki ilişkileri, çatışmaları ve bağları merkeze alan dram filmleri.",
    definition_en: "Dramas centered on relationships, conflicts and bonds between family members.",
    aliases_tr: ["aile filmi"], aliases_en: ["family film drama"], related_slugs: ["family_bonds", "family_conflict", "family_reconciliation"] },
  { slug: "workplace_drama", name_tr: "İş yeri dramı", name_en: "Workplace Drama",
    definition_tr: "Bir iş yerinin iç işleyişini, çalışan ilişkilerini ve kurumsal dinamikleri merkeze alan filmler.",
    definition_en: "Films centered on the inner workings of a workplace, employee relations and institutional dynamics.",
    aliases_tr: ["ofis filmi"], aliases_en: ["office drama"], related_slugs: ["class_inequality", "power"] },
  { slug: "medical_drama", name_tr: "Tıp dramı", name_en: "Medical Drama",
    definition_tr: "Hastane ortamında geçen, sağlık çalışanlarının mesleki ve insani mücadelelerini merkeze alan filmler.",
    definition_en: "Films set in hospitals, centered on medical professionals' professional and personal struggles.",
    aliases_tr: ["hastane filmi"], aliases_en: ["hospital drama"], related_slugs: ["mortality", "human_cost_of_war"] },
  { slug: "legal_thriller", name_tr: "Hukuk gerilimi", name_en: "Legal Thriller",
    definition_tr: "Bir hukuki dava veya soruşturma etrafında gelişen, adalet arayışını gerilim tonunda işleyen filmler.",
    definition_en: "Thrillers built around a legal case or investigation, portraying the pursuit of justice with suspense.",
    aliases_tr: ["hukuk filmi"], aliases_en: ["legal drama thriller"], related_slugs: ["courtroom_drama", "justice", "corruption"] },
  { slug: "whodunit", name_tr: "Gizemli cinayet", name_en: "Whodunit",
    definition_tr: "Bir cinayetin kim tarafından işlendiğinin çözülmesine odaklanan, izleyiciyi de dedektifle birlikte tahmine yönlendiren filmler.",
    definition_en: "Films focused on discovering who committed a murder, engaging the audience in solving the mystery alongside the detective.",
    aliases_tr: ["kim yaptı"], aliases_en: ["who done it", "murder mystery"], related_slugs: ["detective", "closed_circle_mystery", "everyone_is_a_suspect"] },
  { slug: "cozy_mystery", name_tr: "Rahat gizem", name_en: "Cozy Mystery",
    definition_tr: "Şiddetin arka planda kaldığı, atmosferi sıcak ve karakter odaklı gizem filmleri.",
    definition_en: "Mystery films where violence is minimized, atmosphere is warm and character-driven.",
    aliases_tr: ["rahat gizem"], aliases_en: ["cozy mystery film"], related_slugs: ["whodunit", "detective"] },
  { slug: "giallo", name_tr: "Giallo", name_en: "Giallo",
    definition_tr: "1960-70'lerde İtalya'da gelişen, görsel stil, cinayet sahneleri ve gizem etrafında şekillenen filmler.",
    definition_en: "Italian mystery-horror films from 1960s-70s known for visual style, murder sequences and mystery plots.",
    aliases_tr: ["giallo"], aliases_en: ["italian giallo"], related_slugs: ["slasher", "film_noir"] },
  { slug: "vampire_horror", name_tr: "Vampir korkusu", name_en: "Vampire Horror",
    definition_tr: "Vampirler ve onların kurbanları etrafında gelişen doğaüstü korku filmleri.",
    definition_en: "Supernatural horror films centered on vampires and their victims.",
    aliases_tr: ["vampir filmi"], aliases_en: ["vampire film"], related_slugs: ["supernatural_horror", "monster_horror"] },
  { slug: "zombie_horror", name_tr: "Zombi korkusu", name_en: "Zombie Horror",
    definition_tr: "Zombilerin dünyayı istila ettiği ve hayatta kalanların mücadelesini merkeze alan korku filmleri.",
    definition_en: "Horror films centered on zombie outbreaks and survivors' struggles.",
    aliases_tr: ["zombi filmi"], aliases_en: ["zombie film"], related_slugs: ["supernatural_horror", "post_apocalyptic", "survival"] },
  { slug: "werewolf_horror", name_tr: "Kurt adam korkusu", name_en: "Werewolf Horror",
    definition_tr: "Kurt adamlara ve onların dönüşüm süreçlerine odaklanan doğaüstü korku filmleri.",
    definition_en: "Supernatural horror films centered on werewolves and their transformations.",
    aliases_tr: ["kurt adam filmi"], aliases_en: ["werewolf film"], related_slugs: ["monster_horror", "supernatural_horror"] },
  { slug: "witch_horror", name_tr: "Cadı korkusu", name_en: "Witch Horror",
    definition_tr: "Cadılar, büyücülük ve büyü ritüelleri etrafında gelişen doğaüstü korku filmleri.",
    definition_en: "Supernatural horror films centered on witches, witchcraft and magical rituals.",
    aliases_tr: ["cadı filmi"], aliases_en: ["witchcraft film", "witch film"], related_slugs: ["folk_horror", "supernatural_horror", "faith_and_doubt"] },
  { slug: "monster_horror", name_tr: "Canavar korkusu", name_en: "Monster Horror",
    definition_tr: "Doğaüstü veya bilimsel kökenli büyük canavarlar ve onlarla mücadele etrafında gelişen korku filmleri.",
    definition_en: "Horror films built around large monsters of supernatural or scientific origin, and the fight against them.",
    aliases_tr: ["canavar filmi", "kaiju"], aliases_en: ["monster film", "creature feature"], related_slugs: ["body_horror", "humanity_and_nature"] },
  { slug: "eco_horror", name_tr: "Doğa/çevre korkusu", name_en: "Eco-Horror",
    definition_tr: "Doğanın insan faaliyetlerine verdiği tepki veya çevresel yıkım temaları etrafında gelişen korku filmleri.",
    definition_en: "Horror films built around nature's response to human action or environmental destruction.",
    aliases_tr: ["ekolojik korku"], aliases_en: ["environmental horror"], related_slugs: ["humanity_and_nature", "environmental_destruction", "monster_horror"] },
  { slug: "disaster_film", name_tr: "Felaket filmi", name_en: "Disaster Film",
    definition_tr: "Büyük ölçekli doğal veya insan kaynaklı felaketler ve onlardan kurtulma mücadelesi etrafında gelişen filmler.",
    definition_en: "Films built around large-scale natural or man-made disasters and survival efforts.",
    aliases_tr: ["felaket filmi"], aliases_en: ["disaster movie"], related_slugs: ["post_apocalyptic", "survival"] },
  { slug: "space_scifi", name_tr: "Uzay bilim kurgusu", name_en: "Space Sci-Fi",
    definition_tr: "Uzay yolculuğu, uzaylılarla temas veya yıldızlararası olaylar etrafında gelişen bilim kurgu filmleri.",
    definition_en: "Sci-fi films centered on space travel, alien contact or interstellar events.",
    aliases_tr: ["uzay filmi"], aliases_en: ["space opera", "space film"], related_slugs: ["cyberpunk", "time_travel", "humanity_and_nature"] },
  { slug: "cyberpunk", name_tr: "Siberpunk", name_en: "Cyberpunk",
    definition_tr: "Yüksek teknolojiyle örülü distopik geleceklerde, yapay zekâ, siber ağlar ve toplumsal çözülme etrafında gelişen bilim kurgu filmleri.",
    definition_en: "Sci-fi films set in dystopian futures dominated by high tech, AI, cyber networks and social decay.",
    aliases_tr: ["siberpunk"], aliases_en: ["cyber punk"], related_slugs: ["dystopian_scifi", "technology_and_humanity", "neo_noir"] },
  { slug: "steampunk", name_tr: "Steampunk", name_en: "Steampunk",
    definition_tr: "Buhar teknolojisinin egemen olduğu alternatif Viktorya dönemi veya retro-fütüristik dünyalarda geçen bilim kurgu filmleri.",
    definition_en: "Sci-fi films set in alternate Victorian or retro-futuristic worlds dominated by steam technology.",
    aliases_tr: ["buhar punk"], aliases_en: ["steam punk"], related_slugs: ["cyberpunk", "period_drama"] },
  { slug: "time_travel", name_tr: "Zaman yolculuğu", name_en: "Time Travel",
    definition_tr: "Zaman içinde yolculuk etme ve bunun hikâye ve karakterler üzerindeki sonuçları etrafında gelişen filmler.",
    definition_en: "Films built around time travel and its consequences on story and characters.",
    aliases_tr: ["zaman yolculuğu"], aliases_en: ["time travel film", "time-loop"], related_slugs: ["time_loop", "changing_the_past", "free_will_and_fate"] },
  { slug: "superhero", name_tr: "Süper kahraman filmi", name_en: "Superhero",
    definition_tr: "Olağanüstü güçlere sahip karakterlerin kahramanlık öykülerini merkeze alan filmler.",
    definition_en: "Films centered on heroic stories of characters with extraordinary powers.",
    aliases_tr: ["süper kahraman"], aliases_en: ["superhero film", "comic book movie"], related_slugs: ["chosen_one", "good_and_evil"] },
  { slug: "martial_arts", name_tr: "Dövüş sanatları filmi", name_en: "Martial Arts",
    definition_tr: "Dövüş sanatları etrafında şekillenen aksiyon ve mücadele filmleri.",
    definition_en: "Action and struggle films built around martial arts.",
    aliases_tr: ["dövüş filmi"], aliases_en: ["martial arts film", "kung fu film"], related_slugs: ["kung_fu", "samurai", "master_and_apprentice"] },
  { slug: "kung_fu", name_tr: "Kung fu filmi", name_en: "Kung Fu",
    definition_tr: "Çin dövüş sanatları geleneği etrafında gelişen, ustalık, intikam ve onur temalarını işleyen filmler.",
    definition_en: "Films built around Chinese martial arts traditions, exploring mastery, revenge and honor themes.",
    aliases_tr: ["kung fu"], aliases_en: ["kung fu film", "wuxia"], related_slugs: ["martial_arts", "master_and_apprentice"] },
  { slug: "samurai", name_tr: "Samuray filmi", name_en: "Samurai",
    definition_tr: "Japon samuray sınıfı, onur kuralları ve kılıç ustalığı etrafında gelişen filmler.",
    definition_en: "Films built around Japanese samurai class, codes of honor and sword mastery.",
    aliases_tr: ["samuray"], aliases_en: ["samurai film", "jidaigeki"], related_slugs: ["martial_arts", "honor"] },
  { slug: "spaghetti_western", name_tr: "Spagetti western", name_en: "Spaghetti Western",
    definition_tr: "1960-70'lerde çoğunlukla İtalya yapımı, minimalist anlatı ve sert atmosferle işlenen western filmleri.",
    definition_en: "Westerns mostly produced in Italy during 1960s-70s with minimalist storytelling and harsh atmosphere.",
    aliases_tr: ["spagetti western"], aliases_en: ["italian western"], related_slugs: ["contemporary_western", "revenge_thriller"] },
  { slug: "contemporary_western", name_tr: "Çağdaş western", name_en: "Contemporary Western",
    definition_tr: "Western türünün motiflerini modern zamanlarda veya modern sınır bölgelerinde yeniden yorumlayan filmler.",
    definition_en: "Films reinterpreting western genre motifs in modern times or modern frontier settings.",
    aliases_tr: ["modern western"], aliases_en: ["modern western", "neo-western"], related_slugs: ["spaghetti_western", "justice"] },
  { slug: "music_documentary", name_tr: "Müzik belgeseli", name_en: "Music Documentary",
    definition_tr: "Bir müzisyen, grup veya müzik akımını belgesel formunda inceleyen filmler.",
    definition_en: "Films exploring a musician, band or musical movement in documentary form.",
    aliases_tr: ["müzik belgeseli"], aliases_en: ["music doc"], related_slugs: ["biographical_drama"] },
  { slug: "true_crime_documentary", name_tr: "Suç belgeseli", name_en: "True Crime Documentary",
    definition_tr: "Gerçek suç olaylarını, soruşturmaları ve yargı süreçlerini belgesel formunda inceleyen filmler.",
    definition_en: "Films examining real crimes, investigations and legal processes in documentary form.",
    aliases_tr: ["gerçek suç belgeseli"], aliases_en: ["true crime doc"], related_slugs: ["serial_killer", "justice"] }
];

// ============================================================
// KLİŞELER / ANLATI MOTİFLERİ — 100
// subtype ZORUNLU. Değerler:
//   plot_device, character_archetype, relationship_pattern,
//   narrative_structure, dramatic_situation, story_motif, narrative_form
// ============================================================
export const TROPES = [
  { slug: "one_last_job", name_tr: "Son bir iş", name_en: "One Last Job", subtype: "plot_device",
    definition_tr: "Emekli olmuş veya tehlikeli işlerden uzaklaşmış bir karakterin son kez bir göreve dönmesi.",
    definition_en: "A retired or inactive character is persuaded or forced to undertake one final dangerous task.",
    aliases_tr: ["son görev", "son soygun"], aliases_en: ["one final job", "last job"],
    related_slugs: ["heist", "coming_out_of_retirement"],
    disambiguation_note: "heist alt türüyle karıştırılmamalı: heist film türüdür; one_last_job ise karakterin 'son kez' durumunu anlatan bir olay örgüsü aracıdır. coming_out_of_retirement ise sadece emeklilikten dönüş durumudur; one_last_job bu dönüşün 'son' olmasını vurgular." },
  { slug: "reluctant_hero", name_tr: "İsteksiz kahraman", name_en: "Reluctant Hero", subtype: "character_archetype",
    definition_tr: "İçine düştüğü olaylarda kahramanlık rolünü isteksizce üstlenen karakter.",
    definition_en: "A character who reluctantly takes on a heroic role after being drawn into events.",
    aliases_tr: [], aliases_en: ["unwilling hero"], related_slugs: ["call_to_adventure", "accidental_hero"] },
  { slug: "coming_out_of_retirement", name_tr: "Emeklilikten geri dönüş", name_en: "Coming Out of Retirement", subtype: "plot_device",
    definition_tr: "Uzun süre önce emekliye ayrılmış bir karakterin yeniden aktif bir role dönmesi.",
    definition_en: "A long-retired character returns to an active role.",
    aliases_tr: [], aliases_en: ["returning from retirement"], related_slugs: ["one_last_job"] },
  { slug: "odd_couple", name_tr: "Zıt karakterlerin ortaklığı", name_en: "Odd Couple", subtype: "relationship_pattern",
    definition_tr: "Mizaç, yaşam biçimi veya değerler bakımından zıt iki karakterin zorunlu ortaklığı.",
    definition_en: "Two characters with contrasting temperaments, lifestyles or values forced into partnership.",
    aliases_tr: [], aliases_en: ["mismatched pair"], related_slugs: ["buddy_film", "forced_partnership"] },
  { slug: "unlikely_alliance", name_tr: "Beklenmedik ittifak", name_en: "Unlikely Alliance", subtype: "plot_device",
    definition_tr: "Normalde müttefik olmayacak karakterlerin ortak bir amaç için iş birliği yapması.",
    definition_en: "Characters unlikely to ally cooperating for a common goal.",
    aliases_tr: [], aliases_en: [], related_slugs: ["enemies_forced_to_cooperate", "teaming_up_with_enemy"] },
  { slug: "mistaken_identity", name_tr: "Yanlış kimlik", name_en: "Mistaken Identity", subtype: "plot_device",
    definition_tr: "Bir karakterin başka biriyle karıştırılması veya yanlışlıkla başka bir kimlikle anılması.",
    definition_en: "A character is confused with someone else or mistakenly identified as another person.",
    aliases_tr: [], aliases_en: ["identity mix-up"], related_slugs: ["identical_twin_mixup", "undercover_identity"] },
  { slug: "secret_identity_revealed", name_tr: "Gizli kimliğin açığa çıkması", name_en: "Secret Identity Revealed", subtype: "plot_device",
    definition_tr: "Bir karakterin sakladığı gerçek kimliğinin hikâye içinde açığa çıkması.",
    definition_en: "A character's hidden true identity is exposed during the story.",
    aliases_tr: [], aliases_en: [], related_slugs: ["hidden_identity", "final_identity_reveal"] },
  { slug: "race_against_time", name_tr: "Zamanla yarış", name_en: "Race Against Time", subtype: "dramatic_situation",
    definition_tr: "Karakterlerin belirli bir süre içinde bir görevi tamamlamak zorunda olduğu durum.",
    definition_en: "A situation where characters must complete a task within a fixed time limit.",
    aliases_tr: [], aliases_en: ["ticking clock"], related_slugs: ["impossible_mission", "preventing_the_apocalypse"] },
  { slug: "impossible_mission", name_tr: "İmkânsız görev", name_en: "Impossible Mission", subtype: "plot_device",
    definition_tr: "Neredeyse imkânsız görünen bir görevin karakterlere verilmesi ve başarılması süreci.",
    definition_en: "Characters are assigned a near-impossible mission and attempt to accomplish it.",
    aliases_tr: [], aliases_en: [], related_slugs: ["race_against_time", "assembling_the_crew"] },
  { slug: "the_mole", name_tr: "İçeriden hain", name_en: "The Mole", subtype: "plot_device",
    definition_tr: "Bir grup veya örgüt içinde gizli bir hainin bulunması etrafında gelişen durum.",
    definition_en: "A situation built around discovering a hidden traitor within a group or organization.",
    aliases_tr: [], aliases_en: ["traitor in the ranks"], related_slugs: ["betrayed_partner", "double_agent"] },
  { slug: "double_agent", name_tr: "İkili ajan", name_en: "Double Agent", subtype: "plot_device",
    definition_tr: "Aynı anda iki karşıt taraf için çalışan bir ajanın çift taraflı oyunu.",
    definition_en: "An agent simultaneously working for two opposing sides, playing a double game.",
    aliases_tr: [], aliases_en: [], related_slugs: ["undercover_identity", "the_mole", "spy_thriller"] },
  { slug: "plan_goes_wrong", name_tr: "Planın ters gitmesi", name_en: "The Plan Goes Wrong", subtype: "plot_device",
    definition_tr: "Özenle kurulmuş bir planın beklenmedik bir aksilikle çökmesi.",
    definition_en: "A carefully constructed plan collapses due to an unexpected complication.",
    aliases_tr: [], aliases_en: ["heist gone wrong"], related_slugs: ["heist_complication", "perfect_heist_plan"] },
  { slug: "betrayed_partner", name_tr: "Ortağın ihaneti", name_en: "Betrayed Partner", subtype: "relationship_pattern",
    definition_tr: "Bir karakterin ortağı, dostu veya müttefiki tarafından ihanete uğraması.",
    definition_en: "A character is betrayed by their partner, friend or ally.",
    aliases_tr: [], aliases_en: [], related_slugs: ["betrayal", "betrayal_and_revenge"] },
  { slug: "forced_partnership", name_tr: "Zoraki ortaklık", name_en: "Forced Partnership", subtype: "relationship_pattern",
    definition_tr: "İstemeyerek bir araya getirilen iki karakterin ortak bir göreve mecbur kalması.",
    definition_en: "Two characters unwillingly brought together and forced into a shared mission.",
    aliases_tr: [], aliases_en: [], related_slugs: ["odd_couple", "unlikely_alliance"] },
  { slug: "master_and_apprentice", name_tr: "Usta ve çırak", name_en: "Master and Apprentice", subtype: "relationship_pattern",
    definition_tr: "Bir usta ile çırağı arasındaki öğretici ve dönüştürücü ilişki.",
    definition_en: "The instructive and transformative relationship between a master and an apprentice.",
    aliases_tr: ["usta çırak"], aliases_en: ["mentor and student"], related_slugs: ["surpassing_the_mentor", "martial_arts"] },
  { slug: "surpassing_the_mentor", name_tr: "Öğrencinin ustayı aşması", name_en: "Surpassing the Mentor", subtype: "story_motif",
    definition_tr: "Bir öğrencinin zamanla ustasını geride bırakacak düzeye ulaşması.",
    definition_en: "A student reaches a level where they surpass their mentor.",
    aliases_tr: [], aliases_en: ["student surpasses master"], related_slugs: ["master_and_apprentice"] },
  { slug: "chosen_one", name_tr: "Seçilmiş kişi", name_en: "The Chosen One", subtype: "character_archetype",
    definition_tr: "Kehanet, kader veya özel bir seçimle belirli bir göreve uygun görülen karakter.",
    definition_en: "A character deemed by prophecy, fate or special selection for a specific task.",
    aliases_tr: ["seçilmiş kişi"], aliases_en: ["chosen hero"], related_slugs: ["call_to_adventure", "superhero"] },
  { slug: "hidden_heir", name_tr: "Gizli mirasçı", name_en: "Hidden Heir", subtype: "plot_device",
    definition_tr: "Gerçek bir mirasçının kimliğini saklayarak yaşaması veya sonradan açığa çıkması.",
    definition_en: "A true heir living under hidden identity, or whose identity is revealed later.",
    aliases_tr: [], aliases_en: [], related_slugs: ["secret_parentage", "secret_identity_revealed"] },
  { slug: "secret_parentage", name_tr: "Gizli ebeveynlik", name_en: "Secret Parentage", subtype: "plot_device",
    definition_tr: "Bir karakterin gerçek ebeveyninin hikâye içinde açığa çıkması.",
    definition_en: "A character's true parent is revealed during the story.",
    aliases_tr: [], aliases_en: ["secret parent"], related_slugs: ["hidden_heir", "generational_family_secret"] },
  { slug: "false_accusation", name_tr: "Yanlış suçlama", name_en: "False Accusation", subtype: "dramatic_situation",
    definition_tr: "Bir karakterin işlemediği bir suçla suçlanması.",
    definition_en: "A character is accused of a crime they did not commit.",
    aliases_tr: [], aliases_en: [], related_slugs: ["framed_for_a_crime", "fugitive_protagonist"] },
  { slug: "fish_out_of_water", name_tr: "Yabancı bir dünyaya düşme", name_en: "Fish Out of Water", subtype: "dramatic_situation",
    definition_tr: "Bir karakterin alışık olmadığı bir ortama veya dünyaya düşüp uyum sağlamaya çalışması.",
    definition_en: "A character is placed in an unfamiliar environment or world and struggles to adapt.",
    aliases_tr: [], aliases_en: ["stranger in a strange land"], related_slugs: ["belonging", "alienation"] },
  { slug: "amnesia", name_tr: "Hafıza kaybı", name_en: "Amnesia", subtype: "plot_device",
    definition_tr: "Bir karakterin geçmişini veya kimliğini unutması durumu.",
    definition_en: "A character loses memory of their past or identity.",
    aliases_tr: ["hafıza kaybı"], aliases_en: ["memory loss"], related_slugs: ["memory_and_forgetting", "final_identity_reveal"] },
  { slug: "last_minute_rescue", name_tr: "Son anda kurtarılma", name_en: "Last-Minute Rescue", subtype: "dramatic_situation",
    definition_tr: "Karakterin son anda bir kurtarıcı veya beklenmedik bir olay sayesinde kurtulması.",
    definition_en: "A character is saved at the last moment by a rescuer or unexpected event.",
    aliases_tr: [], aliases_en: ["deus ex machina rescue"], related_slugs: ["heroic_sacrifice"] },
  { slug: "trapped_together", name_tr: "Kapalı yerde mahsur kalma", name_en: "Trapped Together", subtype: "dramatic_situation",
    definition_tr: "Karakterlerin kapalı bir mekânda birlikte mahsur kalmasıyla gelişen durum.",
    definition_en: "Characters are trapped together in an enclosed space, driving the situation.",
    aliases_tr: [], aliases_en: ["bottle episode"], related_slugs: ["survival", "enemies_forced_to_cooperate"] },
  { slug: "fake_relationship", name_tr: "Sahte ilişki", name_en: "Fake Relationship", subtype: "relationship_pattern",
    definition_tr: "İki karakterin başkalarını kandırmak için sahte bir ilişki yaşadığını iddia etmesi.",
    definition_en: "Two characters pretend to be in a relationship to deceive others.",
    aliases_tr: ["sahte ilişki"], aliases_en: ["fake dating"], related_slugs: ["friends_to_lovers", "romantic_comedy"] },
  { slug: "love_triangle", name_tr: "Aşk üçgeni", name_en: "Love Triangle", subtype: "relationship_pattern",
    definition_tr: "Üç karakter arasında gelişen ve birinin diğer ikisi arasında seçim yapmak zorunda kaldığı romantik durum.",
    definition_en: "A romantic situation among three characters where one must choose between the other two.",
    aliases_tr: ["aşk üçgeni"], aliases_en: [], related_slugs: ["star_crossed_lovers", "forbidden_love"] },
  { slug: "undercover_identity", name_tr: "Gizli görevde kimlik saklama", name_en: "Undercover Identity", subtype: "plot_device",
    definition_tr: "Bir karakterin bir görev için başka bir kimlik altında yaşaması.",
    definition_en: "A character lives under another identity for a mission.",
    aliases_tr: [], aliases_en: [], related_slugs: ["hidden_identity", "secret_identity_revealed", "spy_thriller"] },
  { slug: "becoming_what_you_hate", name_tr: "Kahramanın düşmanına dönüşmesi", name_en: "Becoming What You Hate", subtype: "story_motif",
    definition_tr: "Bir karakterin savaştığı kötülüğe zamanla dönüşmesi.",
    definition_en: "A character gradually becomes the very evil they fight against.",
    aliases_tr: [], aliases_en: [], related_slugs: ["hero_turns_villain", "facing_the_dark_self"] },
  { slug: "heroic_sacrifice", name_tr: "Son fedakârlık", name_en: "Heroic Sacrifice", subtype: "dramatic_situation",
    definition_tr: "Bir karakterin başkalarını kurtarmak için kendi hayatını veya önemli bir şeyi feda etmesi.",
    definition_en: "A character sacrifices their life or something precious to save others.",
    aliases_tr: [], aliases_en: ["ultimate sacrifice"], related_slugs: ["sacrifice", "last_minute_rescue"] },
  { slug: "call_to_adventure", name_tr: "Kaderin çağrısı", name_en: "Call to Adventure", subtype: "narrative_structure",
    definition_tr: "Bir karakterin sıradan yaşamından çıkıp bir maceraya adım atmasını başlatan olay.",
    definition_en: "The event that launches a character out of ordinary life into an adventure.",
    aliases_tr: [], aliases_en: ["hero's call"], related_slugs: ["chosen_one", "reluctant_hero"] },
  { slug: "vow_of_vengeance", name_tr: "İntikam yemini", name_en: "Vow of Vengeance", subtype: "plot_device",
    definition_tr: "Bir karakterin uğradığı zarar sonrası intikam almaya yemin etmesi.",
    definition_en: "A character swears vengeance after suffering harm.",
    aliases_tr: [], aliases_en: ["vengeance oath"], related_slugs: ["revenge_thriller", "cycle_of_vengeance"] },
  { slug: "accidental_hero", name_tr: "Yanlışlıkla kahraman olma", name_en: "Accidental Hero", subtype: "character_archetype",
    definition_tr: "Bir karakterin istemeden veya farkında olmadan kahraman konumuna gelmesi.",
    definition_en: "A character unintentionally becomes a hero.",
    aliases_tr: [], aliases_en: [], related_slugs: ["reluctant_hero"] },
  { slug: "underdog_triumph", name_tr: "Küçümsenen kişinin yükselişi", name_en: "Underdog Triumph", subtype: "story_motif",
    definition_tr: "Küçümsenen veya dezavantajlı bir karakterin beklenmedik bir başarı kazanması.",
    definition_en: "An underestimated or disadvantaged character unexpectedly achieves success.",
    aliases_tr: [], aliases_en: ["underdog story"], related_slugs: ["self_discovery", "underdog_triumph"] },
  { slug: "discovering_hidden_powers", name_tr: "Gücünü keşfetme", name_en: "Discovering Hidden Powers", subtype: "plot_device",
    definition_tr: "Bir karakterin kendisinde var olan gizli güçleri keşfetmesi.",
    definition_en: "A character discovers hidden powers within themselves.",
    aliases_tr: [], aliases_en: [], related_slugs: ["chosen_one", "call_to_adventure", "self_discovery"] },
  { slug: "hidden_identity", name_tr: "Kimliğini gizleyerek yaşama", name_en: "Hidden Identity", subtype: "plot_device",
    definition_tr: "Bir karakterin gerçek kimliğini saklayarak yaşaması durumu.",
    definition_en: "A character lives while concealing their true identity.",
    aliases_tr: [], aliases_en: [], related_slugs: ["undercover_identity", "secret_identity_revealed"] },
  { slug: "identical_twin_mixup", name_tr: "İkizlerin karıştırılması", name_en: "Identical Twin Mix-Up", subtype: "plot_device",
    definition_tr: "İkiz karakterlerin birbirine karıştırılması etrafında gelişen komik veya dramatik durum.",
    definition_en: "Comedic or dramatic situations arising from identical twins being confused for each other.",
    aliases_tr: [], aliases_en: ["twin swap"], related_slugs: ["mistaken_identity", "taking_anothers_place"] },
  { slug: "body_swap", name_tr: "Yer değiştiren bedenler", name_en: "Body Swap", subtype: "plot_device",
    definition_tr: "İki karakterin bilinçlerinin veya bedenlerinin yer değiştirmesi.",
    definition_en: "Two characters' consciousness or bodies are swapped.",
    aliases_tr: [], aliases_en: ["freaky friday"], related_slugs: ["mistaken_identity", "taking_anothers_place"] },
  { slug: "time_loop", name_tr: "Zaman döngüsüne sıkışma", name_en: "Time Loop", subtype: "narrative_structure",
    definition_tr: "Bir karakterin aynı zaman dilimini tekrar tekrar yaşaması.",
    definition_en: "A character repeatedly relives the same time period.",
    aliases_tr: [], aliases_en: ["groundhog day loop"], related_slugs: ["time_travel", "changing_the_past"] },
  { slug: "changing_the_past", name_tr: "Geçmişe dönerek hatayı düzeltme", name_en: "Changing the Past", subtype: "plot_device",
    definition_tr: "Bir karakterin geçmişe dönerek bir olayı veya kararı değiştirmeye çalışması.",
    definition_en: "A character travels to the past to alter an event or decision.",
    aliases_tr: [], aliases_en: [], related_slugs: ["time_travel", "time_loop", "butterfly_effect"] },
  { slug: "premonition", name_tr: "Geleceği önceden görme", name_en: "Premonition", subtype: "plot_device",
    definition_tr: "Bir karakterin geleceğe dair önseziler veya rüyalar görmesi.",
    definition_en: "A character experiences premonitions or dreams of the future.",
    aliases_tr: [], aliases_en: ["precognitive vision"], related_slugs: ["self_fulfilling_prophecy"] },
  { slug: "self_fulfilling_prophecy", name_tr: "Kehanetin gerçekleşmesi", name_en: "Self-Fulfilling Prophecy", subtype: "plot_device",
    definition_tr: "Bir kehanetin önlenmeye çalışılırken kendi kendini gerçekleştirmesi.",
    definition_en: "A prophecy becomes true because attempts to prevent it cause it.",
    aliases_tr: [], aliases_en: [], related_slugs: ["premonition", "free_will_and_fate"] },
  { slug: "preventing_the_apocalypse", name_tr: "Kıyameti önleme yarışı", name_en: "Preventing the Apocalypse", subtype: "plot_device",
    definition_tr: "Karakterlerin büyük çaplı bir yıkımı veya kıyameti durdurmaya çalışması.",
    definition_en: "Characters attempt to stop a large-scale catastrophe or apocalypse.",
    aliases_tr: [], aliases_en: ["saving the world"], related_slugs: ["race_against_time", "disaster_film"] },
  { slug: "sole_survivor", name_tr: "Felaketten tek başına kurtulma", name_en: "Sole Survivor", subtype: "dramatic_situation",
    definition_tr: "Büyük bir felaketten yalnızca bir karakterin sağ kurtulması.",
    definition_en: "Only one character survives a large catastrophe.",
    aliases_tr: [], aliases_en: [], related_slugs: ["survival", "loss_and_grief"] },
  { slug: "closed_circle_mystery", name_tr: "Kapalı mekânda katil arama", name_en: "Closed-Circle Murder Mystery", subtype: "plot_device",
    definition_tr: "Sınırlı sayıda karakterin bulunduğu kapalı bir mekânda işlenen cinayetin çözülmesi.",
    definition_en: "Solving a murder within a closed setting with a limited number of suspects.",
    aliases_tr: [], aliases_en: ["locked room mystery"], related_slugs: ["whodunit", "everyone_is_a_suspect"] },
  { slug: "everyone_is_a_suspect", name_tr: "Herkesin şüpheli olması", name_en: "Everyone Is a Suspect", subtype: "plot_device",
    definition_tr: "Bir suçta birden fazla karakterin şüpheli konumda olması.",
    definition_en: "Multiple characters are suspects in a crime.",
    aliases_tr: [], aliases_en: [], related_slugs: ["closed_circle_mystery", "whodunit"] },
  { slug: "unreliable_narrator", name_tr: "Güvenilmez anlatıcı", name_en: "Unreliable Narrator", subtype: "narrative_structure",
    definition_tr: "Anlatının güvenilir olmadığı, gerçeği çarpıttığı veya sakladığı bir anlatıcı aracılığıyla sunulması.",
    definition_en: "The narrative is presented through a narrator who distorts, hides or misrepresents the truth.",
    aliases_tr: [], aliases_en: [], related_slugs: ["hidden_narrator_motive", "plot_twist"] },
  { slug: "hidden_narrator_motive", name_tr: "Anlatıcının gerçeği saklaması", name_en: "Hidden Narrator Motive", subtype: "narrative_structure",
    definition_tr: "Anlatıcının kendi çıkarı için hikâyenin bir kısmını saklaması.",
    definition_en: "The narrator conceals part of the story for their own benefit.",
    aliases_tr: [], aliases_en: [], related_slugs: ["unreliable_narrator"] },
  { slug: "big_reveal", name_tr: "Büyük finalde gerçeklerin ortaya çıkması", name_en: "Big Reveal", subtype: "narrative_structure",
    definition_tr: "Hikâyenin sonunda kritik bir gerçeğin topluca ortaya çıkması.",
    definition_en: "A critical truth is fully revealed at the story's climax.",
    aliases_tr: [], aliases_en: ["climactic reveal"], related_slugs: ["plot_twist", "final_identity_reveal"] },
  { slug: "red_herring", name_tr: "Sahte iz / yanıltıcı ipucu", name_en: "Red Herring", subtype: "plot_device",
    definition_tr: "İzleyiciyi yanlış yöne yönlendirmek için kasıtlı olarak yerleştirilen yanıltıcı ipucu.",
    definition_en: "A misleading clue intentionally placed to draw the audience in the wrong direction.",
    aliases_tr: [], aliases_en: [], related_slugs: ["plot_twist", "whodunit"] },
  { slug: "plot_twist", name_tr: "Beklenmedik ters köşe", name_en: "Plot Twist", subtype: "narrative_structure",
    definition_tr: "Hikâyenin beklenmedik bir noktada izleyiciyi şaşırtacak biçimde yön değiştirmesi.",
    definition_en: "The story abruptly shifts direction in an unexpected way to surprise the audience.",
    aliases_tr: [], aliases_en: ["twist ending"], related_slugs: ["big_reveal", "unreliable_narrator"] },
  { slug: "foreshadowing_payoff", name_tr: "Önceden verilen ipucunun anlam kazanması", name_en: "Foreshadowing Payoff", subtype: "narrative_structure",
    definition_tr: "Hikâyenin başında verilen bir ipucu veya detayın sonradan önemli bir anlam kazanması.",
    definition_en: "A hint or detail planted early in the story gains significant meaning later.",
    aliases_tr: [], aliases_en: [], related_slugs: ["chekhovs_gun", "big_reveal"] },
  { slug: "chekhovs_gun", name_tr: "Daha önce görülen nesnenin önem kazanması", name_en: "Chekhov's Gun", subtype: "narrative_structure",
    definition_tr: "Hikâyenin erken bir sahnesinde gösterilen bir nesnenin sonradan kritik bir işlev kazanması.",
    definition_en: "An object shown in an early scene becomes critical later in the story.",
    aliases_tr: [], aliases_en: [], related_slugs: ["foreshadowing_payoff"] },
  { slug: "buried_past_revealed", name_tr: "Geçmişteki sırrın açığa çıkması", name_en: "Buried Past Revealed", subtype: "plot_device",
    definition_tr: "Uzun süredir saklanan bir geçmiş olayının hikâye içinde açığa çıkması.",
    definition_en: "A long-hidden past event is revealed during the story.",
    aliases_tr: [], aliases_en: ["dark secret revealed"], related_slugs: ["generational_family_secret", "confronting_the_past"] },
  { slug: "not_quite_dead", name_tr: "Ölmediği sanılan karakterin geri dönmesi", name_en: "Not Quite Dead", subtype: "plot_device",
    definition_tr: "Öldü sanılan bir karakterin hikâyeye geri dönmesi.",
    definition_en: "A character believed dead returns to the story.",
    aliases_tr: [], aliases_en: ["back from the dead"], related_slugs: ["fake_death", "missing_person_returns"] },
  { slug: "fake_death", name_tr: "Sahte ölüm", name_en: "Fake Death", subtype: "plot_device",
    definition_tr: "Bir karakterin ölümünün sahte olduğunun sonradan anlaşılması.",
    definition_en: "A character's death is later revealed to have been faked.",
    aliases_tr: [], aliases_en: ["faked death"], related_slugs: ["not_quite_dead", "hidden_identity"] },
  { slug: "missing_person_returns", name_tr: "Kayıp kişinin geri dönmesi", name_en: "The Return of the Missing Person", subtype: "plot_device",
    definition_tr: "Uzun süre kayıp olan bir karakterin hikâyeye geri dönmesi.",
    definition_en: "A character missing for a long time returns to the story.",
    aliases_tr: [], aliases_en: [], related_slugs: ["reunion_after_years", "not_quite_dead"] },
  { slug: "reunion_after_years", name_tr: "Yıllar sonra yeniden karşılaşma", name_en: "Reunion After Years", subtype: "relationship_pattern",
    definition_tr: "Uzun yıllar ayrı kalmış iki veya daha fazla karakterin yeniden bir araya gelmesi.",
    definition_en: "Two or more characters separated for many years meet again.",
    aliases_tr: [], aliases_en: ["long-lost reunion"], related_slugs: ["missing_person_returns", "family_reconciliation"] },
  { slug: "separated_family_reunites", name_tr: "Ayrı büyüyen aile üyelerinin buluşması", name_en: "Separated Family Reunites", subtype: "dramatic_situation",
    definition_tr: "Çeşitli nedenlerle ayrı düşmüş aile üyelerinin hikâye içinde yeniden bir araya gelmesi.",
    definition_en: "Family members separated by circumstance reunite within the story.",
    aliases_tr: [], aliases_en: [], related_slugs: ["family_reconciliation", "reunion_after_years"] },
  { slug: "child_saves_parent", name_tr: "Çocuğun ebeveynini kurtarması", name_en: "Child Saves Parent", subtype: "dramatic_situation",
    definition_tr: "Bir çocuğun ebeveynini tehlikeden kurtarması.",
    definition_en: "A child rescues their parent from danger.",
    aliases_tr: [], aliases_en: [], related_slugs: ["parent_searches_for_child", "heroic_sacrifice"] },
  { slug: "parent_searches_for_child", name_tr: "Ebeveynin çocuğunu araması", name_en: "Parent Searches for Child", subtype: "dramatic_situation",
    definition_tr: "Bir ebeveynin kayıp veya kaçırılmış çocuğunu araması.",
    definition_en: "A parent searches for a lost or abducted child.",
    aliases_tr: [], aliases_en: ["search for missing child"], related_slugs: ["child_saves_parent", "parenthood"] },
  { slug: "protector_and_ward", name_tr: "Koruyucu ile korunan arasında bağ", name_en: "Protector and Ward", subtype: "relationship_pattern",
    definition_tr: "Bir koruyucunun himayesine aldığı kişiyle geliştirdiği duygusal bağ.",
    definition_en: "The bond developed between a protector and their ward.",
    aliases_tr: [], aliases_en: ["guardian and child"], related_slugs: ["parent_searches_for_child", "master_and_apprentice"] },
  { slug: "enemies_forced_to_cooperate", name_tr: "Düşmanların birlikte hayatta kalması", name_en: "Enemies Forced to Cooperate", subtype: "dramatic_situation",
    definition_tr: "Düşman karakterlerin hayatta kalmak veya ortak bir hedef için iş birliği yapmak zorunda kalması.",
    definition_en: "Enemy characters are forced to cooperate for survival or a common goal.",
    aliases_tr: [], aliases_en: [], related_slugs: ["unlikely_alliance", "teaming_up_with_enemy"] },
  { slug: "teaming_up_with_enemy", name_tr: "Eski düşmanla iş birliği", name_en: "Teaming Up with an Enemy", subtype: "plot_device",
    definition_tr: "Bir karakterin eskiden düşmanı olan biriyle ortak bir amaç için iş birliği yapması.",
    definition_en: "A character cooperates with a former enemy for a shared goal.",
    aliases_tr: [], aliases_en: [], related_slugs: ["enemies_forced_to_cooperate", "unlikely_alliance"] },
  { slug: "betrayal_and_revenge", name_tr: "İhanete uğrayan kahramanın intikamı", name_en: "Betrayal and Revenge", subtype: "plot_device",
    definition_tr: "Bir ihanete uğrayan karakterin intikam peşine düşmesi.",
    definition_en: "A betrayed character sets out for revenge.",
    aliases_tr: [], aliases_en: [], related_slugs: ["betrayed_partner", "vow_of_vengeance", "revenge_thriller"] },
  { slug: "framed_for_a_crime", name_tr: "Suçun başkasına yüklenmesi", name_en: "Framed for a Crime", subtype: "plot_device",
    definition_tr: "Bir karakterin işlemediği bir suç için kasıtlı olarak suçlanması.",
    definition_en: "A character is deliberately set up for a crime they did not commit.",
    aliases_tr: [], aliases_en: ["set up"], related_slugs: ["false_accusation", "fugitive_protagonist"] },
  { slug: "witness_silencing", name_tr: "Tanığın susturulması", name_en: "Witness Silencing", subtype: "plot_device",
    definition_tr: "Bir tanığın susması için baskı görmesi veya susturulması.",
    definition_en: "A witness is pressured or silenced.",
    aliases_tr: [], aliases_en: ["silencing a witness"], related_slugs: ["last_witness_pursued", "corruption"] },
  { slug: "last_witness_pursued", name_tr: "Son tanığın peşine düşülmesi", name_en: "Last Witness Pursued", subtype: "plot_device",
    definition_tr: "Kritik bir tanığın peşine düşülmesi veya onu koruma mücadelesi.",
    definition_en: "The pursuit or protection of a critical witness.",
    aliases_tr: [], aliases_en: [], related_slugs: ["witness_silencing", "fugitive_protagonist"] },
  { slug: "fugitive_protagonist", name_tr: "Kaçak durumuna düşen kahraman", name_en: "Fugitive Protagonist", subtype: "dramatic_situation",
    definition_tr: "Bir karakterin yanlış suçlama veya başka bir nedenle kaçak durumuna düşmesi.",
    definition_en: "A character becomes a fugitive due to false accusation or another reason.",
    aliases_tr: [], aliases_en: ["on the run"], related_slugs: ["framed_for_a_crime", "false_accusation"] },
  { slug: "hostage_situation", name_tr: "Rehine krizi", name_en: "Hostage Situation", subtype: "dramatic_situation",
    definition_tr: "Bir veya daha fazla rehinenin tutulduğu gerilimli durum.",
    definition_en: "A tense situation where one or more hostages are held.",
    aliases_tr: [], aliases_en: [], related_slugs: ["hostage_captor_bond", "race_against_time"] },
  { slug: "hostage_captor_bond", name_tr: "Rehine ile kaçıran arasında bağ oluşması", name_en: "Hostage and Captor Bond", subtype: "relationship_pattern",
    definition_tr: "Rehine ile kaçıran arasında beklenmedik bir duygusal bağın oluşması.",
    definition_en: "An unexpected emotional bond forms between hostage and captor.",
    aliases_tr: [], aliases_en: ["stockholm syndrome"], related_slugs: ["hostage_situation"] },
  { slug: "assembling_the_crew", name_tr: "Soygun ekibinin bir araya gelmesi", name_en: "Assembling the Crew", subtype: "plot_device",
    definition_tr: "Bir soygun veya görev için uzman karakterlerin bir araya toplanması.",
    definition_en: "Specialist characters are brought together for a heist or mission.",
    aliases_tr: [], aliases_en: ["gathering the team"], related_slugs: ["heist", "perfect_heist_plan"] },
  { slug: "perfect_heist_plan", name_tr: "Kusursuz soygun planı", name_en: "Perfect Heist Plan", subtype: "plot_device",
    definition_tr: "Ayrıntılı ve kusursuz görünen bir soygun planının kurulması.",
    definition_en: "An intricate, seemingly flawless heist plan is devised.",
    aliases_tr: [], aliases_en: [], related_slugs: ["assembling_the_crew", "heist", "plan_goes_wrong"] },
  { slug: "heist_complication", name_tr: "Soygun sırasında beklenmedik engel", name_en: "Heist Complication", subtype: "plot_device",
    definition_tr: "Soygun sırasında ortaya çıkan beklenmedik bir engel veya sorun.",
    definition_en: "An unexpected obstacle or issue emerges during a heist.",
    aliases_tr: [], aliases_en: [], related_slugs: ["plan_goes_wrong", "perfect_heist_plan"] },
  { slug: "macguffin", name_tr: "Çalınan nesnenin beklenenden farklı çıkması", name_en: "The MacGuffin", subtype: "plot_device",
    definition_tr: "Karakterlerin peşine düştüğü nesnenin hikâye için sembolik veya pratik bir işlevi olan araç.",
    definition_en: "An object of pursuit that serves a symbolic or plot-driving function for the characters.",
    aliases_tr: [], aliases_en: [], related_slugs: ["race_for_same_prize", "secret_in_wrong_hands"] },
  { slug: "secret_in_wrong_hands", name_tr: "Yanlış kişiye emanet edilen sır", name_en: "Secret in the Wrong Hands", subtype: "plot_device",
    definition_tr: "Önemli bir sırrın yanlışlıkla yanlış kişinin eline geçmesi.",
    definition_en: "An important secret falls into the wrong hands.",
    aliases_tr: [], aliases_en: [], related_slugs: ["macguffin", "secret_in_wrong_hands"] },
  { slug: "race_for_same_prize", name_tr: "İki tarafın aynı hedefin peşinde olması", name_en: "Race for the Same Prize", subtype: "plot_device",
    definition_tr: "İki veya daha fazla tarafın aynı hedefe ulaşmak için yarışması.",
    definition_en: "Two or more parties compete to reach the same goal.",
    aliases_tr: [], aliases_en: [], related_slugs: ["macguffin", "race_against_time"] },
  { slug: "paying_for_mistake", name_tr: "Kahramanın kendi hatasının bedelini ödemesi", name_en: "Paying for One's Mistake", subtype: "story_motif",
    definition_tr: "Bir karakterin geçmişte yaptığı bir hatanın bedelini ödemek zorunda kalması.",
    definition_en: "A character must pay the price for a past mistake.",
    aliases_tr: [], aliases_en: [], related_slugs: ["guilt", "regret", "redemption"] },
  { slug: "no_good_deed_unpunished", name_tr: "İyilik yapanın karşılığında kötülük görmesi", name_en: "No Good Deed Goes Unpunished", subtype: "story_motif",
    definition_tr: "Bir karakterin iyi bir davranışının beklenmedik olumsuz sonuçlar doğurması.",
    definition_en: "A character's good deed leads to unexpected negative consequences.",
    aliases_tr: [], aliases_en: [], related_slugs: ["paying_for_mistake"] },
  { slug: "power_corrupts", name_tr: "Gücün insanı yozlaştırması", name_en: "Power Corrupts", subtype: "story_motif",
    definition_tr: "Bir karakterin güç kazandıkça ahlaken yozlaşması.",
    definition_en: "A character becomes morally corrupted as they gain power.",
    aliases_tr: [], aliases_en: ["absolute power corrupts"], related_slugs: ["corrupting_power", "power"],
    disambiguation_note: "corrupting_power teması, gücün yozlaştırıcı etkisini genel bir tema olarak ele alır; power_corrupts ise belirli bir karakterin güç kazanarak yozlaşmasını anlatan olay örgüsü motifidir." },
  { slug: "well_intentioned_extremist", name_tr: "Kötü karakterin haklı gerekçesi olması", name_en: "Well-Intentioned Extremist", subtype: "character_archetype",
    definition_tr: "Ahlaken tartışmalı yöntemler kullanan ama iyi niyetle hareket ettiğine inanan karakter.",
    definition_en: "A character using morally questionable means while believing themselves to be acting for good.",
    aliases_tr: [], aliases_en: [], related_slugs: ["hero_turns_villain", "moral_dilemmas"] },
  { slug: "facing_the_dark_self", name_tr: "Kahramanın kendi karanlık tarafıyla yüzleşmesi", name_en: "Facing the Dark Self", subtype: "story_motif",
    definition_tr: "Bir karakterin kendi karanlık yönleriyle veya gölge benliğiyle yüzleşmesi.",
    definition_en: "A character confronts their own dark side or shadow self.",
    aliases_tr: [], aliases_en: ["shadow self"], related_slugs: ["becoming_what_you_hate", "self_discovery"] },
  { slug: "hero_turns_villain", name_tr: "İyi karakterin kötüye dönüşmesi", name_en: "Hero Turns Villain", subtype: "character_archetype",
    definition_tr: "Kahraman olarak tanıtılan bir karakterin hikâye içinde kötü tarafa geçmesi.",
    definition_en: "A character introduced as a hero turns to the side of evil.",
    aliases_tr: [], aliases_en: ["hero's fall"], related_slugs: ["becoming_what_you_hate", "facing_the_dark_self"] },
  { slug: "villain_redemption", name_tr: "Kötü karakterin kurtuluşu", name_en: "Villain Redemption", subtype: "story_motif",
    definition_tr: "Kötü karakterin hikâye içinde kefaret ödeyerek veya iyiliğe yönelerek kurtuluşa ermesi.",
    definition_en: "A villain achieves redemption by atoning or turning to good.",
    aliases_tr: [], aliases_en: [], related_slugs: ["redemption", "heroic_sacrifice"] },
  { slug: "cycle_of_vengeance", name_tr: "İntikamın yeni bir intikam doğurması", name_en: "Cycle of Vengeance", subtype: "story_motif",
    definition_tr: "Bir intikamın yeni intikamları tetikleyerek döngü oluşturması.",
    definition_en: "One act of revenge triggers further revenge, forming a cycle.",
    aliases_tr: [], aliases_en: ["cycle of revenge"], related_slugs: ["revenge", "vow_of_vengeance"] },
  { slug: "generational_family_secret", name_tr: "Aile sırrının kuşaklar boyunca saklanması", name_en: "Generational Family Secret", subtype: "plot_device",
    definition_tr: "Bir ailenin kuşaklar boyunca sakladığı karanlık bir sır.",
    definition_en: "A dark family secret concealed across generations.",
    aliases_tr: [], aliases_en: [], related_slugs: ["buried_past_revealed", "family_conflict"] },
  { slug: "forbidden_love", name_tr: "Yasak aşk", name_en: "Forbidden Love", subtype: "relationship_pattern",
    definition_tr: "Toplumsal, ailevi veya başka bir engel nedeniyle yasaklanan romantik bir ilişki.",
    definition_en: "A romantic relationship forbidden by social, familial or other barriers.",
    aliases_tr: ["yasak aşk"], aliases_en: [], related_slugs: ["star_crossed_lovers", "forbidden_love_theme"],
    disambiguation_note: "forbidden_love trope'u, iki karakterin yasak bir ilişki yaşaması olay örgüsüdür; forbidden_love_theme ise yasak aşkın kendisini bir tema olarak inceleyen filmleri kapsar." },
  { slug: "star_crossed_lovers", name_tr: "Kavuşamayan âşıklar", name_en: "Star-Crossed Lovers", subtype: "relationship_pattern",
    definition_tr: "Dış koşullar nedeniyle bir türlü kavuşamayan âşıklar.",
    definition_en: "Lovers kept apart by external circumstances.",
    aliases_tr: [], aliases_en: ["doomed lovers"], related_slugs: ["forbidden_love", "loss_and_grief"] },
  { slug: "second_chance_romance", name_tr: "Eski sevgililerin yeniden bir araya gelmesi", name_en: "Second-Chance Romance", subtype: "relationship_pattern",
    definition_tr: "Daha önce ayrılmış iki sevgilinin ikinci bir şansla yeniden bir araya gelmesi.",
    definition_en: "Previously separated lovers reunite for a second chance.",
    aliases_tr: [], aliases_en: ["rekindled romance"], related_slugs: ["reunion_after_years", "romantic_comedy"] },
  { slug: "friends_to_lovers", name_tr: "Aşkın arkadaşlıktan doğması", name_en: "Friends to Lovers", subtype: "relationship_pattern",
    definition_tr: "Uzun süreli arkadaşlığın romantik bir ilişkiye dönüşmesi.",
    definition_en: "A long-term friendship evolves into a romance.",
    aliases_tr: [], aliases_en: [], related_slugs: ["romantic_comedy", "love_and_commitment"] },
  { slug: "opposites_attract", name_tr: "Birbirine zıt kişilerin âşık olması", name_en: "Opposites Attract", subtype: "relationship_pattern",
    definition_tr: "Birbirine zıt mizaç veya değerlere sahip iki karakterin romantik bir bağ kurması.",
    definition_en: "Two characters with opposite temperaments or values form a romantic bond.",
    aliases_tr: [], aliases_en: [], related_slugs: ["odd_couple", "romantic_comedy"] },
  { slug: "transformation_for_love", name_tr: "Aşk uğruna kimliğini veya hayatını değiştirme", name_en: "Transformation for Love", subtype: "story_motif",
    definition_tr: "Bir karakterin aşkı için kimliğini, hayat tarzını veya kendisini dönüştürmesi.",
    definition_en: "A character transforms their identity, life or self for love.",
    aliases_tr: [], aliases_en: [], related_slugs: ["love_and_commitment", "self_discovery"] },
  { slug: "miscommunication", name_tr: "Yanlış anlaşılmanın ilişkiyi bozması", name_en: "Miscommunication", subtype: "plot_device",
    definition_tr: "Bir yanlış anlaşılmanın karakterler arası ilişkiyi bozması veya geciktirmesi.",
    definition_en: "A misunderstanding disrupts or delays a relationship between characters.",
    aliases_tr: [], aliases_en: ["misunderstanding"], related_slugs: ["romantic_comedy", "second_chance_romance"] },
  { slug: "taking_anothers_place", name_tr: "Bir karakterin başkasının yerine geçmesi", name_en: "Taking Another's Place", subtype: "plot_device",
    definition_tr: "Bir karakterin başka birinin kimliğini veya rolünü üstlenmesi.",
    definition_en: "A character assumes another's identity or role.",
    aliases_tr: [], aliases_en: [], related_slugs: ["mistaken_identity", "body_swap"] },
  { slug: "chance_encounter", name_tr: "Hayatların tesadüfen kesişmesi", name_en: "Chance Encounter", subtype: "plot_device",
    definition_tr: "Karakterlerin hayatlarının beklenmedik bir tesadüfle kesişmesi.",
    definition_en: "Characters' lives intersect through unexpected coincidence.",
    aliases_tr: [], aliases_en: ["serendipity"], related_slugs: ["chain_of_coincidences", "butterfly_effect"] },
  { slug: "butterfly_effect", name_tr: "Küçük bir kararın büyük sonuçlar doğurması", name_en: "Butterfly Effect", subtype: "plot_device",
    definition_tr: "Küçük bir kararın veya olayın zincirleme büyük sonuçlara yol açması.",
    definition_en: "A small decision or event leads to cascading large consequences.",
    aliases_tr: [], aliases_en: [], related_slugs: ["chain_of_coincidences", "changing_the_past"] },
  { slug: "chain_of_coincidences", name_tr: "Birbirine bağlı görünen tesadüfler", name_en: "Chain of Coincidences", subtype: "plot_device",
    definition_tr: "Hikâyede birbirine bağlı ve anlamlı görünen tesadüfler zinciri.",
    definition_en: "A chain of interconnected, seemingly meaningful coincidences.",
    aliases_tr: [], aliases_en: [], related_slugs: ["butterfly_effect", "chance_encounter"] },
  { slug: "last_minute_confession", name_tr: "Son anda gelen itiraf", name_en: "Last-Minute Confession", subtype: "dramatic_situation",
    definition_tr: "Kritik anda gelen bir itiraf veya açıklamanın hikâyeyi dönüştürmesi.",
    definition_en: "A confession or revelation arriving at a critical moment transforms the story.",
    aliases_tr: [], aliases_en: [], related_slugs: ["big_reveal", "miscommunication"] },
  { slug: "final_identity_reveal", name_tr: "Gerçek kimliğin finalde ortaya çıkması", name_en: "Final Identity Reveal", subtype: "narrative_structure",
    definition_tr: "Bir karakterin gerçek kimliğinin hikâyenin finalinde açığa çıkması.",
    definition_en: "A character's true identity is revealed in the story's finale.",
    aliases_tr: [], aliases_en: [], related_slugs: ["big_reveal", "secret_identity_revealed"] },
  { slug: "bittersweet_ending", name_tr: "Mutlu sonun bozulması", name_en: "Bittersweet Ending", subtype: "narrative_form",
    definition_tr: "Anlatı biçimi — hem olumlu hem olumsuz sonuçlar taşıyan, duygusal açıdan karmaşık final. Olay örgüsü klişesi değil, final kurgusu sınıflandırmasıdır.",
    definition_en: "Narrative form — a finale combining positive and negative outcomes with emotional complexity. Not a plot trope, but a final-construction classification.",
    aliases_tr: ["acı-tatlı son"], aliases_en: [], related_slugs: ["loss_and_grief", "sacrifice"] },
  { slug: "open_ended_ending", name_tr: "Açık uçlu final", name_en: "Open-Ended Ending", subtype: "narrative_form",
    definition_tr: "Anlatı biçimi — hikâyenin önemli bir sonucunu kesin biçimde açıklamayan, yoruma açık final. Olay örgüsü klişesi değil, final kurgusu sınıflandırmasıdır.",
    definition_en: "Narrative form — a finale that leaves key outcomes unresolved, open to interpretation. Not a plot trope, but a final-construction classification.",
    aliases_tr: ["belirsiz son"], aliases_en: [], related_slugs: ["meaning_of_life", "free_will_and_fate"] }
];

// ============================================================
// TEMALAR — 60
// ============================================================
export const THEMES = [
  { slug: "family_bonds", name_tr: "Aile bağları", name_en: "Family Bonds",
    definition_tr: "Aile üyeleri arasındaki sevgi, sadakat ve bağlılığın filmin temel meselesi olması.",
    definition_en: "Love, loyalty and commitment between family members as the film's central concern.",
    aliases_tr: ["aile"], aliases_en: ["family ties"], related_slugs: ["family_reconciliation", "family_conflict"] },
  { slug: "family_conflict", name_tr: "Aile içi çatışma", name_en: "Family Conflict",
    definition_tr: "Aile üyeleri arasındaki anlaşmazlık ve çatışmaların filmin temel meselesi olması.",
    definition_en: "Disagreements and conflicts between family members as the central concern.",
    aliases_tr: [], aliases_en: ["familial conflict"], related_slugs: ["family_bonds", "generational_conflict"] },
  { slug: "family_reconciliation", name_tr: "Aileyle yeniden birleşme", name_en: "Family Reconciliation",
    definition_tr: "Küs veya kopmuş aile üyelerinin yeniden bir araya gelerek barışmasını konu alan tema.",
    definition_en: "Estranged family members reuniting and finding peace as the central theme.",
    aliases_tr: [], aliases_en: ["family healing"], related_slugs: ["family_bonds", "separated_family_reunites", "forgiveness"],
    disambiguation_note: "family_reconciliation bir temadır (barışma süreci); separated_family_reunites bir trope'tur (olay örgüsünde fiziksel buluşma)." },
  { slug: "generational_conflict", name_tr: "Kuşak çatışması", name_en: "Generational Conflict",
    definition_tr: "Farklı kuşakların değerleri ve yaşam biçimleri arasındaki çatışma.",
    definition_en: "Conflict between generations with differing values and lifestyles.",
    aliases_tr: [], aliases_en: [], related_slugs: ["family_conflict", "passage_of_time"] },
  { slug: "parenthood", name_tr: "Ebeveynlik ve çocuk yetiştirme", name_en: "Parenthood",
    definition_tr: "Ebeveyn olmanın sorumlulukları ve dönüştürücü deneyimi.",
    definition_en: "The responsibilities and transformative experience of being a parent.",
    aliases_tr: [], aliases_en: ["parenting"], related_slugs: ["parent_searches_for_child", "family_bonds"] },
  { slug: "sibling_relationships", name_tr: "Kardeşlik", name_en: "Sibling Relationships",
    definition_tr: "Kardeşler arasındaki bağlar, rekabetler ve dayanışma.",
    definition_en: "Bonds, rivalries and solidarity between siblings.",
    aliases_tr: [], aliases_en: ["sibling bond"], related_slugs: ["family_bonds", "family_conflict"] },
  { slug: "friendship", name_tr: "Dostluk", name_en: "Friendship",
    definition_tr: "Arkadaşlık bağlarının gücü, sınavı ve dönüştürücü etkisi.",
    definition_en: "The strength, test and transformative power of friendship.",
    aliases_tr: [], aliases_en: [], related_slugs: ["buddy_film", "loyalty"] },
  { slug: "loyalty", name_tr: "Sadakat", name_en: "Loyalty",
    definition_tr: "Bir karakterin bağlı olduğu kişi veya değerlere sadakati.",
    definition_en: "A character's loyalty to people or values they are committed to.",
    aliases_tr: [], aliases_en: ["faithfulness"], related_slugs: ["friendship", "betrayal"] },
  { slug: "betrayal", name_tr: "İhanet", name_en: "Betrayal",
    definition_tr: "Güvenin kırılması ve bir karakterin ihanete uğraması.",
    definition_en: "The breaking of trust and a character being betrayed.",
    aliases_tr: [], aliases_en: [], related_slugs: ["betrayed_partner", "loyalty"],
    disambiguation_note: "betrayal bir temadır (geniş kavram); betrayed_partner bir trope'tur (belirli karakter ilişkisi durumu)." },
  { slug: "love_and_commitment", name_tr: "Aşk ve bağlılık", name_en: "Love and Commitment",
    definition_tr: "Aşkın doğası ve ilişkilerde bağlılık üzerine temalar.",
    definition_en: "Themes on the nature of love and commitment in relationships.",
    aliases_tr: [], aliases_en: ["love"], related_slugs: ["romantic_comedy", "forbidden_love_theme"] },
  { slug: "forbidden_love_theme", name_tr: "Yasak aşk", name_en: "Forbidden Love",
    definition_tr: "Toplumsal veya ailevi yasaklar nedeniyle imkânsız hale gelen aşkın trajedisi.",
    definition_en: "The tragedy of love made impossible by social or familial prohibitions.",
    aliases_tr: ["yasak aşk"], aliases_en: [], related_slugs: ["forbidden_love", "star_crossed_lovers"],
    disambiguation_note: "forbidden_love_theme bir temadır (aşkın yasak olması meselesi); forbidden_love bir trope'tur (iki karakterin yasak ilişki yaşaması olay örgüsü)." },
  { slug: "loneliness", name_tr: "Yalnızlık", name_en: "Loneliness",
    definition_tr: "Yalnızlık duygusu ve izolasyonun insan yaşamındaki etkisi.",
    definition_en: "The feeling of loneliness and isolation's impact on human life.",
    aliases_tr: [], aliases_en: ["isolation"], related_slugs: ["alienation", "belonging"] },
  { slug: "belonging", name_tr: "Aidiyet", name_en: "Belonging",
    definition_tr: "Bir yere, gruba veya topluma ait olma arayışı.",
    definition_en: "The search for belonging to a place, group or society.",
    aliases_tr: [], aliases_en: [], related_slugs: ["loneliness", "search_for_identity"] },
  { slug: "alienation", name_tr: "Yabancılaşma", name_en: "Alienation",
    definition_tr: "Bir karakterin çevresine, topluma veya kendisine yabancılaşması.",
    definition_en: "A character becoming estranged from their surroundings, society or self.",
    aliases_tr: [], aliases_en: [], related_slugs: ["loneliness", "social_exclusion"] },
  { slug: "self_discovery", name_tr: "Kendini keşfetme", name_en: "Self-Discovery",
    definition_tr: "Bir karakterin kendi kimliğini, değerlerini ve potansiyelini keşfetme süreci.",
    definition_en: "A character's process of discovering their identity, values and potential.",
    aliases_tr: [], aliases_en: [], related_slugs: ["search_for_identity", "self_acceptance"] },
  { slug: "search_for_identity", name_tr: "Kimlik arayışı", name_en: "Search for Identity",
    definition_tr: "Bir karakterin kendi kimliğini bulma arayışı.",
    definition_en: "A character's quest to find their own identity.",
    aliases_tr: [], aliases_en: ["identity quest"], related_slugs: ["self_discovery", "belonging"] },
  { slug: "self_acceptance", name_tr: "Kendini kabul", name_en: "Self-Acceptance",
    definition_tr: "Bir karakterin kendi olduğu gibi kendini kabul etmesi.",
    definition_en: "A character accepting themselves as they are.",
    aliases_tr: [], aliases_en: [], related_slugs: ["self_discovery", "prejudice_discrimination"] },
  { slug: "prejudice_discrimination", name_tr: "Önyargı ve ayrımcılık", name_en: "Prejudice and Discrimination",
    definition_tr: "Önyargı ve ayrımcılığın bireyler ve toplum üzerindeki etkisi.",
    definition_en: "The impact of prejudice and discrimination on individuals and society.",
    aliases_tr: [], aliases_en: [], related_slugs: ["racism", "social_exclusion"] },
  { slug: "social_exclusion", name_tr: "Toplumsal dışlanma", name_en: "Social Exclusion",
    definition_tr: "Bir karakterin veya grubun toplum tarafından dışlanması.",
    definition_en: "A character or group being excluded by society.",
    aliases_tr: [], aliases_en: [], related_slugs: ["alienation", "prejudice_discrimination"] },
  { slug: "confronting_the_past", name_tr: "Geçmişle hesaplaşma", name_en: "Confronting the Past",
    definition_tr: "Bir karakterin geçmişiyle yüzleşmesi ve onunla hesaplaşması.",
    definition_en: "A character facing and reckoning with their past.",
    aliases_tr: [], aliases_en: [], related_slugs: ["memory_and_forgetting", "buried_past_revealed"] },
  { slug: "memory_and_forgetting", name_tr: "Bellek ve unutma", name_en: "Memory and Forgetting",
    definition_tr: "Belleğin doğası, hatırlama ve unutma üzerine temalar.",
    definition_en: "Themes on the nature of memory, remembering and forgetting.",
    aliases_tr: [], aliases_en: [], related_slugs: ["amnesia", "confronting_the_past"] },
  { slug: "loss_and_grief", name_tr: "Kayıp ve yas", name_en: "Loss and Grief",
    definition_tr: "Kayıp ve yasın insan yaşamındaki yeri ve dönüştürücü etkisi.",
    definition_en: "The role and transformative impact of loss and grief in human life.",
    aliases_tr: [], aliases_en: ["grief"], related_slugs: ["mortality", "hope"] },
  { slug: "mortality", name_tr: "Ölüm ve fanilik", name_en: "Mortality",
    definition_tr: "Ölümün kaçınılmazlığı ve insanın faniliği üzerine temalar.",
    definition_en: "Themes on the inevitability of death and human mortality.",
    aliases_tr: [], aliases_en: ["death"], related_slugs: ["loss_and_grief", "meaning_of_life"] },
  { slug: "hope", name_tr: "Umut", name_en: "Hope",
    definition_tr: "Zorluklar karşısında umudun korunması ve gücü.",
    definition_en: "The preservation and power of hope in the face of hardship.",
    aliases_tr: [], aliases_en: [], related_slugs: ["despair", "fear_and_courage"] },
  { slug: "despair", name_tr: "Umutsuzluk", name_en: "Despair",
    definition_tr: "Umutsuzluk ve çaresizlik duygusunun insan üzerindeki etkisi.",
    definition_en: "The impact of despair and hopelessness on the human condition.",
    aliases_tr: [], aliases_en: [], related_slugs: ["hope", "loneliness"] },
  { slug: "fear_and_courage", name_tr: "Korku ve cesaret", name_en: "Fear and Courage",
    definition_tr: "Korku ile cesaret arasındaki gerilim ve cesaretin doğası.",
    definition_en: "The tension between fear and courage, and the nature of courage.",
    aliases_tr: [], aliases_en: [], related_slugs: ["hope", "heroic_sacrifice"] },
  { slug: "guilt", name_tr: "Suçluluk", name_en: "Guilt",
    definition_tr: "Suçluluk duygusunun insan davranışı ve psikolojisi üzerindeki etkisi.",
    definition_en: "The impact of guilt on human behavior and psychology.",
    aliases_tr: [], aliases_en: [], related_slugs: ["regret", "redemption"] },
  { slug: "regret", name_tr: "Pişmanlık", name_en: "Regret",
    definition_tr: "Pişmanlık duygusu ve geçmiş kararlarla hesaplaşma.",
    definition_en: "The feeling of regret and reckoning with past decisions.",
    aliases_tr: [], aliases_en: [], related_slugs: ["guilt", "confronting_the_past"] },
  { slug: "forgiveness", name_tr: "Bağışlama", name_en: "Forgiveness",
    definition_tr: "Bağışlamanın zorluğu, dönüştürücü gücü ve sınırları.",
    definition_en: "The difficulty, transformative power and limits of forgiveness.",
    aliases_tr: [], aliases_en: [], related_slugs: ["redemption", "family_reconciliation"] },
  { slug: "redemption", name_tr: "Kefaret ve arınma", name_en: "Redemption",
    definition_tr: "Bir karakterin geçmiş hatalarından kefaret arayışı ve arınma süreci.",
    definition_en: "A character's search for atonement and purification from past wrongs.",
    aliases_tr: ["kefaret", "arınma"], aliases_en: ["atonement"], related_slugs: ["forgiveness", "villain_redemption"] },
  { slug: "revenge", name_tr: "İntikam", name_en: "Revenge",
    definition_tr: "İntikamın doğası, bedelleri ve döngüsel etkileri.",
    definition_en: "The nature, costs and cyclical impact of revenge.",
    aliases_tr: [], aliases_en: ["vengeance"], related_slugs: ["revenge_thriller", "cycle_of_vengeance"],
    disambiguation_note: "revenge bir temadır (intikamın doğası üzerine); revenge_thriller bir subgenre'dır (intikam odaklı gerilim filmleri türü)." },
  { slug: "justice", name_tr: "Adalet", name_en: "Justice",
    definition_tr: "Adaletin doğası, arayışı ve adaletsizlik karşısındaki tepkiler.",
    definition_en: "The nature and pursuit of justice, and responses to injustice.",
    aliases_tr: [], aliases_en: [], related_slugs: ["courtroom_drama", "corruption"] },
  { slug: "moral_dilemmas", name_tr: "Ahlaki ikilemler", name_en: "Moral Dilemmas",
    definition_tr: "Karakterlerin zor ahlaki seçimlerle yüzleşmesi.",
    definition_en: "Characters facing difficult moral choices.",
    aliases_tr: [], aliases_en: ["ethical dilemmas"], related_slugs: ["good_and_evil", "guilt"] },
  { slug: "good_and_evil", name_tr: "İyilik ve kötülük", name_en: "Good and Evil",
    definition_tr: "İyilik ve kötülük arasındaki çatışma ve ahlaki sınırlar.",
    definition_en: "The conflict between good and evil and moral boundaries.",
    aliases_tr: [], aliases_en: [], related_slugs: ["moral_dilemmas", "hero_turns_villain"] },
  { slug: "power", name_tr: "Güç ve iktidar", name_en: "Power",
    definition_tr: "Güç ve iktidarın doğası, kullanımı ve toplumsal etkileri.",
    definition_en: "The nature, use and social impact of power.",
    aliases_tr: [], aliases_en: [], related_slugs: ["corrupting_power", "power_corrupts"] },
  { slug: "corrupting_power", name_tr: "Gücün yozlaştırması", name_en: "Corrupting Influence of Power",
    definition_tr: "Gücün insanı ahlaken yozlaştırıcı etkisi üzerine temalar.",
    definition_en: "Themes on power's morally corrupting influence on people.",
    aliases_tr: [], aliases_en: [], related_slugs: ["power", "corruption", "power_corrupts"],
    disambiguation_note: "corrupting_power bir temadır (gücün genel yozlaştırıcı etkisi); power_corrupts bir trope'tur (belirli bir karakterin güç kazanarak yozlaşması)." },
  { slug: "corruption", name_tr: "Yolsuzluk ve yozlaşma", name_en: "Corruption",
    definition_tr: "Kurumsal veya toplumsal yolsuzluk ve yozlaşmanın etkileri.",
    definition_en: "The effects of institutional or social corruption and decay.",
    aliases_tr: [], aliases_en: [], related_slugs: ["power", "justice"] },
  { slug: "freedom", name_tr: "Özgürlük", name_en: "Freedom",
    definition_tr: "Özgürlük arayışı ve özgürlüğün bedelleri.",
    definition_en: "The pursuit of freedom and its costs.",
    aliases_tr: [], aliases_en: ["liberty"], related_slugs: ["oppression_authoritarianism", "dystopian_scifi"] },
  { slug: "oppression_authoritarianism", name_tr: "Baskı ve otoriterlik", name_en: "Oppression and Authoritarianism",
    definition_tr: "Baskıcı rejimler ve otoriter yönetimlerin bireyler üzerindeki etkisi.",
    definition_en: "The impact of oppressive regimes and authoritarian rule on individuals.",
    aliases_tr: [], aliases_en: ["authoritarianism"], related_slugs: ["freedom", "dystopian_scifi"] },
  { slug: "class_inequality", name_tr: "Sınıf eşitsizliği", name_en: "Class Inequality",
    definition_tr: "Sınıf farklılıklarının bireyler ve toplumlar üzerindeki etkisi.",
    definition_en: "The impact of class differences on individuals and societies.",
    aliases_tr: [], aliases_en: ["class divide"], related_slugs: ["poverty", "wealth_and_greed"] },
  { slug: "poverty", name_tr: "Yoksulluk", name_en: "Poverty",
    definition_tr: "Yoksulluğun bireysel ve toplumsal sonuçları.",
    definition_en: "The individual and social consequences of poverty.",
    aliases_tr: [], aliases_en: [], related_slugs: ["class_inequality", "exploitation"] },
  { slug: "wealth_and_greed", name_tr: "Zenginlik ve açgözlülük", name_en: "Wealth and Greed",
    definition_tr: "Zenginlik ve açgözlülüğün ahlaki ve toplumsal sonuçları.",
    definition_en: "The moral and social consequences of wealth and greed.",
    aliases_tr: [], aliases_en: ["greed"], related_slugs: ["class_inequality", "corruption"] },
  { slug: "exploitation", name_tr: "Sömürü", name_en: "Exploitation",
    definition_tr: "Ekonomik, sosyal veya cinsel sömürünün bireyler üzerindeki etkisi.",
    definition_en: "The impact of economic, social or sexual exploitation on individuals.",
    aliases_tr: [], aliases_en: [], related_slugs: ["poverty", "class_inequality"] },
  { slug: "social_mobility", name_tr: "Sınıf atlama ve toplumsal hareketlilik", name_en: "Social Mobility",
    definition_tr: "Bireylerin sınıflar arasında hareket etme imkânı ve sınırları.",
    definition_en: "The possibility and limits of movement between social classes.",
    aliases_tr: [], aliases_en: ["class mobility"], related_slugs: ["class_inequality", "belonging"] },
  { slug: "migration_displacement", name_tr: "Göç ve yerinden edilme", name_en: "Migration and Displacement",
    definition_tr: "Göç, sürgün ve yerinden edilmenin bireyler üzerindeki etkisi.",
    definition_en: "The impact of migration, exile and displacement on individuals.",
    aliases_tr: [], aliases_en: [], related_slugs: ["belonging", "homeland_identity"] },
  { slug: "human_cost_of_war", name_tr: "Savaşın insani bedeli", name_en: "Human Cost of War",
    definition_tr: "Savaşın bireysel ve toplumsal yıkımı.",
    definition_en: "The individual and social devastation of war.",
    aliases_tr: [], aliases_en: ["war trauma"], related_slugs: ["peace_reconciliation", "loss_and_grief"] },
  { slug: "peace_reconciliation", name_tr: "Barış ve uzlaşma", name_en: "Peace and Reconciliation",
    definition_tr: "Barış arayışı ve çatışma sonrası uzlaşma süreçleri.",
    definition_en: "The pursuit of peace and post-conflict reconciliation processes.",
    aliases_tr: [], aliases_en: [], related_slugs: ["forgiveness", "human_cost_of_war"] },
  { slug: "homeland_identity", name_tr: "Vatan ve aidiyet duygusu", name_en: "Homeland and National Identity",
    definition_tr: "Vatan, ulusal kimlik ve aidiyet duygusu üzerine temalar.",
    definition_en: "Themes on homeland, national identity and belonging.",
    aliases_tr: [], aliases_en: ["national identity"], related_slugs: ["migration_displacement", "belonging"] },
  { slug: "racism", name_tr: "Irkçılık", name_en: "Racism",
    definition_tr: "Irkçılığın bireysel ve toplumsal etkileri.",
    definition_en: "The individual and social impact of racism.",
    aliases_tr: [], aliases_en: [], related_slugs: ["prejudice_discrimination", "social_exclusion"] },
  { slug: "gender_inequality", name_tr: "Cinsiyet eşitsizliği", name_en: "Gender Inequality",
    definition_tr: "Cinsiyet temelli eşitsizlikler ve toplumsal cinsiyet dinamikleri.",
    definition_en: "Gender-based inequalities and societal gender dynamics.",
    aliases_tr: [], aliases_en: [], related_slugs: ["prejudice_discrimination", "oppression_authoritarianism"] },
  { slug: "faith_and_doubt", name_tr: "İnanç ve şüphe", name_en: "Faith and Doubt",
    definition_tr: "İnanç ve şüphe arasındaki gerilim ve inanç krizleri.",
    definition_en: "The tension between faith and doubt, and crises of belief.",
    aliases_tr: [], aliases_en: [], related_slugs: ["religion_spirituality", "supernatural_horror"] },
  { slug: "religion_spirituality", name_tr: "Din ve maneviyat", name_en: "Religion and Spirituality",
    definition_tr: "Din ve maneviyatın insan yaşamındaki rolü.",
    definition_en: "The role of religion and spirituality in human life.",
    aliases_tr: [], aliases_en: [], related_slugs: ["faith_and_doubt", "meaning_of_life"] },
  { slug: "science_and_ethics", name_tr: "Bilim ve etik", name_en: "Science and Ethics",
    definition_tr: "Bilimsel gelişmelerin etik sonuçları üzerine temalar.",
    definition_en: "Themes on the ethical implications of scientific advances.",
    aliases_tr: [], aliases_en: [], related_slugs: ["technology_and_humanity", "moral_dilemmas"] },
  { slug: "humanity_and_nature", name_tr: "İnsan ve doğa", name_en: "Humanity and Nature",
    definition_tr: "İnsanın doğayla ilişkisi, doğaya etkisi ve doğanın insan üzerindeki etkisi.",
    definition_en: "Humanity's relationship with nature, its impact on it, and nature's impact on humans.",
    aliases_tr: [], aliases_en: ["man and nature"], related_slugs: ["environmental_destruction", "survival"] },
  { slug: "environmental_destruction", name_tr: "Çevre yıkımı", name_en: "Environmental Destruction",
    definition_tr: "Çevresel yıkımın sonuçları ve insanlığın ekolojik sorumluluğu.",
    definition_en: "The consequences of environmental destruction and humanity's ecological responsibility.",
    aliases_tr: [], aliases_en: ["ecological crisis"], related_slugs: ["humanity_and_nature", "eco_horror"] },
  { slug: "technology_and_humanity", name_tr: "Teknoloji ve insanlık", name_en: "Technology and Humanity",
    definition_tr: "Teknolojinin insan yaşamına, kimliğine ve ilişkilerine etkisi.",
    definition_en: "Technology's impact on human life, identity and relationships.",
    aliases_tr: [], aliases_en: [], related_slugs: ["cyberpunk", "science_and_ethics"] },
  { slug: "free_will_and_fate", name_tr: "Özgür irade ve kader", name_en: "Free Will and Fate",
    definition_tr: "İnsanın özgür iradesi ile kader arasındaki ilişki ve gerilim.",
    definition_en: "The relationship and tension between human free will and fate.",
    aliases_tr: [], aliases_en: ["fate"], related_slugs: ["self_fulfilling_prophecy", "meaning_of_life"] },
  { slug: "passage_of_time", name_tr: "Zamanın geçişi", name_en: "Passage of Time",
    definition_tr: "Zamanın geçişi, değişim ve kalıcılık üzerine temalar.",
    definition_en: "Themes on the passage of time, change and permanence.",
    aliases_tr: [], aliases_en: ["time"], related_slugs: ["memory_and_forgetting", "mortality"] },
  { slug: "sacrifice", name_tr: "Fedakârlık", name_en: "Sacrifice",
    definition_tr: "Bir karakterin önemli bir şeyi başkaları için feda etmesi.",
    definition_en: "A character sacrificing something important for others.",
    aliases_tr: [], aliases_en: [], related_slugs: ["heroic_sacrifice", "love_and_commitment"] },
  { slug: "meaning_of_life", name_tr: "Hayatın anlamı", name_en: "Meaning of Life",
    definition_tr: "Hayatın anlamı, amaç ve varoluş üzerine temalar.",
    definition_en: "Themes on the meaning of life, purpose and existence.",
    aliases_tr: [], aliases_en: ["existentialism"], related_slugs: ["mortality", "self_discovery"] }
];

// ============================================================
// KATEGORİ SETLERİ (hızlı lookup için)
// ============================================================
export const SUBGENRE_SLUGS = new Set(SUBGENRES.map(x => x.slug));
export const TROPE_SLUGS = new Set(TROPES.map(x => x.slug));
export const THEME_SLUGS = new Set(THEMES.map(x => x.slug));
export const ALL_TAXONOMY_SLUGS = new Set([...SUBGENRE_SLUGS, ...TROPE_SLUGS, ...THEME_SLUGS]);

// Trope subtype set — whitelist
export const TROPE_SUBTYPES = new Set([
  "plot_device", "character_archetype", "relationship_pattern",
  "narrative_structure", "dramatic_situation", "story_motif", "narrative_form"
]);

// ============================================================
// TMDB KEYWORD HARİTASI
// ⚠️ BOŞ — hiçbir keyword ID doğrulanmış DEĞİLDİR.
// Kullanıcı deploy öncesi TMDB API'sinde her ID'yi doğrulamalı ve buraya eklemeli.
// Uygulama kodu BOŞ olduğunda da sorunsuz çalışır (sadece normalize + AI kullanır).
// ============================================================
export const TMDB_KEYWORD_MAP = {
  // Format: slug: [verified_keyword_id, ...]
  // Örnek (DOĞRULANMIŞ - kullanıcı ekleyecek):
  // heist: [9748],
};

// ============================================================
// TMDB KEYWORD ADAYLARI
// ⚠️ SADECE ARAŞTIRMA — uygulama mantığı BU LİSTEYİ KULLANMAZ.
// verified: false işaretli tüm ID'ler doğrulanmamıştır.
// ============================================================
export const TMDB_KEYWORD_CANDIDATES = {
  heist: [{ id: 9748, verified: false }],
  cyberpunk: [{ id: 4565, verified: false }],
  time_travel: [{ id: 4379, verified: false }],
  found_footage_horror: [{ id: 163076, verified: false }],
  vampire_horror: [{ id: 3133, verified: false }],
  zombie_horror: [{ id: 12377, verified: false }],
  werewolf_horror: [{ id: 12564, verified: false }],
  witch_horror: [{ id: 12565, verified: false }],
  slasher: [{ id: 10714, verified: false }],
  spaghetti_western: [{ id: 10291, verified: false }],
  kung_fu: [{ id: 10000, verified: false }],
  samurai: [{ id: 11111, verified: false }],
  mockumentary: [{ id: 14707, verified: false }],
  film_noir: [{ id: 3956, verified: false }],
  neo_noir: [{ id: 3957, verified: false }],
  space_scifi: [{ id: 9882, verified: false }],
  superhero: [{ id: 9715, verified: false }],
  dystopian_scifi: [{ id: 4563, verified: false }],
  post_apocalyptic: [{ id: 11017, verified: false }],
  disaster_film: [{ id: 10870, verified: false }],
  martial_arts: [{ id: 10001, verified: false }],
  road_movie: [{ id: 11046, verified: false }],
  buddy_film: [{ id: 11047, verified: false }],
  whodunit: [{ id: 10509, verified: false }],
  biographical_drama: [{ id: 9672, verified: false }]
};

// ============================================================
// YARDIMCILAR
// ============================================================

// Bir slug'ı bulur, hangi kategoride olduğunu döner.
export function findSlugCategory(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  if (SUBGENRE_SLUGS.has(s)) return "subgenres";
  if (TROPE_SLUGS.has(s)) return "tropes";
  if (THEME_SLUGS.has(s)) return "themes";
  return null;
}

// Slug geçerli mi (herhangi bir kategoride)?
export function isValidTaxonomySlug(slug) {
  return findSlugCategory(slug) !== null;
}

// Slug'ın kategoriye uygun olup olmadığını kontrol eder.
export function isValidSlugForCategory(slug, category) {
  const s = String(slug || "").trim();
  if (category === "subgenres") return SUBGENRE_SLUGS.has(s);
  if (category === "tropes") return TROPE_SLUGS.has(s);
  if (category === "themes") return THEME_SLUGS.has(s);
  return false;
}

// Name/alias araması — kullanıcı özel girişi için.
// Dönen: { category, slug, matchType } | null
export function matchUserInputToTaxonomy(input) {
  const q = String(input || "").trim().toLowerCase();
  if (!q) return null;
  const norm = (s) => String(s || "").toLowerCase().trim();

  const tryMatch = (arr, category) => {
    // 1) Tam slug
    for (const e of arr) if (norm(e.slug) === q) return { category, slug: e.slug, matchType: "slug" };
    // 2) Tam TR/EN ad
    for (const e of arr) {
      if (norm(e.name_tr) === q || norm(e.name_en) === q) return { category, slug: e.slug, matchType: "name" };
    }
    // 3) Alias
    for (const e of arr) {
      const all = [...(e.aliases_tr || []), ...(e.aliases_en || [])];
      if (all.some(a => norm(a) === q)) return { category, slug: e.slug, matchType: "alias" };
    }
    // 4) Kısmi eşleşme (ad içinde)
    for (const e of arr) {
      if (norm(e.name_tr).includes(q) || norm(e.name_en).includes(q)) return { category, slug: e.slug, matchType: "partial" };
    }
    return null;
  };

  return tryMatch(SUBGENRES, "subgenres") ||
         tryMatch(TROPES, "tropes") ||
         tryMatch(THEMES, "themes");
}

// Bir kategorideki tüm slug'ları liste olarak döner.
export function getSlugsForCategory(category) {
  if (category === "subgenres") return [...SUBGENRE_SLUGS];
  if (category === "tropes") return [...TROPE_SLUGS];
  if (category === "themes") return [...THEME_SLUGS];
  return [];
}
