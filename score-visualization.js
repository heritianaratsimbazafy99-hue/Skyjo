(function attachScoreVisualization(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SkyjoScoreViz = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createScoreVisualizationApi() {
  function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function buildCumulativeSeries(players, rounds) {
    return players.map((player) => {
      let total = 0;
      const points = [{ round: 0, score: 0, total: 0 }];

      rounds.forEach((round, index) => {
        const score = toFiniteNumber(round.adjustedScores?.[player.id]);
        total += score;
        points.push({
          round: toFiniteNumber(round.number, index + 1),
          score,
          total,
        });
      });

      return { player, points };
    });
  }

  function getScoreTrendDomain(series, targetScore) {
    const target = Math.max(0, toFiniteNumber(targetScore, 100));
    const points = series.flatMap((playerSeries) => playerSeries.points);
    const maxRound = Math.max(1, ...points.map((point) => toFiniteNumber(point.round)));
    const rawMin = Math.min(0, ...points.map((point) => toFiniteNumber(point.total)));
    const rawMax = Math.max(target, 0, ...points.map((point) => toFiniteNumber(point.total)));

    return {
      minRound: 0,
      maxRound,
      minScore: rawMin < 0 ? Math.floor((rawMin - 5) / 10) * 10 : 0,
      maxScore: Math.max(10, Math.ceil(rawMax / 10) * 10),
    };
  }

  function getRiskLevel(total, targetScore) {
    const target = Math.max(1, toFiniteNumber(targetScore, 100));
    const score = toFiniteNumber(total);
    const remaining = Math.max(0, target - score);
    const over = Math.max(0, score - target);
    const progress = score / target;

    if (score >= target) {
      return {
        key: "over",
        label: "Seuil atteint",
        remainingLabel: `${over} pts au-dessus`,
      };
    }

    if (progress >= 0.75) {
      return {
        key: "danger",
        label: "Danger",
        remainingLabel: `${remaining} pts restants`,
      };
    }

    if (progress >= 0.5) {
      return {
        key: "watch",
        label: "Vigilance",
        remainingLabel: `${remaining} pts restants`,
      };
    }

    return {
      key: "safe",
      label: "Confort",
      remainingLabel: `${remaining} pts restants`,
    };
  }

  function getTrendLayout(roundCount) {
    const playableRounds = Math.max(0, toFiniteNumber(roundCount));
    return {
      width: Math.max(640, 240 + playableRounds * 40),
      height: 260,
    };
  }

  function spreadLabelPositions(labels, options = {}) {
    const min = toFiniteNumber(options.min);
    const max = toFiniteNumber(options.max, 100);
    const gap = Math.max(0, toFiniteNumber(options.gap, 14));
    const sorted = labels
      .map((label) => ({ id: label.id, y: toFiniteNumber(label.y) }))
      .sort((a, b) => a.y - b.y);
    const placed = [];
    let previous = min - gap;

    sorted.forEach((label) => {
      const y = Math.max(min, label.y, previous + gap);
      placed.push({ ...label, y });
      previous = y;
    });

    const overflow = placed.length ? placed.at(-1).y - max : 0;
    if (overflow > 0) {
      placed.forEach((label) => {
        label.y -= overflow;
      });
    }

    if (placed[0]?.y < min) {
      placed[0].y = min;
      for (let index = 1; index < placed.length; index += 1) {
        placed[index].y = Math.max(placed[index].y, placed[index - 1].y + gap);
      }
    }

    return placed.reduce((positions, label) => {
      positions[label.id] = Math.min(max, Math.max(min, Number(label.y.toFixed(2))));
      return positions;
    }, {});
  }

  function formatSignedNumber(value) {
    const number = toFiniteNumber(value);
    return number > 0 ? `+${number}` : String(number);
  }

  function buildScoreStepDetail(scoreStep, raw, final) {
    const steps = Array.isArray(scoreStep?.steps) ? scoreStep.steps : [];
    if (!steps.length) {
      return `score brut ${raw} → score final ${final}`;
    }

    return steps
      .map((step) => `${String(step.label || "score")} ${toFiniteNumber(step.value)}`)
      .join(" → ");
  }

  function buildChaosReveal(round, players) {
    const chaos = round?.chaos;
    if (!chaos || chaos.timing !== "after") {
      return { shouldReveal: false };
    }

    const effects = Array.isArray(chaos.effects)
      ? chaos.effects.map((effect) => String(effect.message || effect.title || "")).filter(Boolean)
      : [];
    const scoreSteps = chaos.scoreSteps && typeof chaos.scoreSteps === "object" ? chaos.scoreSteps : {};
    const playerList = Array.isArray(players) ? players : [];
    const impacts = playerList
      .map((player) => {
        const step = scoreSteps[player.id] || {};
        const raw = toFiniteNumber(step.raw ?? round.scores?.[player.id]);
        const final = toFiniteNumber(step.final ?? round.adjustedScores?.[player.id], raw);
        const playerEffects = Array.isArray(step.effects) ? step.effects : [];
        const delta = final - raw;
        if (delta === 0 && !playerEffects.length) return null;

        return {
          playerId: player.id,
          playerName: player.name || "Joueur",
          playerColor: player.color || "#0f766e",
          raw,
          final,
          delta,
          deltaLabel: formatSignedNumber(delta),
          detail: buildScoreStepDetail(step, raw, final),
        };
      })
      .filter(Boolean);

    return {
      shouldReveal: true,
      title: chaos.title || "Carte Chaos",
      kicker: `Carte AFTER · Manche ${toFiniteNumber(round?.number, 0)}`,
      description: chaos.description || "",
      effects,
      impacts,
    };
  }

  return {
    buildCumulativeSeries,
    buildChaosReveal,
    getScoreTrendDomain,
    getRiskLevel,
    getTrendLayout,
    spreadLabelPositions,
  };
});
