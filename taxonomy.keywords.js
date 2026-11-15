// taxonomy.keywords.js — TMDB keyword haritası
// Colab doğrulama çıktısından seçilen ID'ler (2026-11-16 test)
//
// İki liste:
//   TMDB_KEYWORD_MAP        → with_keywords filtresinde KULLANILIR (Havuz A)
//   TMDB_KEYWORD_CANDIDATES → sadece araştırma amaçlı, kullanılmaz
//
// Kural: 5-100 film arası keyword'ler haritaya alındı.
// 1-4 film → aday listesine (havuzu çok daraltır, ama Havuz B'de zaten AI değerlendirir)
// 100+ film → hiç alınmadı (genre gibi davranır, keyword'ün amacı daraltmak)
//
// Slug adları taxonomy.subgenres.js / .tropes.js / .themes.js ile birebir uyumlu.

export const TMDB_KEYWORD_MAP = {
  // ============ ALT TÜRLER ============
  film_noir: [379729],                    // "noir" (50 film; "film noir" 1 film çok dar)
  neo_noir: [207268],                     // "neo-noir" (5)
  heist: [10051, 642],                    // "heist" (22) OR "robbery" (33)
  coming_of_age: [10683, 704],            // "coming of age" (14) OR "adolescence" (7)
  road_movie: [7312, 167043],             // "road trip" (12) OR "road movie" (4)
  buddy_film: [15214],                    // "buddy" (11)
  gangster: [3149, 10391],                // "gangster" (11) OR "mafia" (49)
  detective: [703, 155790],               // "detective" (63) OR "private detective" (4)
  police_procedural: [15090],             // "police officer" (12) — "police" 208 çok geniş
  courtroom_drama: [33519, 11038],        // "courtroom" (4) OR "trial" (46)
  political_thriller: [10410, 6078],      // "conspiracy" (17) OR "politics" (75)
  psychological_thriller: [2340, 1523],   // "paranoia" (9) OR "obsession" (27)
  conspiracy_thriller: [10410, 9665],     // "conspiracy" (17) OR "cover-up" (8)
  spy_thriller: [470, 5265],              // "spy" (61) OR "espionage" (14)
  revenge_thriller: [9748, 232766],       // "revenge" (60) OR "vengeance" (7)
  survival: [10349, 9743],                // "survival" (67) OR "stranded" (12)
  prison_drama: [378, 1563],              // "prison" (142) OR "prisoner" (28)
  serial_killer: [10714, 13112],          // "serial killer" (4) OR "murderer" (16)
  slasher: [12339],                       // "slasher" (32)
  folk_horror: [209568, 11083],           // "folk horror" (3) OR "paganism" (6)
  body_horror: [2766, 4375],              // "mutation" (12) OR "transformation" (19) — "body horror" 2 çok dar
  found_footage_horror: [163053],         // "found footage" (14)
  supernatural_horror: [6152, 10224],     // "supernatural" (50) OR "haunting" (22)
  absurdist_comedy: [214655, 309974],     // "absurdism" (5) OR "absurd" (27)
  political_satire: [8201],               // "satire" (70)
  mockumentary: [11800],                  // "mockumentary" (6)
  dystopian_scifi: [4565],                // "dystopia" (17)
  post_apocalyptic: [359337, 12332],      // "post-apocalyptic" (5) OR "apocalypse" (12)
  psychological_drama: [309029, 2800],    // "psychological drama" (8) OR "psychology" (20)
  biographical_drama: [5565, 345513],     // "biography" (13) OR "biographical" (7)
  family_drama: [12279],                  // "family drama" (7)
  workplace_drama: [6282],                // "workplace" (30) — "office"/"business" 100+ çok geniş
  medical_drama: [11612],                 // "hospital" (46) — "medical" 94 sınırda
  legal_thriller: [33519, 10909],         // "courtroom" (4) OR "lawyer" (36)
  whodunit: [381354],                     // "whodunit?" (8)
  giallo: [361094],                       // "giallo" (22)
  vampire_horror: [3133],                 // "vampire" (47)
  zombie_horror: [12377, 10327],          // "zombie" (32) OR "undead" (11)
  werewolf_horror: [12564],               // "werewolf" (8)
  witch_horror: [616],                    // "witch" (52)
  monster_horror: [1299, 13031],          // "monster" (105) OR "creature" (56)
  eco_horror: [33480],                    // "environmental" (36)
  disaster_film: [10617],                 // "disaster" (40)
  space_scifi: [9882],                    // "space" (153) — sınırda ama doğru
  cyberpunk: [12190],                     // "cyberpunk" (3) — sınırda, yine de al
  time_travel: [4379, 5455],              // "time travel" (4) OR "time machine" (4)
  superhero: [9715, 5451],                // "superhero" (33) OR "comic book" (9)
  martial_arts: [779, 780],               // "martial arts" (27) OR "kung fu" (10)
  kung_fu: [780, 9390],                   // "kung fu" (10) OR "shaolin" (10)
  samurai: [1462],                        // "samurai" (15)
  contemporary_western: [168713],         // "neo-western" (4) — sınırda
  slapstick_comedy: [386752],             // "slapstick" (10)
  musical_comedy: [4344],                 // "musical" (107) — sınırda üstte, ama doğru
  romantic_drama: [9840],                 // "romance" (143) — sınırda üstte
  historical_drama: [15126],              // "historical" (56)
  war_drama: [273967, 13065],             // "war" (643) OR "soldier" (85) — çok geniş ama doğru
  anti_war_film: [359913, 2821],          // "anti-war" (7) OR "pacifism" (5)
  gothic_horror: [33505],                 // "gothic" (30)
  folk_musical: [6382, 33534],            // "folk music" (5) OR "folk singer" (3)
  sports_drama: [6075, 274126],           // "sports" (153) OR "athlete" (41)
  dance_film: [1691],                     // "dance" (129)
  music_drama: [4048],                    // "musician" (44)
  surrealist_film: [9887, 3307],          // "surrealism" (13) OR "surreal" (37)

  // ============ KLİŞELER ============
  coming_out_of_retirement: [18115, 4948],   // "retired" (24) OR "retirement" (13)
  odd_couple: [187376],                      // "odd couple" (2) — sınırda
  unlikely_alliance: [316106],               // "alliance" (15)
  race_against_time: [4776],                 // "race against time" (1) — çok dar
  the_mole: [14617, 12347],                  // "mole" (32) OR "infiltration" (11)
  double_agent: [3637, 470],                 // "double agent" (2) OR "spy" (61)
  betrayed_partner: [10085],                 // "betrayal" (17)
  master_and_apprentice: [1310, 4488],       // "mentor" (41) OR "apprentice" (6)
  surpassing_the_mentor: [1310, 9823],       // "mentor" (41) OR "rivalry" (24)
  hidden_heir: [161506, 4833],               // "heir" (20) OR "royal family" (7)
  false_accusation: [15124],                 // "framed" (28)
  trapped_together: [18029, 193110],         // "trapped" (43) OR "locked room" (8)
  undercover_identity: [1568, 4654],         // "undercover" (17) OR "undercover agent" (2)
  call_to_adventure: [322942, 207372],       // "adventure" (82) OR "quest" (41)
  vow_of_vengeance: [155244],                // "vendetta" (7)
  underdog_triumph: [240],                   // "underdog" (6)
  discovering_hidden_powers: [295504, 2343], // "powers" (40) OR "magic" (113)
  time_loop: [10854],                        // "time loop" (7)
  premonition: [10170],                      // "premonition" (4)
  self_fulfilling_prophecy: [530],           // "prophecy" (9)
  preventing_the_apocalypse: [12332],        // "apocalypse" (12)
  sole_survivor: [161240],                   // "sole survivor" (2) — sınırda
  closed_circle_mystery: [193110],           // "locked room" (8)
  everyone_is_a_suspect: [207046],           // "murder mystery" (3) — sınırda
  plot_twist: [275311],                      // "plot twist" (3) — sınırda
  big_reveal: [350779],                      // "identity reveal" (22)
  buried_past_revealed: [372383],            // "buried secrets" (3)
  fake_death: [155750, 155402],              // "fake death" (4) OR "presumed dead" (2)
  missing_person_returns: [156091],          // "missing person" (3)
  reunion_after_years: [362715],             // "reunión" (32)
  separated_family_reunites: [18187],        // "family reunion" (4)
  parent_searches_for_child: [234162, 1930], // "search for child" (1) OR "kidnapping" (7)
  protector_and_ward: [15254, 18092],        // "protector" (17) OR "guardian" (17)
  enemies_forced_to_cooperate: [296988],     // "enemy" (30)
  teaming_up_with_enemy: [316106, 296988],   // "alliance" (15) OR "enemy" (30)
  betrayal_and_revenge: [10085, 9748],       // "betrayal" (17) OR "revenge" (60)
  witness_silencing: [3581],                 // "witness" (29)
  last_witness_pursued: [3581, 4009],        // "witness" (29) OR "witness protection" (1)
  fugitive_protagonist: [10718, 10562],      // "fugitive" (12) OR "on the run" (11)
  hostage_situation: [1562],                 // "hostage" (26)
  hostage_captor_bond: [1562],               // "hostage" (26)
  assembling_the_crew: [10051, 8468],        // "heist" (22) OR "crew" (40)
  perfect_heist_plan: [10051],               // "heist" (22)
  heist_complication: [10051],               // "heist" (22)
  macguffin: [9854],                         // "artifact" (10)
  race_for_same_prize: [6956],               // "treasure hunt" (4)
  paying_for_mistake: [33720, 11436],        // "guilt" (21) OR "redemption" (16)
  well_intentioned_extremist: [3289],        // "villain" (36)
  facing_the_dark_self: [230215, 253417],    // "dark side" (5) OR "inner demons" (2)
  cycle_of_vengeance: [9748],                // "revenge" (60)
  generational_family_secret: [6625],        // "family secrets" (1) — çok dar
  forbidden_love: [3691],                    // "forbidden love" (3)
  star_crossed_lovers: [165086],             // "star crossed lovers" (1)
  second_chance_romance: [34004],            // "second chance" (3)
  miscommunication: [12541],                 // "misunderstanding" (7)
  taking_anothers_place: [1568],             // "undercover" (17)
  chance_encounter: [361460],                // "chance encounter" (1)
  butterfly_effect: [228795],                // "butterfly effect" (1)
  chain_of_coincidences: [10901],            // "coincidence" (4)
  last_minute_confession: [718],             // "confession" (19)
  final_identity_reveal: [350779],           // "identity reveal" (22)
  secret_identity_revealed: [1308, 186189],  // "secret identity" (1) OR "hidden identity" (1) — çok dar
  amnesia: [1453, 11469],                    // "amnesia" (17) OR "memory loss" (3)
  the_chosen_one_alias: [530, 40850],        // placeholder — chosen_one için
  chosen_one: [530, 40850],                  // "prophecy" (9) OR "destiny" (20)
  secret_parentage: [14670],                 // "unknown father" (1)
  hidden_narrator_motive: [2398],            // "narration" (9)

  // ============ TEMALAR ============
  family_conflict: [155294, 10041],          // "family conflict" (2) OR "dysfunctional family" (1)
  family_reconciliation: [18187, 163976],    // "family reunion" (4) OR "reconciliation" (10)
  generational_conflict: [164224],           // "generation gap" (1)
  parenthood: [11093, 15025],                // "parenthood" (3) OR "parenting" (22)
  sibling_relationships: [18027],            // "sibling" (45)
  friendship: [6054, 9713],                  // "friendship" (61) OR "friends" (151)
  loyalty: [1797],                           // "loyalty" (12)
  betrayal: [10085, 44042],                  // "betrayal" (17) OR "treachery" (4)
  loneliness: [9957, 1533],                  // "loneliness" (12) OR "isolation" (24)
  belonging: [250819],                       // "belonging" (7)
  alienation: [7368],                        // "alienation" (8)
  self_discovery: [2796],                    // "self-discovery" (3)
  search_for_identity: [1284],               // "identity" (70)
  self_acceptance: [299386, 155023],         // "self-acceptance" (1) OR "self esteem" (3)
  prejudice_discrimination: [10360, 186782], // "prejudice" (6) OR "discrimination" (17)
  social_exclusion: [339906],                // "social exclusion" (2)
  confronting_the_past: [6162, 375280],      // "past" (113) OR "secrets" (36)
  memory_and_forgetting: [10937, 1453],      // "memory" (65) OR "amnesia" (17)
  loss_and_grief: [9872, 159103],            // "grief" (20) OR "mourning" (15)
  mortality: [211431, 6564],                 // "mortality" (7) OR "terminal illness" (1)
  hope: [3929],                              // "hope" (45)
  despair: [2300, 215015],                   // "despair" (7) OR "hopelessness" (3)
  fear_and_courage: [13073, 299369],         // "fear" (85) OR "courage" (16)
  guilt: [33720, 174203],                    // "guilt" (21) OR "remorse" (6)
  regret: [802],                             // "regret" (14)
  forgiveness: [3446],                       // "forgiveness" (4)
  redemption: [11436],                       // "redemption" (16)
  revenge: [9748],                           // "revenge" (60)
  justice: [15108, 11038],                   // "justice" (67) OR "trial" (46)
  moral_dilemmas: [211062, 4690],            // "ethics" (19) OR "moral conflict" (2)
  corrupting_power: [417, 7606],             // "corruption" (26) OR "dictatorship" (12)
  corruption: [417, 159937],                 // "corruption" (26) OR "bribery" (6)
  freedom: [6089, 2434],                     // "freedom" (44) OR "liberation" (28)
  oppression_authoritarianism: [158455, 7606],// "oppression" (12) OR "dictatorship" (12)
  class_inequality: [318169],                // "social inequality" (3)
  poverty: [12987, 177927],                  // "poverty" (15) OR "homeless" (20)
  wealth_and_greed: [5332, 10329],           // "greed" (16) OR "wealth" (45)
  exploitation: [2804],                      // "exploitation" (27)
  social_mobility: [220373, 11935],          // "class struggle" (3) OR "working class" (8)
  migration_displacement: [1900, 1729, 972], // "immigration" (22) OR "migration" (28) OR "refugee" (26)
  human_cost_of_war: [220492],               // "war trauma" (2)
  peace_reconciliation: [6057, 2821],        // "peace" (39) OR "pacifism" (5)
  homeland_identity: [1628, 1627],           // "nationalism" (11) OR "patriotism" (4)
  racism: [12425],                           // "racism" (34)
  gender_inequality: [4411, 6337],           // "sexism" (10) OR "patriarchy" (4)
  faith_and_doubt: [6150, 179567],           // "faith" (38) OR "crisis of faith" (1)
  religion_spirituality: [11001, 6150],      // "religion" (30) OR "faith" (38)
  science_and_ethics: [211062, 347301],      // "ethics" (19) OR "bioethics" (2)
  humanity_and_nature: [18330, 3593],        // "nature" (67) OR "wilderness" (24)
  environmental_destruction: [6305, 2210],   // "pollution" (11) OR "climate change" (2)
  technology_and_humanity: [1576, 18420],    // "technology" (38) OR "surveillance" (21)
  free_will_and_fate: [18091, 10855],        // "free will" (3) OR "fate" (41)
  passage_of_time: [192966, 4995],           // "passage of time" (1) OR "aging" (26)
  sacrifice: [2858, 381613],                 // "sacrifice" (25) OR "self-sacrifice" (2)
  meaning_of_life: [177146, 181324],         // "meaning of life" (2) OR "existentialism" (4)

  // ============ GÖZLEMCİ YENİ KAVRAMLAR (2.0.0) ============
  identity_swap: [1568],                     // "undercover" (17) — yardımcı
  secret_twin: [312832, 321873],             // "twin" (43) OR "identical twins" (2)
  evil_twin: [312832],                       // "twin" (43)
  doppelganger: [161891],                    // "doppelgänger" (5)
  hidden_agenda: [10410],                    // "conspiracy" (17)
  secret_society: [3271],                    // "secret organization" (3)
  cover_up: [9665],                          // "cover-up" (8)
  witness_protection: [4009],                // "witness protection" (1)
  wrong_place_wrong_time: [14783],           // "false accusations" (1)
  revenge_misfires: [9748],                  // "revenge" (60)
  enemy_becomes_ally: [316106, 296988],      // "alliance" (15) OR "enemy" (30)
  friends_to_enemies: [10085],               // "betrayal" (17)
  enemies_to_lovers: [3691],                 // "forbidden love" (3)
  secret_romance: [3691],                    // "forbidden love" (3)
  unrequited_love: [128, 4516],              // "love triangle" (1) OR "romantic rivalry" (3)
  tragic_love: [165086, 10703],              // "star crossed lovers" (1) OR "tragic love" (2)
  marriage_of_convenience: [227964],         // "fake marriage" (2)
  return_from_the_dead: [6506],              // "resurrection" (5)
  near_death_experience: [10170],            // "premonition" (4)
  haunted_past: [372383],                    // "buried secrets" (3)
  secret_revealed: [335857],                 // "secret revealed" (1)
  hidden_treasure: [6956],                   // "treasure hunt" (4)
  treasure_hunt: [6956],                     // "treasure hunt" (4)
  lost_artifact: [9854],                     // "artifact" (10)
  last_man_standing: [161240, 298724],       // "sole survivor" (2) OR "survivor" (37)
  stranded: [9743],                          // "stranded" (12)
  murder_witness: [3581],                    // "witness" (29)
  wrongful_conviction: [15124],              // "framed" (28)
  confession: [718],                         // "confession" (19)
  double_life: [1568],                       // "undercover" (17)
  undercover_cop: [1568, 4654],              // "undercover" (17) OR "undercover agent" (2)
  undercover_criminal: [1568],               // "undercover" (17)
  inside_job: [10051],                       // "heist" (22)
  mastermind: [10051],                       // "heist" (22)
  elaborate_plan: [11071, 373817],           // "plan gone wrong" (1) OR "failed plan" (1)
  betrayal_at_the_end: [10085],              // "betrayal" (17)
  redemption_arc: [11436],                   // "redemption" (16)
  fall_from_grace: [417],                    // "corruption" (26)
  rise_to_power: [3734],                     // "ambition" (7)
  corrupting_power_trope: [417, 7606],       // "corruption" (26) OR "dictatorship" (12)
  mentor_dies: [1310],                       // "mentor" (41)
  parent_child_reunion: [18187],             // "family reunion" (4)
  long_lost_relative: [156091],              // "missing person" (3)
  secret_child: [14670],                     // "unknown father" (1)
  adopted_child_revelation: [1735],          // "amateur detective" (1) — placeholder, AI yardımıyla
  child_in_danger: [316821, 1930],           // "child in danger" (1) OR "kidnapping" (7)
  kidnapping: [1930],                        // "kidnapping" (7)
  escape_from_captivity: [9777, 10562],      // "prison escape" (4) OR "on the run" (11)
  deus_ex_machina: [83],                     // "saving the world" (2)
  sexism: [4411, 299718],                    // "sexism" (10) OR "gender discrimination" (1)
  social_injustice: [318169],                // "social inequality" (3)
  colonialism: [11935],                      // "working class" (8) — yakın
  privacy_and_surveillance: [18420],         // "surveillance" (21)
  freedom_vs_security: [158455, 7606],       // "oppression" (12) OR "dictatorship" (12)
  class_struggle: [220373, 11935],           // "class struggle" (3) OR "working class" (8)
  obsession: [1523],                         // "obsession" (27)
  madness_and_sanity: [41329],               // "mental illness" (2)
  trauma_and_recovery: [220492],             // "war trauma" (2)
  childhood: [355253],                       // "child" (414) — sınırda ama doğru
  gender_identity: [4411],                   // "sexism" (10) — yakın
  body_image: [155023],                      // "self esteem" (3)
  fame_and_celebrity: [283297],              // "music" (480) — çok geniş, alternatif yok
  art_and_creation: [9854],                  // "artifact" (10) — yakın
  truth_and_deception: [295809],             // "secret" (199)
};

