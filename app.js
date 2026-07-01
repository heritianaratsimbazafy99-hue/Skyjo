const SkyjoChaos = window.SkyjoChaos;
const ScoreDraft = window.SkyjoScoreDraft;
const ScoreViz = window.SkyjoScoreViz;
const STORAGE_KEY = "skyjo-score-arena-state-v2";
const COLORS = ["#e11d48", "#2563eb", "#0f766e", "#d97706", "#7c3aed", "#0891b2", "#be123c", "#65a30d"];

const elements = {
  status: document.querySelector("#game-status"),
  rulesToggle: document.querySelector("#rules-toggle"),
  rulesPanel: document.querySelector("#rules-panel"),
  resetGame: document.querySelector("#reset-game"),
  syncBand: document.querySelector("#sync-band"),
  syncStatus: document.querySelector("#sync-status"),
  startSync: document.querySelector("#start-sync"),
  copyControllerLink: document.querySelector("#copy-controller-link"),
  controllerUrl: document.querySelector("#controller-url"),
  qrCode: document.querySelector("#qr-code"),
  playerForm: document.querySelector("#player-form"),
  playerName: document.querySelector("#player-name"),
  playerCount: document.querySelector("#player-count"),
  playersStrip: document.querySelector("#players-strip"),
  liveTable: document.querySelector("#live-table"),
  targetScore: document.querySelector("#target-score"),
  closerPenalty: document.querySelector("#closer-penalty"),
  chaosMode: document.querySelector("#chaos-mode"),
  chaosIntensity: document.querySelector("#chaos-intensity"),
  chaosCard: document.querySelector("#chaos-card"),
  roundPill: document.querySelector("#round-pill"),
  leaderCallout: document.querySelector("#leader-callout"),
  gameMasterCallout: document.querySelector("#game-master-callout"),
  rankingList: document.querySelector("#ranking-list"),
  closerSelect: document.querySelector("#closer-select"),
  roundForm: document.querySelector("#round-form"),
  scoreInputs: document.querySelector("#score-inputs"),
  submitRound: document.querySelector("#submit-round"),
  undoRound: document.querySelector("#undo-round"),
  insightGrid: document.querySelector("#insight-grid"),
  scoreTrendChart: document.querySelector("#score-trend-chart"),
  tensionChart: document.querySelector("#tension-chart"),
  historyHead: document.querySelector("#history-head"),
  historyBody: document.querySelector("#history-body"),
  roundCardsHistory: document.querySelector("#round-cards-history"),
  toastRegion: document.querySelector("#toast-region"),
  chaosRevealDialog: document.querySelector("#chaos-reveal-dialog"),
  chaosRevealKicker: document.querySelector("#chaos-reveal-kicker"),
  chaosRevealTitle: document.querySelector("#chaos-reveal-title"),
  chaosRevealDescription: document.querySelector("#chaos-reveal-description"),
  chaosRevealEffects: document.querySelector("#chaos-reveal-effects"),
  chaosRevealImpacts: document.querySelector("#chaos-reveal-impacts"),
  closeChaosReveal: document.querySelector("#close-chaos-reveal"),
  continueChaosReveal: document.querySelector("#continue-chaos-reveal"),
  victoryDialog: document.querySelector("#victory-dialog"),
  victoryTitle: document.querySelector("#victory-title"),
  victoryCopy: document.querySelector("#victory-copy"),
  victoryRanking: document.querySelector("#victory-ranking"),
  closeVictory: document.querySelector("#close-victory"),
  victoryNewGame: document.querySelector("#victory-new-game"),
  canvas: document.querySelector("#confetti-canvas"),
};

const sync = {
  enabled: false,
  role: "desktop",
  sessionId: null,
  token: null,
  revision: 0,
  controllerUrl: "",
  events: null,
  connecting: false,
};

let state = loadState();
let lastRenderedRound = state.rounds.length;
let previousRankingIds = [];
let localRoundDraft = ScoreDraft.normalizeRoundDraft(state.roundDraft, state.players);
let closerOptionsSignature = "";
let scoreInputsSignature = "";
let lastChaosRevealRoundId = "";

function createInitialState() {
  return {
    players: [],
    rounds: [],
    targetScore: 100,
    doubleCloserPenalty: true,
    chaosMode: SkyjoChaos.createDefaultChaosMode(),
    activeChaosCard: null,
    gameMasterId: null,
    roundDraft: createEmptyRoundDraft(),
    gameOver: false,
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.players) || !Array.isArray(saved.rounds)) {
      return createInitialState();
    }
    return normalizeState(saved);
  } catch {
    return createInitialState();
  }
}

function normalizeState(input) {
  const players = Array.isArray(input.players) ? input.players : [];
  const rounds = Array.isArray(input.rounds) ? input.rounds : [];
  const normalized = {
    ...createInitialState(),
    ...input,
    players,
    rounds,
    targetScore: Number(input.targetScore) || 100,
    doubleCloserPenalty: input.doubleCloserPenalty !== false,
    chaosMode: SkyjoChaos.normalizeChaosMode(input.chaosMode, rounds),
    activeChaosCard: SkyjoChaos.normalizeActiveChaosCard(input.activeChaosCard, players),
    gameMasterId: players.some((player) => player.id === input.gameMasterId) ? input.gameMasterId : null,
    roundDraft: ScoreDraft.normalizeRoundDraft(input.roundDraft, players),
    gameOver: Boolean(input.gameOver),
  };
  ensureGameMaster(normalized, false);
  ensureChaosCardForNextRound(normalized);
  return normalized;
}

