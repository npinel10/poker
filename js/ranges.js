/**
 * ranges.js — Modèle stratégique du format 3-max hyper-turbo à élimination
 * progressive (type "Trident Space KO" chez Winamax).
 *
 * Les pourcentages ci-dessous sont des courbes indicatives construites à
 * partir des principes reconnus de push/fold (proches des tables Nash
 * heads-up), des ranges d'ouverture standards en 3-max hyper-turbo, et de
 * l'ajustement "bounty" classique (élargir les shoves, resserrer les calls
 * non-éliminatoires). Ce ne sont PAS des sorties de solveur propres à
 * Winamax : voir la page Méthodologie pour le détail et les limites.
 */

// --- Interpolation sur des points de contrôle [bb, pct] ---
function interpolate(curve, bb) {
  const x = Math.max(curve[0][0], Math.min(curve[curve.length - 1][0], bb));
  for (let i = 0; i < curve.length - 1; i++) {
    const [x0, y0] = curve[i];
    const [x1, y1] = curve[i + 1];
    if (x >= x0 && x <= x1) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return curve[curve.length - 1][1];
}

// Seuil au-delà duquel un "open" ou une "défense" devient un push/fold pur
// (plus de relance non all-in ni de call non all-in de sizing standard).
const SHOVE_THRESHOLD_BB = 15;
const THREEBET_DEEP_THRESHOLD_BB = 25; // au-delà : 3-bet non-all-in possible

// --- Courbes % (en % de combos, cumulés depuis le haut du classement) ---

const CURVES = {
  // Open en tant que 1er entrant
  BTN_OPEN: [[2, 100], [3, 100], [5, 96], [7, 90], [10, 82], [15, 74], [20, 69], [25, 66], [30, 63], [40, 60], [50, 58]],
  SB_OPEN: [[2, 100], [3, 100], [5, 98], [7, 94], [10, 88], [15, 80], [20, 74], [25, 70], [30, 67], [40, 63], [50, 60]],

  // Continuation totale (call + 3bet/shove) face à une ouverture
  SB_VS_BTN_CONTINUE: [[2, 100], [3, 100], [5, 90], [7, 78], [10, 64], [15, 52], [20, 44], [25, 40], [30, 37], [40, 34], [50, 32]],
  BB_VS_BTN_CONTINUE: [[2, 100], [3, 100], [5, 92], [7, 82], [10, 70], [15, 58], [20, 50], [25, 45], [30, 42], [40, 38], [50, 36]],
  BB_VS_SB_CONTINUE: [[2, 100], [3, 100], [5, 95], [7, 87], [10, 76], [15, 64], [20, 56], [25, 51], [30, 48], [40, 44], [50, 42]],

  // Continuation totale (call + 4bet-shove) pour l'ouvreur face à un 3-bet
  VS_3BET_CONTINUE: [[2, 100], [3, 100], [5, 85], [7, 72], [10, 58], [15, 44], [20, 36], [25, 31], [30, 28], [40, 25], [50, 23]],
};

// Fraction de la range de "continuation" allouée au 3-bet/shove (le reste = call),
// en fonction du stack effectif du DÉFENSEUR (celui qui décide 3bet vs call).
const THREEBET_ALLOC_CURVE = [[2, 100], [15, 100], [20, 78], [25, 60], [30, 48], [40, 38], [50, 32]];
// Fraction de la range de continuation (vs 3-bet) allouée au 4bet-shove,
// en fonction du stack effectif de l'OUVREUR original.
const FOURBET_SHOVE_ALLOC_CURVE = [[2, 100], [25, 100], [30, 70], [40, 50], [50, 40]];

const BOUNTY_SHOVE_MULT = 1.08; // élargit les ranges "élimination potentielle"
const BOUNTY_CALL_MULT = 0.93; // resserre les calls non all-in / non-éliminatoires

function pctFor(curveKey, bb) {
  return interpolate(CURVES[curveKey], bb);
}

/**
 * Construit les "couches" d'action pour un scénario donné : liste ordonnée
 * de {action, cutoffPct} où cutoffPct est le % CUMULÉ de combos (du plus
 * fort au plus faible) affecté à cette action. Le reste = fold.
 */
function buildScenarioLayers(scenario, bb, bountyOn) {
  const isShoveOpen = bb <= SHOVE_THRESHOLD_BB;

  switch (scenario) {
    case 'BTN_OPEN': {
      let pct = pctFor('BTN_OPEN', bb);
      if (bountyOn && isShoveOpen) pct = Math.min(100, pct * BOUNTY_SHOVE_MULT);
      return [{ action: isShoveOpen ? 'shove' : 'raise', cutoffPct: pct }];
    }
    case 'SB_OPEN': {
      let pct = pctFor('SB_OPEN', bb);
      if (bountyOn && isShoveOpen) pct = Math.min(100, pct * BOUNTY_SHOVE_MULT);
      return [{ action: isShoveOpen ? 'shove' : 'raise', cutoffPct: pct }];
    }

    case 'SB_VS_BTN':
    case 'BB_VS_BTN':
    case 'BB_VS_SB': {
      const curveKey = scenario === 'SB_VS_BTN' ? 'SB_VS_BTN_CONTINUE' : scenario === 'BB_VS_BTN' ? 'BB_VS_BTN_CONTINUE' : 'BB_VS_SB_CONTINUE';
      // Le stack qui compte pour savoir si l'OUVREUR a shove, c'est le stack effectif (bb).
      const openerShoved = isShoveOpen;
      let continuePct = pctFor(curveKey, bb);

      if (openerShoved) {
        // Ouverture déjà all-in : seules options = call ou fold.
        if (bountyOn) continuePct = Math.min(100, continuePct * BOUNTY_SHOVE_MULT);
        return [{ action: 'call', cutoffPct: continuePct }];
      }

      // Ouverture = relance standard : le défenseur peut 3-bet/shove, call, ou fold.
      const allocPct = interpolate(THREEBET_ALLOC_CURVE, bb); // % de la continuation en 3bet
      let threebetPct = continuePct * (allocPct / 100);
      let totalPct = continuePct;
      const threebetAction = bb <= SHOVE_THRESHOLD_BB ? 'shove' : '3bet';

      if (bountyOn) {
        threebetPct = Math.min(totalPct, threebetPct * BOUNTY_SHOVE_MULT);
        const callPortion = Math.max(0, totalPct - threebetPct) * BOUNTY_CALL_MULT;
        totalPct = threebetPct + callPortion;
      }

      return [
        { action: threebetAction, cutoffPct: threebetPct },
        { action: 'call', cutoffPct: totalPct },
      ];
    }

    case 'BTN_VS_3BET':
    case 'SB_VS_3BET': {
      let continuePct = pctFor('VS_3BET_CONTINUE', bb);
      const deepEnoughToFlat = bb > THREEBET_DEEP_THRESHOLD_BB;
      const shoveAllocPct = interpolate(FOURBET_SHOVE_ALLOC_CURVE, bb);
      let shovePct = deepEnoughToFlat ? continuePct * (shoveAllocPct / 100) : continuePct;
      let totalPct = continuePct;

      if (bountyOn) {
        shovePct = Math.min(totalPct, shovePct * BOUNTY_SHOVE_MULT);
        const callPortion = Math.max(0, totalPct - shovePct) * BOUNTY_CALL_MULT;
        totalPct = shovePct + callPortion;
      }

      if (!deepEnoughToFlat) {
        return [{ action: 'shove', cutoffPct: totalPct }];
      }
      return [
        { action: 'shove', cutoffPct: shovePct },
        { action: 'call', cutoffPct: totalPct },
      ];
    }

    default:
      return [];
  }
}

/**
 * Calcule, pour chaque main des 169, l'action assignée selon les couches.
 * Retourne une Map(id -> action) + un résumé {action: {pct, combos}}.
 */
function computeGrid(scenario, bb, bountyOn) {
  const layers = buildScenarioLayers(scenario, bb, bountyOn);
  const assignment = new Map();
  const summary = {};
  layers.forEach((l) => (summary[l.action] = { cutoffPct: l.cutoffPct, combos: 0 }));
  summary.fold = { combos: 0 };

  HAND_ORDER.forEach((h, idx) => {
    const cum = CUMULATIVE_PCT[idx];
    let assigned = 'fold';
    for (const layer of layers) {
      if (cum <= layer.cutoffPct + (h.combos / TOTAL_COMBOS) * 100 * 0.5) {
        assigned = layer.action;
        break;
      }
    }
    assignment.set(h.id, assigned);
    summary[assigned].combos += h.combos;
  });

  Object.keys(summary).forEach((k) => {
    summary[k].pct = (summary[k].combos / TOTAL_COMBOS) * 100;
  });

  return { assignment, summary, layers };
}

const ACTION_META = {
  raise: { label: 'Open (relance)', color: '#3b82f6' },
  shove: { label: 'Shove (all-in)', color: '#ef4444' },
  call: { label: 'Call', color: '#22c55e' },
  '3bet': { label: '3-bet', color: '#f97316' },
  fold: { label: 'Fold', color: '#262b33' },
};

const SCENARIOS_BY_POSITION = {
  BTN: [
    { key: 'BTN_OPEN', label: 'Open (premier à parler)' },
    { key: 'BTN_VS_3BET', label: 'Face à un 3-bet (SB ou BB)' },
  ],
  SB: [
    { key: 'SB_OPEN', label: 'Open (le BTN a foldé)' },
    { key: 'SB_VS_BTN', label: 'Défense face à un open BTN' },
    { key: 'SB_VS_3BET', label: 'Face à un 3-bet (après open SB)' },
  ],
  BB: [
    { key: 'BB_VS_BTN', label: 'Défense face à un open BTN' },
    { key: 'BB_VS_SB', label: 'Défense face à un open SB' },
  ],
};

const STACK_MARKS = [2, 3, 5, 7, 10, 12, 15, 20, 25, 30, 40, 50];
