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

  return {
    CATEGORY,
    CHAOS_CARDS,
    RARITY,
    TIMING,
    createDefaultChaosMode,
    getCard,
    getEligibleCards,
    getRanking,
    getTotals,
    isChaosEnabled,
    normalizeActiveChaosCard,
    normalizeChaosMode,
    selectNextChaosCard,
  };
});
