// audit/test_runner.js
// Run the synthetic dataset through every (TP mode × BE mode) combination,
// compare against expected values, surface divergences and inter-widget
// convergence checks. Writes detailed report to audit/test_output.txt.

'use strict';

const path = require('path');
const fs = require('fs');
const calc = require('./calc_engine.js');
const { trades: rawTrades } = require('./test_dataset.js');

const TP_MODES = ['fixed', 'multi', 'personalised'];
// BE_MODES: 'no-be' was removed in PR feat/kill-no-be-mode (2026-04). Matrix
// shrinks from 3 BE × 3 TP × 14 trades = 126 cells to 2 × 3 × 14 = 84 cells.
const BE_MODES = ['be-fallback', 'flipping-be'];

const tpConfigs = {
  fixed: { mode: 'fixed', multi: { tpCount: 2, partials: { tp1: 50, tp2: 50, tp3: 0 } },
           personalised: { tpCount: 2, targets: { tp1: 1, tp2: 2.4, tp3: 3 }, partials: { tp1: 50, tp2: 50, tp3: 0 } } },
  multi: { mode: 'multi', multi: { tpCount: 2, partials: { tp1: 50, tp2: 50, tp3: 0 } },
           personalised: { tpCount: 2, targets: { tp1: 1, tp2: 2.4, tp3: 3 }, partials: { tp1: 50, tp2: 50, tp3: 0 } } },
  personalised: { mode: 'personalised', multi: { tpCount: 2, partials: { tp1: 50, tp2: 50, tp3: 0 } },
                  personalised: { tpCount: 2, targets: { tp1: 1, tp2: 2.4, tp3: 3 }, partials: { tp1: 50, tp2: 50, tp3: 0 } } },
};

// ── Manually computed expected values ──
// Indexed by trade.id then `<tpMode>:<beMode>` → expected effectiveR (number).
// Personalised plan: 50% at TP1=1R + 50% at TP2=2.4R.
// Multi config: 50/50 on tp1_rr / tp2_rr.
// Fixed mode: passes through trade.r for TP/SL ; BE-TP/BE-SL via _resolveBeRFixed.
const expected = {
  'TP-clean':  { 'fixed:be-fallback':  2.4, 'fixed:flipping-be':  2.4,
                 'multi:be-fallback':  1.7, 'multi:flipping-be':  1.7,
                 'personalised:be-fallback': 1.7, 'personalised:flipping-be': 1.7 },
  'SL-clean':  { 'fixed:be-fallback': -1.0, 'fixed:flipping-be': -1.0,
                 'multi:be-fallback': -1.0, 'multi:flipping-be': -1.0,
                 'personalised:be-fallback': -1.0, 'personalised:flipping-be': -1.0 },
  'BETP-1R-low': { 'fixed:be-fallback': 0,   'fixed:flipping-be': 0,
                   'multi:be-fallback': 0.5, 'multi:flipping-be': 0.5,
                   'personalised:be-fallback': 0.5, 'personalised:flipping-be': 0.5 },
  'BETP-multi-high': { 'fixed:be-fallback': 0, 'fixed:flipping-be': 0,
                       'multi:be-fallback': 1.5, 'multi:flipping-be': 1.5,
                       'personalised:be-fallback': 0.5, 'personalised:flipping-be': 1.7 },
  'BESL-2R-high': { 'fixed:be-fallback': 0, 'fixed:flipping-be': 0,
                    'multi:be-fallback': 1.5, 'multi:flipping-be': 1.5,
                    'personalised:be-fallback': 0.5, 'personalised:flipping-be': 1.7 },
  'BESL-empty-chip': { 'fixed:be-fallback': -1, 'fixed:flipping-be': -1,
                       'multi:be-fallback': 0,  'multi:flipping-be': -1,
                       'personalised:be-fallback': 0, 'personalised:flipping-be': 0.5 },
  'BETP-1R-rrMax5': { 'fixed:be-fallback': 0, 'fixed:flipping-be': 0,
                      'multi:be-fallback': 0.5, 'multi:flipping-be': 0.5,
                      'personalised:be-fallback': 0.5, 'personalised:flipping-be': 1.7 },
  'BETP-multipart-overcap': { 'fixed:be-fallback': 0, 'fixed:flipping-be': 0,
                              'multi:be-fallback': 0.5, 'multi:flipping-be': 2.0,
                              'personalised:be-fallback': 0.5, 'personalised:flipping-be': 1.7 },
  'BESL-boundary': { 'fixed:be-fallback': 0, 'fixed:flipping-be': 0,
                     'multi:be-fallback': 1.5, 'multi:flipping-be': 1.5,
                     'personalised:be-fallback': 0.5, 'personalised:flipping-be': 1.7 },
  'TP-no-rrMax': { 'fixed:be-fallback': 2.4, 'fixed:flipping-be': 2.4,
                   'multi:be-fallback': 1.7, 'multi:flipping-be': 1.7,
                   'personalised:be-fallback': 1.7, 'personalised:flipping-be': 1.7 },
  'BESL-bucket': { 'fixed:be-fallback': 0, 'fixed:flipping-be': -1,
                   'multi:be-fallback': 0.5, 'multi:flipping-be': -1,
                   'personalised:be-fallback': 0.5, 'personalised:flipping-be': 0.5 },
  'BETP-mid': { 'fixed:be-fallback': 0, 'fixed:flipping-be': 0,
                'multi:be-fallback': 1.5, 'multi:flipping-be': 1.5,
                'personalised:be-fallback': 0.5, 'personalised:flipping-be': 1.7 },
  // BE-TP rrMax<TP1 in personalised:
  //   be-fallback trigger=0.5 applyBEAware: legs lv=1, lv=2.4 both > 0.5 → 0R
  //   flipping-be pure-tp-no-sl: lv=1 ≤ reachR(0.6)? no → skip; lv=2.4: no → 0R
  'BETP-rrMax-below-TP1': { 'fixed:be-fallback': 0, 'fixed:flipping-be': 0,
                            'multi:be-fallback': 0.25, 'multi:flipping-be': 0.25,
                            'personalised:be-fallback': 0, 'personalised:flipping-be': 0 },
  // BE-TP no rrMax: reachR fallback = realizedR(0) = 0. Personalised:
  //   be-fallback trigger=1 applyBEAware: 0.5*1 + skip = 0.5R
  //   flipping-be pure-tp-no-sl: lv=1 ≤ reachR(0)? no → skip; lv=2.4: no → 0R
  'BETP-no-rrMax': { 'fixed:be-fallback': 0, 'fixed:flipping-be': 0,
                     'multi:be-fallback': 0.5, 'multi:flipping-be': 0.5,
                     'personalised:be-fallback': 0.5, 'personalised:flipping-be': 0 },
};

