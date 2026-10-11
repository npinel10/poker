/**
 * app.js — Interface : navigation par onglets, explorateur de ranges
 * interactif, et génération des fiches push/fold.
 */

// ---------- Navigation par onglets ----------
function initTabs() {
  const buttons = document.querySelectorAll('.nav-btn');
  const panels = document.querySelectorAll('.tab-panel');

  function activate(tabId) {
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
    panels.forEach((p) => p.classList.toggle('active', p.id === tabId));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    history.replaceState(null, '', '#' + tabId);
  }

  buttons.forEach((b) => b.addEventListener('click', () => activate(b.dataset.tab)));

  const initial = window.location.hash ? window.location.hash.slice(1) : 'accueil';
  if (document.getElementById(initial)) activate(initial);
  else activate('accueil');
}

// ---------- Rendu d'une grille 13x13 ----------
function renderGrid(container, scenario, bb, bountyOn, options) {
  options = options || {};
  const { assignment, summary } = computeGrid(scenario, bb, bountyOn);
  container.innerHTML = '';
  container.classList.add('hand-grid');
  if (options.small) container.classList.add('small');

  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const rowRank = RANK_ORDER[i];
      const colRank = RANK_ORDER[j];
      let id;
      if (i === j) id = rowRank + rowRank;
      else if (i < j) id = rowRank + colRank + 's';
      else id = colRank + rowRank + 'o';

      const action = assignment.get(id) || 'fold';
      const meta = ACTION_META[action];
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.background = meta.color;
      if (action === 'fold') cell.classList.add('is-fold');
      cell.textContent = id;
      cell.title = `${id} — ${meta.label}`;
      container.appendChild(cell);
    }
  }
  return summary;
}

function renderLegend(container, summary, scenario) {
  container.innerHTML = '';
  const order = ['shove', '3bet', 'raise', 'call', 'fold'];
  order.forEach((action) => {
    if (!summary[action]) return;
    const meta = ACTION_META[action];
    const item = document.createElement('div');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = meta.color;
    const text = document.createElement('span');
    const pct = summary[action].pct.toFixed(1);
    const combos = summary[action].combos;
    text.textContent = `${meta.label} — ${pct}% (${combos} combos)`;
    item.appendChild(swatch);
    item.appendChild(text);
    container.appendChild(item);
  });
}

// ---------- Explorateur interactif ----------
const explorerState = { position: 'BTN', scenario: 'BTN_OPEN', bb: 20, bounty: false };

const SCENARIO_INFO = {
  BTN_OPEN: (bb) =>
    bb <= SHOVE_THRESHOLD_BB
      ? `À ${bb}bb, le BTN est en zone push/fold : on ouvre en shove ou on fold, pas de relance standard.`
      : `À ${bb}bb, le BTN ouvre en relance (limp quasi inexistant en hyper-turbo 3-max).`,
  SB_OPEN: (bb) =>
    bb <= SHOVE_THRESHOLD_BB
      ? `Le BTN a foldé. À ${bb}bb, la SB ouvre en shove ou fold.`
      : `Le BTN a foldé. À ${bb}bb, la SB relance ou fold, range plus large que le BTN (un seul adversaire derrière).`,
  SB_VS_BTN: (bb) =>
    bb <= SHOVE_THRESHOLD_BB
      ? `Le BTN a ouvert en shove (stack court). La SB ne peut que call ou fold.`
      : `Le BTN a ouvert en relance standard. La SB peut 3-bet, call ou fold selon son propre stack.`,
  BB_VS_BTN: (bb) =>
    bb <= SHOVE_THRESHOLD_BB
      ? `Le BTN a ouvert en shove. La BB ne peut que call ou fold, avec les meilleures cotes du coup.`
      : `Le BTN a ouvert en relance standard. La BB peut 3-bet, call ou fold.`,
  BB_VS_SB: (bb) =>
    bb <= SHOVE_THRESHOLD_BB
      ? `La SB a ouvert en shove. La BB ne peut que call ou fold (déjà 0.5bb investie).`
      : `La SB a ouvert en relance standard. La BB peut 3-bet, call ou fold, range large (SB souvent large aussi).`,
  BTN_VS_3BET: (bb) =>
    bb > THREEBET_DEEP_THRESHOLD_BB
      ? `Stack profond (>${THREEBET_DEEP_THRESHOLD_BB}bb) : le BTN peut 4-bet shove, call, ou fold face au 3-bet.`
      : `Stack ≤${THREEBET_DEEP_THRESHOLD_BB}bb : face au 3-bet, le BTN joue shove ou fold (le call plat est rarement rentable).`,
  SB_VS_3BET: (bb) =>
    bb > THREEBET_DEEP_THRESHOLD_BB
      ? `Stack profond (>${THREEBET_DEEP_THRESHOLD_BB}bb) : la SB peut 4-bet shove, call, ou fold face au 3-bet de la BB.`
      : `Stack ≤${THREEBET_DEEP_THRESHOLD_BB}bb : face au 3-bet de la BB, la SB joue shove ou fold.`,
};

