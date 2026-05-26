/* ─────────────────────────────────────────────────────────────────
   share.js — standalone viewer for trade-card share links.
   Loads a public.shares row by ID, renders watermark + drawer + cards.
   Trade-card HTML mirrors _wdTradeCard() from dashboard.js so the
   drawer is visually identical to the dashboard under Dawn theme.
   Spec: docs/share-link-feature.md
   ───────────────────────────────────────────────────────────────── */

const SUPABASE_URL = 'https://pjkilmmltbyugjxbvyvh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XYwK5z-G9Dhf1ZThUbje1g_ZW3SzeSC';

const CHIP_KIND_LABEL = {
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

// Mirror dashboard.js constants
const _WD_OC_CLASS = { TP:'oc-tp', SL:'oc-sl', 'BE-TP':'oc-betp', 'BE-SL':'oc-besl' };
const _WD_BG_CLASS = {
  TP: 'wd-trade-card-tp',
  SL: 'wd-trade-card-sl',
  'BE-TP': 'wd-trade-card-betp',
  'BE-SL': 'wd-trade-card-besl',
};

const root = document.getElementById('share-root');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;');
}

function formatRSigned(r) {
  if (typeof r !== 'number' || !Number.isFinite(r)) return '—';
  return `${r > 0 ? '+' : ''}${r.toFixed(1)}R`;
}

function rClassNumeric(r) {
  if (typeof r !== 'number' || !Number.isFinite(r)) return '';
  return r > 0 ? 'pos' : r < 0 ? 'neg' : '';
}

function rClassByOutcome(outcome, r) {
  // Mirror _wdTradeCard's R color class logic
  if (outcome === 'BE-TP') return 'wd-trade-r-betp';
  if (outcome === 'BE-SL') return 'wd-trade-r-besl';
  if (typeof r !== 'number' || !Number.isFinite(r) || r === 0) return 'wd-trade-r-neu';
  return r > 0 ? 'wd-trade-r-pos' : 'wd-trade-r-neg';
}

function dirColor(side) {
  // Mirror dashboard.js inline-style logic
  if (side === 'Achat') return '#5b9cf6';
  if (side === 'Vente') return '#f472b6';
  return 'var(--dim)';
}

function renderError(title, message) {
  root.dataset.state = 'error';
  root.innerHTML = `
    <div class="sv-empty">
      <div class="sv-empty-eyebrow">Flipping Research</div>
      <div class="sv-empty-title">${escapeHtml(title)}</div>
      <div class="sv-empty-msg">${escapeHtml(message)}</div>
    </div>`;
}

function groupTradesByMonth(trades) {
  // Trades come pre-sorted in the snapshot. Group by YYYY-MM for the
  // sticky day-sep header (matches the dashboard convention).
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const groups = [];
  let curKey = null;
  for (const t of trades) {
    const d = String(t.date || '');
    const key = d.slice(0, 7);
    if (key !== curKey) {
      const [y, m] = key.split('-');
      const monthLabel = (m && MONTHS[parseInt(m, 10) - 1])
        ? `${MONTHS[parseInt(m, 10) - 1]} ${y}`
        : (d || 'Undated');
      groups.push({ label: monthLabel, trades: [] });
      curKey = key;
    }
    groups[groups.length - 1].trades.push(t);
  }
  return groups;
}

/* Coerce a media slot value to {url, orig}. Accepts the new object format
   ({url, orig}) and the legacy string format (just the URL, no fallback). */
function _mediaSlot(v) {
  if (!v) return { url: '', orig: '' };
  if (typeof v === 'string') return { url: v.trim(), orig: '' };
  return { url: (v.url || '').trim(), orig: (v.orig || '').trim() };
}

/* Renders a trade card with the SAME HTML structure as _wdTradeCard()
   in dashboard.js, so share.css can reuse the dashboard's `.wd-trade-card*`
   rules verbatim. */
