// Relais Deno Deploy pour nav.html : alertes de la communauté Waze uniquement.
// Appel : /?left=..&right=..&top=..&bottom=..   (même format de réponse que /alerts du relais Cloudflare)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });

const cache = new Map(); // clé -> { t, body }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const p = ['left', 'right', 'top', 'bottom'].map((k) => parseFloat(url.searchParams.get(k)));
  if (p.some((v) => Number.isNaN(v))) return json({ ok: true, usage: '/?left=&right=&top=&bottom=' });
  const [left, right, top, bottom] = p.map((v) => v.toFixed(3));

  const key = [left, right, top, bottom].join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 30000) return json(hit.body);

  const qs = `top=${top}&bottom=${bottom}&left=${left}&right=${right}`;
  const headers = {
    Referer: 'https://www.waze.com/live-map',
    Origin: 'https://www.waze.com',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
  const urls = [
    `https://www.waze.com/live-map/api/georss?${qs}&env=row&types=alerts`,
    `https://www.waze.com/row-rtserver/web/TGeoRSS?${qs}&ma=200&mj=100&mu=20&types=alerts`,
  ];

  let data = null;
  const errs = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers });
      if (r.ok) {
        try { data = await r.json(); break; } catch (e) { errs.push('json invalide'); }
      } else {
        errs.push('waze ' + r.status + ' ' + (await r.text()).slice(0, 100).replace(/\s+/g, ' '));
      }
    } catch (e) {
      errs.push('réseau ' + String(e).slice(0, 80));
    }
  }
  if (!data) return json({ error: errs.join(' | ') || 'waze' }, 502);

  const list = (data.alerts || []).map((a) => ({
    type: a.type,
    subtype: a.subtype || '',
    lon: a.location && a.location.x,
    lat: a.location && a.location.y,
    street: a.street || '',
    city: a.city || '',
    pub: a.pubMillis || 0,
  }));
  const body = { alerts: list, count: list.length };
  cache.set(key, { t: Date.now(), body });
  return json(body);
});