// ── Output buffer ──
const out = [];
function w(line = '') { out.push(line); }

w('═══════════════════════════════════════════════════════════════════════════');
w('  AUDIT TEST RUNNER — Flipping Market Dashboard calc engine');
w('  Dataset: ' + rawTrades.length + ' synthetic trades');
w('  TP modes: ' + TP_MODES.join(', '));
w('  BE modes: ' + BE_MODES.join(', '));
w('  Total cells per trade: ' + (TP_MODES.length * BE_MODES.length));
w('═══════════════════════════════════════════════════════════════════════════');
w();

// ── PHASE 2 : per-trade × per-cell expected vs observed ──

w('─────────────────────────────────────────────────────────────────────');
w('PHASE 2 — effectiveR matrix (expected → observed, gap if any)');
w('─────────────────────────────────────────────────────────────────────');

const tradesFresh = () => rawTrades.map(t => ({ ...t }));
let totalCells = 0, totalGaps = 0;
const gaps = [];

for (const trade of rawTrades) {
  w();
  w(`▶ Trade: ${trade.id}  (outcome=${trade.outcome}, r=${trade.r}, rrMax=${trade.rrMax}, beMgmt=[${(trade.beManagement || []).join(',')}], tp1_rr=${trade.tp1_rr}, tp2_rr=${trade.tp2_rr})`);
  for (const tp of TP_MODES) {
    for (const be of BE_MODES) {
      calc.appState.ui.beMode = be;
      calc.appState.ui.tpConfig = tpConfigs[tp];
      const tCopy = { ...trade };
      const observed = calc.computeEffectiveRR(tCopy, tpConfigs[tp]);
      const exp = expected[trade.id]?.[`${tp}:${be}`];
      totalCells++;
      const gap = (exp != null && Math.abs(observed - exp) > 0.001) ? ` GAP exp=${exp}` : '';
      if (gap) {
        totalGaps++;
        gaps.push({ trade: trade.id, tp, be, expected: exp, observed });
      }
      const expStr = (exp != null) ? exp.toFixed(2).padStart(6) : '   ?  ';
      w(`    ${tp.padEnd(13)} × ${be.padEnd(13)} → observed=${observed.toFixed(2).padStart(6)}  exp=${expStr}${gap}`);
    }
  }
}

