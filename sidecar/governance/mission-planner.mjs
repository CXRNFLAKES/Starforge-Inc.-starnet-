import { randomUUID } from "node:crypto";

const RISK = Object.freeze(["low", "medium", "high"]);
const COMPLEXITY = Object.freeze(["simple", "normal", "complex", "critical"]);
const WORKER_CAPABILITIES = Object.freeze(["research", "strategy", "execution", "sales", "finance", "verification"]);

const clone = (v) => structuredClone(v);
const clean = (v) => String(v ?? "").trim();

function inferComplexity(text) {
  const s = text.toLowerCase();
  if (/(legal|tax|high[- ]?risk|critical|large amount|large capital)/.test(s)) return "critical";
  if (/(multi[- ]?step|automation|build|develop|complex|scale|thousands)/.test(s)) return "complex";
  if (/(research|compare|analy[sz]e|strategy|plan)/.test(s)) return "normal";
  return "simple";
}

function inferRisk(text) {
  const s = text.toLowerCase();
  if (/(legal|tax|financial|investment|debt|medical|regulated|large amount|borrow|loan)/.test(s)) return "high";
  if (/(sell|payment|purchase|marketplace|customer|revenue|money)/.test(s)) return "medium";
  return "low";
}

function inferCapabilities(text) {
  const s = text.toLowerCase();
  const caps = new Set(["strategy"]);
  if (/(research|find|compare|investigate|market)/.test(s)) caps.add("research");
  if (/(sell|sales|customer|client|resale|revenue|money)/.test(s)) caps.add("sales");
  if (/(build|create|automate|execute|launch|deploy)/.test(s)) caps.add("execution");
  if (/(money|revenue|profit|budget|cost|capital)/.test(s)) caps.add("finance");
  caps.add("verification");
  return [...caps];
}

export function makeMissionPlanner({ computeEconomy = null, workforceAllocator = null } = {}) {
  function intake({ objective, constraints = [], budget = null, deadline = null, actor = "cho" } = {}) {
    const text = clean(objective);
    if (!text) throw new Error("Mission objective is required");
    const normalizedConstraints = Array.isArray(constraints) ? constraints.map(clean).filter(Boolean) : [];
    const inferred = inferCapabilities([text, ...normalizedConstraints].join(" "));
    const complexity = inferComplexity([text, ...normalizedConstraints].join(" "));
    const risk = inferRisk([text, ...normalizedConstraints].join(" "));
    return clone({
      id: randomUUID(), type: "mission", objective: text, constraints: normalizedConstraints,
      budget: budget == null ? null : Number(budget), deadline: deadline ? clean(deadline) : null,
      complexity: COMPLEXITY.includes(complexity) ? complexity : "normal",
      risk: RISK.includes(risk) ? risk : "medium", requiredCapabilities: inferred,
      status: "intake", actor: clean(actor) || "cho", createdAt: new Date().toISOString(),
    });
  }

  function plan(mission, { availableWorkers = [], maxWorkers = 20 } = {}) {
    if (!mission?.id || !mission.objective) throw new Error("Valid mission intake is required");
    const workers = Array.isArray(availableWorkers) ? availableWorkers : [];
    const ranked = workers.map(worker => {
      const capabilities = Array.isArray(worker.capabilities) ? worker.capabilities.map(clean) : [];
      const matched = mission.requiredCapabilities.filter(cap => capabilities.includes(cap)).length;
      const load = Number(worker.activeTaskCount ?? worker.taskCount ?? 0) || 0;
      return { worker, matched, load };
    }).sort((a,b) => b.matched-a.matched || a.load-b.load || String(a.worker.id).localeCompare(String(b.worker.id)));
    const selected = ranked.filter(x => x.matched > 0).slice(0, Math.max(1, Number(maxWorkers) || 1));
    const missing = mission.requiredCapabilities.filter(cap => !selected.some(x => Array.isArray(x.worker.capabilities) && x.worker.capabilities.includes(cap)));
    const phases = [
      { id: "research", title: "Research and feasibility", capability: "research" },
      { id: "strategy", title: "Strategy and plan", capability: "strategy" },
      { id: "execution", title: "Execution", capability: "execution" },
      { id: "verification", title: "Verification and outcome check", capability: "verification" },
    ].filter(phase => mission.requiredCapabilities.includes(phase.capability) || ["research","strategy","verification"].includes(phase.id));
    return clone({
      missionId: mission.id, status: "planned", risk: mission.risk, complexity: mission.complexity,
      workerCandidates: selected.map(x => ({ id:x.worker.id, matchedCapabilities:x.worker.capabilities?.filter(c=>mission.requiredCapabilities.includes(c)) ?? [], load:x.load })),
      missingCapabilities: missing, phases, requiresEscalation: mission.risk === "high" || missing.length > 0,
      computePolicy: computeEconomy ? "governed-compute-economy" : "router-only", plannedAt: new Date().toISOString(),
    });
  }

  async function allocate(mission, { maxWorkers = 20, createMissing = true } = {}) {
    if (!mission?.id || !mission.objective) throw new Error("Valid mission intake is required");
    if (!workforceAllocator || typeof workforceAllocator.allocate !== "function") {
      throw new Error("Governed workforce allocator is required for dynamic allocation");
    }
    return clone(await workforceAllocator.allocate({
      requiredCapabilities: mission.requiredCapabilities,
      maxWorkers,
      objective: mission.objective,
      createMissing,
    }));
  }

  return Object.freeze({ intake, plan, allocate });
}

export { RISK, COMPLEXITY, WORKER_CAPABILITIES };
