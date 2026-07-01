(function attachScoreDraft(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }
  root.SkyjoScoreDraft = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createScoreDraftApi() {
  function createEmptyRoundDraft() {
    return {
      closerId: "",
      scores: {},
    };
  }

  function getPlayerIds(players) {
    return new Set((Array.isArray(players) ? players : []).map((player) => String(player.id || "")).filter(Boolean));
  }

  function normalizeRoundDraft(input, players) {
    const playerIds = getPlayerIds(players);
    const draft = createEmptyRoundDraft();
    const source = input && typeof input === "object" ? input : {};
    const closerId = String(source.closerId || "");
    const scores = source.scores && typeof source.scores === "object" ? source.scores : {};

    if (playerIds.has(closerId)) {
      draft.closerId = closerId;
    }

    for (const playerId of playerIds) {
      if (!Object.prototype.hasOwnProperty.call(scores, playerId)) continue;
      const value = scores[playerId];
      if (value === null || value === undefined) continue;
      const text = String(value);
      if (text !== "") {
        draft.scores[playerId] = text;
      }
    }

    return draft;
  }

  function syncDraftCloser(draft, closerId, players) {
    return normalizeRoundDraft({ ...draft, closerId }, players);
  }

  function syncDraftScore(draft, playerId, value, players) {
    const next = normalizeRoundDraft(draft, players);
    const normalizedPlayerId = String(playerId || "");
    if (!getPlayerIds(players).has(normalizedPlayerId)) {
      return next;
    }

    const text = value === null || value === undefined ? "" : String(value);
    if (text === "") {
      delete next.scores[normalizedPlayerId];
      return next;
    }

    next.scores[normalizedPlayerId] = text;
    return next;
  }

  function hasRoundDraftInput(input) {
    const draft = input && typeof input === "object" ? input : {};
    const scores = draft.scores && typeof draft.scores === "object" ? draft.scores : {};
    return Boolean(String(draft.closerId || "")) || Object.values(scores).some((value) => String(value || "") !== "");
  }

  function shouldClearRoundDraft(previousState, nextState, options = {}) {
    const previousRounds = Array.isArray(previousState?.rounds) ? previousState.rounds.length : 0;
    const nextRounds = Array.isArray(nextState?.rounds) ? nextState.rounds.length : 0;
    if (previousRounds === nextRounds) return false;
    if (options.actionType === "SUBMIT_ROUND") return true;
    if (options.preserveRemoteDraft && hasRoundDraftInput(options.draft)) return false;
    return true;
  }

  function createPlayerSignature(players) {
    return (Array.isArray(players) ? players : [])
      .map((player) => [player.id, player.name, player.color].map((part) => encodeURIComponent(String(part || ""))).join(":"))
      .join("|");
  }

  return {
    createEmptyRoundDraft,
    normalizeRoundDraft,
    syncDraftCloser,
    syncDraftScore,
    hasRoundDraftInput,
    shouldClearRoundDraft,
    createPlayerSignature,
  };
});
