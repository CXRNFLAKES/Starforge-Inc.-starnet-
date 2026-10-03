'use strict';

/*
 * StarForge <-> StarNet HTTP seam.
 * This is intentionally read-only: StarNet owns the live roster/run state;
 * StarForge owns its separate governed company ledger.
 */
const fs = require('node:fs');
const path = require('node:path');

function makeStateStore(file) {
  return {
    load() {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (_) { return undefined; }
    },
    save(state) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, file);
    },
  };
}

function rosterRows(roster) {
  return roster instanceof Map
    ? Array.from(roster.entries()).map(([id, value]) => ({
        id,
        name: value?.name ?? id,
        model: value?.model ?? null,
        provider: value?.provider ?? null,
        role: value?.role ?? 'StarNet agent',
        capabilities: Array.isArray(value?.skills) ? [...value.skills] : [],
      }))
    : [];
}

function runRows(runsMeta) {
  return runsMeta instanceof Map
    ? Array.from(runsMeta.entries()).map(([id, value]) => ({ id, ...(value || {}) }))
    : [];
}

function makeRuntime(roster, runsMeta) {
  return Object.freeze({
    async listWorkers() {
      return rosterRows(roster);
    },
    async inspectWorkforce({ activeRuns = [] } = {}) {
      const runs = Array.isArray(activeRuns) ? activeRuns : [];
      const active = new Map(
        runs.filter(run => run && run.agentId != null)
          .map(run => [String(run.agentId), run]),
      );
      const workers = rosterRows(roster).map(worker => ({
        ...worker,
        status: active.has(String(worker.id)) ? 'working' : 'idle',
        activeRun: active.get(String(worker.id)) ?? null,
      }));
      return {
        source: 'live-starnet-sidecar',
        workerCount: workers.length,
        counts: {
          total: workers.length,
          working: workers.filter(worker => worker.status === 'working').length,
          idle: workers.filter(worker => worker.status === 'idle').length,
        },
        workers,
        statusSource: 'starnet-run-registry',
      };
    },
  });
}

function makeStarForgeRoute({ workspace, roster, runsMeta }) {
  if (!workspace) throw new TypeError('StarForge route requires workspace');
  let promise = null;

  async function getHandler() {
    if (!promise) {
      promise = (async () => {
        const [{ makeStarForgeGovernanceHandler }, { makeCompany }] = await Promise.all([
          import('./governance/http.mjs'),
          import('./governance/company.mjs'),
        ]);
        const stateFile = path.join(workspace, 'starforge', 'state.json');
        const store = makeStateStore(stateFile);
        const company = makeCompany(store);
        return makeStarForgeGovernanceHandler({
          workspace: path.dirname(stateFile),
          company,
          runtime: makeRuntime(roster, runsMeta),
          roster,
          runsMeta,
        });
      })();
    }
    return promise;
  }

  return async function handle(req, res) {
    const handler = await getHandler();
    return handler(req, res);
  };
}

module.exports = { makeStarForgeRoute };
