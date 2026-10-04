import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCompany } from '../sidecar/governance/company.mjs';
import { ROLES } from '../sidecar/governance/roles.mjs';

test('company capital snapshot calculates usable capital without inventing funds',()=>{
  const company=makeCompany();
  company.recordFinanceEntry(ROLES.CHO,{id:'cap',kind:'capital-injection',amount:100000,currency:'EUR'});
  company.recordFinanceEntry(ROLES.CHO,{id:'rev',kind:'revenue',amount:50000,currency:'EUR'});
  company.recordFinanceEntry(ROLES.CHO,{id:'tax',kind:'tax-reserve',amount:10000,currency:'EUR'});
  company.recordFinanceEntry(ROLES.CHO,{id:'liab',kind:'liability',amount:15000,currency:'EUR'});
  company.recordFinanceEntry(ROLES.CHO,{id:'exp',kind:'expense',amount:20000,currency:'EUR'});
  const s=company.capitalSnapshot(ROLES.CHO);
  assert.equal(s.cash,120000);
  assert.equal(s.taxReserve,10000);
  assert.equal(s.availableCash,110000);
  assert.equal(s.liabilities,15000);
  assert.equal(s.netOperatingCapital,95000);
});
test('finance report includes entries while capital snapshot stays summary-only',()=>{
  const company=makeCompany();
  company.recordFinanceEntry(ROLES.CHO,{id:'rev',kind:'revenue',amount:1,currency:'EUR'});
  assert.equal(company.capitalSnapshot(ROLES.CHO).entries,undefined);
  assert.equal(company.financeSnapshot(ROLES.CHO).entries.length,1);
});

test('PA can read bounded finance telemetry without gaining finance-report authority',()=>{
  const company=makeCompany();
  company.recordFinanceEntry(ROLES.CHO,{id:'rev',kind:'revenue',amount:500,currency:'EUR'});
  company.recordFinanceEntry(ROLES.CHO,{id:'exp',kind:'expense',amount:100,currency:'EUR'});
  const telemetry=company.financeTelemetrySnapshot(ROLES.PA,{limit:1});
  assert.equal(telemetry.netOperatingCapital,400);
  assert.equal(telemetry.recentEntries.length,1);
  assert.equal(telemetry.recentEntries[0].id,'exp');
  assert.throws(()=>company.financeSnapshot(ROLES.PA),/Unauthorized action/);
});


test('finance telemetry exposes governed cashflow, operating result, and runway metrics',()=>{
  const company=makeCompany();
  const recent=new Date().toISOString();
  company.recordFinanceEntry(ROLES.CHO,{id:'cap',kind:'capital-injection',amount:1000,currency:'EUR',recordedAt:recent});
  company.recordFinanceEntry(ROLES.CHO,{id:'rev',kind:'revenue',amount:500,currency:'EUR',recordedAt:recent});
  company.recordFinanceEntry(ROLES.CHO,{id:'tax',kind:'tax-reserve',amount:100,currency:'EUR',recordedAt:recent});
  company.recordFinanceEntry(ROLES.CHO,{id:'exp',kind:'expense',amount:200,currency:'EUR',recordedAt:recent});
  company.recordFinanceEntry(ROLES.CHO,{id:'liab-pay',kind:'liability-payment',amount:50,currency:'EUR',recordedAt:recent});
  const telemetry=company.financeTelemetrySnapshot(ROLES.PA,{limit:5});
  assert.equal(telemetry.capitalInjections,1000);
  assert.equal(telemetry.revenue,500);
  assert.equal(telemetry.expenses,200);
  assert.equal(telemetry.liabilityPayments,50);
  assert.equal(telemetry.totalInflow,1500);
  assert.equal(telemetry.totalOutflow,350);
  assert.equal(telemetry.netCashflow,1150);
  assert.equal(telemetry.operatingResult,200);
  assert.equal(telemetry.monthlyBurn,200);
  assert.equal(telemetry.runwayMonths,5);
  assert.equal(telemetry.runwaySource,'trailing-30-day-governed-expenses');
});
