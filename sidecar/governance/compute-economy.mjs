import fs from "node:fs";
import path from "node:path";

/* StarForge Compute Economy.
   Policy sits above the existing model router. It never bypasses provider limits or silently
   upgrades a task into paid compute. Legacy authorize()/recordUsage() remain compatible while
   allocate() adds router-governed candidate selection and fail-closed fallback.
*/
const DEFAULT_BUDGETS = Object.freeze({ missionCents: 100, workerCents: 50, taskCents: 10 });
const STATUS = Object.freeze(["available", "rate-limited", "unavailable", "paid-only"]);

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Compute Economy requires a non-negative amount");
  return Math.round(n * 100) / 100;
}
function cents(value) { return Math.round(money(value) * 100); }
function id(value, label) {
  const v = String(value || "").trim();
  if (!v) throw new Error("Compute Economy requires " + label);
  return v;
}

export function makeComputeEconomy({
  budgets = {},
  providerStatuses = {},
  router = null,
  costEngine = null,
  storagePath = null,
} = {}) {
  const limits = Object.freeze({
    missionCents: Number.isFinite(Number(budgets.missionCents)) ? Math.max(0, Math.round(Number(budgets.missionCents))) : DEFAULT_BUDGETS.missionCents,
    workerCents: Number.isFinite(Number(budgets.workerCents)) ? Math.max(0, Math.round(Number(budgets.workerCents))) : DEFAULT_BUDGETS.workerCents,
    taskCents: Number.isFinite(Number(budgets.taskCents)) ? Math.max(0, Math.round(Number(budgets.taskCents))) : DEFAULT_BUDGETS.taskCents,
  });
  const providers = new Map(Object.entries(providerStatuses).map(([k, v]) => [String(k).trim().toLowerCase(), v]));
  const persistentPath = storagePath ? path.resolve(String(storagePath)) : null;
  let persisted = null;
  if (persistentPath && fs.existsSync(persistentPath)) {
    try {
      persisted = JSON.parse(fs.readFileSync(persistentPath, "utf8"));
    } catch (error) {
      throw new Error(`Compute Economy persistence could not be read: ${error.message}`);
    }
  }
  const ledger = Array.isArray(persisted?.ledger) ? persisted.ledger.map((entry) => ({ ...entry })) : [];
  const reservations = new Map(
    Array.isArray(persisted?.reservations)
      ? persisted.reservations.map((reservation) => [String(reservation.reservationId), { ...reservation, authorization: { ...(reservation.authorization || {}) } }])
      : [],
  );

  function persist() {
    if (!persistentPath) return;
    const directory = path.dirname(persistentPath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${persistentPath}.${process.pid}.tmp`;
    const payload = JSON.stringify({ version: 1, limits: { ...limits }, reservations: [...reservations.values()], ledger: ledger.map((entry) => ({ ...entry })) }, null, 2) + "\n";
    try {
      fs.writeFileSync(temporaryPath, payload, "utf8");
      fs.renameSync(temporaryPath, persistentPath);
    } catch (error) {
      try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch {}
      throw new Error(`Compute Economy persistence could not be saved: ${error.message}`);
    }
  }

  function providerStatus(provider) {
    return providers.get(id(provider, "provider").toLowerCase()) || "available";
  }
  function assertProvider(provider) {
    const status = providerStatus(provider);
    if (!STATUS.includes(status)) throw new Error("Compute Economy has invalid provider status: " + status);
    if (status !== "available") throw new Error("Compute Economy rejected provider " + provider + ": " + status);
  }
  function rowsFor({ missionId, workerId = null, taskId = null } = {}) {
    return ledger.filter(e =>
      (!missionId || e.missionId === missionId) &&
      (!workerId || e.workerId === workerId) &&
      (!taskId || e.taskId === taskId)
    );
  }
  function remaining({ missionId, workerId = null, taskId = null } = {}) {
    const rows = rowsFor({ missionId });
    const spent = rows.reduce((s, e) => s + e.costCents, 0);
    const ws = workerId ? rowsFor({ missionId, workerId }).reduce((s, e) => s + e.costCents, 0) : 0;
    const ts = taskId ? rowsFor({ missionId, workerId, taskId }).reduce((s, e) => s + e.costCents, 0) : 0;
    return {
      missionCents: limits.missionCents - spent,
      workerCents: limits.workerCents - ws,
      taskCents: limits.taskCents - ts,
    };
  }

  function authorize({ missionId, workerId, taskId, provider, model, estimatedCost = 0, complexity = "normal" } = {}) {
    const mission = id(missionId, "mission id");
    const worker = id(workerId, "worker id");
    const task = id(taskId, "task id");
    const providerId = id(provider, "provider").toLowerCase();
    const modelId = id(model, "model");
    const costCents = cents(estimatedCost);
    assertProvider(providerId);
    const left = remaining({ missionId: mission, workerId: worker, taskId: task });
    if (costCents > left.missionCents || costCents > left.workerCents || costCents > left.taskCents) {
      throw new Error("Compute Economy budget exceeded");
    }
    return Object.freeze({
      approved: true, missionId: mission, workerId: worker, taskId: task,
      provider: providerId, model: modelId, complexity: String(complexity),
      estimatedCost: money(estimatedCost),
      budgetRemaining: Object.freeze({
        mission: money(Math.max(0, left.missionCents - costCents) / 100),
        worker: money(Math.max(0, left.workerCents - costCents) / 100),
        task: money(Math.max(0, left.taskCents - costCents) / 100),
      }),
    });
  }

  async function allocate({
    missionId, workerId, taskId, candidates = [], complexity = "normal", estimatedCost = 0,
  } = {}) {
    if (!router || typeof router.resolve !== "function") {
      throw new Error("Compute Economy allocation requires the existing StarForge model router");
    }
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error("Compute Economy allocation requires model candidates");
    }

    const approved = [];
    for (const candidate of candidates) {
      const provider = String(candidate?.provider || "").trim();
      const model = String(candidate?.model || "").trim();
      if (!provider || !model) continue;
      try {
        assertProvider(provider);
        const route = await router.resolve({
          provider,
          model,
          key: candidate.key || "",
          token: candidate.token || "",
          fetchImpl: candidate.fetchImpl,
          baseUrl: candidate.baseUrl || "",
          headers: candidate.headers,
        });
        const cost = candidate.estimatedCost != null
          ? money(candidate.estimatedCost)
          : (costEngine && typeof costEngine.estimate === "function"
            ? money(costEngine.estimate(candidate.usage || { prompt_tokens: 0, completion_tokens: 0 }, model).usd)
            : 0);
        approved.push({ route, cost, quality: Number(candidate.quality) || 0 });
      } catch (_) {
        // Rejected provider/model is not a fallback signal to spend more. It is simply ineligible.
      }
    }

    if (!approved.length) throw new Error("Compute Economy found no approved provider/model");
    approved.sort((a, b) => a.cost - b.cost || b.quality - a.quality);

    return authorize({
      missionId, workerId, taskId,
      provider: approved[0].route.provider,
      model: approved[0].route.model,
      estimatedCost: approved[0].cost || estimatedCost,
      complexity,
    });
  }

  function recordUsage({ authorization, inputTokens = null, outputTokens = null, estimatedCost = null, actualCost = null, revenueUsd = 0 } = {}) {
    if (!authorization?.approved) throw new Error("Compute Economy usage requires approved compute");
    const usageCost = actualCost == null ? (estimatedCost == null ? authorization.estimatedCost : estimatedCost) : actualCost;
    const entry = Object.freeze({
      id: "compute-" + (ledger.length + 1),
      missionId: authorization.missionId,
      workerId: authorization.workerId,
      taskId: authorization.taskId,
      provider: authorization.provider,
      model: authorization.model,
      complexity: authorization.complexity,
      inputTokens: inputTokens == null ? null : Number(inputTokens),
      outputTokens: outputTokens == null ? null : Number(outputTokens),
      estimatedCost: authorization.estimatedCost,
      actualCost: money(usageCost),
      costCents: cents(usageCost),
      revenueUsd: money(revenueUsd),
      recordedAt: new Date().toISOString(),
    });
    const left = remaining({ missionId: entry.missionId, workerId: entry.workerId, taskId: entry.taskId });
    if (entry.costCents > left.missionCents || entry.costCents > left.workerCents || entry.costCents > left.taskCents) {
      throw new Error("Compute Economy usage exceeds a hard budget ceiling");
    }
    ledger.push(entry);
    persist();
    return entry;
  }

  async function requestCompute({ missionId, workerId, taskId, complexity = "normal", candidates = [], provider = "", model = "", estimatedCost = null, reason = "" } = {}) {
    let pool = Array.isArray(candidates) ? candidates : [];
    if (!pool.length && provider && model) pool = [{ provider, model, estimatedCost: estimatedCost ?? 0, quality: 0 }];
    if (!pool.length) throw new Error("Compute Economy requires model candidates");
    const eligible = [];
    for (const candidate of pool) {
      try {
        const p = String(candidate?.provider || "").trim(), m = String(candidate?.model || "").trim();
        if (!p || !m) continue;
        assertProvider(p);
        if (!router || typeof router.resolve !== "function") throw new Error("existing StarForge model router is required");
        const route = await router.resolve({ provider: p, model: m, key: candidate.key || "", token: candidate.token || "", fetchImpl: candidate.fetchImpl, baseUrl: candidate.baseUrl || "", headers: candidate.headers });
        if (!route?.allowed) throw new Error("model router rejected candidate");
        const cost = candidate.estimatedCost != null ? money(candidate.estimatedCost) : 0;
        eligible.push({ route, cost, quality: Number(candidate.quality) || 0 });
      } catch (_) {}
    }
    if (!eligible.length) throw new Error("Compute Economy failed closed: no approved provider/model");
    eligible.sort((a,b) => a.cost - b.cost || b.quality - a.quality);
    const chosen = eligible[0];
    const authorization = authorize({ missionId, workerId, taskId, provider: chosen.route.provider, model: chosen.route.model, estimatedCost: chosen.cost, complexity });
    const reservationId = "compute-" + (ledger.length + reservations.size + 1);
    reservations.set(reservationId, { reservationId, authorization, reason: String(reason), reservedCost: chosen.cost, status: "reserved", createdAt: new Date().toISOString() });
    persist();
    return Object.freeze({ reservationId, ...authorization, route: chosen.route, reservedCost: chosen.cost, reason: String(reason) });
  }
  function settleCompute(reservationId, { actualCost = null, usage = {}, revenueUsd = 0, outcome = "" } = {}) {
    const reservation = reservations.get(String(reservationId));
    if (!reservation) throw new Error("unknown compute reservation");
    if (reservation.status !== "reserved") throw new Error("compute reservation is already closed");
    const cost = actualCost == null ? reservation.reservedCost : money(actualCost);
    if (cost > reservation.reservedCost) throw new Error("compute settlement exceeds the reserved hard ceiling");
    const entry = recordUsage({ authorization: reservation.authorization, inputTokens: usage.inputTokens ?? usage.prompt_tokens ?? null, outputTokens: usage.outputTokens ?? usage.completion_tokens ?? null, actualCost: cost, revenueUsd });
    reservation.status = "settled"; reservation.actualCost = cost; reservation.outcome = String(outcome); reservation.settledAt = new Date().toISOString(); reservation.usage = { ...usage };
    reservations.set(reservation.reservationId, reservation);
    return Object.freeze({ ...reservation, entry });
  }
  function releaseCompute(reservationId, reason = "released") {
    const reservation = reservations.get(String(reservationId));
    if (!reservation) throw new Error("unknown compute reservation");
    if (reservation.status !== "reserved") return Object.freeze({ ...reservation });
    reservation.status = "released"; reservation.outcome = String(reason); reservation.releasedAt = new Date().toISOString(); reservations.set(reservation.reservationId, reservation);
    return Object.freeze({ ...reservation });
  }
  function snapshot() { return Object.freeze({ limits: { ...limits }, reservations: [...reservations.values()].map(r => ({ ...r, authorization: { ...r.authorization } })), ledger: ledger.map(e => ({ ...e })) }); }
  function persistence() { return Object.freeze({ enabled: Boolean(persistentPath), path: persistentPath, entries: ledger.length }); }

  function report({ missionId = null, workerId = null } = {}) {
    const entries = ledger.filter(e =>
      (!missionId || e.missionId === missionId) &&
      (!workerId || e.workerId === workerId)
    );
    const totalCost = entries.reduce((s, e) => s + e.costCents, 0) / 100;
    const revenue = entries.reduce((s, e) => s + e.revenueUsd, 0);
    return Object.freeze({
      missionId, workerId, requestCount: entries.length,
      totalCost: money(totalCost), revenueUsd: money(revenue),
      computeRoiUsd: money(revenue - totalCost),
      entries: entries.map(e => ({ ...e })),
    });
  }

  return Object.freeze({ limits: Object.freeze({ ...limits }), providerStatus, authorize, allocate, requestCompute, settleCompute, releaseCompute, recordUsage, remaining, report, snapshot, persistence });
}

export { DEFAULT_BUDGETS, STATUS };
