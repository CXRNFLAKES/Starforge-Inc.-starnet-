import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const file = join(ROOT, ".starforge", "validation-state.json");
const now = new Date().toISOString();
const runNumber = Number(process.env.GITHUB_RUN_NUMBER);
const runId = Number(process.env.GITHUB_RUN_ID);
const sha = String(process.env.GITHUB_SHA || "").trim();
const ref = String(process.env.GITHUB_REF_NAME || "starforge/governance-kernel");

if (!Number.isInteger(runNumber) || runNumber < 1) throw new Error("GITHUB_RUN_NUMBER is required");
if (!Number.isInteger(runId) || runId < 1) throw new Error("GITHUB_RUN_ID is required");
if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error("GITHUB_SHA must be a 40-character commit SHA");

let previous = {};
try { previous = JSON.parse(readFileSync(file, "utf8")); } catch (_) {}

const checkpoint = {
  status: "green",
  runNumber,
  runId,
  sha,
  branch: ref,
  recordedAt: now,
  source: "github-actions",
};

const history = Array.isArray(previous.history) ? previous.history : [];
const deduped = history.filter(item => !(item.runId === runId && item.runNumber === runNumber));
deduped.push(checkpoint);

const state = {
  schemaVersion: 1,
  product: "StarForge",
  phase: "starforge-hq-governance-feed",
  validation: checkpoint,
  history: deduped.slice(-20),
  updatedAt: now,
};

mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded green StarForge state checkpoint for Actions #${runNumber} (${runId}).`);