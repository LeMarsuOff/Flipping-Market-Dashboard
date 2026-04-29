// audit/calc_engine.js
// Verbatim extract (no modification) of the calc engine functions from
// dashboard.js, for offline Node-based testing under the audit.
//
// Sources cités (line numbers exacts) :
//   _SYSTEM_TP_R / _SYSTEM_SL_R   : dashboard.js:1613-1614
//   _hashTpConfig                 : dashboard.js:1630-1650
//   isWinner / isLoser / isBE     : dashboard.js:1657-1671
//   _sortTradesChronological      : dashboard.js:1691-1698
//   computeEffectiveRR            : dashboard.js:1743-1886
//   _enrichTradeClassification    : dashboard.js:1903-1914
//   _isValidPersonalisedConfig    : dashboard.js:1954-1964
//   calcStats                     : dashboard.js:5195-5289
//   computeOptimalRR              : dashboard.js:10918-11030
//   _getTradeReachR               : dashboard.js:13679-13686
//   _getSimulatedR                : dashboard.js:13716-13773
//   _ppSimTrade                   : dashboard.js:14244-14254
//   _parseBeTriggerR              : dashboard.js:16301-16313
//   _FLIPPING_BE_R                : dashboard.js:16321
//   _activeBeMode                 : dashboard.js:16347-16349
//   _resolveBEDecision            : dashboard.js:16351-16384
//   _resolveBeR                   : dashboard.js:16387-16414
//   _resolveBeRMulti              : dashboard.js:16417-16442
//   _resolveBeRFixed              : dashboard.js:16448-16468
//   _poSimTradeBeAware            : dashboard.js:16486-16497

'use strict';

// ── Stubs for browser globals ──
// appState.ui.beMode and appState.ui.tpConfig are read by the calc functions.
// We expose a mutable global so tests can flip modes between calls.
const appState = {
  ui: {
    beMode: 'be-fallback',           // 'be-fallback' | 'flipping-be' (no-be removed in feat/kill-no-be-mode 2026-04)
    tpConfig: null,                  // { mode, multi, personalised }
    rrMinFilter: null,               // ORR pill — null in tests
    beManagementExclude: [],
  },
  trades: { items: [] },
};

// _orrSimMode = 'be-fallback' | 'strict-loss' (header toggle on ORR widget).
let _orrSimMode = 'be-fallback';

// _isMultiMappingComplete normally consults dataset mode + headers; in tests
// we always have synthetic trades with tpN_rr set, so we stub to true.
function _isMultiMappingComplete(_multiCfg) { return true; }

// Suppress dev warnings during tests.
function _warnComputeRROnce(_t, _d, _m) {}

// ── _SYSTEM_TP_R / _SYSTEM_SL_R (dashboard.js:1613-1614) ──
const _SYSTEM_TP_R = 2.4;
const _SYSTEM_SL_R = -1.0;

// ── _hashTpConfig (dashboard.js:1630-1650) ──
function _hashTpConfig(cfg) {
  const beMode = (typeof appState !== 'undefined' && appState.ui && appState.ui.beMode) || 'be-fallback';
  const beTag = '|be:' + beMode;
  if (!cfg) return 'null' + beTag;
  if (cfg.mode === 'fixed') return 'fixed' + beTag;
  if (cfg.mode === 'multi') {
    const m = cfg.multi;
    return 'multi:' + m.tpCount + ':' + m.partials.tp1 + '/' + m.partials.tp2 + '/' + (m.partials.tp3 || 0) + beTag;
  }
  if (cfg.mode === 'personalised') {
    const p = cfg.personalised;
    return 'personalised:' + p.tpCount
         + ':' + p.targets.tp1 + '/' + p.targets.tp2 + '/' + (p.targets.tp3 || 0)
         + ':' + p.partials.tp1 + '/' + p.partials.tp2 + '/' + (p.partials.tp3 || 0)
         + beTag;
  }
  return cfg.mode + beTag;
}

// ── isWinner / isLoser / isBE (dashboard.js:1657-1671) ──
function isWinner(t, cfg) {
  cfg = cfg || appState.ui.tpConfig;
  if (t._effectiveClassMode === _hashTpConfig(cfg)) return t.effectiveClass === 'win';
  return computeEffectiveRR(t, cfg) > 0;
}
function isLoser(t, cfg) {
  cfg = cfg || appState.ui.tpConfig;
  if (t._effectiveClassMode === _hashTpConfig(cfg)) return t.effectiveClass === 'loss';
  return computeEffectiveRR(t, cfg) < 0;
}
function isBE(t, cfg) {
  cfg = cfg || appState.ui.tpConfig;
  if (t._effectiveClassMode === _hashTpConfig(cfg)) return t.effectiveClass === 'be';
  return computeEffectiveRR(t, cfg) === 0;
}

