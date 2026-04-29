// audit/test_dataset.js
// Synthetic trades covering the 4 outcomes × edge cases.
// Each trade carries the fields actually consumed by the calc engine:
//   outcome, r, rrMax, beManagement (array), tp1_rr, tp2_rr, tp3_rr,
//   date, hour, _rawRowIndex.

'use strict';

// Convention chez Max (CLAUDE.md):
//   - SL pur     → trade.r = -1
//   - BE-SL      → trade.r = -1 (BE retraced past entry → got stopped)
//   - BE-TP      → trade.r = 0  (closed at BE before reaching TP)
//   - TP         → trade.r = +2.4 (system TP)
// rrMax is the max excursion reached; set independently of outcome.

const trades = [
  // ── 1. TP propre — straight to target ──
  {
    id: 'TP-clean',
    outcome: 'TP',
    r: 2.4,
    rrMax: 3.1,
    beManagement: ['BE si set à 1RR'],
    tp1_rr: 1.0, tp2_rr: 2.4, tp3_rr: null,
    date: '2026-01-01', hour: 10, _rawRowIndex: 0,
  },

  // ── 2. SL propre — never reached TP1 ──
  {
    id: 'SL-clean',
    outcome: 'SL',
    r: -1,
    rrMax: 0.4,
    beManagement: [],
    tp1_rr: null, tp2_rr: null, tp3_rr: null,
    date: '2026-01-02', hour: 9, _rawRowIndex: 1,
  },

  // ── 3. BE-TP avec chip "1RR" seulement, rrMax modeste ──
  {
    id: 'BETP-1R-low',
    outcome: 'BE-TP',
    r: 0,
    rrMax: 1.5,
    beManagement: ['BE si set à 1RR'],
    tp1_rr: 1.0, tp2_rr: null, tp3_rr: null,
    date: '2026-01-03', hour: 14, _rawRowIndex: 2,
  },

  // ── 4. BE-TP avec multi-chips ["1RR","2RR"], rrMax élevé ──
  {
    id: 'BETP-multi-high',
    outcome: 'BE-TP',
    r: 0,
    rrMax: 3.5,
    beManagement: ['BE si set à 1RR', 'BE si set à 2RR'],
    tp1_rr: 1.0, tp2_rr: 2.0, tp3_rr: null,
    date: '2026-01-04', hour: 11, _rawRowIndex: 3,
  },

  // ── 5. BE-SL avec chip "2RR" seulement, rrMax >= 2.4 ──
  {
    id: 'BESL-2R-high',
    outcome: 'BE-SL',
    r: -1,
    rrMax: 2.8,
    beManagement: ['BE si set à 2RR'],
    tp1_rr: 1.0, tp2_rr: 2.0, tp3_rr: null,
    date: '2026-01-05', hour: 13, _rawRowIndex: 4,
  },

  // ── 6. BE-SL avec beManagement vide (edge case) ──
  {
    id: 'BESL-empty-chip',
    outcome: 'BE-SL',
    r: -1,
    rrMax: 1.7,
    beManagement: [],
    tp1_rr: 1.0, tp2_rr: null, tp3_rr: null,
    date: '2026-01-06', hour: 15, _rawRowIndex: 5,
  },

  // ── 7. BE-TP avec rrMax très élevé (5R) — tester le cap ──
  {
    id: 'BETP-1R-rrMax5',
    outcome: 'BE-TP',
    r: 0,
    rrMax: 5.0,
    beManagement: ['BE si set à 1RR'],
    tp1_rr: 1.0, tp2_rr: null, tp3_rr: null,
    date: '2026-01-07', hour: 12, _rawRowIndex: 6,
  },

  // ── 8. BE-TP avec tpN_rr partiels qui dépassent beTriggerR (pour Multi mode) ──
  // tp2_rr=3.0 > trigger=1, donc Multi BE-aware doit l'exclure du cap
  {
    id: 'BETP-multipart-overcap',
    outcome: 'BE-TP',
    r: 0,
    rrMax: 3.2,
    beManagement: ['BE si set à 1RR'],
    tp1_rr: 1.0, tp2_rr: 3.0, tp3_rr: null,
    date: '2026-01-08', hour: 10, _rawRowIndex: 7,
  },

  // ── 9. BE-SL avec rrMax exactement égal à beTriggerR (boundary) ──
  {
    id: 'BESL-boundary',
    outcome: 'BE-SL',
    r: -1,
    rrMax: 2.4,
    beManagement: ['BE si set à 2RR'],
    tp1_rr: 1.0, tp2_rr: 2.0, tp3_rr: null,
    date: '2026-01-09', hour: 11, _rawRowIndex: 8,
  },

  // ── 10. TP avec rrMax = null (data oddity) ──
  {
    id: 'TP-no-rrMax',
    outcome: 'TP',
    r: 2.4,
    rrMax: null,
    beManagement: ['BE si set à 1RR'],
    tp1_rr: 1.0, tp2_rr: 2.4, tp3_rr: null,
    date: '2026-01-10', hour: 9, _rawRowIndex: 9,
  },

  // ── 11. BE-SL avec rrMax in [TP1, tp) — test du bucket beOut ──
  // rrMax=1.5 → > TP1 (1) but < TP=2 → bucket beOut in be-fallback ORR
  {
    id: 'BESL-bucket',
    outcome: 'BE-SL',
    r: -1,
    rrMax: 1.5,
    beManagement: ['BE si set à 1RR'],
    tp1_rr: 1.0, tp2_rr: null, tp3_rr: null,
    date: '2026-01-11', hour: 14, _rawRowIndex: 10,
  },

  // ── 12. BE-TP avec rrMax in [TP1, leg2) — test cap intermédiaire ──
  {
    id: 'BETP-mid',
    outcome: 'BE-TP',
    r: 0,
    rrMax: 2.5,
    beManagement: ['BE si set à 2RR'],
    tp1_rr: 1.0, tp2_rr: 2.0, tp3_rr: null,
    date: '2026-01-12', hour: 11, _rawRowIndex: 11,
  },

  // ── 13. BE-TP avec rrMax < TP1 (plan personnalisé) — Personalised flipping-be
  // utilise pure-tp-no-sl (floor 0R, pas de SL fallback). Test que le floor
  // est respecté quand reachR < TP1.
  {
    id: 'BETP-rrMax-below-TP1',
    outcome: 'BE-TP',
    r: 0,
    rrMax: 0.6,
    beManagement: ['BE si set à 0.5RR'],
    tp1_rr: 0.5, tp2_rr: null, tp3_rr: null,
    date: '2026-01-13', hour: 10, _rawRowIndex: 12,
  },

  // ── 14. BE-TP avec rrMax = null (data oddity) — défaut _getTradeReachR=0
  {
    id: 'BETP-no-rrMax',
    outcome: 'BE-TP',
    r: 0,
    rrMax: null,
    beManagement: ['BE si set à 1RR'],
    tp1_rr: 1.0, tp2_rr: null, tp3_rr: null,
    date: '2026-01-14', hour: 9, _rawRowIndex: 13,
  },
];

module.exports = { trades };
