import test from 'node:test';
import assert from 'node:assert/strict';
import { companyLevelForCapital, companyLevelTelemetry } from '../sidecar/governance/capital-level.mjs';

test('StarForge level 100 is €10M net operating capital', () => {
  assert.equal(companyLevelForCapital(0), 1);
  assert.equal(companyLevelForCapital(1_000_000), 60);
  assert.equal(companyLevelForCapital(9_000_000), 99);
  assert.equal(companyLevelForCapital(10_000_000), 100);
  assert.equal(companyLevelForCapital(50_000_000), 100);
});

test('StarForge level telemetry reports the governed next milestone', () => {
  const telemetry = companyLevelTelemetry(1_000_000);
  assert.equal(telemetry.level, 60);
  assert.equal(telemetry.nextLevel, 70);
  assert.equal(telemetry.nextThreshold, 2_000_000);
  assert.equal(telemetry.remainingToNext, 1_000_000);
  assert.equal(telemetry.source, 'starforge-governed-company-ledger');
  assert.ok(telemetry.progressPercent >= 0 && telemetry.progressPercent <= 100);
});

test('Invalid capital cannot produce a company level', () => {
  assert.equal(companyLevelForCapital(Number.NaN), null);
  assert.equal(companyLevelTelemetry(-1), null);
});
test('Company rank and unlocks are governed by the level telemetry', () => {
  const startup = companyLevelTelemetry(0);
  assert.equal(startup.rank, 'STARTUP');
  assert.deepEqual(startup.unlocks, []);

  const growth = companyLevelTelemetry(25_000);
  assert.equal(growth.level, 20);
  assert.equal(growth.rank, 'GROWING');
  assert.deepEqual(growth.unlocks, [{ level: 20, name: 'GROWTH OPERATIONS' }]);

  const legendary = companyLevelTelemetry(10_000_000);
  assert.equal(legendary.level, 100);
  assert.equal(legendary.rank, 'LEGENDARY');
  assert.deepEqual(legendary.unlocks.at(-1), { level: 100, name: 'LEGENDARY STATUS' });
});