function saveState() {
  if (sync.role !== "controller") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function setLocalRoundDraft(draft) {
  localRoundDraft = ScoreDraft.normalizeRoundDraft(draft, state.players);
  state.roundDraft = localRoundDraft;
  saveState();
}

function resetLocalRoundDraft() {
  setLocalRoundDraft(ScoreDraft.createEmptyRoundDraft());
}

function reconcileLocalRoundDraft(previousState, nextState, meta = {}, action = {}) {
  const shouldClearDraft =
    action.type === "RESET_GAME" ||
    ScoreDraft.shouldClearRoundDraft(previousState, nextState, {
      actionType: action.type,
      draft: localRoundDraft,
      preserveRemoteDraft: Boolean(meta?.round && !action.type),
    });

  if (shouldClearDraft) {
    localRoundDraft = ScoreDraft.createEmptyRoundDraft();
  } else {
    localRoundDraft = ScoreDraft.normalizeRoundDraft(localRoundDraft, nextState.players);
  }
  nextState.roundDraft = localRoundDraft;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeName(name) {
  return name.trim().replace(/\s+/g, " ").slice(0, 18);
}

function getPlayerColor(index) {
  return COLORS[index % COLORS.length];
}

function createEmptyRoundDraft() {
  return {
    closerId: "",
    scores: {},
  };
}

function pickRandomGameMaster(players) {
  if (!Array.isArray(players) || players.length < 2) return null;
  return players[Math.floor(Math.random() * players.length)]?.id || null;
}

function ensureGameMaster(targetState, randomize = true) {
  if (!Array.isArray(targetState.players) || targetState.players.length < 2) {
    targetState.gameMasterId = null;
    return targetState;
  }

  if (targetState.players.some((player) => player.id === targetState.gameMasterId)) {
    return targetState;
  }

  targetState.gameMasterId = randomize ? pickRandomGameMaster(targetState.players) : targetState.players[0]?.id || null;
  return targetState;
}

function getGameMaster() {
  return state.players.find((player) => player.id === state.gameMasterId) || null;
}

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

function redrawActiveChaosCard(targetState) {
  if (!SkyjoChaos.isChaosEnabled(targetState)) {
    return { error: "Active Deck Chaos avec au moins deux joueurs pour changer de carte." };
  }

  const card = SkyjoChaos.redrawChaosCard(targetState);
  if (!card) {
    return { error: "Aucune autre carte Chaos disponible pour cette manche." };
  }

  targetState.activeChaosCard = card;
  return { card };
}

function parseControllerRoute() {
  const match = window.location.pathname.match(/^\/c\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { sessionId: match[1], token: match[2] };
}

function initMode() {
  const route = parseControllerRoute();
  if (!route) return;
  sync.enabled = true;
  sync.role = "controller";
  sync.sessionId = route.sessionId;
  sync.token = route.token;
  document.body.classList.add("controller-mode");
  connectSession();
}

async function startSyncSession() {
  if (sync.enabled && sync.controllerUrl) {
    showToast("Le QR mobile est déjà actif.", "success");
    return;
  }

  sync.connecting = true;
  renderSyncPanel();
  try {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    if (!response.ok) throw new Error("Lance le serveur Node avec `node server.js` pour générer un QR synchronisé.");
    const payload = await response.json();
    sync.enabled = true;
    sync.role = "desktop";
    sync.sessionId = payload.sessionId;
    sync.token = payload.controllerToken;
    sync.revision = payload.revision;
    sync.controllerUrl = payload.controllerUrl;
    state = normalizeState(payload.state);
    sync.connecting = false;
    await connectSession();
    render();
    showToast("QR mobile actif. Les scores se synchronisent en direct.", "success");
  } catch (error) {
    sync.enabled = false;
    showToast(error.message || "Impossible d'activer le QR mobile.", "danger");
  } finally {
    sync.connecting = false;
    renderSyncPanel();
  }
}

async function connectSession() {
  if (!sync.sessionId || sync.connecting) return;
  sync.connecting = true;
  renderSyncPanel();

  try {
    const response = await fetch(`/api/sessions/${sync.sessionId}`);
    if (!response.ok) throw new Error("Session introuvable. Relance le QR depuis le desktop.");
    const payload = await response.json();
    sync.enabled = true;
    sync.revision = payload.revision;
    updateStateFromRemote(payload.state, payload.revision, {});

    if (sync.events) sync.events.close();
    sync.events = new EventSource(`/api/sessions/${sync.sessionId}/events`);
    sync.events.addEventListener("state", (event) => {
      const payload = JSON.parse(event.data);
      updateStateFromRemote(payload.state, payload.revision, payload.meta || {});
    });
    sync.events.onerror = () => {
      renderSyncPanel("Connexion mobile interrompue. Reconnexion en cours...");
    };
  } catch (error) {
    showToast(error.message || "Impossible de rejoindre la session.", "danger");
  } finally {
    sync.connecting = false;
    renderSyncPanel();
  }
}

function updateStateFromRemote(nextState, revision, meta) {
  const previousState = state;
  const wasGameOver = state.gameOver;
  const normalizedState = normalizeState(nextState);
  reconcileLocalRoundDraft(previousState, normalizedState, meta);
  state = normalizedState;
  sync.revision = revision;
  saveState();
  render();
  if (!wasGameOver && state.gameOver) {
    announceVictory();
  }
  if (meta?.round && sync.role === "desktop") {
    pulseHero();
    showChaosReveal(meta.round);
  }
}

async function dispatchAction(action) {
  if (sync.enabled && sync.sessionId) {
    try {
      const response = await fetch(`/api/sessions/${sync.sessionId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: sync.token,
          baseRevision: sync.revision,
          action,
        }),
      });
      const payload = await response.json();
      if (response.status === 409) {
        updateStateFromRemote(payload.state, payload.revision, {});
        showToast("Un score plus récent vient d'arriver. Réessaie avec l'état à jour.", "danger");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Action refusée.");
      updateStateFromRemote(payload.state, payload.revision, payload.meta || {});
      handleActionMeta(action, payload.meta || {});
    } catch (error) {
      showToast(error.message || "La synchronisation a échoué.", "danger");
    }
    return;
  }

  const result = applyAction(state, action);
  if (result.error) {
    showToast(result.error, "danger");
    return;
  }
  const previousState = state;
  const wasGameOver = state.gameOver;
  reconcileLocalRoundDraft(previousState, result.state, result.meta || {}, action);
  state = result.state;
  saveState();
  render();
  handleActionMeta(action, result.meta || {});
  if (!wasGameOver && state.gameOver) {
    announceVictory();
  }
}

function applyAction(currentState, action) {
  const next = JSON.parse(JSON.stringify(currentState));
  const meta = {};

  switch (action.type) {
    case "ADD_PLAYER": {
      if (next.rounds.length > 0) return { error: "Ajoute les joueurs avant la première manche." };
      const name = sanitizeName(action.name || "");
      if (!name) return { error: "Entre un prénom ou un pseudo avant d'ajouter." };
      if (next.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
        return { error: `${name} est déjà dans la partie.` };
      }
      next.players.push({ id: uid("player"), name, color: getPlayerColor(next.players.length) });
      ensureGameMaster(next);
      ensureChaosCardForNextRound(next);
      meta.message = `${name} rejoint la table.`;
      break;
    }
    case "REMOVE_PLAYER": {
      if (next.rounds.length > 0) return { error: "Impossible de retirer un joueur après la première manche. Lance une nouvelle partie." };
      next.players = next.players.filter((player) => player.id !== action.playerId);
      ensureGameMaster(next);
      ensureChaosCardForNextRound(next);
      break;
    }
    case "SET_TARGET_SCORE": {
      const targetScore = Number(action.targetScore);
      if (!Number.isInteger(targetScore) || targetScore < 20) return { error: "Le seuil doit être un entier supérieur ou égal à 20." };
      next.targetScore = targetScore;
      next.gameOver = Object.values(getTotals(next)).some((score) => score >= next.targetScore);
      ensureChaosCardForNextRound(next);
      break;
    }
    case "SET_CLOSER_PENALTY": {
      next.doubleCloserPenalty = Boolean(action.enabled);
      meta.message = next.doubleCloserPenalty ? "Pénalité officielle activée." : "Pénalité officielle désactivée pour cette table.";
      break;
    }
    case "SET_CHAOS_MODE": {
      next.chaosMode = SkyjoChaos.normalizeChaosMode({
        ...next.chaosMode,
        enabled: Boolean(action.enabled),
        intensity: action.intensity || next.chaosMode.intensity,
        revealMode: "mixed",
      }, next.rounds);
      next.activeChaosCard = null;
      ensureChaosCardForNextRound(next);
      meta.message = next.chaosMode.enabled ? `Deck Chaos ${getChaosIntensityLabel(next.chaosMode.intensity).toLowerCase()} activé.` : "Deck Chaos désactivé.";
      break;
    }
    case "REDRAW_CHAOS_CARD": {
      const result = redrawActiveChaosCard(next);
      if (result.error) return result;
      meta.message = "Nouvelle carte Chaos tirée.";
      break;
    }
    case "SUBMIT_ROUND": {
      if (next.players.length < 2) return { error: "Ajoute au moins deux joueurs pour noter une manche." };
      if (next.gameOver) return { error: "La partie est terminée. Lance une nouvelle partie pour continuer." };
      if (next.doubleCloserPenalty && !action.closerId) return { error: "Choisis le joueur qui a fermé la manche pour appliquer la règle officielle." };

      const rawScores = {};
      for (const player of next.players) {
        const value = Number(action.scores?.[player.id]);
        if (!Number.isInteger(value)) return { error: `Score invalide pour ${player.name}.` };
        rawScores[player.id] = value;
      }

      const round = computeRound(next, rawScores, action.closerId);
      next.rounds.push(round);
      next.chaosMode = SkyjoChaos.normalizeChaosMode({
        ...next.chaosMode,
        usedRareCardIds: round.chaos?.cardId ? SkyjoChaos.normalizeChaosMode(next.chaosMode, [...next.rounds]).usedRareCardIds : next.chaosMode.usedRareCardIds,
      }, next.rounds);
      next.roundDraft = createEmptyRoundDraft();
      next.gameOver = Object.values(getTotals(next)).some((score) => score >= next.targetScore);
      next.activeChaosCard = null;
      ensureChaosCardForNextRound(next);
      meta.round = round;
      meta.gameOver = next.gameOver;
      break;
    }
    case "UNDO_ROUND": {
      if (next.rounds.length === 0) return { error: "Aucune manche à annuler." };
      const removed = next.rounds.pop();
      next.gameOver = false;
      next.chaosMode = SkyjoChaos.normalizeChaosMode({
        ...next.chaosMode,
        usedRareCardIds: [],
      }, next.rounds);
      next.activeChaosCard = SkyjoChaos.restoreActiveChaosCardFromRound(removed, next.players);
      ensureChaosCardForNextRound(next);
      meta.message = `Manche ${removed.number} annulée.`;
      break;
    }
    case "RESET_GAME": {
      const keepPlayers = action.keepPlayers !== false;
      const players = keepPlayers ? next.players.map((player, index) => ({ ...player, color: getPlayerColor(index) })) : [];
      const targetScore = Number(action.targetScore) || next.targetScore || 100;
      const doubleCloserPenalty = action.doubleCloserPenalty ?? next.doubleCloserPenalty;
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
        meta: { message: keepPlayers ? "Nouvelle partie lancée avec les mêmes joueurs." : "Table remise à zéro." },
      };
    }
    default:
      return { error: "Action inconnue." };
  }

  return { state: next, meta };
}

function handleActionMeta(action, meta) {
  if (action.type === "SUBMIT_ROUND") {
    clearScoreInputs();
    const closer = state.players.find((player) => player.id === action.closerId);
    const penaltyText = meta.round?.closerPenaltyApplied ? ` Pénalité appliquée à ${closer?.name}.` : "";
    const chaosText = meta.round?.chaos ? ` Chaos: ${meta.round.chaos.title}.` : "";
    showToast(`Manche ${meta.round?.number || state.rounds.length} validée.${penaltyText}${chaosText}`, meta.round?.closerPenaltyApplied ? "danger" : "success");
    showChaosReveal(meta.round);
    pulseHero();
    return;
  }
  if (meta.message) {
    showToast(meta.message, "success");
  }
}

function addPlayer(name) {
  dispatchAction({ type: "ADD_PLAYER", name });
}

function removePlayer(playerId) {
  dispatchAction({ type: "REMOVE_PLAYER", playerId });
}

function resetGame(keepPlayers = true) {
  dispatchAction({
    type: "RESET_GAME",
    keepPlayers,
    targetScore: Number(elements.targetScore.value) || state.targetScore || 100,
    doubleCloserPenalty: elements.closerPenalty.checked,
    chaosMode: state.chaosMode,
  });
}

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

function submitRound(event) {
  event.preventDefault();

  const closerId = elements.closerSelect.value;
  const scores = {};
  let firstInvalidInput = null;
  let nextDraft = ScoreDraft.syncDraftCloser(localRoundDraft, closerId, state.players);
  state.players.forEach((player) => {
    const input = getScoreInput(player.id);
    const inputValue = input?.value || "";
    const value = Number(inputValue);
    nextDraft = ScoreDraft.syncDraftScore(nextDraft, player.id, inputValue, state.players);
    if (!Number.isInteger(value)) {
      firstInvalidInput = firstInvalidInput || input;
    }
    scores[player.id] = value;
  });
  setLocalRoundDraft(nextDraft);

  if (firstInvalidInput) {
    showToast("Chaque score de manche doit être un nombre entier.", "danger");
    firstInvalidInput.focus();
    return;
  }

  dispatchAction({ type: "SUBMIT_ROUND", closerId, scores });
}

function clearScoreInputs() {
  resetLocalRoundDraft();
  elements.closerSelect.value = "";
  document.querySelectorAll("[data-score-input]").forEach((input) => {
    input.value = "";
  });
}

function undoRound() {
  dispatchAction({ type: "UNDO_ROUND" });
}

function redrawChaosCard() {
  dispatchAction({ type: "REDRAW_CHAOS_CARD" });
}

function getTotals(targetState = state) {
  return targetState.players.reduce((totals, player) => {
    totals[player.id] = targetState.rounds.reduce((sum, round) => sum + (round.adjustedScores[player.id] ?? 0), 0);
    return totals;
  }, {});
}

function getRawTotals() {
  return state.players.reduce((totals, player) => {
    totals[player.id] = state.rounds.reduce((sum, round) => sum + (round.scores[player.id] ?? 0), 0);
    return totals;
  }, {});
}

function getRanking() {
  const totals = getTotals();
  return [...state.players].sort((a, b) => {
    const totalDiff = totals[a.id] - totals[b.id];
    if (totalDiff !== 0) return totalDiff;
    return a.name.localeCompare(b.name, "fr");
  });
}

function getLastRoundScore(playerId) {
  const lastRound = state.rounds.at(-1);
  return lastRound ? lastRound.adjustedScores[playerId] : null;
}

function getAverage(playerId) {
  if (state.rounds.length === 0) return 0;
  const total = getTotals()[playerId] ?? 0;
  return total / state.rounds.length;
}

function getChaosIntensityLabel(intensity) {
  return {
    facile: "Facile",
    moyen: "Moyen",
    fort: "Fort",
    extreme: "Extrême",
  }[intensity] || "Extrême";
}

function getChaosRarityLabel(rarity) {
  return {
    common: "commune",
    rare: "rare",
    "very-rare": "très rare",
  }[rarity] || rarity;
}

function render() {
  elements.targetScore.value = state.targetScore;
  elements.closerPenalty.checked = state.doubleCloserPenalty;
  elements.chaosMode.checked = Boolean(state.chaosMode.enabled);
  elements.chaosIntensity.value = state.chaosMode.intensity || "extreme";

  renderStatus();
  renderSyncPanel();
  renderGameMasterCallout();
  renderChaosCard();
  renderPlayers();
  renderLiveTable();
  renderRoundForm();
  renderRanking();
  renderInsights();
  renderHistory();
  updateButtons();

  lastRenderedRound = state.rounds.length;
}

function renderGameMasterCallout() {
  if (!elements.gameMasterCallout) return;
  const master = state.players.find((player) => player.id === state.gameMasterId);

  if (!master) {
    elements.gameMasterCallout.textContent = "Ajoute au moins deux joueurs pour designer le Game Master.";
    return;
  }

  elements.gameMasterCallout.textContent = `Game Master: ${master.name}`;
}

function renderChaosCard() {
  if (!elements.chaosCard) return;
  const card = state.activeChaosCard;

  if (!state.chaosMode.enabled) {
    elements.chaosCard.className = "chaos-card is-empty";
    elements.chaosCard.innerHTML = `
      <span class="chaos-card-kicker">Deck Chaos</span>
      <strong>Mode désactivé</strong>
      <p>Active-le dans les paramètres pour tirer une carte à chaque manche.</p>
    `;
    return;
  }

  if (!card) {
    elements.chaosCard.className = "chaos-card is-empty";
    elements.chaosCard.innerHTML = `
      <span class="chaos-card-kicker">Deck Chaos</span>
      <strong>En attente de table</strong>
      <p>Ajoute au moins deux joueurs pour tirer la première carte.</p>
    `;
    return;
  }

  const targetNames = getChaosTargetNames(card);
  const isMasked = card.timing === "after" && !card.revealedBeforeSubmit;
  const intensity = state.chaosMode.intensity || "extreme";
  const intensityLabel = getChaosIntensityLabel(intensity);
  const redrawButton = renderChaosRedrawButton();
  elements.chaosCard.className = `chaos-card rarity-${card.rarity} intensity-${intensity}${isMasked ? " is-masked" : ""}`;
  elements.chaosCard.innerHTML = isMasked
    ? `
      <div class="chaos-card-header">
        <span class="chaos-card-kicker">Surprise chaos ${escapeHtml(intensityLabel.toLowerCase())} prête</span>
        ${redrawButton}
      </div>
      <strong>Carte cachée jusqu'à la validation</strong>
      <p>L'effet tombera après le calcul de la manche. Oui, c'est injuste. C'est le principe.</p>
    `
    : `
      <div class="chaos-card-header">
        <div class="chaos-card-meta">
          <span class="chaos-card-kicker">${escapeHtml(card.manual ? "Défi de table" : "Effet automatique")}</span>
          <span class="chaos-rarity">${escapeHtml(intensityLabel)} · ${escapeHtml(getChaosRarityLabel(card.rarity))}</span>
        </div>
        ${redrawButton}
      </div>
      <strong>${escapeHtml(card.title)}</strong>
      <p>${escapeHtml(card.description)}</p>
      ${targetNames ? `<small>Cible: ${escapeHtml(targetNames)}</small>` : ""}
    `;
}

function renderChaosRedrawButton() {
  const disabled = state.gameOver || !state.chaosMode.enabled || state.players.length < 2 || !state.activeChaosCard;
  return `
    <button
      class="chaos-redraw-button"
      type="button"
      data-redraw-chaos-card
      ${disabled ? "disabled" : ""}
      aria-label="Changer la carte Chaos active"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 3h5v5"></path>
        <path d="M4 20 21 3"></path>
        <path d="M21 16v5h-5"></path>
        <path d="m15 15 6 6"></path>
        <path d="M4 4l5 5"></path>
      </svg>
      <span>Changer</span>
    </button>
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

function renderStatus() {
  const playerText = state.players.length < 2 ? "Ajoute les joueurs" : `${state.players.length} joueurs`;
  const roundText = `${state.rounds.length} manche${state.rounds.length > 1 ? "s" : ""}`;
  const syncText = sync.enabled ? (sync.role === "controller" ? "mobile connecté" : "QR live") : "local";
  elements.status.textContent = state.gameOver ? "Partie terminée" : `${playerText} · ${roundText} · ${syncText}`;
  elements.roundPill.textContent = `Manche ${state.rounds.length}`;
}

function renderSyncPanel(forcedStatus) {
  if (!elements.syncBand) return;
  const isController = sync.role === "controller";
  elements.syncBand.classList.toggle("is-controller", isController);
  elements.startSync.disabled = sync.connecting || isController || Boolean(sync.controllerUrl);
  elements.startSync.querySelector("span").textContent = sync.controllerUrl ? "QR actif" : "Activer le QR";
  elements.copyControllerLink.disabled = !sync.controllerUrl;
  elements.controllerUrl.value = sync.controllerUrl || "";

  if (isController) {
    elements.syncStatus.textContent = forcedStatus || "Tu es connecté en mode mobile. Saisis la manche, le desktop se met à jour instantanément.";
    elements.qrCode.innerHTML = `<div class="phone-orb" aria-hidden="true"><span></span></div><strong>Mobile actif</strong>`;
    return;
  }

  if (sync.controllerUrl) {
    elements.syncStatus.textContent = forcedStatus || "QR actif sur le réseau local. Les téléphones qui le scannent rejoignent la saisie de scores.";
    elements.qrCode.innerHTML = `
      <img
        class="qr-svg"
        src="/api/qr.svg?text=${encodeURIComponent(sync.controllerUrl)}"
        alt="QR code à scanner pour rejoindre la saisie mobile"
      />
    `;
    return;
  }

  elements.syncStatus.textContent = forcedStatus || "Lance le mode synchronisé pour générer un QR local à partager autour de la table.";
  elements.qrCode.innerHTML = `<span>QR</span>`;
}

function renderPlayers() {
  elements.playerCount.textContent = `${state.players.length} joueur${state.players.length > 1 ? "s" : ""}`;

  if (state.players.length === 0) {
    elements.playersStrip.innerHTML = `<div class="empty-state">Ajoute les personnes autour de la table pour préparer la première manche.</div>`;
    return;
  }

  elements.playersStrip.innerHTML = state.players
    .map(
      (player, index) => `
        <div class="player-chip is-new-player" style="--player-color: ${player.color}; --delay: ${index * 45}ms">
          <span class="player-avatar" aria-hidden="true">${escapeHtml(player.name.charAt(0).toUpperCase())}</span>
          <span>${escapeHtml(player.name)}</span>
          <button class="remove-player" type="button" data-remove-player="${player.id}" aria-label="Retirer ${escapeHtml(player.name)}">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>
      `
    )
    .join("");
}

function renderAvatar(player, className = "player-avatar") {
  return `<span class="${className} player-avatar" aria-hidden="true">${escapeHtml(player.name.charAt(0).toUpperCase())}</span>`;
}

function renderLiveTable() {
  if (!elements.liveTable) return;
  const totals = getTotals();
  const ranking = getRanking();
  const leaderId = ranking[0]?.id;
  const dangerId = [...state.players].sort((a, b) => totals[b.id] - totals[a.id])[0]?.id;

  if (state.players.length === 0) {
    elements.liveTable.innerHTML = `
      <div class="mat-center">
        <strong>Table vide</strong>
        <span>Ajoute les joueurs pour voir la partie prendre forme.</span>
      </div>
    `;
    return;
  }

  elements.liveTable.innerHTML = `
    <div class="mat-center">
      <strong>${state.rounds.length}</strong>
      <span>manche${state.rounds.length > 1 ? "s" : ""}</span>
    </div>
    ${state.players
      .map((player, index) => {
        const angle = (index / state.players.length) * 360;
        const total = totals[player.id] ?? 0;
        return `
          <div
            class="seat-token${player.id === leaderId ? " is-leading" : ""}${player.id === dangerId && state.rounds.length ? " is-danger" : ""}"
            style="--player-color: ${player.color}; --angle: ${angle}deg"
          >
            <span>${escapeHtml(player.name.charAt(0).toUpperCase())}</span>
            <strong>${escapeHtml(player.name)}</strong>
            <small>${total} pts</small>
          </div>
        `;
      })
      .join("")}
  `;
}

function renderRoundForm() {
  const disabled = state.players.length < 2 || state.gameOver;
  localRoundDraft = ScoreDraft.normalizeRoundDraft(localRoundDraft, state.players);
  renderCloserSelect(disabled);
  elements.submitRound.disabled = disabled;
  renderScoreInputs(disabled);
}

function renderCloserSelect(disabled) {
  const signature = ScoreDraft.createPlayerSignature(state.players);
  if (closerOptionsSignature !== signature) {
    elements.closerSelect.innerHTML = [
      `<option value="">Choisir le joueur</option>`,
      ...state.players.map((player) => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`),
    ].join("");
    closerOptionsSignature = signature;
  }

  elements.closerSelect.value = localRoundDraft.closerId || "";
  elements.closerSelect.disabled = disabled;
}

function renderScoreInputs(disabled) {
  const signature = ScoreDraft.createPlayerSignature(state.players);

  if (state.players.length === 0) {
    if (scoreInputsSignature !== "empty") {
      elements.scoreInputs.innerHTML = `<div class="empty-state">Les champs de score apparaîtront ici dès que la table aura des joueurs.</div>`;
      scoreInputsSignature = "empty";
    }
    return;
  }

  if (scoreInputsSignature !== signature) {
    elements.scoreInputs.innerHTML = state.players.map((player, index) => renderScoreInputRow(player, index, disabled)).join("");
    scoreInputsSignature = signature;
  }

  updateScoreInputRows(disabled);
}

function renderScoreInputRow(player, index, disabled) {
  const isLastInput = index === state.players.length - 1;
  const draftValue = localRoundDraft.scores[player.id] || "";
  return `
    <div class="score-row score-input-card" data-score-row="${escapeHtml(player.id)}" style="--player-color: ${player.color}; --delay: ${index * 35}ms">
      <label for="score-${escapeHtml(player.id)}">
        <span class="player-avatar" aria-hidden="true">${escapeHtml(player.name.charAt(0).toUpperCase())}</span>
        <span>
          <strong>${escapeHtml(player.name)}</strong>
          <small data-score-total="${escapeHtml(player.id)}">0 points cumulés</small>
        </span>
      </label>
      <input
        id="score-${escapeHtml(player.id)}"
        data-score-input="${escapeHtml(player.id)}"
        type="number"
        inputmode="numeric"
        step="1"
        placeholder="0"
        enterkeyhint="${isLastInput ? "done" : "next"}"
        value="${escapeHtml(draftValue)}"
        ${disabled ? "disabled" : ""}
        aria-label="Score de manche pour ${escapeHtml(player.name)}"
      />
      <div class="score-stepper" aria-label="Raccourcis score ${escapeHtml(player.name)}">
        ${[-2, 0, 5, 10, 12].map((value) => `<button type="button" data-score-value="${value}" data-target-score="${escapeHtml(player.id)}" ${disabled ? "disabled" : ""}>${value}</button>`).join("")}
        ${[-5, -1, 1, 5].map((value) => `<button type="button" data-score-bump="${value}" data-target-score="${escapeHtml(player.id)}" ${disabled ? "disabled" : ""}>${value > 0 ? "+" : ""}${value}</button>`).join("")}
      </div>
    </div>
  `;
}

function updateScoreInputRows(disabled) {
  const totals = getTotals();
  state.players.forEach((player, index) => {
    const row = findScoreElement("[data-score-row]", "scoreRow", player.id);
    const total = findScoreElement("[data-score-total]", "scoreTotal", player.id);
    const input = getScoreInput(player.id);
    if (!row || !input) return;

    row.style.setProperty("--player-color", player.color);
    row.style.setProperty("--delay", `${index * 35}ms`);
    if (total) total.textContent = `${totals[player.id] ?? 0} points cumulés`;
    if (input.value !== (localRoundDraft.scores[player.id] || "")) {
      input.value = localRoundDraft.scores[player.id] || "";
    }
    input.disabled = disabled;
    row.querySelectorAll("button").forEach((button) => {
      button.disabled = disabled;
    });
  });
}

function findScoreElement(selector, datasetKey, playerId) {
  return Array.from(elements.scoreInputs.querySelectorAll(selector)).find((element) => element.dataset[datasetKey] === playerId) || null;
}

function getScoreInput(playerId) {
  return findScoreElement("[data-score-input]", "scoreInput", playerId);
}

function setScoreInputValue(input, value) {
  if (!input) return;
  input.value = String(value);
  setLocalRoundDraft(ScoreDraft.syncDraftScore(localRoundDraft, input.dataset.scoreInput, input.value, state.players));
}

function focusScoreInput(input) {
  if (!input) return;
  try {
    input.focus({ preventScroll: true });
  } catch {
    input.focus();
  }
}

function focusNextScoreInput(currentInput) {
  const inputs = state.players.map((player) => getScoreInput(player.id)).filter(Boolean);
  const currentIndex = inputs.indexOf(currentInput);
  if (currentIndex === -1) return false;
  const nextInput = inputs[currentIndex + 1];
  if (!nextInput) return false;
  focusScoreInput(nextInput);
  nextInput.select();
  return true;
}

function renderRanking() {
  const totals = getTotals();
  const rawTotals = getRawTotals();
  const ranking = getRanking();
  const currentRankingIds = ranking.map((player) => player.id);
  const leader = ranking[0];
  const danger = [...state.players].sort((a, b) => totals[b.id] - totals[a.id])[0];

  if (ranking.length < 2) {
    elements.leaderCallout.textContent = "Ajoute au moins deux joueurs pour lancer la course.";
    elements.rankingList.innerHTML = `<div class="empty-state">Le podium se mettra à jour après chaque manche.</div>`;
    previousRankingIds = currentRankingIds;
    return;
  }

  const leadGap = ranking[1] ? totals[ranking[1].id] - totals[leader.id] : 0;
  const dangerRemaining = Math.max(0, state.targetScore - totals[danger.id]);
  elements.leaderCallout.textContent = state.rounds.length
    ? `${leader.name} mène avec ${totals[leader.id]} point${Math.abs(totals[leader.id]) > 1 ? "s" : ""}. Écart: ${leadGap} point${leadGap > 1 ? "s" : ""}. ${danger.name} est à ${dangerRemaining} du seuil.`
    : `La piste est prête. Objectif: rester sous ${state.targetScore} points.`;

  elements.rankingList.innerHTML = ranking
    .map((player, index) => {
      const total = totals[player.id] ?? 0;
      const rawTotal = rawTotals[player.id] ?? 0;
      const progress = Math.max(0, Math.min(100, (total / state.targetScore) * 100));
      const lastScore = getLastRoundScore(player.id);
      const average = getAverage(player.id);
      const previousIndex = previousRankingIds.indexOf(player.id);
      const movement = previousIndex === -1 ? 0 : previousIndex - index;
      const isNearThreshold = total >= state.targetScore * 0.75;
      const tags = [];
      if (index === 0 && state.rounds.length > 0) tags.push("leader");
      if (danger?.id === player.id && state.rounds.length > 0) tags.push("danger");
      if (rawTotal !== total) tags.push("pénalité");
      if (isNearThreshold) tags.push("seuil proche");
      const newScoreClass = state.rounds.length > lastRenderedRound ? " score-changed" : "";
      const movementClass = movement > 0 ? " rank-moved-up" : movement < 0 ? " rank-moved-down" : "";
      return `
        <article class="player-card${index === 0 ? " is-leader" : ""}${danger?.id === player.id ? " is-danger" : ""}${isNearThreshold ? " is-near-threshold" : ""}${newScoreClass}${movementClass}" style="--player-color: ${player.color}">
          <div class="rank-badge" aria-label="Position ${index + 1}">${index + 1}</div>
          <div class="player-main">
            <div class="player-name-line">
              <strong>${escapeHtml(player.name)}</strong>
              ${tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
              ${movement ? `<span class="rank-move">${movement > 0 ? "+" : ""}${movement}</span>` : ""}
            </div>
            <div class="player-meta">
              <span>Moyenne ${formatNumber(average)}</span>
              <span>Dernière ${lastScore === null ? "-" : signedNumber(lastScore)}</span>
              <span>${Math.max(0, state.targetScore - total)} avant seuil</span>
            </div>
            <div class="progress-track" aria-label="Progression vers le seuil" style="--progress: ${progress}%">
              <span></span>
            </div>
          </div>
          <div class="score-total">
            <strong>${total}</strong>
            <span>points</span>
          </div>
        </article>
      `;
    })
    .join("");

  previousRankingIds = currentRankingIds;
}

function renderInsights() {
  const ranking = getRanking();
  const totals = getTotals();

  if (state.players.length < 2) {
    elements.insightGrid.innerHTML = `<div class="empty-state">Les analyses apparaîtront avec les premiers scores.</div>`;
    elements.scoreTrendChart.innerHTML = "";
    elements.tensionChart.innerHTML = "";
    return;
  }

  const leader = ranking[0];
  const runnerUp = ranking[1];
  const danger = [...state.players].sort((a, b) => totals[b.id] - totals[a.id])[0];
  const bestRound = findBestRound();
  const worstRound = findWorstRound();
  const penaltyCount = state.rounds.filter((round) => round.closerPenaltyApplied).length;

  const tiles = [
    {
      label: "Leader",
      value: leader ? leader.name : "-",
      detail: runnerUp ? `${Math.max(0, totals[runnerUp.id] - totals[leader.id])} point(s) d'avance` : "En attente",
      color: "#0f766e",
    },
    {
      label: "Zone rouge",
      value: danger ? danger.name : "-",
      detail: danger ? `${Math.max(0, state.targetScore - totals[danger.id])} point(s) avant ${state.targetScore}` : "En attente",
      color: "#dc2626",
    },
    {
      label: "Meilleure manche",
      value: bestRound ? `${bestRound.player.name} ${signedNumber(bestRound.score)}` : "-",
      detail: bestRound ? `Manche ${bestRound.round.number}` : "Aucune manche",
      color: "#2563eb",
    },
    {
      label: "Pénalités",
      value: `${penaltyCount}`,
      detail: penaltyCount ? "Fermeture risquée détectée" : "Aucune pour le moment",
      color: "#d97706",
    },
  ];

  if (worstRound && state.rounds.length > 0) {
    tiles[1].detail += ` · pic ${worstRound.player.name} ${signedNumber(worstRound.score)}`;
  }

  elements.insightGrid.innerHTML = tiles
    .map(
      (tile) => `
        <article class="insight-tile" style="--tile-color: ${tile.color}">
          <span>${tile.label}</span>
          <strong>${escapeHtml(tile.value)}</strong>
          <p>${escapeHtml(tile.detail)}</p>
        </article>
      `
    )
    .join("");

  renderScoreTrendChart();
  renderTensionChart();
}

function renderScoreTrendChart() {
  if (!elements.scoreTrendChart) return;

  if (state.rounds.length === 0) {
    elements.scoreTrendChart.innerHTML = `<div class="empty-state">La courbe cumulée apparaîtra après la première manche.</div>`;
    return;
  }

  const series = ScoreViz.buildCumulativeSeries(state.players, state.rounds);
  const domain = ScoreViz.getScoreTrendDomain(series, state.targetScore);
  const layout = ScoreViz.getTrendLayout(state.rounds.length);
  const margin = { top: 30, right: 120, bottom: 40, left: 54 };
  const innerWidth = layout.width - margin.left - margin.right;
  const innerHeight = layout.height - margin.top - margin.bottom;
  const xRange = Math.max(1, domain.maxRound - domain.minRound);
  const yRange = Math.max(1, domain.maxScore - domain.minScore);
  const ranking = getRanking();
  const leaderId = ranking[0]?.id;
  const dangerId = [...state.players].sort((a, b) => getTotals()[b.id] - getTotals()[a.id])[0]?.id;

  const x = (round) => margin.left + ((round - domain.minRound) / xRange) * innerWidth;
  const y = (score) => margin.top + (1 - (score - domain.minScore) / yRange) * innerHeight;
  const roundStep = Math.max(1, Math.ceil(domain.maxRound / 6));
  const roundTicks = Array.from({ length: domain.maxRound + 1 }, (_, round) => round).filter(
    (round) => round === 0 || round === domain.maxRound || round % roundStep === 0
  );
  const scoreTicks = [...new Set([domain.minScore, 0, state.targetScore, domain.maxScore])].filter(
    (score) => score >= domain.minScore && score <= domain.maxScore
  );
  const targetY = y(state.targetScore);
  const zeroY = y(0);
  const labelPositions = ScoreViz.spreadLabelPositions(
    series.map((playerSeries) => {
      const finalPoint = playerSeries.points.at(-1);
      return { id: playerSeries.player.id, y: y(finalPoint.total) };
    }),
    { min: margin.top + 8, max: layout.height - margin.bottom - 8, gap: 15 }
  );

  const paths = series
    .map((playerSeries) => {
      const d = playerSeries.points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${formatSvgNumber(x(point.round))} ${formatSvgNumber(y(point.total))}`)
        .join(" ");
      const finalPoint = playerSeries.points.at(-1);
      const isLeader = playerSeries.player.id === leaderId;
      const isDanger = playerSeries.player.id === dangerId;
      return `
        <path
          class="score-line${isLeader ? " is-leader" : ""}${isDanger ? " is-danger" : ""}"
          d="${d}"
          stroke="${playerSeries.player.color}"
        ></path>
        ${playerSeries.points
          .slice(1)
          .map(
            (point) => `
              <circle
                class="score-point"
                cx="${formatSvgNumber(x(point.round))}"
                cy="${formatSvgNumber(y(point.total))}"
                r="${isLeader ? 4.6 : 3.6}"
                fill="${playerSeries.player.color}"
              ></circle>
            `
          )
          .join("")}
        <text
          class="score-line-label"
          x="${formatSvgNumber(x(finalPoint.round) + 10)}"
          y="${formatSvgNumber(labelPositions[playerSeries.player.id] || y(finalPoint.total))}"
          fill="${playerSeries.player.color}"
        >${escapeHtml(playerSeries.player.name)} ${finalPoint.total}</text>
      `;
    })
    .join("");

  elements.scoreTrendChart.innerHTML = `
    <div class="score-trend-header">
      <div>
        <strong>Courbe cumulée</strong>
        <span>Écart entre joueurs après chaque manche</span>
      </div>
      <span>Seuil ${state.targetScore}</span>
    </div>
    <div class="score-trend-plot" tabindex="0">
      <svg
        viewBox="0 0 ${layout.width} ${layout.height}"
        width="${layout.width}"
        height="${layout.height}"
        role="img"
        aria-labelledby="score-trend-title score-trend-desc"
      >
        <title id="score-trend-title">Courbe des scores cumulés</title>
        <desc id="score-trend-desc">Chaque ligne suit le total d'un joueur par manche. Le score le plus bas est favorable et la ligne pointillée indique le seuil de fin.</desc>
        <g class="score-grid">
          ${scoreTicks
            .map(
              (score) => `
                <line x1="${margin.left}" x2="${layout.width - margin.right}" y1="${formatSvgNumber(y(score))}" y2="${formatSvgNumber(y(score))}"></line>
                <text class="score-y-label" x="${margin.left - 12}" y="${formatSvgNumber(y(score) + 4)}">${score}</text>
              `
            )
            .join("")}
          ${roundTicks
            .map(
              (round) => `
                <line x1="${formatSvgNumber(x(round))}" x2="${formatSvgNumber(x(round))}" y1="${margin.top}" y2="${layout.height - margin.bottom}"></line>
                <text class="score-x-label" x="${formatSvgNumber(x(round))}" y="${layout.height - 12}">M${round}</text>
              `
            )
            .join("")}
        </g>
        <line class="score-zero-line" x1="${margin.left}" x2="${layout.width - margin.right}" y1="${formatSvgNumber(zeroY)}" y2="${formatSvgNumber(zeroY)}"></line>
        <line class="score-target-line" x1="${margin.left}" x2="${layout.width - margin.right}" y1="${formatSvgNumber(targetY)}" y2="${formatSvgNumber(targetY)}"></line>
        <text class="score-target-label" x="${layout.width - margin.right + 10}" y="${formatSvgNumber(targetY + 4)}">seuil</text>
        <g class="score-series">${paths}</g>
      </svg>
    </div>
    <div class="score-trend-summary" aria-label="Totaux actuels par joueur">
      ${series
        .map((playerSeries) => {
          const finalPoint = playerSeries.points.at(-1);
          return `<span style="--player-color:${playerSeries.player.color}">${escapeHtml(playerSeries.player.name)} <strong>${finalPoint.total}</strong></span>`;
        })
        .join("")}
    </div>
  `;
}

function renderTensionChart() {
  const totals = getTotals();
  if (!elements.tensionChart || state.players.length === 0) return;
  const tensionRows = state.players
    .map((player) => {
      const total = totals[player.id] ?? 0;
      return {
        player,
        total,
        progress: Math.max(0, Math.min(100, (total / state.targetScore) * 100)),
        risk: ScoreViz.getRiskLevel(total, state.targetScore),
      };
    })
    .sort((a, b) => b.total - a.total);

  elements.tensionChart.innerHTML = `
    <div class="tension-header">
      <div>
        <strong>Jauge de tension</strong>
        <span>Triée par proximité du seuil</span>
      </div>
      <span>0</span>
      <span>50%</span>
      <span>75%</span>
      <span>Seuil ${state.targetScore}</span>
    </div>
    ${tensionRows
      .map(({ player, total, progress, risk }) => {
        return `
          <div class="tension-lane risk-${risk.key}" style="--player-color: ${player.color}; --progress: ${progress}%" aria-label="${escapeHtml(player.name)}: ${total} points, ${risk.label}, ${risk.remainingLabel}">
            <span>
              <strong>${escapeHtml(player.name)}</strong>
              <small>${risk.label} · ${risk.remainingLabel}</small>
            </span>
            <div class="tension-meter"><i></i></div>
            <strong>${total}</strong>
          </div>
        `;
      })
      .join("")}
  `;
}

function findBestRound() {
  let best = null;
  state.rounds.forEach((round) => {
    state.players.forEach((player) => {
      const score = round.adjustedScores[player.id];
      if (score === undefined) return;
      if (!best || score < best.score) {
        best = { round, player, score };
      }
    });
  });
  return best;
}

function findWorstRound() {
  let worst = null;
  state.rounds.forEach((round) => {
    state.players.forEach((player) => {
      const score = round.adjustedScores[player.id];
      if (score === undefined) return;
      if (!worst || score > worst.score) {
        worst = { round, player, score };
      }
    });
  });
  return worst;
}

function renderHistory() {
  if (state.rounds.length === 0 || state.players.length === 0) {
    elements.historyHead.innerHTML = "";
    elements.historyBody.innerHTML = `<tr><td><div class="empty-state">Aucune manche validée pour le moment.</div></td></tr>`;
    elements.roundCardsHistory.innerHTML = `<div class="empty-state">Les cartes de manche apparaîtront ici sur mobile.</div>`;
    return;
  }

  const historyScale = getHistoryScoreScale();

  elements.historyHead.innerHTML = `
    <tr>
      <th scope="col">Manche</th>
      <th scope="col">Fermeture</th>
      <th scope="col">Annonce</th>
      <th scope="col">Chaos</th>
      ${state.players.map((player) => `<th scope="col">${escapeHtml(player.name)}</th>`).join("")}
    </tr>
  `;

  elements.historyBody.innerHTML = state.rounds
    .map((round) => {
      const closer = state.players.find((player) => player.id === round.closerId);
      const announcer = state.players.find((player) => player.id === round.announcerId);
      return `
        <tr>
          <th scope="row">${round.number}</th>
          <td>${closer ? escapeHtml(closer.name) : "-"}</td>
          <td>${announcer ? escapeHtml(announcer.name) : "-"}</td>
          <td>${renderChaosHistorySummary(round)}</td>
          ${state.players.map((player) => renderHistoryCell(round, player, historyScale)).join("")}
        </tr>
      `;
    })
    .join("");

  elements.roundCardsHistory.innerHTML = state.rounds
    .map((round) => {
      const closer = state.players.find((player) => player.id === round.closerId);
      const announcer = state.players.find((player) => player.id === round.announcerId) || getGameMaster();
      return `
        <article class="round-history-card${round.closerPenaltyApplied ? " has-penalty" : ""}">
          <div>
            <span>Manche ${round.number}</span>
            <strong>${closer ? escapeHtml(closer.name) : "-"} ferme</strong>
          </div>
          <p class="round-announcer">${announcer && closer ? `${escapeHtml(announcer.name)} annonce la fermeture de ${escapeHtml(closer.name)}.` : "Annonce de fermeture enregistrée."}</p>
          ${round.chaos ? `<p class="round-chaos-note"><strong>${escapeHtml(round.chaos.title)}</strong> ${escapeHtml((round.chaos.effects || []).map((effect) => effect.message).join(", ") || "defi affiche")}</p>` : ""}
          <div class="round-score-grid">
            ${state.players
              .map((player) => {
                const raw = round.scores[player.id] ?? 0;
                const official = round.officialAdjustedScores?.[player.id] ?? raw;
                const adjusted = round.adjustedScores[player.id] ?? official;
                const hasPenalty = raw !== adjusted;
                const magnitude = getScoreMagnitude(adjusted, historyScale);
                return `<span class="round-score-pill${hasPenalty ? " has-penalty" : ""}${adjusted < 0 ? " is-negative" : ""}" style="--player-color:${player.color}; --score-width:${magnitude}%">${renderAvatar(player, "round-pill-avatar")}${escapeHtml(player.name)} ${escapeHtml(renderScoreStep(round, player))}</span>`;
              })
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

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

function getHistoryScoreScale() {
  return Math.max(
    1,
    ...state.rounds.flatMap((round) =>
      state.players.map((player) => Math.abs(Number(round.adjustedScores?.[player.id] ?? round.scores?.[player.id] ?? 0)))
    )
  );
}

function getScoreMagnitude(score, scale) {
  return Math.max(6, Math.min(100, (Math.abs(Number(score) || 0) / Math.max(1, scale)) * 100));
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
  const suffix = effects.length ? ` (${effects.join(", ")})` : "";
  return `${parts.join(" -> ")}${suffix}`;
}

function renderHistoryCell(round, player, historyScale) {
  const raw = round.scores[player.id] ?? 0;
  const official = round.officialAdjustedScores?.[player.id] ?? raw;
  const adjusted = round.adjustedScores[player.id] ?? official;
  const hasChange = raw !== adjusted;
  const scoreStep = renderScoreStep(round, player);
  const magnitude = getScoreMagnitude(adjusted, historyScale);
  return `
    <td class="${hasChange ? "penalty-cell" : ""}">
      <span
        class="history-score-cell${hasChange ? " has-change" : ""}${adjusted < 0 ? " is-negative" : ""}"
        style="--player-color:${player.color}; --score-width:${magnitude}%"
        aria-label="${escapeHtml(player.name)} manche ${round.number}: ${escapeHtml(scoreStep)}"
      >
        <span aria-hidden="true"></span>
        <strong>${escapeHtml(scoreStep)}</strong>
      </span>
    </td>
  `;
}

function updateButtons() {
  elements.undoRound.disabled = state.rounds.length === 0;
  elements.resetGame.disabled = state.players.length === 0 && state.rounds.length === 0;
  elements.playerName.disabled = state.rounds.length > 0;
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.setProperty("--toast-color", type === "danger" ? "#dc2626" : type === "success" ? "#0f766e" : "#2563eb");
  toast.textContent = message;
  elements.toastRegion.append(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 4200);
}

function showChaosReveal(round) {
  const reveal = ScoreViz.buildChaosReveal(round, state.players);
  if (!reveal.shouldReveal || !elements.chaosRevealDialog) return;
  if (round?.id && lastChaosRevealRoundId === round.id) return;
  lastChaosRevealRoundId = round?.id || `${round?.number || Date.now()}`;

  elements.chaosRevealKicker.textContent = reveal.kicker;
  elements.chaosRevealTitle.textContent = reveal.title;
  elements.chaosRevealDescription.textContent = reveal.description;
  elements.chaosRevealEffects.innerHTML = reveal.effects.length
    ? reveal.effects.map((effect) => `<span>${escapeHtml(effect)}</span>`).join("")
    : "<span>Aucun effet de score automatique.</span>";
  elements.chaosRevealImpacts.innerHTML = reveal.impacts.length
    ? reveal.impacts
        .map(
          (impact) => `
            <article class="chaos-impact-row" style="--player-color:${escapeHtml(impact.playerColor)}">
              <div>
                <strong>${escapeHtml(impact.playerName)}</strong>
                <small>${escapeHtml(impact.detail)}</small>
              </div>
              <div class="chaos-impact-score">
                <span>${escapeHtml(impact.raw)}</span>
                <span aria-hidden="true">→</span>
                <span>${escapeHtml(impact.final)}</span>
                <b>${escapeHtml(impact.deltaLabel)}</b>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="chaos-impact-empty">Aucun score modifié sur cette manche.</div>`;

  if (!elements.chaosRevealDialog.open && typeof elements.chaosRevealDialog.showModal === "function") {
    elements.chaosRevealDialog.showModal();
    elements.closeChaosReveal?.focus();
  } else {
    elements.chaosRevealDialog.setAttribute("open", "");
  }
}

function closeChaosReveal() {
  if (elements.chaosRevealDialog?.open) {
    elements.chaosRevealDialog.close();
  }
}

function announceVictory() {
  const ranking = getRanking();
  const winner = ranking[0];
  const totals = getTotals();
  if (!winner) return;

  elements.victoryTitle.textContent = `${winner.name} gagne !`;
  elements.victoryCopy.textContent = `La partie s'arrête après ${state.rounds.length} manche${state.rounds.length > 1 ? "s" : ""}. Le seuil de ${state.targetScore} points a été atteint, et ${winner.name} termine avec le score le plus bas.`;
  elements.victoryRanking.innerHTML = ranking
    .map(
      (player, index) => `
        <div class="victory-row" style="--player-color:${player.color}">
          <span>${index + 1}. ${escapeHtml(player.name)}</span>
          <span>${totals[player.id]} pts</span>
        </div>
      `
    )
    .join("");

  if (!elements.victoryDialog.open && typeof elements.victoryDialog.showModal === "function") {
    elements.victoryDialog.showModal();
  }
  fireConfetti();
}

function fireConfetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = elements.canvas;
  const context = canvas.getContext("2d");
  const pixelRatio = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const colors = ["#e11d48", "#2563eb", "#0f766e", "#f59e0b", "#fb7185", "#60a5fa"];

  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  context.scale(pixelRatio, pixelRatio);

  const pieces = Array.from({ length: 150 }, () => ({
    x: Math.random() * width,
    y: -20 - Math.random() * height * 0.35,
    size: 6 + Math.random() * 11,
    speed: 2 + Math.random() * 4,
    rotation: Math.random() * Math.PI,
    rotationSpeed: -0.12 + Math.random() * 0.24,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  let frame = 0;
  function draw() {
    frame += 1;
    context.clearRect(0, 0, width, height);
    pieces.forEach((piece) => {
      piece.y += piece.speed;
      piece.x += Math.sin((frame + piece.y) / 24) * 1.8;
      piece.rotation += piece.rotationSpeed;

      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.rotation);
      context.fillStyle = piece.color;
      context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.58);
      context.restore();
    });

    if (frame < 190) {
      requestAnimationFrame(draw);
    } else {
      context.clearRect(0, 0, width, height);
    }
  }

  draw();
}

function pulseHero() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.body.classList.remove("round-pulse");
  window.requestAnimationFrame(() => document.body.classList.add("round-pulse"));
}

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);
}

function formatSvgNumber(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

function signedNumber(value) {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

elements.rulesToggle.addEventListener("click", () => {
  const isHidden = elements.rulesPanel.hidden;
  elements.rulesPanel.hidden = !isHidden;
  elements.rulesToggle.setAttribute("aria-expanded", String(isHidden));
});

elements.startSync.addEventListener("click", startSyncSession);

elements.copyControllerLink.addEventListener("click", async () => {
  if (!sync.controllerUrl) return;
  try {
    await navigator.clipboard.writeText(sync.controllerUrl);
    showToast("Lien mobile copié.", "success");
  } catch {
    elements.controllerUrl.select();
    document.execCommand("copy");
    showToast("Lien mobile copié.", "success");
  }
});

elements.playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addPlayer(elements.playerName.value);
  elements.playerName.value = "";
});

elements.closerSelect.addEventListener("change", () => {
  setLocalRoundDraft(ScoreDraft.syncDraftCloser(localRoundDraft, elements.closerSelect.value, state.players));
});

elements.scoreInputs.addEventListener("input", (event) => {
  const input = event.target.closest("[data-score-input]");
  if (!input) return;
  setLocalRoundDraft(ScoreDraft.syncDraftScore(localRoundDraft, input.dataset.scoreInput, input.value, state.players));
});

elements.scoreInputs.addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-score-input]");
  if (!input || event.key !== "Enter") return;
  event.preventDefault();
  if (!focusNextScoreInput(input)) {
    input.blur();
  }
});

document.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-player]");
  if (removeButton) {
    removePlayer(removeButton.dataset.removePlayer);
    return;
  }

  const quickButton = event.target.closest("[data-quick-name]");
  if (quickButton) {
    addPlayer(quickButton.dataset.quickName);
    return;
  }

  const valueButton = event.target.closest("[data-score-value]");
  if (valueButton) {
    const input = getScoreInput(valueButton.dataset.targetScore);
    if (input) {
      setScoreInputValue(input, valueButton.dataset.scoreValue);
      focusScoreInput(input);
      input.select();
    }
    return;
  }

  const bumpButton = event.target.closest("[data-score-bump]");
  if (bumpButton) {
    const input = getScoreInput(bumpButton.dataset.targetScore);
    if (input) {
      setScoreInputValue(input, String((Number(input.value) || 0) + Number(bumpButton.dataset.scoreBump)));
      focusScoreInput(input);
      input.select();
    }
    return;
  }

  const redrawButton = event.target.closest("[data-redraw-chaos-card]");
  if (redrawButton) {
    redrawChaosCard();
  }
});

elements.targetScore.addEventListener("change", () => {
  dispatchAction({ type: "SET_TARGET_SCORE", targetScore: Number(elements.targetScore.value) });
});

elements.closerPenalty.addEventListener("change", () => {
  dispatchAction({ type: "SET_CLOSER_PENALTY", enabled: elements.closerPenalty.checked });
});

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

elements.roundForm.addEventListener("submit", submitRound);
elements.undoRound.addEventListener("click", undoRound);

elements.resetGame.addEventListener("click", () => {
  if (state.rounds.length === 0 && state.players.length === 0) return;
  resetGame(true);
});

elements.closeChaosReveal.addEventListener("click", closeChaosReveal);
elements.continueChaosReveal.addEventListener("click", closeChaosReveal);

elements.closeVictory.addEventListener("click", () => {
  elements.victoryDialog.close();
});

elements.victoryNewGame.addEventListener("click", () => {
  elements.victoryDialog.close();
  resetGame(true);
});

initMode();
render();
