/* ─────────────────────────────────────────────────────────────────────
   Supabase Edge Function — `share`
   SSR layer in front of the static `share.html` viewer so that pasting a
   share link in Discord / Slack / Twitter / iMessage yields a rich preview
   card (dynamic Open Graph meta tags + a per-share generated og:image).

   GitHub Pages can't do SSR, so the share link now points here instead of
   github.io. This function:

     GET  …/functions/v1/share?id=<id>          → HTML viewer w/ OG meta
     GET  …/functions/v1/share?id=<id>&img=1    → 1200×630 PNG og:image

   The HTML response embeds a <base href> pointing at github.io, so the
   real viewer assets (share.css / share.js / fonts / supabase-js) load and
   run exactly as before — share.js re-reads `?id=` from location.search and
   renders the drawer client-side. We serve the same HTML to humans AND
   crawlers (no User-Agent sniffing) for robustness.

   Spec: docs/share-link-feature.md  (OG-tags follow-up, 2026-06-09)
   ───────────────────────────────────────────────────────────────────── */

import React from 'https://esm.sh/react@18.2.0';
import { ImageResponse } from 'https://deno.land/x/og_edge@0.0.6/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://pjkilmmltbyugjxbvyvh.supabase.co';
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const VIEWER_BASE  = 'https://lemarsuoff.github.io/Flipping-Market-Dashboard/';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/share`;
const ID_RE        = /^[A-Za-z0-9]{4,32}$/;

// ── Dawn palette (mirror of share.css :root) ────────────────────────────
const C = {
  bg:     '#faf6ee',
  bg1:    '#f2ece0',
  bg2:    '#e8e0d0',
  line:   '#d8d0bc',
  line2:  '#c0b89e',
  body:   '#1e1810',
  dim:    '#80706a',
  white:  '#100c06',
  g:      '#1a7a40',
  r:      '#b82828',
  a:      '#d4730a',
  b:      '#0e6b8a',
  teal:   '#0e6b8a',
  purple: '#9b6dff',
  orange: '#f39a3d',
};

const CHIP_KIND_LABEL: Record<string, string> = {
  h4_obstacle:  'H4 Obstacle',
  m15_obstacle: 'M15 Obstacle',
  setup:        'Setup',
  pair:         'Pair',
  session:      'Session',
  trade_style:  'Trade Style',
  rr_bucket:    'RR Bucket',
  session_time: 'Session Time',
  custom:       'Custom Filter',
};

// ── Small utils ─────────────────────────────────────────────────────────
function escAttr(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function num(v: unknown): number | null {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : null;
}
function fmtR(v: unknown): string {
  const n = num(v);
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}R`;
}
function fmtAvg(v: unknown): string {
  const n = num(v);
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}R`;
}
function fmtPct(v: unknown): string {
  const n = num(v);
  return n == null ? '—' : `${n.toFixed(1)}%`;
}
function fmtPf(v: unknown): string {
  if (v == null) return '∞';
  const n = num(v);
  return n == null ? '—' : n.toFixed(2);
}

// KPI tier colors — mirror share.js kpiWrColor / kpiAvgColor / kpiPfColor.
function wrColor(v: unknown): string {
  const n = num(v); if (n == null) return C.body;
  if (n > 55) return C.purple; if (n >= 48) return C.b; if (n >= 40) return C.g;
  if (n >= 35) return C.a; if (n >= 30) return C.orange; return C.r;
}
function avgColor(v: unknown): string {
  const n = num(v); if (n == null) return C.body;
  if (n >= 1) return C.purple; if (n >= 0.6) return C.b; if (n >= 0.3) return C.g;
  if (n >= 0.1) return C.a; if (n >= 0) return C.orange; return C.r;
}
function pfColor(v: unknown): string {
  if (v == null) return C.purple;
  const n = num(v); if (n == null) return C.body;
  if (n >= 3) return C.purple; if (n >= 2.2) return C.b; if (n >= 1.7) return C.g;
  if (n >= 1.3) return C.a; if (n >= 1) return C.orange; return C.r;
}
function rColor(v: unknown): string {
  const n = num(v); if (n == null) return C.body;
  return n > 0 ? C.g : n < 0 ? C.r : C.dim;
}

// ── Data ────────────────────────────────────────────────────────────────
type ShareRow = { chip_name?: string; chip_kind?: string; stats?: Record<string, unknown> };

async function fetchShare(id: string): Promise<ShareRow | null> {
  try {
    const u = `${SUPABASE_URL}/rest/v1/shares?id=eq.${encodeURIComponent(id)}`
      + `&select=chip_name,chip_kind,stats&limit=1`;
    const res = await fetch(u, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (!res.ok) return null;            // RLS hides expired rows → empty array
    const rows = await res.json();
    return (Array.isArray(rows) && rows[0]) ? rows[0] : null;
  } catch (_) {
    return null;
  }
}

// ── HTML (viewer + OG meta) ─────────────────────────────────────────────
let _scaffold: string | null = null;
const FALLBACK_SCAFFOLD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trade Cards — Flipping Research</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Anybody:wght@400;600;700;800;900&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="share.css?v=7">
</head>
<body>
  <div id="share-root" data-state="loading">
    <div class="sv-loading">
      <div class="sv-loading-dot"></div>
      <div class="sv-loading-text">Loading trade cards…</div>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="share.js?v=9"></script>
</body>
</html>`;