function populateScenarios() {
  const select = document.getElementById('scenario-select');
  select.innerHTML = '';
  SCENARIOS_BY_POSITION[explorerState.position].forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.key;
    opt.textContent = s.label;
    select.appendChild(opt);
  });
  explorerState.scenario = SCENARIOS_BY_POSITION[explorerState.position][0].key;
  select.value = explorerState.scenario;
}

function updateExplorer() {
  const grid = document.getElementById('explorer-grid');
  const legend = document.getElementById('explorer-legend');
  const summary = renderGrid(grid, explorerState.scenario, explorerState.bb, explorerState.bounty);
  renderLegend(legend, summary, explorerState.scenario);

  const totalContinue = Object.keys(summary)
    .filter((k) => k !== 'fold')
    .reduce((acc, k) => acc + summary[k].pct, 0);
  document.getElementById('explorer-total').textContent = `Range totale jouée : ${totalContinue.toFixed(1)}%`;

  const infoFn = SCENARIO_INFO[explorerState.scenario];
  document.getElementById('explorer-info').textContent = infoFn ? infoFn(explorerState.bb) : '';

  document.getElementById('bb-value').textContent = explorerState.bb + ' bb';
}

function initExplorer() {
  const posButtons = document.querySelectorAll('.position-btn');
  posButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      posButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      explorerState.position = btn.dataset.position;
      populateScenarios();
      updateExplorer();
    });
  });

  document.getElementById('scenario-select').addEventListener('change', (e) => {
    explorerState.scenario = e.target.value;
    updateExplorer();
  });

  const slider = document.getElementById('bb-slider');
  slider.addEventListener('input', (e) => {
    explorerState.bb = Number(e.target.value);
    updateExplorer();
  });

  document.getElementById('bounty-toggle').addEventListener('change', (e) => {
    explorerState.bounty = e.target.checked;
    updateExplorer();
  });

  populateScenarios();
  updateExplorer();
}

// ---------- Fiches Push/Fold ----------
const CHEAT_SHEET_STACKS = [20, 15, 12, 10, 7, 5, 3, 2];
const CHEAT_SHEET_SCENARIOS = [
  { key: 'BTN_OPEN', title: 'BTN — Open' },
  { key: 'SB_OPEN', title: 'SB — Open (BTN fold)' },
  { key: 'BB_VS_BTN', title: 'BB — vs Open BTN' },
  { key: 'BB_VS_SB', title: 'BB — vs Open SB' },
];

function buildCheatSheets() {
  const root = document.getElementById('cheatsheets-root');
  root.innerHTML = '';

  CHEAT_SHEET_SCENARIOS.forEach((scenario) => {
    const section = document.createElement('div');
    section.className = 'cheat-scenario';
    const h3 = document.createElement('h3');
    h3.textContent = scenario.title;
    section.appendChild(h3);

    const row = document.createElement('div');
    row.className = 'cheat-row';

    CHEAT_SHEET_STACKS.forEach((bb) => {
      const card = document.createElement('div');
      card.className = 'cheat-card';
      const label = document.createElement('div');
      label.className = 'cheat-card-label';
      label.textContent = bb + ' bb';
      card.appendChild(label);

      const gridEl = document.createElement('div');
      card.appendChild(gridEl);
      const summary = renderGrid(gridEl, scenario.key, bb, false, { small: true });

      const pctEl = document.createElement('div');
      pctEl.className = 'cheat-card-pct';
      const played = Object.keys(summary)
        .filter((k) => k !== 'fold')
        .reduce((acc, k) => acc + summary[k].pct, 0);
      pctEl.textContent = played.toFixed(1) + '%';
      card.appendChild(pctEl);

      row.appendChild(card);
    });

    section.appendChild(row);
    root.appendChild(section);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initExplorer();
  buildCheatSheets();
});
