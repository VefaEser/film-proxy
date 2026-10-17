const MODEL_DEFAULT = "gemini-3.8-flash";
const TMDB_BASE = "https://api.themoviedb.org/3";
const GOOGLE_INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

function response(data,status=200){
  return new Response(JSON.stringify(data),{
    status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8"}
  });
}
function jsonError(message,status=500,extra={}){
  return response({error:String(message),...extra},status);
}
function safeJSON(text,fallback=null){
  try{return JSON.parse(text)}catch{return fallback}
}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function norm(s){return String(s||"").trim().toLowerCase().replace(/\s+/g," ")}
function yearOf(m){return Number(String(m.release_date||"").slice(0,4))||Number(m.year)||0}
function movieKey(m){return String(m.id||m.tmdb_id||"")}
function cacheKey(prefix,value){
  return `${prefix}:${encodeURIComponent(String(value)).slice(0,450)}`;
}

async function cacheGet(env,key){
  if(!env.DB)return null;
  try{
    const row=await env.DB.prepare(
      "SELECT data_json, updated_at FROM search_cache WHERE cache_key = ?"
    ).bind(key).first();
    if(!row)return null;
    if(Date.now()/1000-Number(row.updated_at)>30*86400)return null;
    return safeJSON(row.data_json);
  }catch(e){console.error("D1 cache read:",e.message);return null}
}
async function cachePut(env,key,data){
  if(!env.DB)return;
  try{
    await env.DB.prepare(
      "INSERT INTO search_cache (cache_key,data_json,updated_at) VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at"
    ).bind(key,JSON.stringify(data),Math.floor(Date.now()/1000)).run();
  }catch(e){console.error("D1 cache write:",e.message)}
}
async function cachedJSON(env,key,ttlSeconds,fetcher){
  const cached=await cacheGet(env,key);
  if(cached && Date.now()/1000-Number(cached._cachedAt||0)<ttlSeconds)return cached.value;
  const value=await fetcher();
  await cachePut(env,key,{_cachedAt:Math.floor(Date.now()/1000),value});
  return value;
}

async function fetchJSON(url,options={},label="Uzak servis"){
  const res=await fetch(url,{...options,signal:AbortSignal.timeout?AbortSignal.timeout(18000):undefined});
  const body=await res.text();
  const data=safeJSON(body,null);
  if(!res.ok)throw new Error(`${label}: HTTP ${res.status} ${body.slice(0,300)}`);
  if(!data)throw new Error(`${label}: JSON yanıtı alınamadı`);
  return data;
}

async function tmdb(env,path,params={}){
  if(!env.TMDB_API_KEY)throw new Error("Cloudflare Secret TMDB_API_KEY tanımlı değil.");
  const url=new URL(TMDB_BASE+path);
  url.searchParams.set("api_key",env.TMDB_API_KEY);
  for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=="")url.searchParams.set(k,String(v));
  const key=cacheKey("tmdb",url.pathname+"?"+[...url.searchParams].filter(([k])=>k!=="api_key").map(([k,v])=>`${k}=${v}`).join("&"));
  return cachedJSON(env,key,86400,()=>fetchJSON(url.toString(),{},"TMDB"));
}