// ── _sortTradesChronological (dashboard.js:1691-1698) ──
function _sortTradesChronological(trades) {
  return [...trades].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const h = (a.hour ?? 99) - (b.hour ?? 99);
    if (h !== 0) return h;
    return (a._rawRowIndex ?? 0) - (b._rawRowIndex ?? 0);
  });
}

// ── _isValidPersonalisedConfig (dashboard.js:1954-1964) ──
function _isValidPersonalisedConfig(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.tpCount !== 2 && p.tpCount !== 3) return false;
  const t = p.targets, pt = p.partials;
  if (!t || typeof t !== 'object' || !pt || typeof pt !== 'object') return false;
  for (const k of ['tp1', 'tp2', 'tp3']) {
    if (typeof t[k] !== 'number' || !Number.isFinite(t[k])) return false;
    if (typeof pt[k] !== 'number' || !Number.isFinite(pt[k])) return false;
  }
  return true;
}

// ── computeEffectiveRR (dashboard.js:1743-1886) — VERBATIM ──
function computeEffectiveRR(trade, tpConfig) {
  if (trade && trade._simulated) return trade.r;

  const mode = tpConfig && tpConfig.mode;
  switch (mode) {
    case 'fixed':
      if (trade.outcome === 'BE-TP' || trade.outcome === 'BE-SL') {
        return _resolveBeRFixed(trade);
      }
      return trade.r;
    case 'multi': {
      const mCfg = tpConfig.multi;
      if (!_isMultiMappingComplete(mCfg)) {
        _warnComputeRROnce('multi-mapping-incomplete', 'global', '');
        return trade.r;
      }
      const pSum = (mCfg.partials.tp1 || 0) + (mCfg.partials.tp2 || 0)
                 + (mCfg.tpCount === 3 ? (mCfg.partials.tp3 || 0) : 0);
      if (Math.abs(pSum - 100) > 0.01) {
        _warnComputeRROnce('multi-partials-sum', String(pSum), '');
        return trade.r;
      }
      if (trade.outcome === 'SL') return trade.r;
      if (trade.outcome === 'TP') {
        const p = mCfg.partials;
        const n = mCfg.tpCount;
        let rr = 0;
        let anyHit = false;
        if (trade.tp1_rr != null) { rr += (p.tp1 / 100) * trade.tp1_rr; anyHit = true; }
        if (trade.tp2_rr != null) { rr += (p.tp2 / 100) * trade.tp2_rr; anyHit = true; }
        if (n === 3 && trade.tp3_rr != null) { rr += (p.tp3 / 100) * trade.tp3_rr; anyHit = true; }
        if (!anyHit) {
          _warnComputeRROnce('multi-no-tp-rr', '', '');
          return trade.r;
        }
        return rr;
      }
      if (trade.outcome === 'BE-TP' || trade.outcome === 'BE-SL') {
        return _resolveBeRMulti(trade, mCfg);
      }
      return trade.r;
    }
    case 'personalised': {
      const psCfg = tpConfig.personalised;
      if (!_isValidPersonalisedConfig(psCfg)) {
        _warnComputeRROnce('personalised-invalid-config', 'global', '');
        return trade.r;
      }
      const psSum = (psCfg.partials.tp1 || 0) + (psCfg.partials.tp2 || 0)
                  + (psCfg.tpCount === 3 ? (psCfg.partials.tp3 || 0) : 0);
      if (Math.abs(psSum - 100) > 0.01) {
        _warnComputeRROnce('personalised-partials-sum', String(psSum), '');
        return trade.r;
      }

      const psT = psCfg.targets;
      const psP = psCfg.partials;
      const partials = [
        { lv: psT.tp1, pct: psP.tp1 / 100 },
        { lv: psT.tp2, pct: psP.tp2 / 100 },
      ];
      if (psCfg.tpCount === 3) partials.push({ lv: psT.tp3, pct: psP.tp3 / 100 });
      partials.sort((a, b) => a.lv - b.lv);

      if (trade.outcome === 'BE-TP' || trade.outcome === 'BE-SL') {
        return _resolveBeR(trade, partials, _getTradeReachR(trade));
      }
      if (trade.rrMax == null || !Number.isFinite(trade.rrMax)) {
        _warnComputeRROnce('personalised-no-rrmax', 'global', '');
      }
      const reachR = _getTradeReachR(trade);
      return _ppSimTrade(reachR, partials);
    }
    default:
      return trade.r;
  }
}

