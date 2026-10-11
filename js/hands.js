/**
 * hands.js — Générateur des 169 mains de départ + classement de force.
 *
 * Le classement utilise la formule de Chen (méthode publiée par David Sklansky
 * pour évaluer la force d'une main preflop : hauteur des cartes, paire,
 * assortie, connectivité). Elle sert de base objective et reproductible pour
 * construire des ranges cohérentes (voir la page "Méthodologie" du site pour
 * le détail complet).
 */

const RANK_ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const RANK_VALUE = { A: 14, K: 13, Q: 12, J: 11, T: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 };

const CHEN_VALUE = { A: 10, K: 8, Q: 7, J: 6, T: 5, 9: 4.5, 8: 4, 7: 3.5, 6: 3, 5: 2.5, 4: 2, 3: 1.5, 2: 1 };

function gapPenalty(gap) {
  if (gap <= 0) return 0;
  if (gap === 1) return 1;
  if (gap === 2) return 2;
  if (gap === 3) return 4;
  return 5;
}

function chenScore(rHi, rLo, suited, isPair) {
  let score;
  if (isPair) {
    score = Math.max(CHEN_VALUE[rHi] * 2, 5);
  } else {
    score = CHEN_VALUE[rHi];
    if (suited) score += 2;
    const gap = RANK_VALUE[rHi] - RANK_VALUE[rLo] - 1;
    score -= gapPenalty(gap);
    if (gap <= 1 && RANK_VALUE[rHi] <= RANK_VALUE['J']) score += 1;
  }
  return Math.ceil(score * 2) / 2;
}

// Construit les 169 mains avec leur score, combos, et méta-données.
function buildHandTable() {
  const hands = [];
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const rowRank = RANK_ORDER[i];
      const colRank = RANK_ORDER[j];
      if (i === j) {
        hands.push({
          id: rowRank + rowRank,
          label: rowRank + rowRank,
          type: 'pair',
          combos: 6,
          row: i,
          col: j,
          score: chenScore(rowRank, rowRank, false, true),
        });
      } else if (i < j) {
        const id = rowRank + colRank + 's';
        hands.push({
          id,
          label: id,
          type: 'suited',
          combos: 4,
          row: i,
          col: j,
          score: chenScore(rowRank, colRank, true, false),
        });
      } else {
        const id = colRank + rowRank + 'o';
        hands.push({
          id,
          label: id,
          type: 'offsuit',
          combos: 12,
          row: i,
          col: j,
          score: chenScore(colRank, rowRank, false, false),
        });
      }
    }
  }
  return hands;
}

const HAND_TABLE = buildHandTable();
const TOTAL_COMBOS = 1326;

// Tri décroissant par force : score Chen, puis paires > assorties > dépareillées,
// puis somme des hauteurs, pour un ordre déterministe et stable.
const HAND_ORDER = [...HAND_TABLE].sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  const typeRank = { pair: 2, suited: 1, offsuit: 0 };
  if (typeRank[b.type] !== typeRank[a.type]) return typeRank[b.type] - typeRank[a.type];
  const sumA = RANK_VALUE[a.id[0]] + RANK_VALUE[a.id[1]];
  const sumB = RANK_VALUE[b.id[0]] + RANK_VALUE[b.id[1]];
  return sumB - sumA;
});

const HAND_RANK_INDEX = new Map(HAND_ORDER.map((h, idx) => [h.id, idx]));

// Retourne, pour chaque main (dans HAND_ORDER), le % cumulé de combos
// atteint une fois cette main incluse.
const CUMULATIVE_PCT = (() => {
  let cum = 0;
  return HAND_ORDER.map((h) => {
    cum += h.combos;
    return (cum / TOTAL_COMBOS) * 100;
  });
})();

/**
 * Renvoie l'ensemble des id de mains (ex: "AKs") appartenant au top `pct`%
 * de combos selon le classement de force. pct est borné [0,100].
 */
function topHandsByPercent(pct) {
  const target = Math.max(0, Math.min(100, pct));
  if (target <= 0) return new Set();
  const set = new Set();
  for (let i = 0; i < HAND_ORDER.length; i++) {
    if (CUMULATIVE_PCT[i] - HAND_ORDER[i].combos / TOTAL_COMBOS * 100 * 0.999 <= target) {
      // Inclure tant que le début de la main est encore sous la cible (arrondi au plus proche)
    }
    if (CUMULATIVE_PCT[i] <= target + (HAND_ORDER[i].combos / TOTAL_COMBOS * 100) / 2) {
      set.add(HAND_ORDER[i].id);
    } else {
      break;
    }
  }
  return set;
}

function exactCombosForSet(set) {
  let combos = 0;
  set.forEach((id) => {
    const h = HAND_TABLE.find((x) => x.id === id);
    if (h) combos += h.combos;
  });
  return combos;
}