function renderCard(t, idx) {
  const r = (typeof t.r === 'number' && Number.isFinite(t.r)) ? t.r : null;
  const rDisplay = r != null ? `${r > 0 ? '+' : ''}${r.toFixed(1)}R` : '—';
  const bgCls = _WD_BG_CLASS[t.outcome] || '';
  const ocCls = _WD_OC_CLASS[t.outcome] || '';
  const rCls  = rClassByOutcome(t.outcome, r);
  const dirCol = dirColor(t.side);

  // Camera buttons — emojis match dashboard.js (📷📷📸).
  // A slot renders iff it has a url OR a TradingView orig fallback link.
  const slots = {
    h4:   _mediaSlot(t.media && t.media.h4),
    m15:  _mediaSlot(t.media && t.media.m15),
    m15a: _mediaSlot(t.media && t.media.m15a),
  };
  const cams = [];
  if (slots.h4.url   || slots.h4.orig)   cams.push({ emoji: '📷', label: 'H4',   slot: 'h4',   ...slots.h4   });
  if (slots.m15.url  || slots.m15.orig)  cams.push({ emoji: '📷', label: 'M15',  slot: 'm15',  ...slots.m15  });
  if (slots.m15a.url || slots.m15a.orig) cams.push({ emoji: '📸', label: 'M15A', slot: 'm15a', ...slots.m15a });

  const camsHtml = cams.map(c => `
    <div class="wd-media-item">
      <button class="trade-media-btn wd-media-btn"
              data-screen-url="${escapeAttr(c.url)}"
              data-screen-orig="${escapeAttr(c.orig)}"
              data-screen-slot="${escapeAttr(c.slot)}"
              data-screen-step="${escapeAttr(c.label)}"
              data-screen-pair="${escapeAttr(t.pair || '')}"
              data-screen-date="${escapeAttr(t.date || '')}"
              data-screen-r="${escapeAttr(rDisplay)}"
              data-card-idx="${idx}"
              title="${escapeAttr(c.label)}">${c.emoji}</button>
      <span class="wd-media-label">${escapeHtml(c.label)}</span>
    </div>
  `).join('');

  // Direction + outcome — direction in col 1, outcome in col 2 (row 2)
  const directionHtml = t.side
    ? `<div class="wd-trade-direction" style="color:${dirCol}">${escapeHtml(t.side)}</div>`
    : '';
  const outcomeHtml = t.outcome
    ? `<div class="wd-trade-outcome-wrap"><span class="${ocCls} wd-trade-outcome">${escapeHtml(t.outcome)}</span></div>`
    : '';

  // Session + hour line (single full-width row)
  const sessionHourHtml = (t.session || t.sessionTime)
    ? `<div class="wd-trade-session-hour wd-trade-meta-line-full">${t.session ? `<span>${escapeHtml(t.session)}</span>` : ''}${t.sessionTime ? `<span>${escapeHtml(t.sessionTime)}</span>` : ''}</div>`
    : '';

  // RR Max
  const rrMaxHtml = (typeof t.rrMax === 'number' && Number.isFinite(t.rrMax))
    ? `<div class="wd-trade-meta-line wd-trade-meta-line-full">
         <span class="wd-trade-meta-title">RR Max :</span><span class="wd-trade-meta-value">${t.rrMax.toFixed(1)}R</span>
       </div>`
    : '';

  // H4 obstacles
  const obsH4 = Array.isArray(t.obsH4) ? t.obsH4 : [];
  const h4Html = obsH4.length
    ? `<div class="wd-trade-meta-line wd-trade-meta-line-full">
         <span class="wd-trade-meta-title">Obstacles H4 :</span><span class="wd-trade-meta-value">${escapeHtml([...obsH4].sort().join(' · '))}</span>
       </div>`
    : '';

  // M15 obstacles
  const obsM15 = Array.isArray(t.obsM15) ? t.obsM15 : [];
  const obsHtml = obsM15.length
    ? `<div class="wd-trade-meta-line wd-trade-meta-line-full">
         <span class="wd-trade-meta-title">Obstacles M15 :</span><span class="wd-trade-meta-value">${escapeHtml([...obsM15].sort().join(' · '))}</span>
       </div>`
    : '';

  const setupLine = t.style || '—';

  return `
    <div class="wd-trade-card ${bgCls}" data-card-idx="${idx}">
      <div class="wd-trade-main">
        <div class="wd-trade-pair-row">${escapeHtml(t.pair || '—')}</div>
        ${t.date ? `<div class="wd-trade-date">${escapeHtml(t.date)}</div>` : ''}
      </div>
      <div class="wd-trade-side">
        <div class="wd-trade-r ${rCls}">${escapeHtml(rDisplay)}</div>
        ${camsHtml}
      </div>
      ${directionHtml}
      ${outcomeHtml}
      <div class="wd-trade-setup wd-trade-meta-line-full">${escapeHtml(setupLine)}</div>
      ${sessionHourHtml}
      ${rrMaxHtml}
      ${h4Html}
      ${obsHtml}
    </div>`;
}

