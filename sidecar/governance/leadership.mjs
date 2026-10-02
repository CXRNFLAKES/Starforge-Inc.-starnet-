import crypto from "node:crypto";
import { ROLES } from "./roles.mjs";
import { ACTIONS, assertCan } from "./authority.mjs";

const LEADERSHIP_CAPABILITIES = Object.freeze({
  [ROLES.PA]: Object.freeze([
    "coordinate", "research", "review_work", "inspect_company", "communicate",
    "brief_cho", "investigate", "convene_board", "assess_risk", "maintain_memory",
  ]),
  [ROLES.CEO]: Object.freeze([
    "coordinate", "research", "review_work", "inspect_company", "communicate",
    "spawn_agents", "delegate", "create_projects", "manage_operations",
    "monitor_performance", "reassign_workers", "request_approval",
    "execute_approved_plans", "direct_starnet",
  ]),
  [ROLES.VICE_CEO]: Object.freeze([
    "coordinate", "research", "review_work", "inspect_company", "communicate",
    "lead_starnet", "delegate_starnet", "monitor_performance",
    "reassign_starnet_workers", "report_to_leadership",
  ]),
});

const RESERVED_CAPABILITIES = Object.freeze({
  [ROLES.PA]: Object.freeze(["brief_cho", "investigate", "convene_board", "assess_risk"]),
  [ROLES.CEO]: Object.freeze([
    "spawn_agents", "delegate", "create_projects", "manage_operations",
    "monitor_performance", "reassign_workers", "request_approval",
    "execute_approved_plans", "direct_starnet",
  ]),
  [ROLES.VICE_CEO]: Object.freeze([
    "lead_starnet", "delegate_starnet", "monitor_performance",
    "reassign_starnet_workers", "report_to_leadership",
  ]),
});

export function leadershipProfile(role) {
  const capabilities = LEADERSHIP_CAPABILITIES[role];
  if (!capabilities) throw new Error(`Unknown leadership role: ${role}`);
  return {
    role,
    capabilities: [...capabilities],
    reservedCapabilities: [...(RESERVED_CAPABILITIES[role] || [])],
  };
}

export function hasCapability(role, capability) {
  return LEADERSHIP_CAPABILITIES[role]?.includes(capability) === true;
}

export function assertLeadershipCapability(role, capability) {
  if (!hasCapability(role, capability)) {
    throw new Error(`Unauthorized capability: ${role} cannot perform ${capability}`);
  }
  return true;
}

export function makeLeadership({ company } = {}) {
  if (!company || typeof company.snapshot !== "function") {
    throw new Error("makeLeadership requires a company");
  }

  function actor(role) {
    const person = company.snapshot().people.find(p => p.role === role);
    if (!person) throw new Error(`No registered ${role} leader`);
    return { id: person.id, name: person.name, role };
  }

  function act(role, capability, { action = null, details = {} } = {}) {
    assertLeadershipCapability(role, capability);
    if (action) assertCan(role, action);
    const leader = actor(role);
    company.audit(role, `leadership.${capability}`, { leaderId: leader.id, details });
    return { ...leader, capability, action, details };
  }

  function communicate(role, targetRole, message) {
    assertLeadershipCapability(role, "communicate");
    if (!targetRole || !message) throw new Error("Communication target and message are required");
    const leader = actor(role);
    const target = company.snapshot().people.find(p => p.role === targetRole);
    if (!target) throw new Error("Unknown communication target: " + targetRole);
    return act(role, "communicate", {
      details: { targetRole, targetId: target.id, message: String(message) },
    });
  }

  function briefCho(role, brief) {
    assertLeadershipCapability(role, "brief_cho");
    if (role !== ROLES.PA) throw new Error("Only the PA may brief the CHO through the PA channel");
    if (!brief) throw new Error("CHO brief is required");
    return act(role, "brief_cho", { details: { brief: String(brief) } });
  }

  function requestApproval(role, request) {
    assertLeadershipCapability(role, "request_approval");
    if (role !== ROLES.CEO) throw new Error("Only the CEO may submit an operational approval request");
    if (!request || !request.title) throw new Error("Approval request title is required");
    return act(role, "request_approval", {
      action: ACTIONS.CEO_REQUEST_APPROVAL,
      details: { request: structuredClone(request) },
    });
  }

  function operate(role, operation) {
    assertLeadershipCapability(role, "manage_operations");
    if (role !== ROLES.CEO) throw new Error("Only the CEO may control company operations");
    return act(role, "manage_operations", {
      action: ACTIONS.CEO_OPERATE,
      details: { operation: String(operation || "") },
    });
  }

  function listLeadershipReports({ targetRole = null } = {}) {
    const reports = company.snapshot().leadershipReports
      .filter(report => !targetRole || report.targets.some(target => target.role === targetRole));
    return structuredClone(reports);
  }

  function getLeadershipReport(role, reportId) {
    assertLeadershipCapability(role, "review_work");
    if (!reportId) throw new Error("Leadership report id is required");

    const report = company.snapshot().leadershipReports.find(item => item.id === reportId);
    if (!report) throw new Error("Unknown leadership report");
    if (!report.targets.some(target => target.role === role)) {
      throw new Error(`Leadership report is not addressed to ${role}`);
    }

    return structuredClone(report);
  }
  function reviewLeadershipReport(role, reportId) {
    assertLeadershipCapability(role, "review_work");
    if (!reportId) throw new Error("Leadership report id is required");

    const report = company.snapshot().leadershipReports.find(item => item.id === reportId);
    if (!report) throw new Error("Unknown leadership report");
    if (!report.targets.some(target => target.role === role)) {
      throw new Error(`Leadership report is not addressed to ${role}`);
    }

    const reviewer = actor(role);
    company.audit(role, "leadership.review_report", {
      leaderId: reviewer.id,
      details: { reportId, sourceRole: ROLES.VICE_CEO },
    });

    return structuredClone({
      report,
      reviewer: { id: reviewer.id, name: reviewer.name, role: reviewer.role },
      reviewScope: role === ROLES.PA ? "independent-oversight" : "operational-review",
    });
  }

  function reportToLeadership(role, report) {
    assertLeadershipCapability(role, "report_to_leadership");
    if (role !== ROLES.VICE_CEO) throw new Error("Only the Vice CEO may use the StarNet leadership report channel");
    if (!report || typeof report !== "object") throw new Error("StarNet leadership report is required");
    const targets = [ROLES.CEO, ROLES.PA].map(targetRole => {
      const target = company.snapshot().people.find(p => p.role === targetRole);
      if (!target) throw new Error(`Missing StarForge ${targetRole} reporting target`);
      return { role: target.role, id: target.id, name: target.name };
    });
    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      report: structuredClone(report),
      targets,
    };
    company.recordLeadershipReport(role, entry);
    return act(role, "report_to_leadership", {
      action: ACTIONS.STARNET_REPORT,
      details: { report: structuredClone(report), targets, reportId: entry.id },
    });
  }

  return {
    profiles: () => [leadershipProfile(ROLES.PA), leadershipProfile(ROLES.CEO), leadershipProfile(ROLES.VICE_CEO)],
    actor,
    act,
    communicate,
    briefCho,
    requestApproval,
    operate,
    reportToLeadership,
    listLeadershipReports,
    getLeadershipReport,
    reviewLeadershipReport,
  };
}

export { LEADERSHIP_CAPABILITIES };
