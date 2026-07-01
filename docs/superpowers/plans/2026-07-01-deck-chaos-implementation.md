# Deck Chaos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an optional Deck Chaos mode for Skyjo Score Arena with 36 random rule cards, mixed before/after reveal, automatic score effects, manual table challenges, persistent history, and QR mobile consistency.

**Architecture:** Add a shared `chaos-engine.js` module loaded by both the browser and Node server. The engine owns card definitions, weighted selection, target resolution, rare-card tracking, and pure score effect application. `app.js` and `server.js` keep their existing action flow but call the shared engine during state normalization, card preparation, and round calculation.

**Tech Stack:** Vanilla HTML/CSS/JS, Node HTTP server, CommonJS-compatible shared JS module, Node built-in test runner.

---

## File Map

- Create `chaos-engine.js`: shared Deck Chaos catalogue, selection helpers, target resolution, score effect resolver, exports for browser and Node.
- Create `test/chaos-engine.test.js`: unit tests for deck shape, selection, rare-card rules, and representative score effects.
- Modify `package.json`: add a `test` script using `node --test`.
- Modify `index.html`: load `chaos-engine.js` before `app.js`, add Deck Chaos controls and card container.
- Modify `app.js`: normalize chaos state, dispatch chaos actions, draw active cards, apply chaos during round calculation, render card UI and history.
- Modify `server.js`: require `chaos-engine.js`, mirror app state normalization/action/round logic for QR sessions.
- Modify `styles.css`: style Deck Chaos settings, active card, masked after-card state, score explanations, and history badges.

## Task 1: Shared Engine Skeleton And Tests

