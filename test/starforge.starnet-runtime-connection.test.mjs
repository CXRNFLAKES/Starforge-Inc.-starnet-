import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { connectStarNetRuntime } from "../sidecar/governance/starnet-runtime-connection.mjs";

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try { return await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("StarForge connects to a real local StarNet HTTP runtime and discovers workers", async () => {
  await withServer((req, res) => {
    if (req.url === "/api/runtime/agent") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ agents: [
        { id: "live-1", name: "Live Worker One", model: "runtime-model" },
        { id: "live-2", name: "Live Worker Two", model: "runtime-model" },
      ] }));
      return;
    }
    res.writeHead(404); res.end();
  }, async (baseUrl) => {
    const connection = await connectStarNetRuntime({ baseUrl });
    assert.equal(connection.connected, true);
    assert.equal(connection.source, "live-runtime");
    assert.equal(connection.workerCount, 2);
    assert.ok(connection.bridge);
    assert.deepEqual(await connection.bridge.listWorkers(), [
      { id: "live-1", name: "Live Worker One", model: "runtime-model" },
      { id: "live-2", name: "Live Worker Two", model: "runtime-model" },
    ]);
  });
});

test("StarForge fails closed when the StarNet runtime is unreachable", async () => {
  const connection = await connectStarNetRuntime({ baseUrl: "http://127.0.0.1:1", timeoutMs: 250 });
  assert.equal(connection.connected, false);
  assert.equal(connection.source, "runtime-unreachable");
  assert.equal(connection.bridge, null);
  assert.match(connection.reason, /failed|fetch|connect|socket|refused|unreachable|timeout/i);
});

test("StarForge fails closed when StarNet runtime is not configured", async () => {
  const connection = await connectStarNetRuntime();
  assert.equal(connection.connected, false);
  assert.equal(connection.source, "unconfigured");
  assert.equal(connection.bridge, null);
});