function renderShare(d) {
  const stats = d.stats || {};
  const trades = Array.isArray(d.trades) ? d.trades : [];
  const totalR = typeof stats.netR === 'number' ? stats.netR : 0;
  const totalRSigned = `${totalR >= 0 ? '+' : ''}${totalR.toFixed(1)}R`;
  const totalCls = totalR >= 0 ? 'wd-drawer-total-pos' : 'wd-drawer-total-neg';
  const sub = `${stats.trades || trades.length} trades · ${stats.wins || 0}W ${stats.losses || 0}L`;
  const kindLabel = CHIP_KIND_LABEL[d.chip_kind] || CHIP_KIND_LABEL.custom;

  const groups = groupTradesByMonth(trades);
  const bodyHtml = groups.map(g => `
    <div class="wd-day-sep">${escapeHtml(g.label)}</div>
    ${g.trades.map(t => renderCard(t, trades.indexOf(t))).join('')}
  `).join('');

  const winrate = typeof stats.winrate === 'number' ? stats.winrate.toFixed(1) + '%' : '—';
  const avgR    = typeof stats.avgR === 'number'
    ? `${stats.avgR > 0 ? '+' : ''}${stats.avgR.toFixed(2)}R`
    : '—';
  const pf      = (stats.profitFactor == null) ? '∞'
                  : (typeof stats.profitFactor === 'number' ? stats.profitFactor.toFixed(2) : '—');

  root.dataset.state = 'loaded';
  root.innerHTML = `
    <div class="watermark">
      <div class="wm-inner">
        <div class="wm-brand">
          <span class="wm-brand-dot"></span>
          Flipping Research · Shared trade cards
        </div>
        <div class="wm-chip-eyebrow">${escapeHtml(kindLabel)}</div>
        <h1 class="wm-chip-name">${escapeHtml(d.chip_name || 'Trade cards')}</h1>
        <div class="wm-meta">
          <div class="wm-meta-item">
            <div class="wm-meta-lbl">Trades</div>
            <div class="wm-meta-val">${escapeHtml(String(stats.trades || trades.length))}</div>
          </div>
          <div class="wm-meta-item">
            <div class="wm-meta-lbl">Win rate</div>
            <div class="wm-meta-val">${escapeHtml(winrate)}</div>
          </div>
          <div class="wm-meta-item">
            <div class="wm-meta-lbl">Net R</div>
            <div class="wm-meta-val ${rClassNumeric(totalR)}">${escapeHtml(totalRSigned)}</div>
          </div>
          <div class="wm-meta-item">
            <div class="wm-meta-lbl">Avg R</div>
            <div class="wm-meta-val ${rClassNumeric(stats.avgR)}">${escapeHtml(avgR)}</div>
          </div>
          <div class="wm-meta-item">
            <div class="wm-meta-lbl">Profit factor</div>
            <div class="wm-meta-val">${escapeHtml(pf)}</div>
          </div>
        </div>
        <div class="wm-cta">
          <span class="wm-cta-arrow"></span>
          Click a camera icon to view its screenshot
        </div>
      </div>
      <div class="wm-footer">
        <span>${(typeof d.view_count === 'number' && d.view_count > 0) ? (d.view_count + ' views') : ''}</span>
        <span>flipping-market · shared view</span>
      </div>
    </div>

    <aside class="wd-drawer">
      <div class="wd-drawer-head">
        <div class="wd-drawer-head-main">
          <div class="wd-drawer-title" title="${escapeAttr(d.chip_name || '')}">${escapeHtml(d.chip_name || 'Trade cards')}</div>
          <div class="wd-drawer-sub">${escapeHtml(sub)}</div>
        </div>
        <div class="wd-drawer-head-side">
          <div class="wd-drawer-total ${totalCls}">${escapeHtml(totalRSigned)}</div>
        </div>
      </div>
      <div class="wd-drawer-body">${bodyHtml}</div>
    </aside>
  `;

  // Init keyboard nav state and attach the document-level keydown listener.
  _navState.trades  = trades;
  _navState.tradeIdx = -1;   // -1 = no screenshot open yet (watermark visible)
  _navState.slot    = '';
  root.addEventListener('click', handleClick);
}