w();
w(`Cells tested: ${totalCells}  ·  Gaps vs expected: ${totalGaps}`);
if (gaps.length) {
  w('Gaps detail:');
  for (const g of gaps) w(`  ${g.trade} [${g.tp} × ${g.be}]: expected ${g.expected}, observed ${g.observed}`);
}

// ── PHASE 3 : inter-widget convergence ──

w();
w('─────────────────────────────────────────────────────────────────────');
w('PHASE 3 — inter-widget convergence');
w('─────────────────────────────────────────────────────────────────────');

// PO ↔ Personalised on the same plan
function sumPO(trades, partials) {
  // Mimics _poSimulateModel semantics: per trade, _poSimTradeBeAware(t, reach, partials).
  let total = 0;
  for (const t of trades) {
    const reach = calc._getTradeReachR(t);
    total += calc._poSimTradeBeAware(t, reach, partials);
  }
  return total;
}

w();
w('PO ↔ Personalised (Total R) — expect convergence to rounding for every BE mode');
const personalisedPlan = [{ lv: 1, pct: 0.5 }, { lv: 2.4, pct: 0.5 }];
for (const be of BE_MODES) {
  calc.appState.ui.beMode = be;
  calc.appState.ui.tpConfig = tpConfigs.personalised;
  const ts = tradesFresh();
  const persoTotal = ts.reduce((s, t) => s + calc.computeEffectiveRR(t, tpConfigs.personalised), 0);
  const tsPO = tradesFresh();
  const poTotal = sumPO(tsPO, personalisedPlan);
  const delta = persoTotal - poTotal;
  const flag = Math.abs(delta) > 0.0001 ? '  ⚠ DIVERGENT' : '  ✓';
  w(`  BE=${be.padEnd(13)} : Personalised=${persoTotal.toFixed(4)}  PO=${poTotal.toFixed(4)}  Δ=${delta.toFixed(4)}${flag}`);
}

// Multi ↔ PO
w();
w('Multi ↔ PO (Total R) — divergence ACCEPTED on runners (tp_N_rr > leg lv) ; check structural');
const multiPlanLegs = [{ lv: 1, pct: 0.5 }, { lv: 2.4, pct: 0.5 }];
for (const be of BE_MODES) {
  calc.appState.ui.beMode = be;
  calc.appState.ui.tpConfig = tpConfigs.multi;
  const ts = tradesFresh();
  const multiTotal = ts.reduce((s, t) => s + calc.computeEffectiveRR(t, tpConfigs.multi), 0);
  const tsPO = tradesFresh();
  const poTotal = sumPO(tsPO, multiPlanLegs);
  const delta = multiTotal - poTotal;
  w(`  BE=${be.padEnd(13)} : Multi=${multiTotal.toFixed(4)}  PO(plan 1R/2.4R 50/50)=${poTotal.toFixed(4)}  Δ=${delta.toFixed(4)}`);
}

// ORR ↔ _getSimulatedR sticky_TR convergence at TP=2.4R
w();
w('ORR cumR ↔ Σ _getSimulatedR  (at TP=2.4R, BE-fallback ORR mode) — expect convergence');
calc.setOrrSimMode('be-fallback');
calc.appState.ui.rrMinFilter = null; // ORR pill not active for getSimulatedR (will use _SYSTEM_TP_R=2.4)

for (const be of BE_MODES) {
  calc.appState.ui.beMode = be;
  const ts = tradesFresh();
  const orrResults = calc.computeOptimalRR(ts);
  const orr2_4 = orrResults.find(r => Math.abs(r.tp - 2.4) < 0.01);
  const cumR = orr2_4 ? orr2_4.cumR : null;
  // Σ simulated R (treating null/excluded as 0R contribution to cumR)
  let simSum = 0, excluded = 0;
  for (const t of ts) {
    const r = calc._getSimulatedR(t);
    if (r === null) excluded++;
    else simSum += r;
  }
  const delta = (cumR != null) ? cumR - simSum : null;
  const flag = (delta != null && Math.abs(delta) > 0.0001) ? '  ⚠ DIVERGENT' : '  ✓';
  w(`  BE=${be.padEnd(13)} : ORR cumR(tp=2.4)=${cumR}  Σ_getSimulatedR=${simSum.toFixed(2)}  excluded=${excluded}  Δ=${delta?.toFixed(4)}${flag}`);
}

