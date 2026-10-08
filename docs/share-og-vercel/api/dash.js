/* ─────────────────────────────────────────────────────────────────────
   Vercel serverless function — `/api/dash`  (rewritten to `/dash`)
   Same standalone project as /share: `flipping-share-og`
   → https://flipping-share-og.vercel.app/dash?id=<id>

   Viewer of a PRESET share (read-only Global Overview of Max's dashboard).
   Spec: docs/preset-share-feature.md §3

   FLOW
   ----
   1. SELECT the share row (anon key, RLS hides expired rows). Not found /
      expired → small standalone "Link expired" page.
   2. Fetch the live github.io index.html (memory-cached 60 s so a dashboard
      deploy is picked up quickly).
   3. Inject at the very top of <head>, BEFORE every other script:
        <base href=github.io>   → dashboard.js / css / data load from Pages
        OG + Twitter meta       → rich preview in Discord / Slack / X
        window.__FM_SHARE__     → the snapshot, read synchronously by the
                                  share-mode bootstrap in index.html
   The page is served from this origin (vercel.app), so the dashboard's
   storage here is isolated from the viewer's own github.io dashboard on top
   of the in-memory localStorage shim.

   REDEPLOY: see api/share.js header (same folder, `vercel deploy --prod --yes`).
   ───────────────────────────────────────────────────────────────────── */

const SUPABASE_URL  = 'https://pjkilmmltbyugjxbvyvh.supabase.co';
// Public anon (publishable) key — same one already shipped in dashboard.js / share.js.
const ANON_KEY      = 'sb_publishable_XYwK5z-G9Dhf1ZThUbje1g_ZW3SzeSC';
const VIEWER_BASE   = 'https://lemarsuoff.github.io/Flipping-Market-Dashboard/';
const OG_IMAGE_BASE = SUPABASE_URL + '/functions/v1/share'; // Supabase image endpoint
const ID_RE         = /^[A-Za-z0-9]{4,32}$/;
const BG            = '#faf6ee';
const SCAFFOLD_TTL  = 60 * 1000;

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function fmtR(v)   { const n = num(v); return n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}R`; }
function fmtPct(v) { const n = num(v); return n == null ? '—' : `${n.toFixed(1)}%`; }
function fmtPf(v)  { if (v == null) return '∞'; const n = num(v); return n == null ? '—' : n.toFixed(2); }

/* JSON safe to inline inside <script>: no `</script>`, no HTML comment
   openers, no JS-breaking line separators. */
function inlineJson(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

async function fetchShare(id) {
  try {
    const u = `${SUPABASE_URL}/rest/v1/shares?id=eq.${encodeURIComponent(id)}`
      + `&chip_kind=eq.preset`
      + `&select=id,chip_name,stats,trades,dashboard,expires_at,view_count&limit=1`;
    const r = await fetch(u, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
    if (!r.ok) return null;                 // RLS hides expired rows → []
    const rows = await r.json();
    return (Array.isArray(rows) && rows[0]) ? rows[0] : null;
  } catch (_) { return null; }
}

let _scaffold = null;
let _scaffoldAt = 0;
async function getScaffold() {
  if (_scaffold && Date.now() - _scaffoldAt < SCAFFOLD_TTL) return _scaffold;
  try {
    const r = await fetch(`${VIEWER_BASE}index.html`, { redirect: 'follow' });
    if (r.ok) {
      const html = await r.text();
      // Only accept a dashboard that knows share-mode.
      if (html.includes('__FM_SHARE__') && /<head>/i.test(html)) {
        _scaffold = html;
        _scaffoldAt = Date.now();
        return html;
      }
    }
  } catch (_) { /* fall through */ }
  return _scaffold; // stale copy beats nothing; null → error page
}

function expiredPage(found) {
  const title = found ? "Couldn't load this dashboard" : 'Link expired';
  const msg = found
    ? 'The dashboard failed to load. Try refreshing in a moment.'
    : "This shared dashboard has expired or doesn't exist. Ask the sender for a fresh link.";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escAttr(title)} — Flipping Research</title>
<meta property="og:title" content="Shared dashboard — Flipping Research">
<meta property="og:description" content="${escAttr(msg)}">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Anybody:wght@800&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;height:100%;background:${BG};color:#1e1810;font-family:'DM Mono',monospace}
  .wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center}
  .eyebrow{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#80706a}
  h1{font-family:'Anybody',sans-serif;font-weight:800;font-size:34px;margin:0}
  p{margin:0;max-width:420px;font-size:13px;line-height:1.6;color:#80706a}
</style></head>
<body><div class="wrap">
  <div class="eyebrow">Flipping Research · shared dashboard</div>
  <h1>${escAttr(title)}</h1>
  <p>${escAttr(msg)}</p>
</div></body></html>`;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host || 'x'}`);
  const id = (url.searchParams.get('id') || '').trim();
  const row = ID_RE.test(id) ? await fetchShare(id) : null;

  res.setHeader('content-type', 'text/html; charset=utf-8');

  if (!row) {
    res.setHeader('cache-control', 'public, max-age=60');
    res.status(404).send(expiredPage(false));
    return;
  }

  const html0 = await getScaffold();
  if (!html0) {
    res.setHeader('cache-control', 'no-store');
    res.status(502).send(expiredPage(true));
    return;
  }

  const stats = row.stats || {};
  const name = String(row.chip_name || 'Shared dashboard').trim();
  const title = `${name} — Flipping Research`;
  const desc = `Global Overview · ${num(stats.trades) ?? 0} trades · ${fmtPct(stats.winrate)} WR · `
    + `${fmtR(stats.netR)} · PF ${fmtPf(stats.profitFactor)}`;
  const ogImg = `${OG_IMAGE_BASE}?id=${encodeURIComponent(id)}&img=1`;
  const pageUrl = `https://${req.headers.host}/dash?id=${encodeURIComponent(id)}`;

  const head = `
<base href="${VIEWER_BASE}">
<script>window.__FM_SHARE__ = ${inlineJson({ id, row })};</script>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Flipping Research">
<meta property="og:url" content="${escAttr(pageUrl)}">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:image" content="${escAttr(ogImg)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escAttr(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(title)}">
<meta name="twitter:description" content="${escAttr(desc)}">
<meta name="twitter:image" content="${escAttr(ogImg)}">
<meta name="theme-color" content="${BG}">
<meta name="description" content="${escAttr(desc)}">
<meta name="robots" content="noindex">`;

  let html = html0.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escAttr(title)}</title>`);
  html = html.replace(/<head>/i, `<head>${head}`);

  // The snapshot is immutable; a short CDN cache only bounds how long an
  // expired link keeps rendering (RLS stops it at the source).
  res.setHeader('cache-control', 'public, max-age=60, s-maxage=300');
  res.status(200).send(html);
};