// ── Keyboard navigation state ────────────────────────────────────
// Mirrors the dashboard's lightbox:
//   ArrowUp / ArrowDown  → previous / next trade (keeps current step if available)
//   ArrowLeft / ArrowRight → previous / next step within current trade
//   Escape               → close screenshot view, back to watermark
const _SLOT_ORDER = ['h4', 'm15', 'm15a'];
const _SLOT_LABEL = { h4: 'H4', m15: 'M15', m15a: 'M15A' };
const _navState = { trades: [], tradeIdx: -1, slot: '' };

function _slotHasContent(t, slot) {
  const v = _mediaSlot(t && t.media && t.media[slot]);
  return !!(v.url || v.orig);
}

function _navOpen(tradeIdx, slot) {
  const t = _navState.trades[tradeIdx];
  if (!t) return;
  const v = _mediaSlot(t.media && t.media[slot]);
  if (!v.url && !v.orig) return;
  _navState.tradeIdx = tradeIdx;
  _navState.slot     = slot;
  _showLightbox(t, slot, v);
  // Highlight active card + active camera (mirrors dashboard.js _lbShow @14834).
  const cards = root.querySelectorAll('.wd-trade-card');
  cards.forEach(c => c.classList.remove('is-active'));
  root.querySelectorAll('.wd-media-btn.is-active').forEach(b => b.classList.remove('is-active'));
  const target = cards[tradeIdx];
  if (target) {
    target.classList.add('is-active');
    const activeBtn = target.querySelector(`.wd-media-btn[data-screen-slot="${slot}"]`);
    if (activeBtn) activeBtn.classList.add('is-active');
    const body = target.closest('.wd-drawer-body');
    if (body) {
      const cRect = body.getBoundingClientRect();
      const eRect = target.getBoundingClientRect();
      if (eRect.bottom <= cRect.top)       body.scrollTop += (eRect.top - cRect.top);
      else if (eRect.top >= cRect.bottom)  body.scrollTop += (eRect.bottom - cRect.bottom);
    }
  }
}

function _navStepDelta(delta) {
  if (_navState.tradeIdx < 0) return;
  const t = _navState.trades[_navState.tradeIdx];
  if (!t) return;
  const curIdx = _SLOT_ORDER.indexOf(_navState.slot);
  for (let i = 1; i <= _SLOT_ORDER.length; i++) {
    const newIdx  = ((curIdx + delta * i) % _SLOT_ORDER.length + _SLOT_ORDER.length) % _SLOT_ORDER.length;
    const newSlot = _SLOT_ORDER[newIdx];
    if (_slotHasContent(t, newSlot)) { _navOpen(_navState.tradeIdx, newSlot); return; }
  }
}

