const test = require("node:test");
const assert = require("node:assert/strict");

const ScoreDraft = require("../score-draft");

const players = [
  { id: "p1", name: "Mila" },
  { id: "p2", name: "Nary" },
  { id: "p3", name: "Tiana" },
];

test("normalizeRoundDraft keeps in-progress mobile scores for matching players", () => {
  const draft = ScoreDraft.normalizeRoundDraft(
    {
      closerId: "p2",
      scores: {
        p1: "12",
        p2: "-1",
        removed: "99",
      },
    },
    players
  );

  assert.deepEqual(draft, {
    closerId: "p2",
    scores: {
      p1: "12",
      p2: "-1",
    },
  });
});

test("syncDraftScore stores score text without forcing unfinished numeric input", () => {
  const draft = ScoreDraft.syncDraftScore(ScoreDraft.createEmptyRoundDraft(), "p1", "-", players);

  assert.deepEqual(draft, {
    closerId: "",
    scores: {
      p1: "-",
    },
  });
});

test("shouldClearRoundDraft clears local input when the played round count changes", () => {
  assert.equal(
    ScoreDraft.shouldClearRoundDraft({ rounds: [] }, { rounds: [{ number: 1 }] }),
    true
  );
  assert.equal(
    ScoreDraft.shouldClearRoundDraft({ rounds: [{ number: 1 }] }, { rounds: [{ number: 1 }] }),
    false
  );
});

test("shouldClearRoundDraft preserves active local input during a remote round validation", () => {
  assert.equal(
    ScoreDraft.shouldClearRoundDraft(
      { rounds: [] },
      { rounds: [{ number: 1 }] },
      {
        draft: { closerId: "", scores: { p1: "17" } },
        preserveRemoteDraft: true,
      }
    ),
    false
  );
});

test("shouldClearRoundDraft still clears after the local submitter validates the round", () => {
  assert.equal(
    ScoreDraft.shouldClearRoundDraft(
      { rounds: [] },
      { rounds: [{ number: 1 }] },
      {
        draft: { closerId: "", scores: { p1: "17" } },
        actionType: "SUBMIT_ROUND",
        preserveRemoteDraft: true,
      }
    ),
    true
  );
});