// ── _enrichTradeClassification (dashboard.js:1903-1914) ──
function _enrichTradeClassification(trades, tpConfig) {
  const cfg = tpConfig || appState.ui.tpConfig;
  const cfgHash = _hashTpConfig(cfg);
  for (const t of trades) {
    if (t._effectiveClassMode === cfgHash) continue;
    const r = computeEffectiveRR(t, cfg);
    t.effectiveR = r;
    t.effectiveClass = r > 0 ? 'win' : (r < 0 ? 'loss' : 'be');
    t._effectiveClassMode = cfgHash;
  }
  return trades;
}

// ── calcStats (dashboard.js:5195-5289) — VERBATIM ──
function calcStats(trades, tpConfigArg) {
  if (!trades.length) return null;
  const tpConfig = tpConfigArg || appState.ui.tpConfig;
  _enrichTradeClassification(trades, tpConfig);
  const n = trades.length;
  const wins   = trades.filter(t => isWinner(t, tpConfig));
  const losses = trades.filter(t => isLoser(t, tpConfig));
  const bes    = trades.filter(t => isBE(t, tpConfig));
  const w = wins.length, l = losses.length;
  const totalR = trades.reduce((s, t) => s + computeEffectiveRR(t, tpConfig), 0);
  const wr = w / n * 100;
  const ev = totalR / n;
  const gross_w = wins.reduce((s,t)=>s+computeEffectiveRR(t, tpConfig),0);
  const gross_l = Math.abs(losses.reduce((s,t)=>s+computeEffectiveRR(t, tpConfig),0));
  const pf = gross_l > 0 ? gross_w / gross_l : 9.99;

  const _sorted = _sortTradesChronological(trades);
  let eq = 0, peak = 0, maxDD = 0;
  const curve = _sorted.map(t => {
    eq += computeEffectiveRR(t, tpConfig);
    if (eq > peak) peak = eq;
    const dd = eq - peak;
    if (dd < maxDD) maxDD = dd;
    return eq;
  });

  let maxW=0,maxL=0,cur=0,curSign=0;
  _sorted.forEach(t => {
    if (isBE(t, tpConfig)) return;
    const s = isWinner(t, tpConfig) ? 1 : -1;
    if (s === curSign) { cur++; } else { cur = 1; curSign = s; }
    if (s === 1 && cur > maxW) maxW = cur;
    if (s === -1 && cur > maxL) maxL = cur;
  });

  const winRuns = [];
  const lossRuns = [];
  let runR = 0, runSign = 0;
  _sorted.forEach((t, i) => {
    if (isBE(t, tpConfig)) {
      if (i === _sorted.length - 1 && runSign !== 0) {
        (runSign === 1 ? winRuns : lossRuns).push(runR);
      }
      return;
    }
    const s = isWinner(t, tpConfig) ? 1 : -1;
    if (s === runSign) {
      runR += t.effectiveR;
    } else {
      if (runSign !== 0) (runSign === 1 ? winRuns : lossRuns).push(runR);
      runR = t.effectiveR; runSign = s;
    }
    if (i === _sorted.length - 1) (runSign === 1 ? winRuns : lossRuns).push(runR);
  });

  const avgWinStreakR  = winRuns.length  ? winRuns.reduce((s,v)=>s+v,0)  / winRuns.length  : null;
  const avgLossStreakR = lossRuns.length ? lossRuns.reduce((s,v)=>s+v,0) / lossRuns.length : null;
  const maxConsecProfitR = winRuns.length ? Math.max(...winRuns) : null;
  const maxConsecLossR   = lossRuns.length ? Math.min(...lossRuns) : null;

  const be_tp = trades.filter(t=>t.outcome==='BE-TP').length;
  const be_sl = trades.filter(t=>t.outcome==='BE-SL').length;
  const be    = be_tp + be_sl;
  const cnt_tp = trades.filter(t=>t.outcome==='TP').length;
  const cnt_sl = trades.filter(t=>t.outcome==='SL').length;
  const avgWin  = w > 0 ? gross_w / w   : null;
  const avgLoss = l > 0 ? -gross_l / l  : null;

  return { n, w, l, bes:bes.length, be, be_tp, be_sl, cnt_tp, cnt_sl, wr, ev, totalR, pf, curve, maxDD, maxW, maxL, avgWin, avgLoss, avgWinStreakR, avgLossStreakR, maxConsecProfitR, maxConsecLossR };
}