// calcStats coherence: WR%, totalR, n
w();
w('calcStats summary across all (TP × BE) combos (n=' + rawTrades.length + ')');
w('  TP-mode      | BE-mode      |  n |  w |  l | be | WR%   | totalR  | PF      | maxDD');
w('  -------------+--------------+----+----+----+----+-------+---------+---------+--------');
for (const tp of TP_MODES) {
  for (const be of BE_MODES) {
    calc.appState.ui.beMode = be;
    calc.appState.ui.tpConfig = tpConfigs[tp];
    const ts = tradesFresh();
    const s = calc.calcStats(ts, tpConfigs[tp]);
    w(`  ${tp.padEnd(12)} | ${be.padEnd(12)} | ${String(s.n).padStart(2)} | ${String(s.w).padStart(2)} | ${String(s.l).padStart(2)} | ${String(s.bes).padStart(2)} | ${s.wr.toFixed(1).padStart(5)} | ${s.totalR.toFixed(2).padStart(7)} | ${(isFinite(s.pf) ? s.pf.toFixed(2) : '∞').padStart(7)} | ${s.maxDD.toFixed(2).padStart(7)}`);
  }
}

// ── PHASE 4 : edge cases and inter-mode inconsistencies ──

w();
w('─────────────────────────────────────────────────────────────────────');
w('PHASE 4 — edge cases & cross-mode consistency probes');
w('─────────────────────────────────────────────────────────────────────');

// Probe : same trade × same BE mode, different TP mode → expected to differ but
// surface every divergence > 0.01 as a "user awareness" point.
w();
w('Cross-TP-mode divergence per trade per BE mode (max - min over TP modes):');
const crossTpDivergences = [];
for (const trade of rawTrades) {
  for (const be of BE_MODES) {
    const vals = TP_MODES.map(tp => {
      calc.appState.ui.beMode = be;
      calc.appState.ui.tpConfig = tpConfigs[tp];
      return { tp, val: calc.computeEffectiveRR({ ...trade }, tpConfigs[tp]) };
    });
    const max = Math.max(...vals.map(v => v.val));
    const min = Math.min(...vals.map(v => v.val));
    if (max - min > 0.01) {
      crossTpDivergences.push({ trade: trade.id, be, vals, spread: max - min });
    }
  }
}
crossTpDivergences.sort((a, b) => b.spread - a.spread);
for (const d of crossTpDivergences.slice(0, 30)) {
  const valsStr = d.vals.map(v => `${v.tp}=${v.val.toFixed(2)}`).join('  ');
  w(`  ${d.trade.padEnd(28)} BE=${d.be.padEnd(13)} spread=${d.spread.toFixed(2).padStart(5)}  ${valsStr}`);
}

// Probe : test cache invalidation semantics on BE switch
w();
w('Cache invalidation : switch BE mode and verify computeEffectiveRR recomputes');
{
  // Use BESL-bucket: in Fixed mode it shifts from 0R (be-fallback BE-aware → BE-SL=0)
  // to -1R (flipping-be reach<2.4 → SL pur fallback → rrMax<2.4 → -1). The class
  // change (be → loss) makes the cache-invalidation signal observable.
  const t = { ...rawTrades.find(x => x.id === 'BESL-bucket') };
  calc.appState.ui.tpConfig = tpConfigs.fixed;

  calc.appState.ui.beMode = 'be-fallback';
  const r1 = calc.computeEffectiveRR(t, tpConfigs.fixed);
  // Now classify (mutates t._effectiveClassMode)
  calc._enrichTradeClassification([t], tpConfigs.fixed);
  const class1 = t.effectiveClass;
  const hash1 = t._effectiveClassMode;

  calc.appState.ui.beMode = 'flipping-be';
  // Without explicit cache clear, _enrichTradeClassification should detect hash mismatch.
  calc._enrichTradeClassification([t], tpConfigs.fixed);
  const class2 = t.effectiveClass;
  const hash2 = t._effectiveClassMode;
  const r2 = t.effectiveR;

  w(`  Trade BESL-bucket in Fixed mode :`);
  w(`    BE=be-fallback : effectiveR=${r1}  class=${class1}  hash=${hash1}`);
  w(`    BE=flipping-be : effectiveR=${r2}  class=${class2}  hash=${hash2}`);
  w(`    Hash differs ? ${hash1 !== hash2 ? '✓' : '⚠'}    Reclassified ? ${class1 !== class2 ? '✓ (be→loss)' : '⚠ stale'}`);
}

