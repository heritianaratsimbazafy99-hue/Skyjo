const SkyjoChaos = window.SkyjoChaos;
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
  roundPill: document.querySelector("#round-pill"),
  leaderCallout: document.querySelector("#leader-callout"),
  rankingList: document.querySelector("#ranking-list"),
  closerSelect: document.querySelector("#closer-select"),
  roundForm: document.querySelector("#round-form"),
  scoreInputs: document.querySelector("#score-inputs"),
  submitRound: document.querySelector("#submit-round"),
  undoRound: document.querySelector("#undo-round"),
  insightGrid: document.querySelector("#insight-grid"),
  tensionChart: document.querySelector("#tension-chart"),
  historyHead: document.querySelector("#history-head"),
  historyBody: document.querySelector("#history-body"),
  roundCardsHistory: document.querySelector("#round-cards-history"),
  toastRegion: document.querySelector("#toast-region"),
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
    roundDraft: input.roundDraft && typeof input.roundDraft === "object" ? input.roundDraft : createEmptyRoundDraft(),
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
  const wasGameOver = state.gameOver;
  state = normalizeState(nextState);
  sync.revision = revision;
  saveState();
  render();
  if (!wasGameOver && state.gameOver) {
    announceVictory();
  }
  if (meta?.round && sync.role === "desktop") {
    pulseHero();
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
  const wasGameOver = state.gameOver;
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
        intensity: "extreme",
        revealMode: "mixed",
      }, next.rounds);
      next.activeChaosCard = null;
      ensureChaosCardForNextRound(next);
      meta.message = next.chaosMode.enabled ? "Deck Chaos active. La table entre en zone instable." : "Deck Chaos desactive.";
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
      next.chaosMode = SkyjoChaos.normalizeChaosMode(next.chaosMode, next.rounds);
      next.activeChaosCard = null;
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
    showToast(`Manche ${meta.round?.number || state.rounds.length} validée.${penaltyText}`, meta.round?.closerPenaltyApplied ? "danger" : "success");
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
  state.players.forEach((player) => {
    const input = document.querySelector(`[data-score-input="${player.id}"]`);
    const value = Number(input?.value);
    if (!Number.isInteger(value)) {
      firstInvalidInput = firstInvalidInput || input;
    }
    scores[player.id] = value;
  });

  if (firstInvalidInput) {
    showToast("Chaque score de manche doit être un nombre entier.", "danger");
    firstInvalidInput.focus();
    return;
  }

  dispatchAction({ type: "SUBMIT_ROUND", closerId, scores });
}

function clearScoreInputs() {
  document.querySelectorAll("[data-score-input]").forEach((input) => {
    input.value = "";
  });
}

