const MILESTONES = Object.freeze([
  [1, 0], [5, 1_000], [10, 5_000], [20, 25_000], [30, 75_000],
  [40, 200_000], [50, 500_000], [60, 1_000_000], [70, 2_000_000],
  [80, 3_500_000], [90, 6_000_000], [99, 9_000_000], [100, 10_000_000],
]);

export function companyLevelForCapital(capital) {
  const value = Number(capital);
  if (!Number.isFinite(value) || value < 0) return null;
  let level = 1;
  for (const [candidate, threshold] of MILESTONES) {
    if (value >= threshold) level = candidate;
    else break;
  }
  return Math.min(100, level);
}

export function companyLevelTelemetry(capital) {
  const value = Number(capital);
  const level = companyLevelForCapital(value);
  if (level === null) return null;

  const currentIndex = MILESTONES.findIndex(([candidate]) => candidate === level);
  const currentThreshold = currentIndex >= 0 ? MILESTONES[currentIndex][1] : 0;
  const next = MILESTONES[currentIndex + 1] ?? null;
  const target = next ? next[1] : 10_000_000;
  const span = Math.max(1, target - currentThreshold);
  const progressPercent = next
    ? Math.max(0, Math.min(100, ((value - currentThreshold) / span) * 100))
    : 100;

  return {
    level,
    maxLevel: 100,
    maxCapital: 10_000_000,
    currentCapital: value,
    currentThreshold,
    nextLevel: next?.[0] ?? null,
    nextThreshold: next?.[1] ?? null,
    remainingToNext: next ? Math.max(0, next[1] - value) : 0,
    progressPercent,
    source: "starforge-governed-company-ledger",
  };
}

export { MILESTONES };