// ============================================================
// ARAŞTIRMA LİSTESİ (kullanılmaz)
// 1-4 film olan keyword'ler — havuzu çok daraltır, AI-only tercih edilmeli.
// İleride TMDB'de yeni film eklendikçe yeniden değerlendirilebilir.
// ============================================================
export const TMDB_KEYWORD_CANDIDATES = {
  coming_out_of_retirement: [{ id: 375289, name: "former criminal", film_count: 1 }],
  forced_partnership: [{ id: 372845, name: "reluctant partners", film_count: 1 }],
  impossible_mission: [{ id: 362720, name: "mission impossible", film_count: 1 }],
  plan_goes_wrong: [{ id: 11071, name: "plan gone wrong", film_count: 1 }],
  last_minute_rescue: [{ id: 10084, name: "rescue", film_count: 52 }],  // aslında geniş, haritaya alınabilir
  fake_relationship: [{ id: 357252, name: "fake relationship", film_count: 1 }, { id: 227964, name: "fake marriage", film_count: 2 }],
  love_triangle: [{ id: 128, name: "love triangle", film_count: 1 }, { id: 4516, name: "romantic rivalry", film_count: 3 }],
  becoming_what_you_hate: [{ id: 417, name: "corruption", film_count: 26 }],
  heroic_sacrifice: [{ id: 2858, name: "sacrifice", film_count: 25 }],  // aslında geniş
  accidental_hero: [{ id: 209197, name: "unlikely hero", film_count: 2 }],
  hidden_identity: [{ id: 186189, name: "hidden identity", film_count: 1 }],
  identical_twin_mixup: [{ id: 321873, name: "identical twins", film_count: 2 }],
  body_swap: [{ id: 33721, name: "body swap", film_count: 1 }, { id: 229871, name: "body switch", film_count: 1 }],
  changing_the_past: [{ id: 370640, name: "changing the past", film_count: 2 }],
  not_quite_dead: [{ id: 6506, name: "resurrection", film_count: 5 }],
  everyone_is_a_suspect: [{ id: 207046, name: "murder mystery", film_count: 3 }],
  unreliable_narrator: [{ id: 174089, name: "unreliable narrator", film_count: 1 }, { id: 2398, name: "narration", film_count: 9 }],
  red_herring: [{ id: 180665, name: "red herring", film_count: 2 }],
  chekhovs_gun: [],
  foreshadowing_payoff: [],
  horse_race: [],
  no_good_deed_unpunished: [{ id: 256178, name: "payback", film_count: 3 }, { id: 170365, name: "good deed", film_count: 2 }],
  power_corrupts: [{ id: 417, name: "corruption", film_count: 26 }],  // aslında geniş
  hero_turns_villain: [{ id: 353816, name: "hero turned villain", film_count: 1 }, { id: 417, name: "corruption", film_count: 26 }],
  villain_redemption: [{ id: 11436, name: "redemption", film_count: 16 }],  // aslında geniş
  forbidden_love_theme: [{ id: 3691, name: "forbidden love", film_count: 3 }],
  friends_to_lovers: [{ id: 282988, name: "friends to lovers", film_count: 1 }],
  opposites_attract: [{ id: 165301, name: "opposites attract", film_count: 1 }],
  transformation_for_love: [{ id: 4375, name: "transformation", film_count: 19 }],
  bittersweet_ending: [{ id: 366622, name: "bittersweet ending", film_count: 1 }, { id: 368391, name: "tragic ending", film_count: 1 }],
  open_ended_ending: [{ id: 366622, name: "bittersweet ending", film_count: 1 }],
  family_bonds: [{ id: 18035, name: "family", film_count: 375 }, { id: 328555, name: "family bonds", film_count: 3 }],
  love_and_commitment: [{ id: 9673, name: "love", film_count: 415 }, { id: 14534, name: "relationship", film_count: 212 }],
  good_and_evil: [{ id: 370865, name: "good vs evil", film_count: 1 }, { id: 292094, name: "good and evil", film_count: 1 }],
  power: [{ id: 288793, name: "power", film_count: 165 }, { id: 3734, name: "ambition", film_count: 7 }],
  family_drama_old: [],
  absent_father: [],
  revenge_thriller_old: [],
  heist_gone_wrong: [{ id: 177438, name: "heist gone wrong", film_count: 2 }],
  // Sözlükte 1-4 filmli tüm keyword'ler buraya
};

// Yardımcı: Bir slug için keyword ID'lerini döner.
export function getKeywordIdsForSlug(slug) {
  if (!slug) return [];
  const ids = TMDB_KEYWORD_MAP[slug];
  if (!Array.isArray(ids)) return [];
  return ids.filter(x => Number.isFinite(x));
}

// Yardımcı: Bir liste slug'ın keyword'ü var mı?
export function hasKeywordForSlug(slug) {
  return getKeywordIdsForSlug(slug).length > 0;
}