// Probe : multi-chip BE (max picked)
w();
w('Multi-chip BE trigger parsing : ["BE si set à 1RR","BE si set à 2RR"] → expect MAX=2');
{
  const trigger = calc._parseBeTriggerR(['BE si set à 1RR', 'BE si set à 2RR']);
  const triggerInverted = calc._parseBeTriggerR(['BE si set à 2RR', 'BE si set à 1RR']);
  w(`  parsed forward order  : ${trigger}    expected: 2  ${trigger === 2 ? '✓' : '⚠'}`);
  w(`  parsed inverted order : ${triggerInverted}    expected: 2  ${triggerInverted === 2 ? '✓' : '⚠'}`);
}

// Probe : empty / null beManagement
w();
w('Empty / malformed beManagement → expect null trigger, applyBEAware=false');
{
  const cases = [
    { name: 'empty array',    val: [] },
    { name: 'null',           val: null },
    { name: 'undefined',      val: undefined },
    { name: 'no-R chip',      val: ['BE rule that does not parse'] },
    { name: 'mixed types',    val: ['BE 1RR', 42, null, 'BE 3R'] },
  ];
  for (const c of cases) {
    const trigger = calc._parseBeTriggerR(c.val);
    w(`  ${c.name.padEnd(20)} → trigger=${trigger}`);
  }
}

// Probe : Personalised plan with extreme partial allocations
w();
w('Personalised invariants : sum != 100 → fallback to trade.r');
{
  const t = { outcome: 'TP', r: 5, rrMax: 5 };
  const cfg = { mode: 'personalised',
                multi: { tpCount: 2, partials: { tp1: 50, tp2: 50, tp3: 0 } },
                personalised: { tpCount: 2, targets: { tp1: 1, tp2: 2.4, tp3: 0 }, partials: { tp1: 70, tp2: 70, tp3: 0 } } };
  calc.appState.ui.beMode = 'be-fallback';
  const r = calc.computeEffectiveRR(t, cfg);
  w(`  partials sum=140 (invalid) → effectiveR=${r}  expected fallback to trade.r=5  ${r === 5 ? '✓' : '⚠'}`);
}

// ── PHASE 4b : ORR widget per BE mode at every step ──
w();
w('─────────────────────────────────────────────────────────────────────');
w('PHASE 4b — computeOptimalRR full curve per BE mode (be-fallback ORR)');
w('─────────────────────────────────────────────────────────────────────');
calc.setOrrSimMode('be-fallback');
calc.appState.ui.rrMinFilter = null;
for (const be of BE_MODES) {
  calc.appState.ui.beMode = be;
  const ts = tradesFresh();
  const r = calc.computeOptimalRR(ts);
  w();
  w(`BE=${be}`);
  w('  TP    | wins | losses | beOut | excluded | cumR    | WR%    | EV     | PF');
  w('  ------+------+--------+-------+----------+---------+--------+--------+-------');
  for (const row of r) {
    w(`  ${row.tp.toFixed(1).padStart(4)}  | ${String(row.wins).padStart(4)} | ${String(row.losses).padStart(6)} | ${String(row.beOut).padStart(5)} | ${String(row.excluded).padStart(8)} | ${row.cumR.toFixed(2).padStart(7)} | ${(row.winrate * 100).toFixed(1).padStart(5)} | ${row.ev.toFixed(2).padStart(6)} | ${(isFinite(row.pf) ? row.pf.toFixed(2) : '∞').padStart(6)}`);
  }
}

// ── Final summary ──
w();
w('═══════════════════════════════════════════════════════════════════════════');
w(`SUMMARY : ${totalCells} cells tested · ${totalGaps} gap(s) vs expected`);
w(`cross-TP divergences > 0.01 : ${crossTpDivergences.length} cases`);
w('═══════════════════════════════════════════════════════════════════════════');

const outputPath = path.join(__dirname, 'test_output.txt');
fs.writeFileSync(outputPath, out.join('\n'), 'utf8');
console.log(out.join('\n'));
console.error(`\nWritten to: ${outputPath}`);
console.error(`Cells: ${totalCells}, Gaps: ${totalGaps}`);