function undoRound() {
  dispatchAction({ type: "UNDO_ROUND" });
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

function render() {
  elements.targetScore.value = state.targetScore;
  elements.closerPenalty.checked = state.doubleCloserPenalty;

  renderStatus();
  renderSyncPanel();
  renderPlayers();
  renderLiveTable();
  renderRoundForm();
  renderRanking();
  renderInsights();
  renderHistory();
  updateButtons();

  lastRenderedRound = state.rounds.length;
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
  elements.closerSelect.innerHTML = [
    `<option value="">Choisir le joueur</option>`,
    ...state.players.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`),
  ].join("");
  elements.closerSelect.disabled = disabled;
  elements.submitRound.disabled = disabled;

  if (state.players.length === 0) {
    elements.scoreInputs.innerHTML = `<div class="empty-state">Les champs de score apparaîtront ici dès que la table aura des joueurs.</div>`;
    return;
  }

  const totals = getTotals();
  elements.scoreInputs.innerHTML = state.players
    .map((player, index) => {
      const currentTotal = totals[player.id] ?? 0;
      return `
        <div class="score-row score-input-card" style="--player-color: ${player.color}; --delay: ${index * 35}ms">
          <label for="score-${player.id}">
            <span class="player-avatar" aria-hidden="true">${escapeHtml(player.name.charAt(0).toUpperCase())}</span>
            <span>
              <strong>${escapeHtml(player.name)}</strong>
              <small>${currentTotal} points cumulés</small>
            </span>
          </label>
          <input
            id="score-${player.id}"
            data-score-input="${player.id}"
            type="number"
            inputmode="numeric"
            step="1"
            placeholder="0"
            ${disabled ? "disabled" : ""}
            aria-label="Score de manche pour ${escapeHtml(player.name)}"
          />
          <div class="score-stepper" aria-label="Raccourcis score ${escapeHtml(player.name)}">
            ${[-2, 0, 5, 10, 12].map((value) => `<button type="button" data-score-value="${value}" data-target-score="${player.id}" ${disabled ? "disabled" : ""}>${value}</button>`).join("")}
            ${[-5, -1, 1, 5].map((value) => `<button type="button" data-score-bump="${value}" data-target-score="${player.id}" ${disabled ? "disabled" : ""}>${value > 0 ? "+" : ""}${value}</button>`).join("")}
          </div>
        </div>
      `;
    })
    .join("");
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

  renderTensionChart();
}

function renderTensionChart() {
  const totals = getTotals();
  if (!elements.tensionChart || state.players.length === 0) return;
  elements.tensionChart.innerHTML = `
    <div class="tension-header">
      <strong>Timeline de tension</strong>
      <span>Seuil ${state.targetScore}</span>
    </div>
    ${state.players
      .map((player) => {
        const total = totals[player.id] ?? 0;
        const progress = Math.max(0, Math.min(100, (total / state.targetScore) * 100));
        return `
          <div class="tension-lane" style="--player-color: ${player.color}; --progress: ${progress}%">
            <span>${escapeHtml(player.name)}</span>
            <div><i></i></div>
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

  elements.historyHead.innerHTML = `
    <tr>
      <th scope="col">Manche</th>
      <th scope="col">Fermeture</th>
      ${state.players.map((player) => `<th scope="col">${escapeHtml(player.name)}</th>`).join("")}
    </tr>
  `;

  elements.historyBody.innerHTML = state.rounds
    .map((round) => {
      const closer = state.players.find((player) => player.id === round.closerId);
      return `
        <tr>
          <th scope="row">${round.number}</th>
          <td>${closer ? escapeHtml(closer.name) : "-"}</td>
          ${state.players.map((player) => renderHistoryCell(round, player)).join("")}
        </tr>
      `;
    })
    .join("");

  elements.roundCardsHistory.innerHTML = state.rounds
    .map((round) => {
      const closer = state.players.find((player) => player.id === round.closerId);
      return `
        <article class="round-history-card${round.closerPenaltyApplied ? " has-penalty" : ""}">
          <div>
            <span>Manche ${round.number}</span>
            <strong>${closer ? escapeHtml(closer.name) : "-"} ferme</strong>
          </div>
          <div class="round-score-grid">
            ${state.players
              .map((player) => {
                const raw = round.scores[player.id] ?? 0;
                const adjusted = round.adjustedScores[player.id] ?? raw;
                const hasPenalty = raw !== adjusted;
                return `<span class="round-score-pill${hasPenalty ? " has-penalty" : ""}" style="--player-color:${player.color}">${escapeHtml(player.name)} ${hasPenalty ? `${raw}->${adjusted}` : adjusted}</span>`;
              })
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderHistoryCell(round, player) {
  const raw = round.scores[player.id] ?? 0;
  const adjusted = round.adjustedScores[player.id] ?? raw;
  const hasPenalty = raw !== adjusted;
  return `<td class="${hasPenalty ? "penalty-cell" : ""}">${hasPenalty ? `${raw} -> ${adjusted}` : adjusted}</td>`;
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
    const input = document.querySelector(`[data-score-input="${valueButton.dataset.targetScore}"]`);
    if (input) input.value = valueButton.dataset.scoreValue;
    return;
  }

  const bumpButton = event.target.closest("[data-score-bump]");
  if (bumpButton) {
    const input = document.querySelector(`[data-score-input="${bumpButton.dataset.targetScore}"]`);
    if (input) input.value = String((Number(input.value) || 0) + Number(bumpButton.dataset.scoreBump));
  }
});

elements.targetScore.addEventListener("change", () => {
  dispatchAction({ type: "SET_TARGET_SCORE", targetScore: Number(elements.targetScore.value) });
});

elements.closerPenalty.addEventListener("change", () => {
  dispatchAction({ type: "SET_CLOSER_PENALTY", enabled: elements.closerPenalty.checked });
});

elements.roundForm.addEventListener("submit", submitRound);
elements.undoRound.addEventListener("click", undoRound);

elements.resetGame.addEventListener("click", () => {
  if (state.rounds.length === 0 && state.players.length === 0) return;
  resetGame(true);
});

elements.closeVictory.addEventListener("click", () => {
  elements.victoryDialog.close();
});

elements.victoryNewGame.addEventListener("click", () => {
  elements.victoryDialog.close();
  resetGame(true);
});

initMode();
render();