async function tmdbRoute(env,url){
  const path=url.pathname.replace(/^\/tmdb/,"");
  if(path==="/genre/movie/list")
    return tmdb(env,path,{language:url.searchParams.get("language")||"tr-TR"});
  if(path==="/configuration/languages")
    return tmdb(env,path);
  if(path==="/configuration/countries")
    return tmdb(env,path,{language:url.searchParams.get("language")||"tr-TR"});
  if(path==="/discover/movie"){
    const allowed=[
      "language","sort_by","vote_average.gte","vote_average.lte","vote_count.gte",
      "page","primary_release_date.gte","primary_release_date.lte","with_genres",
      "without_genres","with_original_language","with_origin_country","with_text_query"
    ];
    const params={};
    for(const key of allowed)if(url.searchParams.has(key))params[key]=url.searchParams.get(key);
    return tmdb(env,path,params);
  }
  if(path==="/search/movie"){
    return tmdb(env,path,{
      query:url.searchParams.get("query")||"",
      language:url.searchParams.get("language")||"tr-TR",
      page:url.searchParams.get("page")||1,
      include_adult:"false"
    });
  }
  const detail=path.match(/^\/movie\/details$/);
  if(detail){
    const id=url.searchParams.get("id");
    if(!id||!/^\d+$/.test(id))throw new Error("TMDB film ID geçersiz.");
    const lang=url.searchParams.get("language")||"tr-TR";
    const [movie,credits]=await Promise.all([
      tmdb(env,`/movie/${id}`,{language:lang}),
      tmdb(env,`/movie/${id}/credits`)
    ]);
    const imdb=await omdb(env,{i:movie.imdb_id||""}).catch(()=>null);
    return {...movie,credits,imdbRating:imdb?.imdbRating||null,imdbVotes:imdb?.imdbVotes||null};
  }
  throw new Error("Bilinmeyen TMDB uç noktası.");
}

async function omdb(env,params){
  if(!env.OMDB_API_KEY)throw new Error("Cloudflare Secret OMDB_API_KEY tanımlı değil.");
  const url=new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey",env.OMDB_API_KEY);
  for(const [k,v] of Object.entries(params))if(v)url.searchParams.set(k,v);
  const key=cacheKey("omdb",url.toString().replace(env.OMDB_API_KEY,"KEY"));
  return cachedJSON(env,key,7*86400,async()=>{
    const data=await fetchJSON(url.toString(),{},"OMDb");
    if(data.Response==="False")throw new Error(data.Error||"OMDb sonucu bulunamadı.");
    return data;
  });
}

