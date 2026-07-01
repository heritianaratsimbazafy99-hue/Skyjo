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
