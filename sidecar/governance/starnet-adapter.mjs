import { ACTIONS, assertCan } from "./authority.mjs";

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeRoster(source) {
  const rows = source instanceof Map
    ? Array.from(source.entries()).map(([id, value]) => ({ id, ...(value || {}) }))
    : Array.isArray(source) ? source : [];

  return rows
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      name: String(row.name ?? row.id ?? "").trim(),
      model: row.model ?? null,
      provider: row.provider ?? null,
      reasoningEffort: row.reasoningEffort ?? null,
      capabilities: Array.isArray(row.capabilities) ? [...row.capabilities] : [],
    }))
    .filter((row) => ID_RE.test(row.id))
    .map(clone);
}

export function makeStarNetAdapter({ roster, dispatch } = {}) {
  if (typeof roster !== "function") throw new TypeError("StarNet roster function is required");
  if (typeof dispatch !== "function") throw new TypeError("StarNet dispatch function is required");

  function listWorkers() { return normalizeRoster(roster()); }

  async function delegateTask(actorRole, task = {}) {
    assertCan(actorRole, ACTIONS.STARNET_DELEGATE);

    const agentId = String(task.assigneeId ?? "").trim();
    const title = String(task.title ?? "").trim();
    if (!ID_RE.test(agentId)) throw new Error("StarNet delegation requires a valid assigneeId");
    if (!title) throw new Error("StarNet delegation requires a task title");

    const worker = listWorkers().find((item) => item.id === agentId);
    if (!worker) throw new Error("StarNet worker is not present in the live roster");

    const prompt = String(
      task.prompt ??
      [title, task.successCriteria ? `Success criteria: ${task.successCriteria}` : ""]
        .filter(Boolean).join("\n\n"),
    ).trim();
    if (!prompt) throw new Error("StarNet delegation requires a non-empty task prompt");

    const dispatchRequest = {
      workers: [{ agentId, prompt, context: task.context ?? "" }],
      parallel: false,
    };

    let result;
    try {
      result = await dispatch(dispatchRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`StarNet dispatch failed: ${message}`, { cause: error });
    }

    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("StarNet dispatch returned an invalid result");
    }
    if (typeof result.content !== "string") {
      throw new Error("StarNet dispatch returned a result without content");
    }

    return clone({
      taskId: task.id ?? null,
      projectId: task.projectId ?? null,
      assigneeId: agentId,
      worker,
      delegatedBy: actorRole,
      dispatchRequest,
      result,
    });
  }

  return Object.freeze({ listWorkers, delegateTask });
}