// ── computeOptimalRR (dashboard.js:10918-11030) — VERBATIM ──
function computeOptimalRR(trades) {
  if (!trades.length) return [];
  const steps = [0.5, 1.0, 1.5, 2.0, 2.4, 2.5, 3.0, 3.3, 3.5, 4.0, 4.5, 5.0];
  const hasRRMax = trades.some(t => t.rrMax !== null && t.rrMax !== undefined && Number.isFinite(t.rrMax));
  const results = steps.map(tp => {
    let wins = 0, losses = 0, beOut = 0, excluded = 0;
    for (let i = 0; i < trades.length; i++) {
      const t    = trades[i];
      const outcome = t?.outcome;

      if (outcome === 'BE-TP' || outcome === 'BE-SL') {
        const decision = _resolveBEDecision(t);
        if (decision.fallbackVariant === 'pure-tp-no-sl' && t.outcome === 'BE-TP') {
          const r = typeof t.r === 'number' ? t.r : NaN;
          const rrMaxRaw = t.rrMax;
          const rMax = Number.isFinite(rrMaxRaw)
            ? rrMaxRaw
            : (Number.isFinite(r) && r > 0 ? r : null);
          if (rMax !== null && rMax >= tp) {
            wins++;
          } else if (rMax !== null) {
            if (_orrSimMode === 'strict-loss') losses++;
            else                               beOut++;
          } else {
            excluded++;
          }
          continue;
        }
        if (decision.fallbackToNoBE && t.outcome === 'BE-SL') {
          const r = typeof t.r === 'number' ? t.r : NaN;
          const rrMaxRaw = t.rrMax;
          const rMax = Number.isFinite(rrMaxRaw)
            ? rrMaxRaw
            : (Number.isFinite(r) && r > 0 ? r : null);
          if (rMax !== null && rMax >= tp) {
            wins++;
          } else if (rMax !== null && rMax < _SYSTEM_TP_R) {
            losses++;
          } else if (rMax !== null) {
            if (_orrSimMode === 'strict-loss') losses++;
            else                               beOut++;
          } else if (Number.isFinite(r) && r < 0) {
            losses++;
          } else {
            excluded++;
          }
          continue;
        }
        const beR = _resolveBeR(t, [{ lv: tp, pct: 1 }], _getTradeReachR(t));
        if (beR > 0)      wins++;
        else if (beR < 0) losses++;
        else              beOut++;
        continue;
      }

      const r    = typeof t?.r === 'number' ? t.r : NaN;
      const rrMaxRaw = t?.rrMax;
      const rMax = Number.isFinite(rrMaxRaw)
        ? rrMaxRaw
        : (Number.isFinite(r) && r > 0 ? r : null);

      if (rMax !== null && rMax >= tp) {
        wins++;
      } else if (Number.isFinite(r) && r < 0) {
        losses++;
      } else if (rMax !== null && rMax < _SYSTEM_TP_R) {
        losses++;
      } else if (rMax !== null) {
        if (_orrSimMode === 'strict-loss') losses++;
        else                               beOut++;
      } else {
        excluded++;
      }
    }
    const counted = wins + losses;
    const cumR    = wins * tp - losses * 1;
    const total   = trades.length;
    const winrate = total > 0 ? wins / total : 0;
    const ev      = counted > 0 ? cumR / counted : 0;
    const pf      = losses > 0 ? (wins * tp) / losses : (wins > 0 ? Infinity : 0);
    return { tp, winrate, ev, pf, cumR, wins, bes: 0, losses, beOut, excluded };
  });
  results._hasRRMax = hasRRMax;
  return results;
}

// ── _getTradeReachR (dashboard.js:13679-13686) ──
function _getTradeReachR(trade) {
  const rrMax = trade?.rrMax;
  const realizedR = typeof trade?.r === 'number' && trade.r > 0 ? trade.r : 0;
  if (rrMax !== null && rrMax !== undefined && Number.isFinite(rrMax)) {
    return Math.max(rrMax, realizedR);
  }
  return realizedR;
}

