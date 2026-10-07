function clone(value) {
  return value == null ? value : structuredClone(value);
}

function clean(value) {
  return String(value ?? "").trim().toLowerCase();
}

function outcomeWeight(entry) {
  if (entry?.outcome === "completed" && entry?.verified === true) return 1;
  if (entry?.verified === true) return 0.5;
  return -1;
}

function capabilityOverlap(required = [], entry = {}) {
  const wanted = new Set(required.map(clean).filter(Boolean));
  return (entry.requiredCapabilities || []).reduce((score, capability) => (
    wanted.has(clean(capability)) ? score + 1 : score
  ), 0);
}

export function makeOutcomeIntelligence({ memory = null } = {}) {
  if (!memory || typeof memory.snapshot !== "function") {
    throw new Error("Outcome intelligence requires governed mission memory");
  }

  function analyze({ objective = "", requiredCapabilities = [], candidates = [] } = {}) {
    const history = memory.snapshot();
    const words = clean(objective).split(/[^a-z0-9]+/).filter((word) => word.length > 2);
    const relevant = history.map(entry => {
      const objectiveMatch = words.reduce((score, word) => score + (clean(entry.objective).includes(word) ? 1 : 0), 0);
      const capabilityMatch = capabilityOverlap(requiredCapabilities, entry);
      return {
        entry,
        relevance: objectiveMatch + capabilityMatch * 2,
      };
    }).filter(item => item.relevance > 0);

    const strategyEvidence = relevant.reduce((map, { entry, relevance }) => {
      const lesson = clean(entry.lesson);
      const key = lesson || "unspecified-strategy";
      const current = map.get(key) || { strategy: entry.lesson || "Unspecified strategy", samples: 0, verified: 0, revenue: 0, relevance: 0 };
      current.samples += 1;
      current.verified += entry.verified ? 1 : 0;
      current.revenue += Number(entry.revenue) || 0;
      current.relevance += relevance;
      map.set(key, current);
      return map;
    }, new Map());

    const strategies = [...strategyEvidence.values()].map(item => ({
      ...item,
      successRate: item.samples ? item.verified / item.samples : 0,
      score: item.relevance + item.verified * 2 + Math.min(5, Math.max(0, item.revenue) / 100),
    })).sort((a, b) => b.score - a.score);

    const workerEvidence = new Map();
    for (const { entry, relevance } of relevant) {
      for (const worker of entry.workers || []) {
        const current = workerEvidence.get(worker.id) || {
          id: worker.id, name: worker.name, samples: 0, verified: 0, relevance: 0,
        };
        current.samples += 1;
        current.verified += entry.verified ? 1 : 0;
        current.relevance += relevance;
        workerEvidence.set(worker.id, current);
      }
    }
    const workerRankings = [...workerEvidence.values()].map(worker => ({
      ...worker,
      successRate: worker.samples ? worker.verified / worker.samples : 0,
      score: worker.relevance + worker.verified * 2,
    })).sort((a, b) => b.score - a.score);

    const rankedCandidates = candidates.map(candidate => {
      const worker = workerRankings.find(item => item.id === candidate.id);
      return {
        candidate: clone(candidate),
        evidenceScore: worker?.score ?? 0,
        historicalSuccessRate: worker?.successRate ?? null,
      };
    }).sort((a, b) => b.evidenceScore - a.evidenceScore);

    return clone({
      objective,
      evidenceCount: relevant.length,
      strategies,
      workerRankings,
      rankedCandidates,
      confidence: Math.min(1, relevant.length / 5),
    });
  }

  return Object.freeze({ analyze });
}