async function getScaffold(): Promise<string> {
  if (_scaffold) return _scaffold;
  try {
    const res = await fetch(`${VIEWER_BASE}share.html`, { redirect: 'follow' });
    if (res.ok) {
      const html = await res.text();
      if (html.includes('share-root')) { _scaffold = html; return html; }
    }
  } catch (_) { /* fall through */ }
  return FALLBACK_SCAFFOLD;
}

async function htmlResponse(id: string, validId: boolean, row: ShareRow | null): Promise<Response> {
  const stats = row?.stats ?? {};
  const chipName = (row?.chip_name || '').trim();
  const found = !!row;

  const title = found
    ? `${chipName || 'Trade cards'} — Flipping Research`
    : 'Trade Cards — Flipping Research';
  const desc = found
    ? `${num(stats.trades) ?? 0} trades · ${fmtPct(stats.winrate)} WR · `
      + `${fmtR(stats.netR)} · PF ${fmtPf(stats.profitFactor)}`
    : 'Shared trade cards — Flipping Research.';

  const ogImg = validId
    ? `${FUNCTION_URL}?id=${encodeURIComponent(id)}&img=1`
    : `${FUNCTION_URL}?img=1`;
  const pageUrl = validId ? `${FUNCTION_URL}?id=${encodeURIComponent(id)}` : FUNCTION_URL;

  const meta = `
    <base href="${VIEWER_BASE}">
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
    <meta name="theme-color" content="${C.bg}">
    <meta name="description" content="${escAttr(desc)}">`;

  let html = await getScaffold();
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escAttr(title)}</title>`);
  // Inject <base> + OG block immediately after <head> so the <base> precedes
  // every relative asset reference in the scaffold.
  html = html.replace(/<head>/i, `<head>${meta}`);

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
    },
  });
}

// ── og:image (1200×630 PNG) ─────────────────────────────────────────────
const FONT_GLYPHS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  + ' .,:;!?@#&()[]{}/+-–—•·%∞$€£°\'"';

async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const fam = family.replace(/ /g, '+');
  const url = `https://fonts.googleapis.com/css2?family=${fam}:wght@${weight}&text=${encodeURIComponent(text)}`;
  // No browser User-Agent → Google Fonts returns a TTF (Satori can't read woff2).
  const css = await (await fetch(url)).text();
  const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/);
  if (!m) throw new Error(`font parse failed: ${family}@${weight}`);
  const r = await fetch(m[1]);
  if (!r.ok) throw new Error(`font fetch failed: ${family}@${weight}`);
  return await r.arrayBuffer();
}

const h = React.createElement;

// One centered stat column. `first` omits the left divider so the rules only
// sit *between* tiles (mirrors the share-view watermark `.wm-meta` grid).
function statTile(label: string, value: string, color: string, first: boolean) {
  return h('div', {
    style: {
      flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '12px', padding: '22px 6px',
      borderLeft: first ? '0px solid transparent' : `1px solid ${C.line}`,
    },
  },
    h('div', {
      style: {
        fontFamily: 'DM Sans', fontWeight: 500, fontSize: '21px',
        letterSpacing: '2.5px', textTransform: 'uppercase', color: C.dim,
      },
    }, label),
    h('div', {
      style: { fontFamily: 'Anybody', fontWeight: 800, fontSize: '50px', color, lineHeight: 1 },
    }, value),
  );
}