// ── _getSimulatedR (dashboard.js:13716-13773) — VERBATIM ──
function _getSimulatedR(trade) {
  const tp = appState.ui.rrMinFilter !== null ? appState.ui.rrMinFilter : _SYSTEM_TP_R;

  if (trade?.outcome === 'BE-TP' || trade?.outcome === 'BE-SL') {
    const decision = _resolveBEDecision(trade);
    if (decision.fallbackVariant === 'pure-tp-no-sl' && trade.outcome === 'BE-TP') {
      const r = typeof trade.r === 'number' ? trade.r : NaN;
      const rrMaxRaw = trade.rrMax;
      const rMax = Number.isFinite(rrMaxRaw)
        ? rrMaxRaw
        : (Number.isFinite(r) && r > 0 ? r : null);
      if (rMax !== null && rMax >= tp) return tp;
      if (rMax !== null) return _orrSimMode === 'strict-loss' ? -1 : 0;
      return null;
    }
    if (decision.fallbackToNoBE && trade.outcome === 'BE-SL') {
      const r = typeof trade.r === 'number' ? trade.r : NaN;
      const rrMaxRaw = trade.rrMax;
      const rMax = Number.isFinite(rrMaxRaw)
        ? rrMaxRaw
        : (Number.isFinite(r) && r > 0 ? r : null);
      if (rMax !== null && rMax >= tp) return tp;
      if (rMax !== null && rMax < _SYSTEM_TP_R) return -1;
      if (rMax !== null) return _orrSimMode === 'strict-loss' ? -1 : 0;
      if (Number.isFinite(r) && r < 0) return -1;
      return null;
    }
    return _resolveBeR(trade, [{ lv: tp, pct: 1 }], _getTradeReachR(trade));
  }

  const r = typeof trade?.r === 'number' ? trade.r : NaN;
  const rrMaxRaw = trade?.rrMax;
  const rMax = Number.isFinite(rrMaxRaw)
    ? rrMaxRaw
    : (Number.isFinite(r) && r > 0 ? r : null);

  if (rMax !== null && rMax >= tp) return tp;
  if (Number.isFinite(r) && r < 0) return -1;
  if (rMax !== null && rMax < _SYSTEM_TP_R) return -1;
  if (rMax !== null) {
    return _orrSimMode === 'strict-loss' ? -1 : null;
  }
  return null;
}

// ── _ppSimTrade (dashboard.js:14244-14254) ──
function _ppSimTrade(rrMax, partials) {
  if (!partials.length) return 0;
  const tp1 = partials[0].lv;
  if (rrMax < tp1) return -1;

  let r = 0;
  for (const { pct, lv } of partials) {
    if (rrMax >= lv) r += pct * lv;
  }
  return r;
}

// ── _parseBeTriggerR (dashboard.js:16301-16313) ──
function _parseBeTriggerR(beManagementArr) {
  if (!Array.isArray(beManagementArr)) return null;
  let max = null;
  for (const s of beManagementArr) {
    if (typeof s !== 'string') continue;
    const m = s.match(/(\d+(?:\.\d+)?)\s*R/i);
    if (m) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n) && (max === null || n > max)) max = n;
    }
  }
  return max;
}

// ── _FLIPPING_BE_R (dashboard.js:16321) ──
const _FLIPPING_BE_R = 2.4;

// ── _activeBeMode (dashboard.js:16347-16349) ──
function _activeBeMode() {
  return (typeof appState !== 'undefined' && appState.ui && appState.ui.beMode) || 'be-fallback';
}

// ── _resolveBEDecision (dashboard.js:16351-16383, post feat/kill-no-be-mode) ──
function _resolveBEDecision(trade) {
  const mode = _activeBeMode();
  if (mode === 'flipping-be') {
    if (trade.outcome === 'BE-TP') {
      return { applyBEAware: false, triggerR: null, fallbackToNoBE: true, fallbackVariant: 'pure-tp-no-sl' };
    }
    const reach = _getTradeReachR(trade);
    if (Number.isFinite(reach) && reach >= _FLIPPING_BE_R) {
      return { applyBEAware: true, triggerR: _FLIPPING_BE_R, fallbackToNoBE: false };
    }
    return { applyBEAware: false, triggerR: null, fallbackToNoBE: true, fallbackVariant: 'pure-tp-with-sl' };
  }
  // be-fallback
  const trigger = _parseBeTriggerR(trade.beManagement);
  if (trigger === null) {
    return { applyBEAware: false, triggerR: null, fallbackToNoBE: false };
  }
  return { applyBEAware: true, triggerR: trigger, fallbackToNoBE: false };
}