**Files:**
- Create: `chaos-engine.js`
- Create: `test/chaos-engine.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add the Node test script**

Modify `package.json` so `scripts` becomes:

```json
"scripts": {
  "dev": "node server.js",
  "start": "node server.js",
  "check": "node --check app.js && node --check server.js && node --check chaos-engine.js",
  "test": "node --test test/*.test.js"
}
```

- [ ] **Step 2: Create the first failing engine tests**

Create `test/chaos-engine.test.js`:

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const Chaos = require("../chaos-engine");

test("default chaos mode is disabled and extreme-ready", () => {
  assert.deepEqual(Chaos.createDefaultChaosMode(), {
    enabled: false,
    intensity: "extreme",
    revealMode: "mixed",
    usedRareCardIds: [],
  });
});

test("normalizes missing chaos state without enabling it", () => {
  assert.deepEqual(Chaos.normalizeChaosMode(undefined, []), Chaos.createDefaultChaosMode());
});

test("exports a 36-card Deck Chaos catalogue", () => {
  assert.equal(Chaos.CHAOS_CARDS.length, 36);
  assert.equal(new Set(Chaos.CHAOS_CARDS.map((card) => card.id)).size, 36);
  assert.ok(Chaos.CHAOS_CARDS.every((card) => card.title && card.description && card.timing && card.rarity));
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run:

```bash
npm test
```

Expected: FAIL because `chaos-engine.js` does not exist yet.

- [ ] **Step 4: Create the shared engine skeleton**

Create `chaos-engine.js` with this structure:

```js
(function attachChaosEngine(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.SkyjoChaos = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createChaosEngine() {
  const TIMING = {
    BEFORE: "before",
    AFTER: "after",
  };

  const RARITY = {
    COMMON: "common",
    RARE: "rare",
    VERY_RARE: "very-rare",
  };

  const CATEGORY = {
    SCORE: "score",
    MANUAL: "manual",
    ADAPTIVE: "adaptive",
    VIOLENT: "violent",
    FUNNY: "funny",
    STRATEGIC: "strategic",
  };

  const CHAOS_CARDS = [
    { id: "fermeture-piegee", title: "Fermeture piegee", timing: TIMING.BEFORE, rarity: RARITY.RARE, category: CATEGORY.SCORE, weight: 7, description: "Si le joueur qui ferme n'est pas seul meilleur score de manche, son score positif est triple au lieu d'etre double." },
    { id: "dernier-souffle", title: "Dernier souffle", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.ADAPTIVE, weight: 10, description: "Le dernier au classement avant la manche retire 15 points s'il fait la meilleure manche." },
    { id: "chasse-au-leader", title: "Chasse au leader", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.ADAPTIVE, weight: 10, description: "Si le leader ne finit pas dans les deux meilleurs scores de manche, il prend +10." },
    { id: "zero-heroique", title: "Zero heroique", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.SCORE, weight: 10, description: "Tout joueur qui termine la manche a 0 marque -10." },
    { id: "interdit-de-fermer", title: "Interdit de fermer", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.SCORE, weight: 10, description: "Un joueur tire au hasard prend +20 s'il ferme cette manche.", target: "random-player" },
    { id: "mini-manche-nucleaire", title: "Mini-manche nucleaire", timing: TIMING.BEFORE, rarity: RARITY.RARE, category: CATEGORY.SCORE, weight: 7, description: "Les scores positifs entre 1 et 10 deviennent 0 ; les scores au-dessus de 25 prennent +10." },
    { id: "tout-ou-rien", title: "Tout ou rien", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.SCORE, weight: 10, description: "Le meilleur score de manche gagne -8 ; le pire score prend +8." },
    { id: "annonce-sous-pression", title: "Annonce sous pression", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.MANUAL, weight: 10, manual: true, description: "Defi manuel : le joueur qui ferme doit etre choisi dans l'app avant de saisir les scores." },
    { id: "score-miroir", title: "Score miroir", timing: TIMING.AFTER, rarity: RARITY.RARE, category: CATEGORY.SCORE, weight: 7, description: "Deux joueurs tires au hasard echangent leurs scores finaux de manche.", target: "two-random-players" },
    { id: "taxe-du-pire", title: "La taxe du pire", timing: TIMING.AFTER, rarity: RARITY.COMMON, category: CATEGORY.SCORE, weight: 10, description: "Le pire score de manche prend +12." },
    { id: "hold-up", title: "Hold-up", timing: TIMING.AFTER, rarity: RARITY.COMMON, category: CATEGORY.SCORE, weight: 10, description: "Le meilleur score de manche prend -8 et le pire prend +8." },
    { id: "egalite-explosive", title: "Egalite explosive", timing: TIMING.AFTER, rarity: RARITY.COMMON, category: CATEGORY.SCORE, weight: 10, description: "Si au moins deux joueurs ont le meme score de manche, chacun prend +5." },
    { id: "remboursement-surprise", title: "Remboursement surprise", timing: TIMING.AFTER, rarity: RARITY.COMMON, category: CATEGORY.FUNNY, weight: 10, description: "Un joueur tire au hasard retire 10 points, sauf s'il est deja premier au classement.", target: "random-player" },
    { id: "double-fond", title: "Double fond", timing: TIMING.AFTER, rarity: RARITY.COMMON, category: CATEGORY.SCORE, weight: 10, description: "Le deuxieme meilleur score de manche retire 12 points." },
    { id: "retour-de-flamme", title: "Retour de flamme", timing: TIMING.AFTER, rarity: RARITY.COMMON, category: CATEGORY.SCORE, weight: 10, description: "Si le joueur qui ferme a pris la penalite officielle, le meilleur adversaire retire 10 points." },
    { id: "derniere-place-protegee", title: "Derniere place protegee", timing: TIMING.AFTER, rarity: RARITY.RARE, category: CATEGORY.ADAPTIVE, weight: 7, description: "Si le dernier au classement prend le pire score de manche, son malus chaos est annule une fois." },
    { id: "couronne-lourde", title: "Couronne lourde", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.ADAPTIVE, weight: 10, description: "Le leader commence la manche avec un handicap automatique de +7." },
    { id: "sous-marin", title: "Sous-marin", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.ADAPTIVE, weight: 10, description: "Le joueur le plus proche du leader sans etre premier retire 5 s'il bat le leader sur la manche." },
    { id: "rattrapage-brutal", title: "Rattrapage brutal", timing: TIMING.BEFORE, rarity: RARITY.RARE, category: CATEGORY.ADAPTIVE, weight: 7, description: "Si l'ecart entre le premier et le dernier depasse 50, le dernier retire 20 sur cette manche." },
    { id: "anti-domination", title: "Anti-domination", timing: TIMING.BEFORE, rarity: RARITY.RARE, category: CATEGORY.ADAPTIVE, weight: 7, description: "Si le meme joueur a gagne les deux dernieres manches, il prend +10 sur cette manche.", requiresTwoRounds: true },
    { id: "inversion-totale", title: "Inversion totale", timing: TIMING.AFTER, rarity: RARITY.VERY_RARE, category: CATEGORY.SCORE, weight: 2, description: "Apres calcul, le meilleur score de manche devient le pire score de manche, et inversement." },
    { id: "banque-cassee", title: "Banque cassee", timing: TIMING.AFTER, rarity: RARITY.VERY_RARE, category: CATEGORY.SCORE, weight: 2, description: "Tous les scores chaos sont divises par deux, arrondis vers le bas." },
    { id: "jackpot-noir", title: "Jackpot noir", timing: TIMING.AFTER, rarity: RARITY.VERY_RARE, category: CATEGORY.FUNNY, weight: 2, description: "Un joueur tire au hasard double son score de manche, y compris si le score est negatif.", target: "random-player" },
    { id: "reset-de-panique", title: "Reset de panique", timing: TIMING.AFTER, rarity: RARITY.VERY_RARE, category: CATEGORY.SCORE, weight: 2, description: "Le pire score de manche est remplace par la moyenne arrondie des autres scores." },
    { id: "dette-instantanee", title: "Dette instantanee", timing: TIMING.AFTER, rarity: RARITY.RARE, category: CATEGORY.VIOLENT, weight: 6, description: "Le pire score de manche prend +20 ; s'il est aussi le joueur qui ferme, il prend encore +10." },
    { id: "leader-en-surtension", title: "Leader en surtension", timing: TIMING.BEFORE, rarity: RARITY.RARE, category: CATEGORY.VIOLENT, weight: 6, description: "Le leader double son score de manche s'il finit pire que la moyenne des autres joueurs." },
    { id: "erreur-fatale", title: "Erreur fatale", timing: TIMING.AFTER, rarity: RARITY.RARE, category: CATEGORY.VIOLENT, weight: 6, description: "Tout score superieur ou egal a 30 recoit +15." },
    { id: "fermeture-kamikaze", title: "Fermeture kamikaze", timing: TIMING.BEFORE, rarity: RARITY.RARE, category: CATEGORY.VIOLENT, weight: 6, description: "Si le joueur qui ferme n'est pas strictement meilleur, son score est triple puis +5 est ajoute." },
    { id: "banquier-a-glisse", title: "Le banquier a glisse", timing: TIMING.AFTER, rarity: RARITY.COMMON, category: CATEGORY.FUNNY, weight: 10, description: "Un joueur tire au hasard recoit -10 ou +10, tire aleatoirement par l'app apres la manche.", target: "random-player" },
    { id: "justice-approximative", title: "Justice approximative", timing: TIMING.AFTER, rarity: RARITY.COMMON, category: CATEGORY.FUNNY, weight: 10, description: "L'app tire un joueur au hasard ; son score est remplace par la moyenne arrondie de la table.", target: "random-player" },
    { id: "applaudissements-obligatoires", title: "Applaudissements obligatoires", timing: TIMING.AFTER, rarity: RARITY.COMMON, category: CATEGORY.MANUAL, weight: 10, manual: true, description: "Defi manuel : le joueur avec la meilleure manche choisit quelqu'un qui doit annoncer son score avec respect." },
    { id: "mauvaise-foi-officielle", title: "Mauvaise foi officielle", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.MANUAL, weight: 10, manual: true, description: "Defi manuel : chaque joueur annonce s'il pense finir meilleur que le leader. L'app affiche le defi sans appliquer automatiquement l'effet." },
    { id: "pari-de-fermeture", title: "Pari de fermeture", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.STRATEGIC, weight: 10, manual: true, description: "Defi manuel : avant la manche chaque joueur peut declarer je ferme. Les paris ne sont pas saisis dans cette version." },
    { id: "assurance-anti-catastrophe", title: "Assurance anti-catastrophe", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.STRATEGIC, weight: 10, manual: true, description: "Defi manuel : un joueur peut accepter +5 quoi qu'il arrive pour plafonner son score final a 25. L'app affiche le defi sans saisie dediee." },
    { id: "cible-prioritaire", title: "Cible prioritaire", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.STRATEGIC, weight: 10, description: "L'app designe un joueur cible. Ceux qui font mieux que lui retirent 5 ; ceux qui font pire prennent +5.", target: "random-player" },
    { id: "contre-leader", title: "Contre-leader", timing: TIMING.BEFORE, rarity: RARITY.COMMON, category: CATEGORY.STRATEGIC, weight: 10, manual: true, description: "Defi manuel : le dernier choisit attaque ou survie. L'app affiche le choix sans appliquer automatiquement l'effet." },
  ];

  function createDefaultChaosMode() {
    return {
      enabled: false,
      intensity: "extreme",
      revealMode: "mixed",
      usedRareCardIds: [],
    };
  }

  function normalizeChaosMode(input, rounds) {
    const defaults = createDefaultChaosMode();
    const usedFromRounds = Array.isArray(rounds)
      ? rounds.map((round) => round.chaos?.cardId).filter((cardId) => getCard(cardId)?.rarity === RARITY.VERY_RARE)
      : [];
    const usedRareCardIds = Array.from(new Set([...(Array.isArray(input?.usedRareCardIds) ? input.usedRareCardIds : []), ...usedFromRounds]));
    return {
      enabled: Boolean(input?.enabled),
      intensity: input?.intensity === "extreme" ? "extreme" : defaults.intensity,
      revealMode: input?.revealMode === "mixed" ? "mixed" : defaults.revealMode,
      usedRareCardIds,
    };
  }

  function getCard(cardId) {
    return CHAOS_CARDS.find((card) => card.id === cardId) || null;
  }

  return {
    CATEGORY,
    CHAOS_CARDS,
    RARITY,
    TIMING,
    createDefaultChaosMode,
    getCard,
    normalizeChaosMode,
  };
});
```

- [ ] **Step 5: Run tests and syntax checks**

Run:

```bash
npm test
npm run check
```

Expected: both PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json chaos-engine.js test/chaos-engine.test.js
git commit -m "feat: add Deck Chaos engine skeleton"
```

## Task 2: Card Selection, Target Resolution, And Rare-Card Rules

**Files:**
- Modify: `chaos-engine.js`
- Modify: `test/chaos-engine.test.js`

- [ ] **Step 1: Add failing selection tests**

Append to `test/chaos-engine.test.js`:

```js
function makePlayers() {
  return [
    { id: "p1", name: "Mila" },
    { id: "p2", name: "Nary" },
    { id: "p3", name: "Tiana" },
  ];
}

function makeState(overrides = {}) {
  return {
    players: makePlayers(),
    rounds: [],
    chaosMode: Chaos.createDefaultChaosMode(),
    ...overrides,
  };
}

test("selects a stable active card snapshot with resolved random target", () => {
  const state = makeState({
    chaosMode: { enabled: true, intensity: "extreme", revealMode: "mixed", usedRareCardIds: [] },
  });
  const card = Chaos.selectNextChaosCard(state, {
    random: () => 0,
    forceCardId: "interdit-de-fermer",
  });
  assert.equal(card.id, "interdit-de-fermer");
  assert.equal(card.revealedBeforeSubmit, true);
  assert.deepEqual(card.targets.players, ["p1"]);
});

test("masks after cards before submit but keeps the real card id in state", () => {
  const state = makeState({
    chaosMode: { enabled: true, intensity: "extreme", revealMode: "mixed", usedRareCardIds: [] },
  });
  const card = Chaos.selectNextChaosCard(state, {
    random: () => 0,
    forceCardId: "score-miroir",
  });
  assert.equal(card.id, "score-miroir");
  assert.equal(card.revealedBeforeSubmit, false);
  assert.equal(card.timing, "after");
  assert.deepEqual(card.targets.players, ["p1", "p2"]);
});

test("does not select previous card or already used very rare card", () => {
  const state = makeState({
    rounds: [{ chaos: { cardId: "zero-heroique" } }],
    chaosMode: { enabled: true, intensity: "extreme", revealMode: "mixed", usedRareCardIds: ["inversion-totale"] },
  });
  const eligible = Chaos.getEligibleCards(state);
  assert.equal(eligible.some((card) => card.id === "zero-heroique"), false);
  assert.equal(eligible.some((card) => card.id === "inversion-totale"), false);
});

test("excludes anti-domination before there are two previous rounds", () => {
  const state = makeState({
    chaosMode: { enabled: true, intensity: "extreme", revealMode: "mixed", usedRareCardIds: [] },
  });
  assert.equal(Chaos.getEligibleCards(state).some((card) => card.id === "anti-domination"), false);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm test
```

Expected: FAIL with missing `selectNextChaosCard` and `getEligibleCards`.

- [ ] **Step 3: Add selection helpers to `chaos-engine.js`**

Inside `createChaosEngine()`, before the final `return`, add:

```js
  function isChaosEnabled(state) {
    return Boolean(state?.chaosMode?.enabled) && Array.isArray(state.players) && state.players.length >= 2 && !state.gameOver;
  }

  function getTotals(state) {
    return (state.players || []).reduce((totals, player) => {
      totals[player.id] = (state.rounds || []).reduce((sum, round) => sum + Number(round.adjustedScores?.[player.id] ?? 0), 0);
      return totals;
    }, {});
  }

  function getRanking(state) {
    const totals = getTotals(state);
    return [...(state.players || [])].sort((a, b) => {
      const diff = (totals[a.id] ?? 0) - (totals[b.id] ?? 0);
      if (diff !== 0) return diff;
      return String(a.name || "").localeCompare(String(b.name || ""), "fr");
    });
  }

  function getPreviousChaosCardId(state) {
    return state?.rounds?.at?.(-1)?.chaos?.cardId || null;
  }

  function getEligibleCards(state) {
    const mode = normalizeChaosMode(state?.chaosMode, state?.rounds || []);
    const previousCardId = getPreviousChaosCardId(state);
    return CHAOS_CARDS.filter((card) => {
      if (card.id === previousCardId) return false;
      if (card.rarity === RARITY.VERY_RARE && mode.usedRareCardIds.includes(card.id)) return false;
      if (card.requiresTwoRounds && (!Array.isArray(state?.rounds) || state.rounds.length < 2)) return false;
      return true;
    });
  }

  function pickWeighted(cards, random) {
    const totalWeight = cards.reduce((sum, card) => sum + card.weight, 0);
    let cursor = random() * totalWeight;
    for (const card of cards) {
      cursor -= card.weight;
      if (cursor <= 0) return card;
    }
    return cards[cards.length - 1] || null;
  }

  function pickPlayerIds(players, count, random) {
    const pool = [...players];
    const picked = [];
    while (pool.length && picked.length < count) {
      const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
      picked.push(pool.splice(index, 1)[0].id);
    }
    return picked;
  }

  function resolveTargets(card, state, random) {
    const players = state.players || [];
    if (card.target === "random-player") return { players: pickPlayerIds(players, 1, random) };
    if (card.target === "two-random-players") return { players: pickPlayerIds(players, 2, random) };
    if (card.id === "couronne-lourde" || card.id === "chasse-au-leader" || card.id === "leader-en-surtension") {
      const leader = getRanking(state)[0];
      return { players: leader ? [leader.id] : [] };
    }
    if (card.id === "dernier-souffle" || card.id === "rattrapage-brutal" || card.id === "contre-leader") {
      const last = getRanking(state).at(-1);
      return { players: last ? [last.id] : [] };
    }
    if (card.id === "sous-marin") {
      const runnerUp = getRanking(state)[1];
      return { players: runnerUp ? [runnerUp.id] : [] };
    }
    return { players: [] };
  }

  function snapshotCard(card, state, random) {
    return {
      id: card.id,
      title: card.title,
      timing: card.timing,
      rarity: card.rarity,
      category: card.category,
      description: card.description,
      manual: Boolean(card.manual),
      revealedBeforeSubmit: card.timing === TIMING.BEFORE,
      targets: resolveTargets(card, state, random),
    };
  }

  function normalizeActiveChaosCard(input, players) {
    const card = getCard(input?.id);
    if (!card) return null;
    const playerIds = new Set((players || []).map((player) => player.id));
    return {
      id: card.id,
      title: card.title,
      timing: card.timing,
      rarity: card.rarity,
      category: card.category,
      description: card.description,
      manual: Boolean(card.manual),
      revealedBeforeSubmit: Boolean(input.revealedBeforeSubmit),
      targets: {
        players: Array.isArray(input.targets?.players) ? input.targets.players.filter((playerId) => playerIds.has(playerId)) : [],
      },
    };
  }

  function selectNextChaosCard(state, options = {}) {
    if (!isChaosEnabled(state)) return null;
    const random = typeof options.random === "function" ? options.random : Math.random;
    if (options.forceCardId) {
      const forced = getCard(options.forceCardId);
      return forced ? snapshotCard(forced, state, random) : null;
    }
    const eligible = getEligibleCards(state);
    const selected = pickWeighted(eligible.length ? eligible : CHAOS_CARDS, random);
    return selected ? snapshotCard(selected, state, random) : null;
  }
```

Then add these functions to the exported object:

```js
    getEligibleCards,
    getRanking,
    getTotals,
    isChaosEnabled,
    normalizeActiveChaosCard,
    selectNextChaosCard,
```

- [ ] **Step 4: Run tests and syntax checks**

Run:

```bash
npm test
npm run check
```

Expected: both PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add chaos-engine.js test/chaos-engine.test.js package.json
git commit -m "feat: select Deck Chaos cards"
```

## Task 3: Score Effect Resolver

**Files:**
- Modify: `chaos-engine.js`
- Modify: `test/chaos-engine.test.js`

- [ ] **Step 1: Add failing score effect tests**

Append to `test/chaos-engine.test.js`:

```js
function applyCard(cardId, rawScores, officialScores = rawScores, overrides = {}) {
  const state = makeState({
    rounds: overrides.rounds || [],
    chaosMode: { enabled: true, intensity: "extreme", revealMode: "mixed", usedRareCardIds: [] },
  });
  const card = Chaos.selectNextChaosCard(state, {
    forceCardId: cardId,
    random: overrides.random || (() => 0),
  });
  return Chaos.resolveChaosForRound({
    stateBeforeRound: state,
    rawScores,
    officialScores,
    closerId: overrides.closerId || "p1",
    closerPenaltyApplied: Boolean(overrides.closerPenaltyApplied),
    activeChaosCard: card,
    random: overrides.random || (() => 0),
  });
}

test("zero heroique turns zero scores into -10", () => {
  const result = applyCard("zero-heroique", { p1: 0, p2: 8, p3: 14 });
  assert.equal(result.adjustedScores.p1, -10);
  assert.equal(result.effects[0].cardId, "zero-heroique");
});

test("fermeture piegee upgrades official closer penalty from double to triple", () => {
  const result = applyCard("fermeture-piegee", { p1: 12, p2: 8, p3: 20 }, { p1: 24, p2: 8, p3: 20 }, {
    closerId: "p1",
    closerPenaltyApplied: true,
  });
  assert.equal(result.adjustedScores.p1, 36);
});

test("score miroir swaps two resolved player scores", () => {
  const result = applyCard("score-miroir", { p1: 5, p2: 22, p3: 9 });
  assert.deepEqual(result.adjustedScores, { p1: 22, p2: 5, p3: 9 });
});

test("manual cards keep scores but produce an explanation", () => {
  const result = applyCard("annonce-sous-pression", { p1: 5, p2: 12, p3: 9 });
  assert.deepEqual(result.adjustedScores, { p1: 5, p2: 12, p3: 9 });
  assert.equal(result.effects[0].type, "manual");
});

test("very rare cards are returned for usedRareCardIds", () => {
  const result = applyCard("banque-cassee", { p1: 5, p2: 21, p3: -3 });
  assert.deepEqual(result.adjustedScores, { p1: 2, p2: 10, p3: -2 });
  assert.deepEqual(result.usedRareCardIds, ["banque-cassee"]);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm test
```

Expected: FAIL with missing `resolveChaosForRound`.

- [ ] **Step 3: Add resolver helpers**

Inside `createChaosEngine()`, before the final `return`, add:

```js
  function cloneScores(scores) {
    return Object.fromEntries(Object.entries(scores || {}).map(([playerId, score]) => [playerId, Number(score) || 0]));
  }

  function addEffect(effects, card, message, players = [], type = "score") {
    effects.push({
      cardId: card.id,
      title: card.title,
      type,
      players,
      message,
    });
  }

  function getBestIds(scores) {
    const entries = Object.entries(scores);
    const best = Math.min(...entries.map(([, score]) => score));
    return entries.filter(([, score]) => score === best).map(([playerId]) => playerId);
  }

  function getWorstIds(scores) {
    const entries = Object.entries(scores);
    const worst = Math.max(...entries.map(([, score]) => score));
    return entries.filter(([, score]) => score === worst).map(([playerId]) => playerId);
  }

  function getSecondBestId(scores) {
    const uniqueScores = Array.from(new Set(Object.values(scores))).sort((a, b) => a - b);
    if (uniqueScores.length < 2) return null;
    const second = uniqueScores[1];
    const match = Object.entries(scores).find(([, score]) => score === second);
    return match ? match[0] : null;
  }

  function averageExcluding(scores, excludedPlayerId) {
    const values = Object.entries(scores).filter(([playerId]) => playerId !== excludedPlayerId).map(([, score]) => score);
    if (!values.length) return scores[excludedPlayerId] ?? 0;
    return Math.round(values.reduce((sum, score) => sum + score, 0) / values.length);
  }

  function hasCloserFailed(rawScores, closerId) {
    const closerScore = rawScores[closerId];
    return Number(closerScore) > 0 && Object.entries(rawScores).some(([playerId, score]) => playerId !== closerId && score <= closerScore);
  }

  function findLastRoundWinnerId(round) {
    if (!round?.adjustedScores) return null;
    const bestIds = getBestIds(round.adjustedScores);
    return bestIds.length === 1 ? bestIds[0] : null;
  }

  function createScoreSteps(rawScores, officialScores, finalScores, effects) {
    const steps = {};
    for (const playerId of Object.keys(rawScores)) {
      const playerEffects = effects.filter((effect) => effect.players.includes(playerId)).map((effect) => effect.message);
      steps[playerId] = {
        raw: rawScores[playerId],
        official: officialScores[playerId],
        final: finalScores[playerId],
        effects: playerEffects,
      };
    }
    return steps;
  }
```

- [ ] **Step 4: Add `resolveChaosForRound`**

Add this function before the final `return`:

```js
  function resolveChaosForRound(input) {
    const rawScores = cloneScores(input.rawScores);
    const officialScores = cloneScores(input.officialScores);
    const adjustedScores = cloneScores(input.officialScores);
    const stateBeforeRound = input.stateBeforeRound || {};
    const card = normalizeActiveChaosCard(input.activeChaosCard, stateBeforeRound.players || []);
    const effects = [];
    const random = typeof input.random === "function" ? input.random : Math.random;
    const closerId = input.closerId;
    const ranking = getRanking(stateBeforeRound);
    const leaderId = ranking[0]?.id || null;
    const lastId = ranking.at(-1)?.id || null;
    const runnerUpId = ranking[1]?.id || null;

    if (!card) {
      return {
        adjustedScores,
        chaos: null,
        effects,
        scoreSteps: createScoreSteps(rawScores, officialScores, adjustedScores, effects),
        usedRareCardIds: normalizeChaosMode(stateBeforeRound.chaosMode, stateBeforeRound.rounds || []).usedRareCardIds,
      };
    }

    const targetPlayers = Array.isArray(card.targets?.players) ? card.targets.players : [];
    const bestIds = () => getBestIds(adjustedScores);
    const worstIds = () => getWorstIds(adjustedScores);
    const bestSingle = () => (bestIds().length === 1 ? bestIds()[0] : null);
    const worstSingle = () => (worstIds().length === 1 ? worstIds()[0] : null);

    switch (card.id) {
      case "fermeture-piegee": {
        if (closerId && hasCloserFailed(rawScores, closerId)) {
          adjustedScores[closerId] = rawScores[closerId] * 3;
          addEffect(effects, card, "fermeture piegee", [closerId]);
        }
        break;
      }
      case "dernier-souffle": {
        if (lastId && bestIds().includes(lastId)) {
          adjustedScores[lastId] -= 15;
          addEffect(effects, card, "dernier souffle -15", [lastId]);
        }
        break;
      }
      case "chasse-au-leader": {
        const sorted = Object.entries(adjustedScores).sort((a, b) => a[1] - b[1]);
        const topTwo = sorted.slice(0, 2).map(([playerId]) => playerId);
        if (leaderId && !topTwo.includes(leaderId)) {
          adjustedScores[leaderId] += 10;
          addEffect(effects, card, "chasse au leader +10", [leaderId]);
        }
        break;
      }
      case "zero-heroique": {
        for (const [playerId, score] of Object.entries(adjustedScores)) {
          if (score === 0) {
            adjustedScores[playerId] = -10;
            addEffect(effects, card, "zero heroique -10", [playerId]);
          }
        }
        break;
      }
      case "interdit-de-fermer": {
        const targetId = targetPlayers[0];
        if (targetId && targetId === closerId) {
          adjustedScores[targetId] += 20;
          addEffect(effects, card, "interdit de fermer +20", [targetId]);
        }
        break;
      }
      case "mini-manche-nucleaire": {
        for (const [playerId, score] of Object.entries(adjustedScores)) {
          if (score > 0 && score <= 10) {
            adjustedScores[playerId] = 0;
            addEffect(effects, card, "mini-manche nucleaire score bas a 0", [playerId]);
          } else if (score > 25) {
            adjustedScores[playerId] += 10;
            addEffect(effects, card, "mini-manche nucleaire +10", [playerId]);
          }
        }
        break;
      }
      case "tout-ou-rien": {
        const best = bestSingle();
        const worst = worstSingle();
        if (best) {
          adjustedScores[best] -= 8;
          addEffect(effects, card, "tout ou rien -8", [best]);
        }
        if (worst && worst !== best) {
          adjustedScores[worst] += 8;
          addEffect(effects, card, "tout ou rien +8", [worst]);
        }
        break;
      }
      case "annonce-sous-pression":
      case "applaudissements-obligatoires":
      case "mauvaise-foi-officielle":
      case "pari-de-fermeture":
      case "assurance-anti-catastrophe":
      case "contre-leader": {
        addEffect(effects, card, card.description, targetPlayers, "manual");
        break;
      }
      case "score-miroir": {
        const [first, second] = targetPlayers;
        if (first && second) {
          const firstScore = adjustedScores[first];
          adjustedScores[first] = adjustedScores[second];
          adjustedScores[second] = firstScore;
          addEffect(effects, card, "score miroir", [first, second]);
        }
        break;
      }
      case "taxe-du-pire": {
        for (const playerId of worstIds()) {
          adjustedScores[playerId] += 12;
          addEffect(effects, card, "taxe du pire +12", [playerId]);
        }
        break;
      }
      case "hold-up": {
        const best = bestSingle();
        const worst = worstSingle();
        if (best) {
          adjustedScores[best] -= 8;
          addEffect(effects, card, "hold-up -8", [best]);
        }
        if (worst && worst !== best) {
          adjustedScores[worst] += 8;
          addEffect(effects, card, "hold-up +8", [worst]);
        }
        break;
      }
      case "egalite-explosive": {
        const counts = Object.values(adjustedScores).reduce((map, score) => {
          map.set(score, (map.get(score) || 0) + 1);
          return map;
        }, new Map());
        for (const [playerId, score] of Object.entries(adjustedScores)) {
          if ((counts.get(score) || 0) >= 2) {
            adjustedScores[playerId] += 5;
            addEffect(effects, card, "egalite explosive +5", [playerId]);
          }
        }
        break;
      }
      case "remboursement-surprise": {
        const targetId = targetPlayers[0];
        if (targetId && targetId !== leaderId) {
          adjustedScores[targetId] -= 10;
          addEffect(effects, card, "remboursement surprise -10", [targetId]);
        }
        break;
      }
      case "double-fond": {
        const secondBestId = getSecondBestId(adjustedScores);
        if (secondBestId) {
          adjustedScores[secondBestId] -= 12;
          addEffect(effects, card, "double fond -12", [secondBestId]);
        }
        break;
      }
      case "retour-de-flamme": {
        if (input.closerPenaltyApplied) {
          const opponents = Object.fromEntries(Object.entries(adjustedScores).filter(([playerId]) => playerId !== closerId));
          const bestOpponent = getBestIds(opponents)[0];
          if (bestOpponent) {
            adjustedScores[bestOpponent] -= 10;
            addEffect(effects, card, "retour de flamme -10", [bestOpponent]);
          }
        }
        break;
      }
      case "derniere-place-protegee": {
        if (lastId && worstIds().includes(lastId)) {
          adjustedScores[lastId] = officialScores[lastId];
          addEffect(effects, card, "derniere place protegee", [lastId]);
        }
        break;
      }
      case "couronne-lourde": {
        if (leaderId) {
          adjustedScores[leaderId] += 7;
          addEffect(effects, card, "couronne lourde +7", [leaderId]);
        }
        break;
      }
      case "sous-marin": {
        if (runnerUpId && leaderId && adjustedScores[runnerUpId] < adjustedScores[leaderId]) {
          adjustedScores[runnerUpId] -= 5;
          addEffect(effects, card, "sous-marin -5", [runnerUpId]);
        }
        break;
      }
      case "rattrapage-brutal": {
        if (leaderId && lastId) {
          const totals = getTotals(stateBeforeRound);
          if ((totals[lastId] ?? 0) - (totals[leaderId] ?? 0) > 50) {
            adjustedScores[lastId] -= 20;
            addEffect(effects, card, "rattrapage brutal -20", [lastId]);
          }
        }
        break;
      }
      case "anti-domination": {
        const lastTwoWinners = (stateBeforeRound.rounds || []).slice(-2).map(findLastRoundWinnerId);
        if (lastTwoWinners[0] && lastTwoWinners[0] === lastTwoWinners[1]) {
          adjustedScores[lastTwoWinners[0]] += 10;
          addEffect(effects, card, "anti-domination +10", [lastTwoWinners[0]]);
        }
        break;
      }
      case "inversion-totale": {
        const best = bestSingle();
        const worst = worstSingle();
        if (best && worst && best !== worst) {
          const bestScore = adjustedScores[best];
          adjustedScores[best] = adjustedScores[worst];
          adjustedScores[worst] = bestScore;
          addEffect(effects, card, "inversion totale", [best, worst]);
        }
        break;
      }
      case "banque-cassee": {
        for (const playerId of Object.keys(adjustedScores)) {
          adjustedScores[playerId] = Math.floor(adjustedScores[playerId] / 2);
          addEffect(effects, card, "banque cassee /2", [playerId]);
        }
        break;
      }
      case "jackpot-noir": {
        const targetId = targetPlayers[0];
        if (targetId) {
          adjustedScores[targetId] *= 2;
          addEffect(effects, card, "jackpot noir x2", [targetId]);
        }
        break;
      }
      case "reset-de-panique": {
        const worst = worstSingle();
        if (worst) {
          adjustedScores[worst] = averageExcluding(adjustedScores, worst);
          addEffect(effects, card, "reset de panique", [worst]);
        }
        break;
      }
      case "dette-instantanee": {
        for (const playerId of worstIds()) {
          adjustedScores[playerId] += playerId === closerId ? 30 : 20;
          addEffect(effects, card, playerId === closerId ? "dette instantanee +30" : "dette instantanee +20", [playerId]);
        }
        break;
      }
      case "leader-en-surtension": {
        if (leaderId) {
          const otherScores = Object.entries(adjustedScores).filter(([playerId]) => playerId !== leaderId).map(([, score]) => score);
          const average = otherScores.reduce((sum, score) => sum + score, 0) / Math.max(1, otherScores.length);
          if (adjustedScores[leaderId] > average) {
            adjustedScores[leaderId] *= 2;
            addEffect(effects, card, "leader en surtension x2", [leaderId]);
          }
        }
        break;
      }
      case "erreur-fatale": {
        for (const [playerId, score] of Object.entries(adjustedScores)) {
          if (score >= 30) {
            adjustedScores[playerId] += 15;
            addEffect(effects, card, "erreur fatale +15", [playerId]);
          }
        }
        break;
      }
      case "fermeture-kamikaze": {
        if (closerId && hasCloserFailed(rawScores, closerId)) {
          adjustedScores[closerId] = rawScores[closerId] * 3 + 5;
          addEffect(effects, card, "fermeture kamikaze x3 +5", [closerId]);
        }
        break;
      }
      case "banquier-a-glisse": {
        const targetId = targetPlayers[0];
        if (targetId) {
          const delta = random() < 0.5 ? -10 : 10;
          adjustedScores[targetId] += delta;
          addEffect(effects, card, `banquier a glisse ${delta > 0 ? "+10" : "-10"}`, [targetId]);
        }
        break;
      }
      case "justice-approximative": {
        const targetId = targetPlayers[0];
        if (targetId) {
          adjustedScores[targetId] = averageExcluding(adjustedScores, targetId);
          addEffect(effects, card, "justice approximative", [targetId]);
        }
        break;
      }
      case "cible-prioritaire": {
        const targetId = targetPlayers[0];
        if (targetId) {
          const targetScore = adjustedScores[targetId];
          for (const [playerId, score] of Object.entries(adjustedScores)) {
            if (playerId === targetId) continue;
            if (score < targetScore) {
              adjustedScores[playerId] -= 5;
              addEffect(effects, card, "cible prioritaire -5", [playerId]);
            } else if (score > targetScore) {
              adjustedScores[playerId] += 5;
              addEffect(effects, card, "cible prioritaire +5", [playerId]);
            }
          }
        }
        break;
      }
      default:
        break;
    }

    const usedRareCardIds = normalizeChaosMode(stateBeforeRound.chaosMode, stateBeforeRound.rounds || []).usedRareCardIds;
    const nextUsedRareCardIds = card.rarity === RARITY.VERY_RARE ? Array.from(new Set([...usedRareCardIds, card.id])) : usedRareCardIds;
    const chaos = {
      cardId: card.id,
      title: card.title,
      timing: card.timing,
      category: card.category,
      rarity: card.rarity,
      description: card.description,
      revealedBeforeSubmit: card.revealedBeforeSubmit,
      targets: card.targets,
      effects,
      scoreSteps: createScoreSteps(rawScores, officialScores, adjustedScores, effects),
    };

    return {
      adjustedScores,
      chaos,
      effects,
      scoreSteps: chaos.scoreSteps,
      usedRareCardIds: nextUsedRareCardIds,
    };
  }
```

Add `resolveChaosForRound` to the exported object.

- [ ] **Step 5: Run tests and syntax checks**

Run:

```bash
npm test
npm run check
```

Expected: both PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add chaos-engine.js test/chaos-engine.test.js
git commit -m "feat: resolve Deck Chaos score effects"
```

## Task 4: Integrate Chaos State And Actions In Client And Server

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `server.js`

- [ ] **Step 1: Load the shared engine in the browser**

Modify `index.html` in the `<head>` so scripts are:

```html
<script defer src="/chaos-engine.js?v=1"></script>
<script defer src="/app.js?v=6"></script>
```

- [ ] **Step 2: Add engine references**

At the top of `app.js`, before `const STORAGE_KEY`, add:

```js
const SkyjoChaos = window.SkyjoChaos;
```

At the top of `server.js`, after the `QRCode` require, add:

```js
const SkyjoChaos = require("./chaos-engine");
```

- [ ] **Step 3: Extend initial state and normalization in both `app.js` and `server.js`**

In both files, update `createInitialState()` to include:

```js
    chaosMode: SkyjoChaos.createDefaultChaosMode(),
    activeChaosCard: null,
```

In `app.js` `normalizeState(input)`, add these properties inside `normalized` after `roundDraft`:

```js
    chaosMode: SkyjoChaos.normalizeChaosMode(input.chaosMode, input.rounds),
    activeChaosCard: SkyjoChaos.normalizeActiveChaosCard(input.activeChaosCard, players),
```

In `server.js` `cleanState(input)`, add the same properties inside `cleaned` after `roundDraft`:

```js
    chaosMode: SkyjoChaos.normalizeChaosMode(input.chaosMode, input.rounds),
    activeChaosCard: SkyjoChaos.normalizeActiveChaosCard(input.activeChaosCard, players),
```

- [ ] **Step 4: Add chaos preparation helpers in both `app.js` and `server.js`**

In both files, after the helper `ensureGameMaster(targetState, randomize = true)` or `ensureGameMaster(state, randomize = true)`, add:

```js
function ensureChaosCardForNextRound(targetState) {
  targetState.chaosMode = SkyjoChaos.normalizeChaosMode(targetState.chaosMode, targetState.rounds);

  if (!SkyjoChaos.isChaosEnabled(targetState)) {
    targetState.activeChaosCard = null;
    return targetState;
  }

  targetState.activeChaosCard = SkyjoChaos.normalizeActiveChaosCard(targetState.activeChaosCard, targetState.players);
  if (!targetState.activeChaosCard) {
    targetState.activeChaosCard = SkyjoChaos.selectNextChaosCard(targetState);
  }

  return targetState;
}
```

- [ ] **Step 5: Add `SET_CHAOS_MODE` action in both `applyAction` functions**

Add this `case` after `SET_CLOSER_PENALTY` in both `app.js` and `server.js`:

```js
    case "SET_CHAOS_MODE": {
      next.chaosMode = SkyjoChaos.normalizeChaosMode({
        ...next.chaosMode,
        enabled: Boolean(action.enabled),
        intensity: "extreme",
        revealMode: "mixed",
      }, next.rounds);
      next.activeChaosCard = null;
      ensureChaosCardForNextRound(next);
      meta.message = next.chaosMode.enabled ? "Deck Chaos active. La table entre en zone instable." : "Deck Chaos desactive.";
      break;
    }
```

- [ ] **Step 6: Call `ensureChaosCardForNextRound` after player and reset actions**

In both `app.js` and `server.js`, after `ensureGameMaster(next);` in `ADD_PLAYER`, add:

```js
      ensureChaosCardForNextRound(next);
```

In both files, after `ensureGameMaster(next);` in `REMOVE_PLAYER`, add:

```js
      ensureChaosCardForNextRound(next);
```

In both files, inside `RESET_GAME`, build the reset state first:

```js
      const resetState = {
        ...createInitialState(),
        players,
        targetScore,
        doubleCloserPenalty,
        chaosMode: SkyjoChaos.normalizeChaosMode(action.chaosMode || next.chaosMode, []),
        gameMasterId: keepPlayers ? pickRandomGameMaster(players) : null,
        roundDraft: createEmptyRoundDraft(),
      };
      ensureChaosCardForNextRound(resetState);
      return {
        state: resetState,
        meta: { message: keepPlayers ? "Nouvelle partie lancee avec les memes joueurs." : "Table remise a zero." },
      };
```

Keep the surrounding `const keepPlayers`, `players`, `targetScore`, and `doubleCloserPenalty` lines already present.

- [ ] **Step 7: Replace `computeRound` in both `app.js` and `server.js`**

Replace the existing `computeRound` function in both files with:

```js
function computeRound(currentState, rawScores, closerId) {
  const officialScores = { ...rawScores };
  let closerPenaltyApplied = false;
  const announcerId = currentState.gameMasterId || null;

  if (currentState.doubleCloserPenalty && closerId) {
    const closerScore = rawScores[closerId];
    const hasEqualOrLowerOpponent = currentState.players.some((player) => player.id !== closerId && rawScores[player.id] <= closerScore);
    if (closerScore > 0 && hasEqualOrLowerOpponent) {
      officialScores[closerId] = closerScore * 2;
      closerPenaltyApplied = true;
    }
  }

  const chaosResult = SkyjoChaos.resolveChaosForRound({
    stateBeforeRound: currentState,
    rawScores,
    officialScores,
    closerId,
    closerPenaltyApplied,
    activeChaosCard: currentState.activeChaosCard,
  });

  return {
    id: uid("round"),
    number: currentState.rounds.length + 1,
    closerId,
    announcerId,
    scores: rawScores,
    scoreAnnouncements: currentState.players.map((player) => ({ playerId: player.id, score: rawScores[player.id] })),
    officialAdjustedScores: officialScores,
    adjustedScores: chaosResult.adjustedScores,
    closerPenaltyApplied,
    chaos: chaosResult.chaos,
    createdAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 8: Update submit and undo flow in both `applyAction` functions**

In `SUBMIT_ROUND`, replace the existing block from `next.rounds.push(round);` through the current `next.gameOver = Object.values(getTotals(next)).some((score) => score >= next.targetScore);` line with:

```js
      next.rounds.push(round);
      next.chaosMode = SkyjoChaos.normalizeChaosMode({
        ...next.chaosMode,
        usedRareCardIds: round.chaos?.cardId ? SkyjoChaos.normalizeChaosMode(next.chaosMode, [...next.rounds]).usedRareCardIds : next.chaosMode.usedRareCardIds,
      }, next.rounds);
      next.roundDraft = createEmptyRoundDraft();
      next.gameOver = Object.values(getTotals(next)).some((score) => score >= next.targetScore);
      next.activeChaosCard = null;
      ensureChaosCardForNextRound(next);
```

In `UNDO_ROUND`, after `next.gameOver = false;`, add:

```js
      next.chaosMode = SkyjoChaos.normalizeChaosMode(next.chaosMode, next.rounds);
      next.activeChaosCard = null;
      ensureChaosCardForNextRound(next);
```

- [ ] **Step 9: Preserve chaos settings on client reset**

In `app.js` `resetGame(keepPlayers = true)`, include `chaosMode`:

```js
    chaosMode: state.chaosMode,
```

- [ ] **Step 10: Run syntax checks and engine tests**

Run:

```bash
npm test
npm run check
```

Expected: both PASS.

- [ ] **Step 11: Commit**

Run:

```bash
git add index.html app.js server.js
git commit -m "feat: integrate Deck Chaos state"
```

## Task 5: Deck Chaos UI Rendering

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`

- [ ] **Step 1: Add Deck Chaos controls to settings**

In `index.html`, inside `.settings-grid` after the closer penalty toggle, add:

```html
<label class="toggle-row chaos-toggle-row" for="chaos-mode">
  <span>
    <strong>Deck Chaos</strong>
    <small>Ajoute des cartes random, des malus absurdes et des retournements violents.</small>
  </span>
  <input id="chaos-mode" type="checkbox" />
</label>
<div class="field chaos-intensity-field">
  <label for="chaos-intensity">Intensite chaos</label>
  <select id="chaos-intensity">
    <option value="extreme">Extreme</option>
  </select>
</div>
```

- [ ] **Step 2: Add active card container**

In `index.html`, inside `.round-panel`, immediately after `<div class="game-master-callout" id="game-master-callout" aria-live="polite"></div>`, add:

```html
<div class="chaos-card is-empty" id="chaos-card" aria-live="polite"></div>
```

- [ ] **Step 3: Register new DOM elements**

In `app.js`, add to the `elements` object:

```js
  chaosMode: document.querySelector("#chaos-mode"),
  chaosIntensity: document.querySelector("#chaos-intensity"),
  chaosCard: document.querySelector("#chaos-card"),
```

- [ ] **Step 4: Render controls and active card**

In `render()`, after `elements.closerPenalty.checked = state.doubleCloserPenalty;`, add:

```js
  elements.chaosMode.checked = Boolean(state.chaosMode.enabled);
  elements.chaosIntensity.value = state.chaosMode.intensity || "extreme";
```

In `render()`, after `renderGameMasterCallout();`, add:

```js
  renderChaosCard();
```

Add this function after `renderGameMasterCallout()`:

```js
function renderChaosCard() {
  if (!elements.chaosCard) return;
  const card = state.activeChaosCard;

  if (!state.chaosMode.enabled) {
    elements.chaosCard.className = "chaos-card is-empty";
    elements.chaosCard.innerHTML = `
      <span class="chaos-card-kicker">Deck Chaos</span>
      <strong>Mode desactive</strong>
      <p>Active-le dans les parametres pour tirer une carte a chaque manche.</p>
    `;
    return;
  }

  if (!card) {
    elements.chaosCard.className = "chaos-card is-empty";
    elements.chaosCard.innerHTML = `
      <span class="chaos-card-kicker">Deck Chaos</span>
      <strong>En attente de table</strong>
      <p>Ajoute au moins deux joueurs pour tirer la premiere carte.</p>
    `;
    return;
  }

  const targetNames = getChaosTargetNames(card);
  const isMasked = card.timing === "after" && !card.revealedBeforeSubmit;
  elements.chaosCard.className = `chaos-card rarity-${card.rarity}${isMasked ? " is-masked" : ""}`;
  elements.chaosCard.innerHTML = isMasked
    ? `
      <span class="chaos-card-kicker">Surprise chaos prete</span>
      <strong>Carte cachee jusqu'a la validation</strong>
      <p>L'effet tombera apres le calcul de la manche. Oui, c'est injuste. C'est le principe.</p>
    `
    : `
      <div class="chaos-card-header">
        <span class="chaos-card-kicker">${escapeHtml(card.manual ? "Defi de table" : "Effet automatique")}</span>
        <span class="chaos-rarity">${escapeHtml(card.rarity)}</span>
      </div>
      <strong>${escapeHtml(card.title)}</strong>
      <p>${escapeHtml(card.description)}</p>
      ${targetNames ? `<small>Cible: ${escapeHtml(targetNames)}</small>` : ""}
    `;
}

function getChaosTargetNames(card) {
  const targets = Array.isArray(card.targets?.players) ? card.targets.players : [];
  if (!targets.length) return "";
  return targets
    .map((playerId) => state.players.find((player) => player.id === playerId)?.name)
    .filter(Boolean)
    .join(", ");
}
```

- [ ] **Step 5: Wire settings events**

In `app.js`, after the closer penalty change listener, add:

```js
elements.chaosMode.addEventListener("change", () => {
  dispatchAction({
    type: "SET_CHAOS_MODE",
    enabled: elements.chaosMode.checked,
    intensity: elements.chaosIntensity.value,
  });
});

elements.chaosIntensity.addEventListener("change", () => {
  dispatchAction({
    type: "SET_CHAOS_MODE",
    enabled: elements.chaosMode.checked,
    intensity: elements.chaosIntensity.value,
  });
});
```

- [ ] **Step 6: Add card reveal to submit toast**

In `handleActionMeta(action, meta)`, inside the `SUBMIT_ROUND` block, replace the existing `showToast` call that reports the validated round with:

```js
    const chaosText = meta.round?.chaos ? ` Chaos: ${meta.round.chaos.title}.` : "";
    showToast(`Manche ${meta.round?.number || state.rounds.length} validee. ${masterText}${penaltyText}${chaosText}`, meta.round?.closerPenaltyApplied ? "danger" : "success");
```

- [ ] **Step 7: Add CSS for controls and cards**

Append to `styles.css`:

```css
.chaos-toggle-row {
  border-color: rgba(225, 29, 72, 0.28);
  background: linear-gradient(135deg, rgba(225, 29, 72, 0.12), rgba(245, 158, 11, 0.14));
}

.chaos-intensity-field select {
  min-height: 48px;
  border: 1px solid rgba(47, 23, 37, 0.16);
  border-radius: 8px;
  padding: 0 14px;
  background: #fff;
  color: var(--color-foreground);
  font: inherit;
}

.chaos-card {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(225, 29, 72, 0.24);
  border-radius: 8px;
  padding: 16px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(254, 226, 226, 0.9));
  box-shadow: 0 16px 38px rgba(47, 23, 37, 0.1);
}

.chaos-card.is-empty {
  border-color: rgba(47, 23, 37, 0.12);
  background: rgba(255, 255, 255, 0.7);
}

.chaos-card.is-masked {
  border-color: rgba(124, 58, 237, 0.28);
  background: linear-gradient(135deg, rgba(237, 233, 254, 0.98), rgba(219, 234, 254, 0.86));
}

.chaos-card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.chaos-card-kicker,
.chaos-rarity {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.chaos-card strong {
  font-size: 1.05rem;
}

.chaos-card p,
.chaos-card small {
  margin: 0;
  color: rgba(47, 23, 37, 0.72);
}

.chaos-rarity {
  border-radius: 999px;
  padding: 4px 8px;
  background: rgba(225, 29, 72, 0.12);
  color: #be123c;
}
```

- [ ] **Step 8: Run checks**

Run:

```bash
npm test
npm run check
```

Expected: both PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add index.html app.js styles.css
git commit -m "feat: render Deck Chaos controls"
```

## Task 6: History, Score Explanations, And Mobile Consistency

**Files:**
- Modify: `app.js`
- Modify: `styles.css`

- [ ] **Step 1: Update desktop history headers**

In `renderHistory()`, change the header row to include a Chaos column after `Annonce`:

```js
      <th scope="col">Chaos</th>
```

In the history body row, after the announcement `<td>`, add:

```js
          <td>${renderChaosHistorySummary(round)}</td>
```

- [ ] **Step 2: Add history summary helpers**

Add after `renderHistory()`:

```js
function renderChaosHistorySummary(round) {
  if (!round.chaos) return "-";
  const effects = Array.isArray(round.chaos.effects) ? round.chaos.effects : [];
  const effectText = effects.length ? effects.map((effect) => effect.message).join(", ") : "aucun score modifie";
  return `
    <div class="history-chaos-summary">
      <strong>${escapeHtml(round.chaos.title)}</strong>
      <small>${escapeHtml(effectText)}</small>
    </div>
  `;
}

function renderScoreStep(round, player) {
  const raw = round.scores[player.id] ?? 0;
  const official = round.officialAdjustedScores?.[player.id] ?? raw;
  const final = round.adjustedScores[player.id] ?? official;
  const effects = round.chaos?.scoreSteps?.[player.id]?.effects || [];
  const parts = [`${raw}`];
  if (official !== raw) parts.push(`${official} penalite`);
  if (final !== official) parts.push(`${final} chaos`);
  if (parts.length === 1) return `${final}`;
  const suffix = effects.length ? ` (${effects.map(escapeHtml).join(", ")})` : "";
  return `${parts.join(" -> ")}${suffix}`;
}
```

- [ ] **Step 3: Use score steps in history cells**

Replace `renderHistoryCell(round, player)` with:

```js
function renderHistoryCell(round, player) {
  const raw = round.scores[player.id] ?? 0;
  const official = round.officialAdjustedScores?.[player.id] ?? raw;
  const adjusted = round.adjustedScores[player.id] ?? official;
  const hasChange = raw !== adjusted;
  return `<td class="${hasChange ? "penalty-cell" : ""}">${escapeHtml(renderScoreStep(round, player))}</td>`;
}
```

- [ ] **Step 4: Update mobile round cards**

Inside the mobile history renderer where `elements.roundCardsHistory.innerHTML` maps over `state.rounds`, after the `round-announcer` paragraph, add:

```js
          ${round.chaos ? `<p class="round-chaos-note"><strong>${escapeHtml(round.chaos.title)}</strong> ${escapeHtml((round.chaos.effects || []).map((effect) => effect.message).join(", ") || "defi affiche")}</p>` : ""}
```

Inside the mobile score pill map, replace the raw/adjusted label with:

```js
                return `<span class="round-score-pill${hasPenalty ? " has-penalty" : ""}" style="--player-color:${player.color}">${renderAvatar(player, "round-pill-avatar")}${escapeHtml(player.name)} ${escapeHtml(renderScoreStep(round, player))}</span>`;
```

- [ ] **Step 5: Add history CSS**

Append to `styles.css`:

```css
.history-chaos-summary {
  display: grid;
  gap: 2px;
  min-width: 160px;
}

.history-chaos-summary strong {
  font-size: 0.82rem;
}

.history-chaos-summary small,
.round-chaos-note {
  color: rgba(47, 23, 37, 0.68);
}

.round-chaos-note {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(225, 29, 72, 0.08);
}
```

- [ ] **Step 6: Run checks**

Run:

```bash
npm test
npm run check
```

Expected: both PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add app.js styles.css
git commit -m "feat: explain Deck Chaos history"
```

## Task 7: Browser Verification And QR Smoke Test

**Files:**
- No planned code changes unless verification finds a defect.

- [ ] **Step 1: Start the local server**

Run:

```bash
npm run dev
```

Expected: server prints `Skyjo Score Arena: http://127.0.0.1:8000/`.

- [ ] **Step 2: Verify baseline page loads**

Open `http://127.0.0.1:8000/`.

Expected:
- no console errors;
- Deck Chaos controls appear in "Joueurs et parametres";
- the card panel says Deck Chaos is disabled.

- [ ] **Step 3: Verify local Deck Chaos flow**

In the browser:

1. Add `Mila`, `Nary`, and `Tiana`.
2. Enable `Deck Chaos`.
3. Confirm a card appears or a masked "Surprise chaos prete" appears.
4. Choose a closer.
5. Enter scores `Mila: 12`, `Nary: 8`, `Tiana: 22`.
6. Announce each score.
7. Validate the round.

Expected:
- round validates;
- toast mentions the chaos card when one exists;
- history includes a Chaos column;
- score cells show transformations when score changed;
- no score is `undefined`, `NaN`, or blank.

- [ ] **Step 4: Verify disabled mode does not affect scoring**

In the browser:

1. Reset with same players.
2. Disable `Deck Chaos`.
3. Enter a round where closer is `Mila`, scores are `Mila: 12`, `Nary: 8`, `Tiana: 22`.
4. Validate.

Expected:
- Mila receives official closer penalty from `12` to `24` when official penalty is enabled;
- no chaos card is saved on the round;
- history Chaos column shows `-`.

- [ ] **Step 5: Verify QR mode state consistency**

In the browser:

1. Reset with same players.
2. Enable `Deck Chaos`.
3. Click `Activer le QR`.
4. Open the generated controller URL in another browser tab.
5. Confirm both desktop and controller show the same card state.
6. Submit a round from the controller tab.

Expected:
- desktop updates through SSE;
- desktop history shows the same chaos card resolved by the server;
- no duplicate card is drawn client-side after receiving remote state.

- [ ] **Step 6: Run final checks**

Run:

```bash
npm test
npm run check
git status --short
```

Expected:
- tests PASS;
- syntax check PASS;
- `git status --short` shows only intentional files if there are uncommitted verification fixes.

- [ ] **Step 7: Commit verification fixes if any were needed**

If code was changed during verification, run:

```bash
git add app.js server.js index.html styles.css chaos-engine.js test/chaos-engine.test.js package.json
git commit -m "fix: polish Deck Chaos verification"
```

Expected: no commit is needed if verification passed without code changes.

## Self-Review

- Spec coverage: The plan covers the shared engine, all 36 cards, weighted selection, before/after reveal, rare-card tracking, client/server integration, UI controls, history explanations, QR consistency, disabled-mode compatibility, and verification.
- Placeholder scan: No banned placeholder steps are present. Manual-only cards are explicitly scoped as displayed challenges for the first version.
- Type consistency: The same names are used across tasks: `chaosMode`, `activeChaosCard`, `round.chaos`, `officialAdjustedScores`, `adjustedScores`, `scoreSteps`, `selectNextChaosCard`, `resolveChaosForRound`, and `normalizeActiveChaosCard`.
