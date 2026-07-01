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

test("normalizes stale two-player random target cards to null", () => {
  const state = makeState({
    chaosMode: { enabled: true, intensity: "extreme", revealMode: "mixed", usedRareCardIds: [] },
  });
  const card = Chaos.selectNextChaosCard(state, {
    random: () => 0,
    forceCardId: "score-miroir",
  });
  const remainingPlayers = makePlayers().filter((player) => player.id !== "p2");

  assert.equal(Chaos.normalizeActiveChaosCard(card, remainingPlayers), null);
});

test("normalizes stale ranking target cards to null", () => {
  const state = makeState({
    chaosMode: { enabled: true, intensity: "extreme", revealMode: "mixed", usedRareCardIds: [] },
  });
  const card = Chaos.selectNextChaosCard(state, {
    random: () => 0,
    forceCardId: "couronne-lourde",
  });
  const remainingPlayers = makePlayers().filter((player) => player.id !== "p1");

  assert.deepEqual(card.targets.players, ["p1"]);
  assert.equal(Chaos.normalizeActiveChaosCard(card, remainingPlayers), null);
});

test("keeps active random target cards when required targets are still present", () => {
  const state = makeState({
    chaosMode: { enabled: true, intensity: "extreme", revealMode: "mixed", usedRareCardIds: [] },
  });
  const card = Chaos.selectNextChaosCard(state, {
    random: () => 0,
    forceCardId: "interdit-de-fermer",
  });

  assert.deepEqual(Chaos.normalizeActiveChaosCard(card, makePlayers()), card);
});

test("normalizes legacy active cards with timing-based reveal defaults", () => {
  assert.equal(
    Chaos.normalizeActiveChaosCard({ id: "couronne-lourde", targets: { players: ["p1"] } }, makePlayers()).revealedBeforeSubmit,
    true
  );
  assert.equal(
    Chaos.normalizeActiveChaosCard({ id: "score-miroir", targets: { players: ["p1", "p2"] } }, makePlayers()).revealedBeforeSubmit,
    false
  );
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

test("ranking target effects use the active card snapshot", () => {
  const state = makeState({
    rounds: [{ adjustedScores: { p1: 20, p2: 0, p3: 10 } }],
    chaosMode: { enabled: true, intensity: "extreme", revealMode: "mixed", usedRareCardIds: [] },
  });
  const result = Chaos.resolveChaosForRound({
    stateBeforeRound: state,
    rawScores: { p1: 1, p2: 1, p3: 1 },
    officialScores: { p1: 1, p2: 1, p3: 1 },
    closerId: "p1",
    activeChaosCard: {
      id: "couronne-lourde",
      revealedBeforeSubmit: true,
      targets: { players: ["p1"] },
    },
  });

  assert.equal(result.adjustedScores.p1, 8);
  assert.equal(result.adjustedScores.p2, 1);
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

test("restores a valid active card snapshot from an undone chaos round", () => {
  const state = makeState({
    chaosMode: { enabled: true, intensity: "extreme", revealMode: "mixed", usedRareCardIds: [] },
  });
  const card = Chaos.selectNextChaosCard(state, {
    random: () => 0,
    forceCardId: "score-miroir",
  });
  const result = Chaos.resolveChaosForRound({
    stateBeforeRound: state,
    rawScores: { p1: 5, p2: 22, p3: 9 },
    officialScores: { p1: 5, p2: 22, p3: 9 },
    closerId: "p1",
    activeChaosCard: card,
  });

  assert.deepEqual(Chaos.restoreActiveChaosCardFromRound({ chaos: result.chaos }, makePlayers()), card);
});

test("fermeture kamikaze applies on a tied zero closer score", () => {
  const result = applyCard("fermeture-kamikaze", { p1: 0, p2: 0, p3: 9 }, undefined, {
    closerId: "p1",
  });
  assert.equal(result.adjustedScores.p1, 5);
});

test("score steps include ordered official penalty and chaos steps", () => {
  const result = applyCard("fermeture-kamikaze", { p1: 12, p2: 8, p3: 20 }, { p1: 24, p2: 8, p3: 20 }, {
    closerId: "p1",
    closerPenaltyApplied: true,
  });
  assert.equal(result.adjustedScores.p1, 41);
  assert.deepEqual(result.scoreSteps.p1.steps, [
    { label: "score brut", value: 12 },
    { label: "penalite fermeture", value: 24 },
    { label: "effet chaos", value: 41 },
  ]);
});