async function imageResponse(row: ShareRow | null): Promise<Response> {
  const stats = row?.stats ?? {};
  const found = !!row;
  const chipName = (row?.chip_name || 'Trade cards').trim() || 'Trade cards';
  const kindLabel = CHIP_KIND_LABEL[row?.chip_kind || ''] || CHIP_KIND_LABEL.custom;
  // Prefer the real dimension/property name carried in the snapshot; fall back
  // to the chip_kind taxonomy label, then a neutral label.
  const dimLabel = (typeof stats.dim === 'string' && stats.dim.trim()) ? stats.dim.trim() : '';
  const eyebrow = found ? (dimLabel || kindLabel) : 'Shared trade cards';

  const tradesVal = String(num(stats.trades) ?? 0);
  const totalVal = fmtR(stats.netR);
  const wrVal  = fmtPct(stats.winrate);
  const avgVal = fmtAvg(stats.avgR);
  const pfVal  = fmtPf(stats.profitFactor);

  // Subset the fonts to every glyph we actually draw.
  const glyphs = FONT_GLYPHS + chipName + eyebrow
    + tradesVal + totalVal + wrVal + avgVal + pfVal
    + 'FLIPPING RESEARCH SHARED TRADE CARDS'
    + 'TRADES TOTAL R WIN RATE AVG R PROFIT FACTOR';

  const [anybody800, dmsans500, dmsans700] = await Promise.all([
    loadGoogleFont('Anybody', 800, glyphs),
    loadGoogleFont('DM Sans', 500, glyphs),
    loadGoogleFont('DM Sans', 700, glyphs),
  ]);

  // Scale the chip name to the available width.
  const len = chipName.length;
  const nameSize = len <= 9 ? 110 : len <= 16 ? 90 : len <= 24 ? 70 : len <= 34 ? 54 : 44;

  const tiles = [
    statTile('Trades', tradesVal, C.body, true),
    statTile('Total R', totalVal, rColor(stats.netR), false),
    statTile('Win rate', wrVal, wrColor(stats.winrate), false),
    statTile('Avg R', avgVal, avgColor(stats.avgR), false),
    statTile('Profit factor', pfVal, pfColor(stats.profitFactor), false),
  ];

  const tree = h('div', {
    style: {
      width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: C.bg,
      padding: '56px 80px', fontFamily: 'DM Sans',
    },
  },
    // brand pill
    h('div', { style: {
      display: 'flex', alignItems: 'center', gap: '16px',
      border: `1px solid ${C.line2}`, borderRadius: '40px', padding: '14px 30px',
    } },
      h('div', { style: { width: '14px', height: '14px', borderRadius: '50%', background: C.teal } }),
      h('div', { style: {
        fontFamily: 'DM Sans', fontWeight: 500, fontSize: '24px',
        letterSpacing: '4px', textTransform: 'uppercase', color: C.dim,
      } }, 'Flipping Research · Shared trade cards'),
    ),
    h('div', { style: { display: 'flex', flexGrow: 1 } }),
    // eyebrow (real dimension / property name)
    h('div', { style: {
      display: 'flex', fontFamily: 'DM Sans', fontWeight: 500, fontSize: '26px',
      letterSpacing: '6px', textTransform: 'uppercase', color: C.dim,
    } }, eyebrow),
    // chip name
    h('div', { style: {
      display: 'flex', marginTop: '14px', maxWidth: '1040px', textAlign: 'center',
      fontFamily: 'Anybody', fontWeight: 800, fontSize: `${nameSize}px`,
      lineHeight: 1.02, color: C.white,
    } }, chipName),
    h('div', { style: { display: 'flex', flexGrow: 1.2 } }),
    // stats row
    found
      ? h('div', { style: {
          display: 'flex', width: '1040px', alignItems: 'stretch',
          borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`,
        } }, ...tiles)
      : h('div', { style: {
          display: 'flex', fontFamily: 'DM Sans', fontWeight: 500,
          fontSize: '28px', color: C.dim,
        } }, "This link has expired or doesn't exist"),
  );

  return new ImageResponse(tree, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Anybody', data: anybody800, weight: 800, style: 'normal' },
      { name: 'DM Sans', data: dmsans500, weight: 500, style: 'normal' },
      { name: 'DM Sans', data: dmsans700, weight: 700, style: 'normal' },
    ],
    headers: {
      'cache-control': 'public, max-age=86400, immutable',
      'access-control-allow-origin': '*',
    },
  });
}

// ── Router ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  const wantImg = url.searchParams.get('img') === '1';
  const validId = ID_RE.test(id);

  const row = validId ? await fetchShare(id) : null;

  if (wantImg) {
    try {
      return await imageResponse(row);
    } catch (err) {
      console.error('[share] image render failed', err);
      return new Response('image unavailable', { status: 500 });
    }
  }
  return await htmlResponse(id, validId, row);
});
