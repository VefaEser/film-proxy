export default {
  async fetch(r, e) {
    const u = new URL(r.url);
    const c = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'};
    if (r.method === 'OPTIONS') return new Response(null, {headers: c});
    if (u.pathname.startsWith('/tmdb/')) {
      let res = await fetch(`https://themoviedb.org{u.pathname.replace('/tmdb/','')}${u.search}`, {headers: {'Authorization': `Bearer ${e.TMDB_API_KEY}`}});
      let n = new Response(res.body, res);
      Object.keys(c).forEach(k => n.headers.set(k, c[k]));
      return n;
    }
    if (u.pathname.startsWith('/gemini/')) {
      let t = new URL(`https://googleapis.com{u.pathname.replace('/gemini/','')}`);
      t.searchParams.set('key', e.GEMINI_API_KEY);
      let res = await fetch(t.toString(), {method: r.method, headers: {'Content-Type': 'application/json'}, body: r.body});
      let n = new Response(res.body, res);
      Object.keys(c).forEach(k => n.headers.set(k, c[k]));
      return n;
    }
    return new Response('Ok', {headers: c});
  }
};
