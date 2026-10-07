import test from "node:test";
import assert from "node:assert/strict";
import { makeWorkforceAllocator } from "../sidecar/governance/workforce-allocator.mjs";

test("workforce allocator preserves Overseer and reuses capable workers", async () => {
  const created = [];
  const workers = [
    { id: "ov", name: "Overseer", capabilities: ["coordination"] },
    { id: "research-1", name: "Researcher", capabilities: ["research"] },
    { id: "sales-1", name: "Sales", capabilities: ["sales"], activeTaskCount: 4 },
  ];
  const allocator = makeWorkforceAllocator({
    starnet: { listWorkers: async () => workers },
  });
  const result = await allocator.allocate({
    requiredCapabilities: ["research", "sales"],
    objective: "make €2000 legitimately",
    createMissing: false,
  });
  assert.equal(result.status, "allocated");
  assert.deepEqual(result.selected.map((worker) => worker.id), ["research-1", "sales-1"]);
  assert.deepEqual(result.protectedWorkers.map((worker) => worker.id), ["ov"]);
  assert.equal(created.length, 0);
});

test("allocator creates only missing capabilities through the StarNet lifecycle adapter", async () => {
  const workers = [{ id: "ov", name: "Overseer", capabilities: ["coordination"] }];
  const calls = [];
  const allocator = makeWorkforceAllocator({
    starnet: {
      listWorkers: async () => workers,
      createWorker: async (request) => {
        calls.push(request);
        return { id: "new-research", name: request.name, capabilities: request.capabilities };
      },
    },
  });
  const result = await allocator.allocate({ requiredCapabilities: ["research"], objective: "research resale opportunities" });
  assert.equal(result.status, "allocated");
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].id, "new-research");
  assert.equal(calls[0].source, "starforge-dynamic-allocation");
  assert.deepEqual(calls[0].capabilities, ["research"]);
});

test("allocator fails closed when worker creation is unavailable", async () => {
  const allocator = makeWorkforceAllocator({
    starnet: { listWorkers: async () => [{ id: "ov", name: "Overseer", capabilities: [] }] },
  });
  const result = await allocator.allocate({ requiredCapabilities: ["research"] });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.missingCapabilities, ["research"]);
});

test("retirement removes non-protected workers but never Overseer", async () => {
  let workers = [
    { id: "ov", name: "Overseer" },
    { id: "old-1", name: "Old Worker" },
    { id: "old-2", name: "Old Researcher" },
  ];
  const removed = [];
  const allocator = makeWorkforceAllocator({
    starnet: {
      listWorkers: async () => workers,
      removeWorker: async (id) => {
        removed.push(id);
        workers = workers.filter((worker) => worker.id !== id);
      },
    },
  });
  const result = await allocator.retireNonProtected();
  assert.equal(result.status, "completed");
  assert.deepEqual(removed, ["old-1", "old-2"]);
  assert.deepEqual(result.remaining.map((worker) => worker.id), ["ov"]);
});


test("allocator prefers the governed StarNet summon lifecycle for missing capabilities", async () => {
  const calls = [];
  const allocator = makeWorkforceAllocator({
    starnet: {
      listWorkers: async () => [{ id: "ov", name: "Overseer", capabilities: [] }],
      summonWorker: async (request) => {
        calls.push(request);
        return { id: "summoned-research", name: request.name, capabilities: request.capabilities };
      },
    },
  });
  const result = await allocator.allocate({ requiredCapabilities: ["research"], objective: "find legitimate resale opportunities" });
  assert.equal(result.status, "allocated");
  assert.equal(result.created[0].id, "summoned-research");
  assert.equal(calls[0].source, "starforge-dynamic-allocation");
  assert.equal(calls[0].purpose, "find legitimate resale opportunities");
});
