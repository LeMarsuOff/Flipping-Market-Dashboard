// audit/test_runner_extra.js
// Additional probes to support the audit report (post feat/kill-no-be-mode):
//  - Empty BE chip in be-fallback : Fixed vs Multi vs Personalised inconsistency
//    (incohérence #1 from the original audit — NOT addressed by this PR)
//  - ORR strict-loss vs be-fallback comparison
//  - PO ↔ Multi divergence breakdown per trade
//  - _hashTpConfig stability
//  - Personalised 3-leg plan
//  - PO Full Plan ↔ Personalised TotalR convergence
//
// The original Probe 1 ("Personalised × no-be vs flipping-be on BE-TP, rrMax<TP1")
// was deleted: the no-be mode no longer exists, so the asymmetry it documented
// has no surface. The flipping-be branch (pure-tp-no-sl variant) is the only
// remaining BE-TP fallback, and it correctly floors at 0R.

'use strict';

const fs = require('fs');
const path = require('path');
const calc = require('./calc_engine.js');
const { trades: rawTrades } = require('./test_dataset.js');

const out = [];
const w = (line = '') => out.push(line);

w('═══════════════════════════════════════════════════════════════════════════');
w('  EXTRA PROBES — design questions & edge cases (post feat/kill-no-be-mode)');
w('═══════════════════════════════════════════════════════════════════════════');

const persoPlan = { mode: 'personalised',
  multi: { tpCount: 2, partials: { tp1: 50, tp2: 50, tp3: 0 } },
  personalised: { tpCount: 2, targets: { tp1: 1, tp2: 2.4, tp3: 3 }, partials: { tp1: 50, tp2: 50, tp3: 0 } } };

// ── 1. Empty BE chip in be-fallback : Fixed=trade.r, Multi/Personalised=0R ──
w();
w('── Probe 1 : empty BE chip in be-fallback mode — TP-mode inconsistency ──');
w('CLAUDE.md decision table : be-fallback null chip → {applyBEAware:false, fallbackToNoBE:false}.');
w('  _resolveBeR        → "else" branch returns 0R');
w('  _resolveBeRMulti   → "else" branch returns 0R');
w('  _resolveBeRFixed   → "else" branch returns trade.r (passthrough)');
w('Inconsistency: same trade, different effectiveR per TP mode. Documented as');
w('audit incohérence #1 — NOT addressed by feat/kill-no-be-mode (separate PR).');
w();
calc.appState.ui.beMode = 'be-fallback';
const probe1 = [
  { id: 'BE-TP empty chip, r=0',   t: { outcome: 'BE-TP', r: 0,  rrMax: 1.5, beManagement: [], tp1_rr: 1, tp2_rr: null } },
  { id: 'BE-SL empty chip, r=-1',  t: { outcome: 'BE-SL', r: -1, rrMax: 1.5, beManagement: [], tp1_rr: 1, tp2_rr: null } },
  { id: 'BE-SL empty chip, r=0.5 (community)', t: { outcome: 'BE-SL', r: 0.5, rrMax: 1.5, beManagement: [], tp1_rr: 1, tp2_rr: null } },
];
for (const p of probe1) {
  const vals = {};
  for (const tpMode of ['fixed', 'multi', 'personalised']) {
    const cfg = { ...persoPlan, mode: tpMode };
    calc.appState.ui.tpConfig = cfg;
    vals[tpMode] = calc.computeEffectiveRR({ ...p.t }, cfg);
  }
  w(`  ${p.id.padEnd(40)} : fixed=${vals.fixed.toFixed(2)}  multi=${vals.multi.toFixed(2)}  personalised=${vals.personalised.toFixed(2)}`);
}

// ── 2. ORR strict-loss vs be-fallback mode comparison ──
w();
w('── Probe 2 : ORR widget — strict-loss vs be-fallback comparison at TP=2.4R ──');
calc.appState.ui.beMode = 'be-fallback';
calc.appState.ui.rrMinFilter = null;
const tradesSnap = rawTrades.map(t => ({ ...t }));
calc.setOrrSimMode('be-fallback');
const orrBF = calc.computeOptimalRR(tradesSnap.map(t => ({ ...t }))).find(r => Math.abs(r.tp - 2.4) < 0.01);
calc.setOrrSimMode('strict-loss');
const orrSL = calc.computeOptimalRR(tradesSnap.map(t => ({ ...t }))).find(r => Math.abs(r.tp - 2.4) < 0.01);
w(`  be-fallback ORR @ TP=2.4 : wins=${orrBF.wins} losses=${orrBF.losses} beOut=${orrBF.beOut} cumR=${orrBF.cumR}`);
w(`  strict-loss ORR @ TP=2.4 : wins=${orrSL.wins} losses=${orrSL.losses} beOut=${orrSL.beOut} cumR=${orrSL.cumR}`);
w(`  Δ cumR = ${(orrSL.cumR - orrBF.cumR).toFixed(2)}  (= -1 × number of beOut→losses migrated)`);

