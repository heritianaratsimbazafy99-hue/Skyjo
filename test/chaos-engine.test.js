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