async function wikidata(env,movie){
  const key=cacheKey("wikidata",`${movie.title}|${movie.original_title}|${yearOf(movie)}`);
  return cachedJSON(env,key,30*86400,async()=>{
    const title=movie.original_title||movie.title||"";
    const year=yearOf(movie);
    if(!title)return {items:[],filmingLocations:[],originalWork:null};
    const escaped=title.replace(/\\/g,"\\\\").replace(/"/g,'\\"');
    const query=`
SELECT ?item ?itemLabel ?itemDescription ?originalWorkLabel ?filmingLocationLabel WHERE {
  ?item wdt:P31 wd:Q11424;
        rdfs:label ?label.
  FILTER(LANG(?label)="en" && LCASE(STR(?label))=LCASE("${escaped}"))
  OPTIONAL {?item wdt:P144 ?originalWork.}
  OPTIONAL {?item wdt:P915 ?filmingLocation.}
  OPTIONAL {?item wdt:P577 ?date.}
  OPTIONAL {?item schema:description ?itemDescription. FILTER(LANG(?itemDescription)="en")}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,tr". }
  ${year?`FILTER(!BOUND(?date) || YEAR(?date) >= ${year-1} && YEAR(?date) <= ${year+1})`:""}
}
LIMIT 8`;
    const url="https://query.wikidata.org/sparql?query="+encodeURIComponent(query);
    const data=await fetchJSON(url,{headers:{
      "Accept":"application/sparql-results+json",
      "User-Agent":"FilmKesifMotoru/1.0 (public film metadata research)"
    }},"Wikidata");
    const bindings=data.results?.bindings||[];
    return {
      items:bindings.map(x=>({
        label:x.itemLabel?.value||"",
        description:x.itemDescription?.value||"",
        originalWork:x.originalWorkLabel?.value||"",
        filmingLocation:x.filmingLocationLabel?.value||""
      })),
      originalWork:bindings.find(x=>x.originalWorkLabel)?.originalWorkLabel?.value||null,
      filmingLocations:[...new Set(bindings.map(x=>x.filmingLocationLabel?.value).filter(Boolean))]
    };
  });
}

async function commons(env,movie){
  const title=movie.original_title||movie.title||"";
  if(!title)return {images:[]};
  const key=cacheKey("commons",title);
  return cachedJSON(env,key,14*86400,async()=>{
    const url=new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action","query");
    url.searchParams.set("format","json");
    url.searchParams.set("generator","search");
    url.searchParams.set("gsrsearch",`filetype:bitmap "${title}" film`);
    url.searchParams.set("gsrnamespace","6");
    url.searchParams.set("gsrlimit","5");
    url.searchParams.set("prop","imageinfo");
    url.searchParams.set("iiprop","url|extmetadata");
    url.searchParams.set("iiurlwidth","640");
    const data=await fetchJSON(url.toString(),{headers:{"User-Agent":"FilmKesifMotoru/1.0"}},"Wikimedia Commons");
    const pages=Object.values(data.query?.pages||{});
    return {images:pages.map(p=>{
      const i=p.imageinfo?.[0]||{},meta=i.extmetadata||{};
      return {
        title:p.title||"",url:i.thumburl||i.url||"",
        pageUrl:i.descriptionurl||"",
        license:meta.LicenseShortName?.value||"Lisans bilgisi belirtilmemiş",
        artist:meta.Artist?.value||"",
        attribution:meta.Attribution?.value||""
      };
    }).filter(x=>x.url)};
  });
}

async function tavily(env,query){
  if(!env.TAVILY_API_KEY)return {results:[],warning:"TAVILY_API_KEY ayarlanmamış."};
  const key=cacheKey("tavily",query);
  return cachedJSON(env,key,7*86400,async()=>{
    const data=await fetchJSON("https://api.tavily.com/search",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        api_key:env.TAVILY_API_KEY,query,
        search_depth:"basic",max_results:5,
        include_answer:false,include_raw_content:false
      })
    },"Tavily");
    return {results:(data.results||[]).map(x=>({
      title:x.title||"",url:x.url||"",content:(x.content||"").slice(0,1800),
      score:x.score||0
    }))};
  });
}

function extractText(data){
  if(typeof data?.output_text==="string")return data.output_text;
  if(typeof data?.text==="string")return data.text;
  const outputs=data?.outputs||data?.output||[];
  const list=Array.isArray(outputs)?outputs:[outputs];
  const texts=[];
  for(const o of list){
    if(typeof o?.text==="string")texts.push(o.text);
    for(const c of o?.content||[])if(typeof c?.text==="string")texts.push(c.text);
  }
  return texts.join("\n");
}

async function callGemini(env,prompt){
  const keys=[env.GEMINI_API_KEY_1,env.GEMINI_API_KEY_2,env.GEMINI_API_KEY_3].filter(Boolean);
  if(!keys.length)throw new Error("GEMINI_API_KEY_1, GEMINI_API_KEY_2 veya GEMINI_API_KEY_3 Secret'larından en az biri gerekli.");
  const model=env.GEMINI_MODEL||MODEL_DEFAULT;
  let lastError;
  for(let i=0;i<keys.length;i++){
    try{
      const data=await fetchJSON(GOOGLE_INTERACTIONS,{
        method:"POST",
        headers:{"Content-Type":"application/json","x-goog-api-key":keys[i]},
        body:JSON.stringify({model,input:prompt})
      },"Gemini Interactions");
      const text=extractText(data);
      if(!text)throw new Error("Gemini yanıtında metin bulunamadı.");
      return text;
    }catch(e){
      lastError=e;
      const msg=String(e.message||e);
      const retryable=/HTTP (429|500|502|503|504)|quota|rate.?limit|temporar/i.test(msg);
      if(!retryable)throw e;
      if(i<keys.length-1)await wait(1200*(i+1));
    }
  }
  throw lastError||new Error("Gemini isteği başarısız.");
}