// ── 3. PO ↔ Multi divergence breakdown per trade ──
w();
w('── Probe 3 : Multi vs PO per-trade breakdown (be-fallback) ──');
w('Plan PO: 1R/2.4R 50/50 (matches Personalised). Multi: tpCount=2, 50/50 on tp1_rr/tp2_rr.');
const multiCfg = { mode: 'multi', multi: { tpCount: 2, partials: { tp1: 50, tp2: 50, tp3: 0 } },
                   personalised: persoPlan.personalised };
calc.appState.ui.beMode = 'be-fallback';
calc.appState.ui.tpConfig = multiCfg;
w('  Trade ID                       | outcome | tp_N_rr      | Multi  | PO 1R/2.4R | Δ      | Why');
w('  -------------------------------+---------+--------------+--------+------------+--------+-------------');
for (const t0 of rawTrades) {
  const t = { ...t0 };
  const multiR = calc.computeEffectiveRR(t, multiCfg);
  const reach = calc._getTradeReachR(t);
  const poR = calc._poSimTradeBeAware(t, reach, [{ lv: 1, pct: 0.5 }, { lv: 2.4, pct: 0.5 }]);
  const delta = multiR - poR;
  const tpStr = `${t.tp1_rr ?? 'null'}/${t.tp2_rr ?? 'null'}`;
  let why = '';
  if (Math.abs(delta) < 0.001) why = '(converges)';
  else if (t.outcome === 'TP' && t.tp2_rr != null && t.tp2_rr > 2.4) why = 'tp2_rr > leg lv (runner)';
  else if (t.outcome === 'TP' && t.tp2_rr != null && t.tp2_rr < 2.4) why = 'tp2_rr < leg lv (under)';
  else if (t.outcome === 'BE-SL' && t.r < 0) why = 'Multi BE-SL=trade.r passthrough';
  else if (t.outcome === 'BE-TP') why = 'Multi BE-TP weighted realized; PO uses plan exact';
  w(`  ${t0.id.padEnd(30)} | ${t.outcome.padEnd(7)} | ${tpStr.padEnd(12)} | ${multiR.toFixed(2).padStart(6)} | ${poR.toFixed(2).padStart(10)} | ${delta.toFixed(2).padStart(6)} | ${why}`);
}

// ── 4. _hashTpConfig stability — different objects, same values ──
w();
w('── Probe 4 : _hashTpConfig stability ──');
const cfgA = { mode: 'personalised', multi: { tpCount: 2, partials: { tp1: 50, tp2: 50, tp3: 0 } },
               personalised: { tpCount: 2, targets: { tp1: 1, tp2: 2.4, tp3: 3 }, partials: { tp1: 50, tp2: 50, tp3: 0 } } };
const cfgB = { mode: 'personalised', multi: { tpCount: 2, partials: { tp1: 50, tp2: 50, tp3: 0 } },
               personalised: { tpCount: 2, targets: { tp1: 1, tp2: 2.4, tp3: 3 }, partials: { tp1: 50, tp2: 50, tp3: 0 } } };
const cfgC = { mode: 'personalised', multi: { tpCount: 2, partials: { tp1: 50, tp2: 50, tp3: 0 } },
               personalised: { tpCount: 2, targets: { tp1: 1, tp2: 2.5, tp3: 3 }, partials: { tp1: 50, tp2: 50, tp3: 0 } } };
calc.appState.ui.beMode = 'be-fallback';
const hA = calc._hashTpConfig(cfgA);
const hB = calc._hashTpConfig(cfgB);
const hC = calc._hashTpConfig(cfgC);
w(`  hash(A) = ${hA}`);
w(`  hash(B) = ${hB}    A==B ? ${hA === hB ? '✓' : '⚠'}`);
w(`  hash(C) = ${hC}    A!=C ? ${hA !== hC ? '✓' : '⚠'}`);
calc.appState.ui.beMode = 'flipping-be';
const hAflip = calc._hashTpConfig(cfgA);
w(`  hash(A) under flipping-be = ${hAflip}    A_BF != A_FB ? ${hA !== hAflip ? '✓' : '⚠'}`);