// ── _resolveBeR (dashboard.js:16387-16414) ──
function _resolveBeR(trade, partials, reachR) {
  const d = _resolveBEDecision(trade);
  if (d.applyBEAware) {
    let r = 0;
    for (const { pct, lv } of partials) {
      if (lv <= d.triggerR) r += pct * lv;
    }
    return r;
  }
  if (d.fallbackToNoBE) {
    if (d.fallbackVariant === 'pure-tp-no-sl' && trade.outcome === 'BE-TP') {
      let r = 0;
      for (const { pct, lv } of partials) {
        if (reachR >= lv) r += pct * lv;
      }
      return r;
    }
    return _ppSimTrade(reachR, partials);
  }
  return 0;
}

// ── _resolveBeRMulti (dashboard.js:16417-16442) ──
function _resolveBeRMulti(trade, mCfg) {
  const d = _resolveBEDecision(trade);
  if (d.applyBEAware) {
    const p = mCfg.partials, n = mCfg.tpCount;
    let rr = 0;
    if (trade.tp1_rr != null && trade.tp1_rr <= d.triggerR)            rr += (p.tp1 / 100) * trade.tp1_rr;
    if (trade.tp2_rr != null && trade.tp2_rr <= d.triggerR)            rr += (p.tp2 / 100) * trade.tp2_rr;
    if (n === 3 && trade.tp3_rr != null && trade.tp3_rr <= d.triggerR) rr += (p.tp3 / 100) * trade.tp3_rr;
    return rr;
  }
  if (d.fallbackToNoBE) {
    if (trade.outcome === 'BE-SL') return trade.r;
    const p = mCfg.partials, n = mCfg.tpCount;
    let rr = 0, anyHit = false;
    if (trade.tp1_rr != null)              { rr += (p.tp1 / 100) * trade.tp1_rr; anyHit = true; }
    if (trade.tp2_rr != null)              { rr += (p.tp2 / 100) * trade.tp2_rr; anyHit = true; }
    if (n === 3 && trade.tp3_rr != null)   { rr += (p.tp3 / 100) * trade.tp3_rr; anyHit = true; }
    return anyHit ? rr : 0;
  }
  return 0;
}

// ── _resolveBeRFixed (dashboard.js:16448-16468) ──
function _resolveBeRFixed(trade) {
  const d = _resolveBEDecision(trade);
  if (d.applyBEAware) {
    if (trade.outcome === 'BE-TP') return trade.r;
    return 0;
  }
  if (d.fallbackToNoBE) {
    if (trade.outcome === 'BE-SL') {
      const rrMax = trade.rrMax;
      return (Number.isFinite(rrMax) && rrMax >= _SYSTEM_TP_R) ? _SYSTEM_TP_R : -1;
    }
    return trade.r;
  }
  return trade.r;
}

// ── _poSimTradeBeAware (dashboard.js:16486-16497) ──
function _poSimTradeBeAware(trade, rrMax, partials) {
  if (!partials || !partials.length) return _ppSimTrade(rrMax, partials);
  if (trade && (trade.outcome === 'BE-TP' || trade.outcome === 'BE-SL')) {
    return _resolveBeR(trade, partials, rrMax);
  }
  return _ppSimTrade(rrMax, partials);
}

// Helper to clear classification cache between mode switches.
function clearClassificationCache(trades) {
  for (const t of trades) {
    delete t._effectiveClassMode;
    delete t.effectiveR;
    delete t.effectiveClass;
  }
}

module.exports = {
  appState,
  get _orrSimMode() { return _orrSimMode; },
  setOrrSimMode(v) { _orrSimMode = v; },
  _SYSTEM_TP_R,
  _SYSTEM_SL_R,
  _FLIPPING_BE_R,
  _hashTpConfig,
  isWinner,
  isLoser,
  isBE,
  _sortTradesChronological,
  computeEffectiveRR,
  _enrichTradeClassification,
  calcStats,
  computeOptimalRR,
  _getTradeReachR,
  _getSimulatedR,
  _ppSimTrade,
  _parseBeTriggerR,
  _resolveBEDecision,
  _resolveBeR,
  _resolveBeRMulti,
  _resolveBeRFixed,
  _poSimTradeBeAware,
  clearClassificationCache,
};