function extractJSON(text){
  const clean=String(text).replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
  const start=clean.indexOf("{"),end=clean.lastIndexOf("}");
  if(start<0||end<start)throw new Error("Gemini geçerli JSON döndürmedi.");
  return JSON.parse(clean.slice(start,end+1));
}

async function researchOne(env,movie,filters,settings){
  const [omdbData,wd,commonsData,webData]=await Promise.all([
    (async()=>{try{return await omdb(env,{t:movie.original_title||movie.title,y:String(yearOf(movie)||"")})}catch{return null}})(),
    wikidata(env,movie).catch(e=>({items:[],filmingLocations:[],warning:e.message})),
    commons(env,movie).catch(e=>({images:[],warning:e.message})),
    settings.useWebResearch?tavily(env,`${movie.original_title||movie.title} ${yearOf(movie)||""} film plot filming location themes cinematography review`).catch(e=>({results:[],warning:e.message})):Promise.resolve({results:[]})
  ]);
  return {
    omdb:omdbData?{imdbRating:omdbData.imdbRating,imdbVotes:omdbData.imdbVotes,imdbID:omdbData.imdbID}:null,
    wikidata:wd,commons:commonsData,web: webData
  };
}

async function analyseBatch(env,movies,filters,settings){
  const sourceRows=[];
  for(const movie of movies){
    sourceRows.push({movie,sources:await researchOne(env,movie,filters,settings)});
  }
  const results=[];
  for(let i=0;i<sourceRows.length;i+=4){
    const batch=sourceRows.slice(i,i+4);
    const cacheIds=batch.map(x=>`${movieKey(x.movie)}:${JSON.stringify(filters)}:${settings.useAI}:${settings.useWebResearch}`);
    const pending=[];
    for(let j=0;j<batch.length;j++){
      const cache=await cacheGet(env,cacheKey("analysis",cacheIds[j]));
      if(cache?.result)results.push({...cache.result,...cache.sources});
      else pending.push({row:batch[j],cacheId:cacheIds[j]});
    }
    if(!pending.length)continue;

    let aiById={};
    if(settings.useAI){
      const prompt=`Sen bir film araştırma asistanısın. Yalnızca sağlanan kaynaklardan hareket et. Kaynakta kanıt yoksa tahminini düşük güvenli olarak işaretle; doğrulanmış gibi sunma. Kullanıcı filtreleri JSON: ${JSON.stringify(filters)}.
Her film için: filtre koşullarının karşılanıp karşılanmadığını değerlendir; IMDb verilerini, gece/gündüz oranını, iç/dış mekân oranını, mekân sayısını, diyalog yoğunluğunu, renk kullanımını, görüntü oranını, mevsimi, karakter yoğunluğunu, hikâye dönemini/coğrafyasını, gerçek çekim yerini, anlatım tarzını, sesini, yapım özelliklerini, hassas içeriklerin yoğunluk ve sunuluş biçimini, hikâye gerçekçiliğini ve ilişkili filmleri incele.
Hikâyenin geçtiği yer ile gerçek çekim yerini karıştırma. Wikidata özgün eser ilişkisi varsa related_films/original_work alanına koy. Wikimedia Commons görselleri yalnızca kaynak görselidir; lisans ve kaynak adreslerini koru. Filmde görünmeyen içerik hakkında kanıt yoksa uydurma.
Her sonuç JSON nesnesi olsun: id, filter_match (true/false/null), filter_reasons (string[]), night_ratio (0-100 veya null), day_ratio (0-100 veya null), indoor_ratio (0-100 veya null), location_count (string), dialogue_density (0-100 veya null), color_ratio (0-100 veya null), aspect_ratio (string/null), season (string/null), confidence (low/medium/high), evidence (string[]), related_films (string[]), original_work (string/null), filming_locations (string[]), family_content (object).
Yanıt biçimi yalnızca şu JSON: {"movies":[...]}.
Filmler ve kaynaklar: ${JSON.stringify(pending.map(x=>({movie:x.row.movie,sources:x.row.sources})))}`;
      const raw=await callGemini(env,prompt);
      const parsed=extractJSON(raw);
      for(const item of parsed.movies||[])aiById[Number(item.id)]=item;
    }

    for(const pendingItem of pending){
      const movie=pendingItem.row.movie,sources=pendingItem.row.sources;
      const ai=aiById[Number(movie.id)]||{};
      const imdb=sources.omdb||{};
      const result={
        id:movie.id,
        ...(settings.useAI?ai:{}),
        imdbRating:imdb.imdbRating||null,
        imdbVotes:imdb.imdbVotes||null,
        imdbID:imdb.imdbID||null,
        related_films:ai.related_films||[],
        original_work:ai.original_work||sources.wikidata?.originalWork||null,
        filming_locations:ai.filming_locations||sources.wikidata?.filmingLocations||[],
        source_evidence:{
          web:(sources.web?.results||[]).map(x=>({title:x.title,url:x.url,content:x.content})),
          wikidata:sources.wikidata,
          commons:sources.commons
        }
      };
      results.push(result);
      await cachePut(env,cacheKey("analysis",pendingItem.cacheId),{result,sources});
    }
  }
  return results;
}

