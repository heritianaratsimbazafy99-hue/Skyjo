const test = require("node:test");
const assert = require("node:assert/strict");

const ScoreViz = require("../score-visualization");

const players = [
  { id: "p1", name: "Mila", color: "#e11d48" },
  { id: "p2", name: "Nary", color: "#2563eb" },
  { id: "p3", name: "Tiana", color: "#0f766e" },
];

const rounds = [
  { number: 1, adjustedScores: { p1: 8, p2: 22, p3: -2 } },
  { number: 2, adjustedScores: { p1: 30, p2: 10, p3: 12 } },
  { number: 3, adjustedScores: { p1: -1, p2: 25, p3: 20 } },
];

test("buildCumulativeSeries starts at zero and accumulates each player per round", () => {
  const series = ScoreViz.buildCumulativeSeries(players, rounds);

  assert.deepEqual(
    series.map((playerSeries) => ({
      id: playerSeries.player.id,
      totals: playerSeries.points.map((point) => point.total),
    })),
    [
      { id: "p1", totals: [0, 8, 38, 37] },
      { id: "p2", totals: [0, 22, 32, 57] },
      { id: "p3", totals: [0, -2, 10, 30] },
    ]
  );
});

test("getScoreTrendDomain includes zero, target score, and negative totals", () => {
  const series = ScoreViz.buildCumulativeSeries(players, rounds);

  assert.deepEqual(ScoreViz.getScoreTrendDomain(series, 50), {
    minRound: 0,
    maxRound: 3,
    minScore: -10,
    maxScore: 60,
  });
});

test("getRiskLevel describes threshold distance with redundant labels", () => {
  assert.deepEqual(ScoreViz.getRiskLevel(22, 100), {
    key: "safe",
    label: "Confort",
    remainingLabel: "78 pts restants",
  });
  assert.deepEqual(ScoreViz.getRiskLevel(65, 100), {
    key: "watch",
    label: "Vigilance",
    remainingLabel: "35 pts restants",
  });
  assert.deepEqual(ScoreViz.getRiskLevel(85, 100), {
    key: "danger",
    label: "Danger",
    remainingLabel: "15 pts restants",
  });
  assert.deepEqual(ScoreViz.getRiskLevel(108, 100), {
    key: "over",
    label: "Seuil atteint",
    remainingLabel: "8 pts au-dessus",
  });
});

test("getTrendLayout grows width for long games but keeps a stable minimum", () => {
  assert.deepEqual(ScoreViz.getTrendLayout(0), { width: 640, height: 260 });
  assert.deepEqual(ScoreViz.getTrendLayout(4), { width: 640, height: 260 });
  assert.deepEqual(ScoreViz.getTrendLayout(20), { width: 1040, height: 260 });
});

test("spreadLabelPositions separates direct labels while staying inside bounds", () => {
  assert.deepEqual(
    ScoreViz.spreadLabelPositions(
      [
        { id: "a", y: 80 },
        { id: "b", y: 84 },
        { id: "c", y: 90 },
      ],
      { min: 20, max: 100, gap: 14 }
    ),
    {
      a: 72,
      b: 86,
      c: 100,
    }
  );
});
