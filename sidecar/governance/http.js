'use strict';

const path = require('node:path');
const fs = require('node:fs');

let companyPromise = null;

function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }

function makeStarForgeGovernanceHandler({ workspace, roster, runsMeta } = {}) {
  const root = path.resolve(String(workspace || '.'));
  const file = path.join(root, 'starforge.company.json');

  async function company() {
    if (!companyPromise) {
      companyPromise = import('./company.mjs').then(({ makeCompany }) => makeCompany({
        load() {
          try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return undefined; }
        },
        save(state) {
          fs.mkdirSync(root, { recursive: true });
          const tmp = file + '.tmp';
          fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
          fs.renameSync(tmp, file);
        }
      }));
    }
    return companyPromise;
  }

  return async function handleStarForgeGovernance(req, res) {
    try {
      const c = await company();
      const finance = c.financeTelemetrySnapshot('pa', { limit: 5 });
      const capital = {
        currency: finance.currency,
        openingCapital: finance.openingCapital,
        cash: finance.cash,
        availableCash: finance.availableCash,
        taxReserve: finance.taxReserve,
        liabilities: finance.liabilities,
        netOperatingCapital: finance.netOperatingCapital,
        entryCount: finance.entryCount,
        source: 'starforge-governed-company-ledger'
      };
      const workers = Array.from(roster || []).map(([agentId, agent]) => {
        const runs = Array.from(runsMeta || []).filter(([, meta]) => String(meta.agentId || '') === String(agentId));
        return {
          agentId,
          name: agent.name || agentId,
          model: agent.model || null,
          provider: agent.provider || null,
          role: agent.role || 'StarNet agent',
          status: runs.length ? 'working' : 'idle',
          activeRunCount: runs.length
        };
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        ok: true,
        source: 'starforge-governance',
        capital,
        finance,
        workforce: {
          source: 'live-starnet-runtime',
          workerCount: workers.length,
          counts: {
            working: workers.filter(w => w.status === 'working').length,
            idle: workers.filter(w => w.status === 'idle').length
          },
          workers
        }
      }));
    } catch (error) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
  };
}

module.exports = { makeStarForgeGovernanceHandler };