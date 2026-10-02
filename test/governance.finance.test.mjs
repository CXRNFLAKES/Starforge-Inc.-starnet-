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