function _navTradeDelta(delta) {
  if (_navState.tradeIdx < 0) return;
  const n = _navState.trades.length;
  if (!n) return;
  for (let i = 1; i <= n; i++) {
    const newIdx = ((_navState.tradeIdx + delta * i) % n + n) % n;
    const t = _navState.trades[newIdx];
    // Prefer keeping the current step; otherwise pick the first available.
    if (_slotHasContent(t, _navState.slot)) { _navOpen(newIdx, _navState.slot); return; }
    const fallback = _SLOT_ORDER.find(s => _slotHasContent(t, s));
    if (fallback) { _navOpen(newIdx, fallback); return; }
  }
}

function _navClose() {
  _navState.tradeIdx = -1;
  _navState.slot     = '';
  _removeLightbox();
  root.querySelectorAll('.wd-trade-card.is-active').forEach(c => c.classList.remove('is-active'));
  root.querySelectorAll('.wd-media-btn.is-active').forEach(b => b.classList.remove('is-active'));
}

document.addEventListener('keydown', (e) => {
  if (!document.getElementById('img-lightbox-overlay')) return;
  if      (e.key === 'Escape')      { e.preventDefault(); _navClose(); }
  else if (e.key === 'ArrowDown')   { e.preventDefault(); if (!e.repeat) _navTradeDelta(1); }
  else if (e.key === 'ArrowUp')     { e.preventDefault(); if (!e.repeat) _navTradeDelta(-1); }
  else if (e.key === 'ArrowRight')  { e.preventDefault(); if (!e.repeat) _navStepDelta(1); }
  else if (e.key === 'ArrowLeft')   { e.preventDefault(); if (!e.repeat) _navStepDelta(-1); }
});

function handleClick(e) {
  const cam = e.target.closest('.trade-media-btn[data-screen-slot]');
  if (!cam) return;
  const tradeIdx = parseInt(cam.dataset.cardIdx, 10);
  const slot     = cam.dataset.screenSlot;
  if (Number.isFinite(tradeIdx) && slot) _navOpen(tradeIdx, slot);
}

/* Centered lightbox overlay — mirrors dashboard.js openImgLightbox + _lbShow.
   Created on first open, removed on close. Click backdrop to close.
   Selector bar at top with ‹ pair · date · STEP · n/total ›. */