// ── 5. 3-leg Personalised plan ──
w();
w('── Probe 5 : Personalised 3-leg plan (1R / 2R / 3R, 33/33/34) ──');
const cfg3 = { mode: 'personalised',
  multi: { tpCount: 3, partials: { tp1: 33, tp2: 33, tp3: 34 } },
  personalised: { tpCount: 3, targets: { tp1: 1, tp2: 2, tp3: 3 }, partials: { tp1: 33, tp2: 33, tp3: 34 } } };
calc.appState.ui.tpConfig = cfg3;
const probe5Trades = [
  { id: 'TP rrMax=3.5',     t: { outcome: 'TP', r: 2.4, rrMax: 3.5, beManagement: [] } },
  { id: 'TP rrMax=2.0',     t: { outcome: 'TP', r: 2.4, rrMax: 2.0, beManagement: [] } },
  { id: 'TP rrMax=1.5',     t: { outcome: 'TP', r: 2.4, rrMax: 1.5, beManagement: [] } },
  { id: 'BE-TP trigger=2',  t: { outcome: 'BE-TP', r: 0, rrMax: 4.0, beManagement: ['BE 2RR'] } },
  { id: 'BE-SL trigger=3',  t: { outcome: 'BE-SL', r: -1, rrMax: 3.5, beManagement: ['BE 3RR'] } },
];
for (const p of probe5Trades) {
  const vals = {};
  for (const be of ['be-fallback', 'flipping-be']) {
    calc.appState.ui.beMode = be;
    vals[be] = calc.computeEffectiveRR({ ...p.t }, cfg3);
  }
  w(`  ${p.id.padEnd(20)} : be-fallback=${vals['be-fallback'].toFixed(3)}  flipping-be=${vals['flipping-be'].toFixed(3)}`);
}

// ── 6. PO Full Plan vs Personalised across 3 plans (full-plan card convergence) ──
w();
w('── Probe 6 : PO Full Plan ↔ Personalised TotalR convergence (multi-leg plans) ──');
const plans = [
  { name: '2R 100%',          legs: [{ lv: 2.0, pct: 1.0 }],  perso: { tpCount: 2, targets: { tp1: 2.0, tp2: 2.0, tp3: 0 }, partials: { tp1: 100, tp2: 0, tp3: 0 } } },
  { name: '1R/2.4R 50/50',    legs: [{ lv: 1.0, pct: 0.5 },  { lv: 2.4, pct: 0.5 }], perso: { tpCount: 2, targets: { tp1: 1.0, tp2: 2.4, tp3: 0 }, partials: { tp1: 50, tp2: 50, tp3: 0 } } },
  { name: '1R/2R/3R 33/33/34',legs: [{ lv: 1.0, pct: 0.33 }, { lv: 2.0, pct: 0.33 }, { lv: 3.0, pct: 0.34 }], perso: { tpCount: 3, targets: { tp1: 1.0, tp2: 2.0, tp3: 3.0 }, partials: { tp1: 33, tp2: 33, tp3: 34 } } },
];
w('  Plan                    | BE-mode      | Personalised | PO         | Δ');
w('  ------------------------+--------------+--------------+------------+--------');
for (const plan of plans) {
  for (const be of ['be-fallback', 'flipping-be']) {
    const persoCfg = { mode: 'personalised', multi: { tpCount: 2, partials: { tp1: 50, tp2: 50, tp3: 0 } }, personalised: plan.perso };
    calc.appState.ui.beMode = be;
    calc.appState.ui.tpConfig = persoCfg;
    const ts = rawTrades.map(t => ({ ...t }));
    const persoTotal = ts.reduce((s, t) => s + calc.computeEffectiveRR(t, persoCfg), 0);
    const tsPO = rawTrades.map(t => ({ ...t }));
    let poTotal = 0;
    for (const t of tsPO) {
      const reach = calc._getTradeReachR(t);
      poTotal += calc._poSimTradeBeAware(t, reach, plan.legs);
    }
    const delta = persoTotal - poTotal;
    const flag = Math.abs(delta) > 0.0001 ? '⚠' : '✓';
    w(`  ${plan.name.padEnd(23)} | ${be.padEnd(12)} | ${persoTotal.toFixed(4).padStart(12)} | ${poTotal.toFixed(4).padStart(10)} | ${delta.toFixed(4)}  ${flag}`);
  }
}

w();
w('═══════════════════════════════════════════════════════════════════════════');

const outputPath = path.join(__dirname, 'test_extra_output.txt');
fs.writeFileSync(outputPath, out.join('\n'), 'utf8');
console.log(out.join('\n'));
