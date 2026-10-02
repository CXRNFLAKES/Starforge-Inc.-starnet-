import { ROLES } from "./roles.mjs";

export const ACTIONS = Object.freeze({
  COMPANY_READ: "company.read",
  COMPANY_CONFIGURE: "company.configure",
  CHO_DECIDE: "cho.decide",
  PA_ADVISE_CHO: "pa.advise_cho",
  PA_REVIEW: "pa.review",
  PA_INVESTIGATE: "pa.investigate",
  BOARD_CONVENE: "board.convene",
  BOARD_DECIDE: "board.decide",
  CEO_OPERATE: "ceo.operate",
  CEO_DELEGATE: "ceo.delegate",
  CEO_REQUEST_APPROVAL: "ceo.request_approval",
  STARNET_DELEGATE: "starnet.delegate",
  STARNET_REPORT: "starnet.report",
  FINANCE_RECORD: "finance.record",
  FINANCE_REPORT: "finance.report",
  FINANCE_TELEMETRY: "finance.telemetry",
  RISK_ASSESS: "risk.assess",
  APPROVAL_EXECUTE: "approval.execute",
  WORKER_EXECUTE: "worker.execute",
});

const roleActions = Object.freeze({
  [ROLES.CHO]: new Set(Object.values(ACTIONS)),
  [ROLES.PA]: new Set([
    ACTIONS.COMPANY_READ, ACTIONS.PA_ADVISE_CHO, ACTIONS.PA_REVIEW,
    ACTIONS.PA_INVESTIGATE, ACTIONS.BOARD_CONVENE, ACTIONS.RISK_ASSESS,
    ACTIONS.FINANCE_TELEMETRY,
  ]),
  [ROLES.BOARD]: new Set([
    ACTIONS.COMPANY_READ, ACTIONS.BOARD_CONVENE, ACTIONS.BOARD_DECIDE,
    ACTIONS.PA_REVIEW, ACTIONS.RISK_ASSESS, ACTIONS.FINANCE_REPORT,
  ]),
  [ROLES.CEO]: new Set([
    ACTIONS.COMPANY_READ, ACTIONS.CEO_OPERATE, ACTIONS.CEO_DELEGATE,
    ACTIONS.CEO_REQUEST_APPROVAL, ACTIONS.STARNET_DELEGATE, ACTIONS.FINANCE_REPORT,
  ]),
  [ROLES.VICE_CEO]: new Set([
    ACTIONS.COMPANY_READ, ACTIONS.STARNET_DELEGATE, ACTIONS.STARNET_REPORT,
    ACTIONS.CEO_DELEGATE,
  ]),
  [ROLES.ACCOUNTANT]: new Set([
    ACTIONS.COMPANY_READ, ACTIONS.FINANCE_RECORD, ACTIONS.FINANCE_REPORT,
  ]),
  [ROLES.CFO]: new Set([
    ACTIONS.COMPANY_READ, ACTIONS.FINANCE_RECORD, ACTIONS.FINANCE_REPORT,
    ACTIONS.CEO_REQUEST_APPROVAL,
  ]),
  [ROLES.RISK]: new Set([ACTIONS.COMPANY_READ, ACTIONS.RISK_ASSESS]),
  [ROLES.EXECUTIVE]: new Set([
    ACTIONS.COMPANY_READ, ACTIONS.CEO_OPERATE, ACTIONS.CEO_DELEGATE,
  ]),
  [ROLES.WORKER]: new Set([ACTIONS.COMPANY_READ, ACTIONS.WORKER_EXECUTE]),
});

export const CHO_RESERVED_ACTIONS = new Set([
  ACTIONS.CHO_DECIDE,
  ACTIONS.COMPANY_CONFIGURE,
  ACTIONS.APPROVAL_EXECUTE,
]);

export function can(role, action) {
  return roleActions[role]?.has(action) === true;
}

export function requiresCho(action) {
  return CHO_RESERVED_ACTIONS.has(action);
}

export function assertCan(role, action) {
  if (!can(role, action)) {
    throw new Error(`Unauthorized action: ${role} cannot perform ${action}`);
  }
  return true;
}

export function canActOnBehalfOf(actorRole, targetRole, action) {
  if (actorRole === ROLES.CHO) return can(actorRole, action);
  if (actorRole === targetRole) return can(actorRole, action);
  return false;
}