function _showLightbox(t, slot, slotData) {
  let overlay = document.getElementById('img-lightbox-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'img-lightbox-overlay';
    overlay.className = 'img-lightbox-overlay';
    overlay.addEventListener('click', _navClose);

    const sel = document.createElement('div');
    sel.id = 'img-lightbox-sel';
    sel.className = 'img-lightbox-sel';
    sel.addEventListener('click', e => e.stopPropagation());
    overlay.appendChild(sel);

    const img = document.createElement('img');
    img.id = 'img-lightbox-img';
    img.className = 'img-lightbox-img';
    img.addEventListener('click', e => e.stopPropagation());
    overlay.appendChild(img);

    document.body.appendChild(overlay);
  }

  // Remove any leftover placeholder + reset the <img> from the previous
  // navigation (arrow keys reuse the same overlay).
  overlay.querySelectorAll('.tv-img-placeholder').forEach(n => n.remove());
  const img = document.getElementById('img-lightbox-img');
  if (img) {
    img.style.display = '';
    img.onerror = null;
    img.removeAttribute('src');
  }

  // Selector bar — same structure as dashboard's _lbShow.
  const sel = document.getElementById('img-lightbox-sel');
  const stepLabel = ({ h4: 'H4 Before', m15: 'M15 Before', m15a: 'M15 After' })[slot] || slot;
  const label = [t.pair, t.date].filter(Boolean).join('  ·  ');
  const total = _navState.trades.length;
  const tradeNum = _navState.tradeIdx + 1;
  const hasMulti = total > 1;
  if (sel) {
    sel.innerHTML = `
      ${hasMulti ? `<button class="img-lightbox-nav-btn" data-lb-nav="-1" type="button">‹</button>` : ''}
      <span class="img-lightbox-label">${escapeHtml(label)}</span>
      <span class="img-lightbox-step">${escapeHtml(stepLabel)}</span>
      ${hasMulti ? `<span class="img-lightbox-count">${tradeNum} / ${total}</span>` : ''}
      ${hasMulti ? `<button class="img-lightbox-nav-btn" data-lb-nav="1" type="button">›</button>` : ''}`;
    // Wire ‹ / › buttons to navigate trades, same as ArrowUp/Down.
    sel.querySelectorAll('[data-lb-nav]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _navTradeDelta(parseInt(btn.dataset.lbNav, 10) || 0);
      });
    });
  }

  // Image: bind onerror BEFORE src so a 404 swaps to the placeholder
  // immediately (and the placeholder is removed on next navigation).
  if (img) {
    img.alt = `${t.pair || ''} ${t.date || ''} ${stepLabel}`.trim();
    img.dataset.orig = slotData.orig || '';
    img.onerror = () => _renderLightboxFallback(slotData.orig || '');
    if (slotData.url) {
      img.src = slotData.url;
    } else {
      // No image URL (TV /x/ link only) — show fallback immediately.
      _renderLightboxFallback(slotData.orig || '');
    }
  }
}

function _removeLightbox() {
  const ov = document.getElementById('img-lightbox-overlay');
  if (ov) ov.remove();
}

function _renderLightboxFallback(origUrl) {
  const overlay = document.getElementById('img-lightbox-overlay');
  if (!overlay) return;
  const img = document.getElementById('img-lightbox-img');
  if (img) img.style.display = 'none';
  // Idempotent: avoid stacking placeholders on repeated load failures.
  let ph = overlay.querySelector('.tv-img-placeholder');
  if (!ph) {
    ph = document.createElement('div');
    ph.className = 'tv-img-placeholder';
    ph.addEventListener('click', e => e.stopPropagation());
    overlay.appendChild(ph);
  }
  ph.innerHTML = `
    <div class="tv-ph-icon">🔗</div>
    <div class="tv-ph-title">Lien TradingView invalide</div>
    ${origUrl
      ? `<a class="tv-ph-link" href="${escapeAttr(origUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir sur TradingView ↗</a>`
      : `<div class="tv-ph-hint">Le partageur n'a pas inclus de lien original.</div>`}`;
}

async function loadShare(id) {
  let sb;
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    console.error('[share] supabase client init failed', err);
    renderError("Couldn't load", 'The Supabase library failed to load. Try refreshing the page.');
    return;
  }

  try {
    const { data, error } = await sb
      .from('shares')
      .select('chip_name, chip_kind, stats, trades, expires_at, view_count')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      renderError('Link expired', "This share has expired or doesn't exist. Ask the sender for a fresh link.");
      return;
    }

    renderShare(data);
    // Fire-and-forget view bump (RPC bypasses RLS via security definer).
    sb.rpc('increment_share_view', { p_share_id: id }).then(null, () => {});
  } catch (err) {
    console.error('[share] load failed', err);
    renderError("Couldn't load", 'Network error. Try refreshing the page in a moment.');
  }
}

const params = new URLSearchParams(location.search);
const id = (params.get('id') || '').trim();

if (!id) {
  renderError('Invalid link', 'This URL is missing a share ID. Ask the sender for the full link.');
} else if (!/^[A-Za-z0-9]{4,32}$/.test(id)) {
  renderError('Invalid link', "This share ID isn't valid. Ask the sender for the full link.");
} else {
  loadShare(id);
}
