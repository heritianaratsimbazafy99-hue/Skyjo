const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const QRCode = require("qrcode");
const SkyjoChaos = require("./chaos-engine");
const ScoreDraft = require("./score-draft");

const PORT = Number(process.env.PORT) || 8000;
const ROOT = __dirname;
const COLORS = ["#e11d48", "#2563eb", "#0f766e", "#d97706", "#7c3aed", "#0891b2", "#be123c", "#65a30d"];
const sessions = new Map();

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

function getChaosIntensityLabel(intensity) {
  return {
    facile: "Facile",
    moyen: "Moyen",
    fort: "Fort",
    extreme: "Extrême",
  }[intensity] || "Extrême";
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function cleanState(input) {
  const fallback = createInitialState();
  if (!input || typeof input !== "object") return fallback;
  const players = Array.isArray(input.players) ? input.players : [];
  const rounds = Array.isArray(input.rounds) ? input.rounds : [];
  const cleaned = {
    ...fallback,
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
  ensureGameMaster(cleaned, false);
  ensureChaosCardForNextRound(cleaned);
  return cleaned;
}

function sanitizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").slice(0, 18);
}

function getPlayerColor(index) {
  return COLORS[index % COLORS.length];
}

function createEmptyRoundDraft() {
  return ScoreDraft.createEmptyRoundDraft();
}

function pickRandomGameMaster(players) {
  if (!Array.isArray(players) || players.length < 2) return null;
  return players[Math.floor(Math.random() * players.length)]?.id || null;
}

function ensureGameMaster(state, randomize = true) {
  if (!Array.isArray(state.players) || state.players.length < 2) {
    state.gameMasterId = null;
    return state;
  }

  if (state.players.some((player) => player.id === state.gameMasterId)) {
    return state;
  }

  state.gameMasterId = randomize ? pickRandomGameMaster(state.players) : state.players[0]?.id || null;
  return state;
}

function ensureChaosCardForNextRound(state) {
  state.chaosMode = SkyjoChaos.normalizeChaosMode(state.chaosMode, state.rounds);

  if (!SkyjoChaos.isChaosEnabled(state)) {
    state.activeChaosCard = null;
    return state;
  }

  state.activeChaosCard = SkyjoChaos.normalizeActiveChaosCard(state.activeChaosCard, state.players);
  if (!state.activeChaosCard) {
    state.activeChaosCard = SkyjoChaos.selectNextChaosCard(state);
  }

  return state;
}

function redrawActiveChaosCard(state) {
  if (!SkyjoChaos.isChaosEnabled(state)) {
    return { error: "Active Deck Chaos avec au moins deux joueurs pour changer de carte." };
  }

  const card = SkyjoChaos.redrawChaosCard(state);
  if (!card) {
    return { error: "Aucune autre carte Chaos disponible pour cette manche." };
  }

  state.activeChaosCard = card;
  return { card };
}

function getTotals(state) {
  return state.players.reduce((totals, player) => {
    totals[player.id] = state.rounds.reduce((sum, round) => sum + (round.adjustedScores[player.id] ?? 0), 0);
    return totals;
  }, {});
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

function applyAction(currentState, action) {
  const next = JSON.parse(JSON.stringify(currentState));
  const meta = {};

  switch (action.type) {
    case "ADD_PLAYER": {
      if (next.rounds.length > 0) return { error: "Ajoute les joueurs avant la première manche." };
      const name = sanitizeName(action.name);
      if (!name) return { error: "Nom de joueur invalide." };
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
      if (next.rounds.length > 0) return { error: "Impossible de retirer un joueur après la première manche." };
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
      if (next.doubleCloserPenalty && !action.closerId) return { error: "Choisis le joueur qui a fermé la manche." };

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

function createSession(initialState, req) {
  const sessionId = crypto.randomBytes(4).toString("hex");
  const controllerToken = crypto.randomBytes(5).toString("hex");
  const session = {
    id: sessionId,
    controllerToken,
    revision: 0,
    state: cleanState(initialState),
    clients: new Set(),
  };
  sessions.set(sessionId, session);
  return {
    session,
    controllerUrl: `${getLanBaseUrl(req)}/c/${sessionId}/${controllerToken}`,
  };
}

function getLanBaseUrl(req) {
  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const [, port = String(PORT)] = hostHeader.split(":");
  const host = hostHeader.startsWith("localhost") || hostHeader.startsWith("127.") ? getLanIp() : hostHeader.split(":")[0];
  return `http://${host}:${port}`;
}

function getLanIp() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

function broadcast(session, event = "state", meta = {}) {
  const payload = JSON.stringify({
    sessionId: session.id,
    revision: session.revision,
    state: session.state,
    meta,
  });
  for (const client of session.clients) {
    client.write(`event: ${event}\n`);
    client.write(`data: ${payload}\n\n`);
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload trop volumineux."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function serveFile(req, res, pathname) {
  const routePath = pathname === "/" || pathname.startsWith("/c/") ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(ROOT, routePath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/qr.svg") {
    const text = url.searchParams.get("text") || "";
    if (!text) {
      sendJson(res, 400, { error: "Texte QR manquant." });
      return true;
    }
    const svg = await QRCode.toString(text, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 3,
      color: {
        dark: "#2f1725",
        light: "#ffffff",
      },
    });
    res.writeHead(200, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(svg);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/sessions") {
    const body = await readJson(req);
    const { session, controllerUrl } = createSession(body.state, req);
    sendJson(res, 201, {
      sessionId: session.id,
      controllerToken: session.controllerToken,
      revision: session.revision,
      state: session.state,
      controllerUrl,
    });
    return true;
  }

  const match = url.pathname.match(/^\/api\/sessions\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return false;

  const session = sessions.get(match[1]);
  if (!session) {
    sendJson(res, 404, { error: "Session introuvable. Relance le QR depuis le desktop." });
    return true;
  }

  if (req.method === "GET" && !match[2]) {
    sendJson(res, 200, { sessionId: session.id, revision: session.revision, state: session.state });
    return true;
  }

  if (req.method === "GET" && match[2] === "events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    session.clients.add(res);
    res.write(`event: state\n`);
    res.write(`data: ${JSON.stringify({ sessionId: session.id, revision: session.revision, state: session.state })}\n\n`);
    req.on("close", () => session.clients.delete(res));
    return true;
  }

  if (req.method === "POST" && match[2] === "actions") {
    const body = await readJson(req);
    if (body.token !== session.controllerToken) {
      sendJson(res, 403, { error: "Jeton contrôleur invalide." });
      return true;
    }
    if (Number(body.baseRevision) !== session.revision) {
      sendJson(res, 409, { error: "État de session plus récent disponible.", revision: session.revision, state: session.state });
      return true;
    }
    const result = applyAction(session.state, body.action || {});
    if (result.error) {
      sendJson(res, 400, { error: result.error, revision: session.revision, state: session.state });
      return true;
    }
    session.state = result.state;
    session.revision += 1;
    broadcast(session, "state", result.meta);
    sendJson(res, 200, { revision: session.revision, state: session.state, meta: result.meta });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    const handled = url.pathname.startsWith("/api/") ? await handleApi(req, res, url) : false;
    if (handled) return;
    serveFile(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Erreur serveur." });
  }
});

const LISTEN_HOST = process.env.VERCEL ? undefined : "0.0.0.0";

server.listen(PORT, LISTEN_HOST, () => {
  console.log(`Skyjo Score Arena: http://127.0.0.1:${PORT}/`);
  console.log(`QR mobile LAN:     http://${getLanIp()}:${PORT}/`);
});
