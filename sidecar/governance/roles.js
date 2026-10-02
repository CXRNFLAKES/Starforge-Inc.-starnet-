export const ROLES = Object.freeze({
  CHO: "cho",
  PA: "pa",
  BOARD: "board",
  CEO: "ceo",
  ACCOUNTANT: "accountant",
  CFO: "cfo",
  RISK: "risk",
  EXECUTIVE: "executive",
  WORKER: "worker",
});

export const ROLE_DESCRIPTIONS = Object.freeze({
  [ROLES.CHO]: "Human owner and final authority.",
  [ROLES.PA]: "Main Overseer / Chief of Staff; direct CHO interface and independent oversight.",
  [ROLES.BOARD]: "Governance body for strategy, oversight, and delegated approvals.",
  [ROLES.CEO]: "Operational executive responsible for execution and delegation.",
  [ROLES.ACCOUNTANT]: "Bookkeeping, records, reporting, and tax-record support.",
  [ROLES.CFO]: "Financial strategy and management.",
  [ROLES.RISK]: "Independent risk assessment and controls.",
  [ROLES.EXECUTIVE]: "Department or functional executive.",
  [ROLES.WORKER]: "Execution-level agent.",
});

export function isRole(value) {
  return Object.values(ROLES).includes(value);
}

export function describeRole(role) {
  return ROLE_DESCRIPTIONS[role] ?? null;
}