async function handleResearch(env,body){
  const movies=Array.isArray(body.movies)?body.movies.slice(0,10):[];
  if(!movies.length)return {movies:[]};
  const filters=body.filters||{};
  const settings={
    useAI:body.useAI!==false,
    useWebResearch:body.useWebResearch!==false
  };
  const analysed=await analyseBatch(env,movies,filters,settings);
  const byId=new Map(analysed.map(m=>[Number(m.id),m]));
  return {movies:movies.map(m=>({...m,...(byId.get(Number(m.id))||{})}))};
}

async function handleRequest(request,env){
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  const url=new URL(request.url);
  try{
    if(url.pathname==="/health"){
      return response({
        ok:true,model:env.GEMINI_MODEL||MODEL_DEFAULT,
        tmdb:!!env.TMDB_API_KEY,omdb:!!env.OMDB_API_KEY,
        tavily:!!env.TAVILY_API_KEY,
        geminiKeys:[!!env.GEMINI_API_KEY_1,!!env.GEMINI_API_KEY_2,!!env.GEMINI_API_KEY_3],
        d1:!!env.DB
      });
    }
    if(url.pathname.startsWith("/tmdb/")){
      const result=await tmdbRoute(env,url);
      return response(result);
    }
    if(url.pathname==="/omdb"){
      const params={};
      for(const k of ["i","t","y","type"])if(url.searchParams.has(k))params[k]=url.searchParams.get(k);
      return response(await omdb(env,params));
    }
    if(url.pathname==="/wikidata"){
      const movie={id:url.searchParams.get("id"),title:url.searchParams.get("title"),original_title:url.searchParams.get("title"),year:url.searchParams.get("year")};
      return response(await wikidata(env,movie));
    }
    if(url.pathname==="/commons"){
      const movie={title:url.searchParams.get("title"),original_title:url.searchParams.get("title")};
      return response(await commons(env,movie));
    }
    if(url.pathname==="/research"||url.pathname==="/gemini-interactions"){
      if(request.method!=="POST")return jsonError("Bu uç nokta POST bekliyor.",405);
      const body=await request.json();
      return response(await handleResearch(env,body));
    }
    return jsonError("Uç nokta bulunamadı.",404);
  }catch(e){
    console.error(e.stack||e);
    const message=String(e.message||e);
    const status=/API_KEY|Secret .*tanımlı değil|gerekli/.test(message)?503:500;
    return jsonError(message,status);
  }
}

export default {
  fetch(request,env){
    return handleRequest(request,env);
  }
};
