import { randomUUID } from "node:crypto";
import { ROLES } from "./roles.mjs";
import { ACTIONS, assertCan } from "./authority.mjs";
import { isValidDecision } from "./decision-packet.mjs";

export const SCHEMA_VERSION = 1;

export function defaultState() {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    company: {
      id: "starforge",
      name: "StarForge",
      mission: "",
      objective: "",
      status: "active",
      phase: 1,
      cho: { id: "cho", name: "Human Owner", role: ROLES.CHO },
      createdAt: now,
      updatedAt: now,
    },
    objectives: [],
    projects: [],
    tasks: [],
    leadershipReports: [],
    recoveryMissions: [],
    people: [
      { id: "cho", name: "CHO", role: ROLES.CHO },
      { id: "main-overseer", name: "PA / Chief of Staff", role: ROLES.PA },
      { id: "board", name: "Board of Directors", role: ROLES.BOARD },
      { id: "starforge-ceo", name: "StarForge CEO", role: ROLES.CEO },
      { id: "starnet-vice-ceo", name: "StarNet Vice CEO", role: ROLES.VICE_CEO },
    ],
    decisions: [],
    boardMeetings: [],
    decisionPackets: [],
    audit: [],
    finance: {
      currency: "EUR",
      openingCapital: 0,
      entries: [],
    },
  };
}

function normalize(state) {
  const base = defaultState();
  return {
    ...base,
    ...state,
    company: { ...base.company, ...(state?.company ?? {}) },
    people: Array.isArray(state?.people) ? state.people : base.people,
    objectives: Array.isArray(state?.objectives) ? state.objectives : [],
    projects: Array.isArray(state?.projects) ? state.projects : [],
    tasks: Array.isArray(state?.tasks) ? state.tasks : [],
    leadershipReports: Array.isArray(state?.leadershipReports) ? state.leadershipReports : [],
    recoveryMissions: Array.isArray(state?.recoveryMissions) ? state.recoveryMissions : [],
    decisions: Array.isArray(state?.decisions) ? state.decisions : [],
    boardMeetings: Array.isArray(state?.boardMeetings) ? state.boardMeetings : [],
    decisionPackets: Array.isArray(state?.decisionPackets) ? state.decisionPackets : [],
    audit: Array.isArray(state?.audit) ? state.audit : [],
    finance: {
      ...base.finance,
      ...(state?.finance ?? {}),
      entries: Array.isArray(state?.finance?.entries) ? state.finance.entries : [],
    },
  };
}

export function makeCompany({ load, save } = {}) {
  let state = normalize(load?.());

  const persist = () => save?.(structuredClone(state));

  function financeData({ summaryOnly = false } = {}) {
    const entries = state.finance.entries;
    let cash = Number(state.finance.openingCapital) || 0;
    let taxReserve = 0;
    let liabilities = 0;
    for (const entry of entries) {
      const amount = Number(entry.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (entry.kind === "capital-injection" || entry.kind === "revenue") cash += amount;
      else if (entry.kind === "expense") cash -= amount;
      else if (entry.kind === "tax-reserve") { cash -= amount; taxReserve += amount; }
      else if (entry.kind === "liability") liabilities += amount;
      else if (entry.kind === "liability-payment") { cash -= amount; liabilities = Math.max(0, liabilities - amount); }
    }
    const summary = {
      currency: state.finance.currency,
      openingCapital: Number(state.finance.openingCapital) || 0,
      cash,
      // Tax reserves are already removed from cash above. Do not subtract the reserve a second time.
      availableCash: Math.max(0, cash),
      taxReserve,
      liabilities,
      netOperatingCapital: Math.max(0, cash) - liabilities,
      entryCount: entries.length,
    };
    return summaryOnly ? summary : { ...summary, entries: structuredClone(entries) };
  }

  function recordAudit(actorRole, event, details = {}, persistAudit = true) {
    if (!actorRole || !event) throw new Error("Audit actor and event are required");
    const entry = { id: randomUUID(), at: new Date().toISOString(), actorRole, event, details: structuredClone(details) };
    state.audit.push(entry);
    if (persistAudit) persist();
    return structuredClone(entry);
  }

  function recordLeadershipActivity(actorRole, capability, details = {}) {
    const allowed = {
      [ROLES.PA]: ["coordinate", "research", "review_work", "inspect_company", "communicate", "brief_cho", "investigate", "convene_board", "assess_risk", "maintain_memory"],
      [ROLES.CEO]: ["coordinate", "research", "review_work", "inspect_company", "communicate", "spawn_agents", "delegate", "create_projects", "manage_operations", "monitor_performance", "reassign_workers", "request_approval", "execute_approved_plans", "direct_starnet"],
      [ROLES.VICE_CEO]: ["coordinate", "research", "inspect_company", "communicate", "lead_starnet", "delegate_starnet", "monitor_performance", "reassign_starnet_workers", "report_to_leadership"],
    };
    if (!allowed[actorRole]?.includes(capability)) throw new Error("Unauthorized leadership audit activity");
    return recordAudit(actorRole, `leadership.${capability}`, {
      leaderId: state.people.find(person => person.role === actorRole)?.id ?? null,
      details,
    });
  }

  function recordLeadershipReview(actorRole, { reportId, sourceRole = ROLES.VICE_CEO } = {}) {
    if (![ROLES.CEO, ROLES.PA].includes(actorRole)) throw new Error("Unauthorized leadership report review");
    if (!reportId) throw new Error("Leadership report id is required");
    return recordAudit(actorRole, "leadership.review_report", {
      leaderId: state.people.find(person => person.role === actorRole)?.id ?? null,
      details: { reportId, sourceRole },
    });
  }

  return {
    snapshot() { return structuredClone(state); },

    setChoProfile(actorRole, { id = "cho", name = "Human Owner" } = {}) {
      assertCan(actorRole, ACTIONS.COMPANY_CONFIGURE);
      state.company.cho = { id: String(id), name: String(name), role: ROLES.CHO };
      state.company.updatedAt = new Date().toISOString();
      recordAudit(actorRole, "company.cho.profile.updated", { choId: state.company.cho.id }, false);
      persist();
      return this.snapshot();
    },

    setMission(actorRole, { mission = "", objective = "" } = {}) {
      assertCan(actorRole, ACTIONS.COMPANY_CONFIGURE);
      state.company.mission = String(mission);
      state.company.objective = String(objective);
      state.company.updatedAt = new Date().toISOString();
      recordAudit(actorRole, "company.mission.updated", { mission, objective }, false);
      persist();
      return this.snapshot();
    },

    createObjective(actorRole, { title, description = "", status = "active" } = {}) {
      assertCan(actorRole, ACTIONS.COMPANY_CONFIGURE);
      if (!title) throw new Error("Objective title is required");
      const objective = {
        id: randomUUID(), title: String(title), description: String(description),
        status: String(status), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      state.objectives.push(objective);
      state.company.updatedAt = objective.updatedAt;
      recordAudit(actorRole, "company.objective.created", { objectiveId: objective.id }, false);
      persist();
      return structuredClone(objective);
    },

    recordBoardMeeting(actorRole, meeting) {
      assertCan(actorRole, ACTIONS.BOARD_CONVENE);
      if (!meeting?.id || !meeting?.objective) throw new Error("Invalid board meeting");
      state.boardMeetings.push(structuredClone(meeting));
      state.company.updatedAt = meeting.updatedAt;
      recordAudit(actorRole, "board.meeting.convened", { meetingId: meeting.id, objective: meeting.objective }, false);
      persist();
      return structuredClone(meeting);
    },

    updateBoardMeeting(actorRole, meeting) {
      assertCan(actorRole, ACTIONS.BOARD_DECIDE);
      const index = state.boardMeetings.findIndex((item) => item.id === meeting?.id);
      if (index < 0) throw new Error("Unknown board meeting");
      state.boardMeetings[index] = structuredClone(meeting);
      state.company.updatedAt = meeting.updatedAt;
      recordAudit(actorRole, "board.decision.recorded", {
        meetingId: meeting.id, decisionCount: meeting.decisions?.length ?? 0, actionItemCount: meeting.actionItems?.length ?? 0,
      }, false);
      persist();
      return structuredClone(meeting);
    },

    registerPerson(actorRole, person) {
      assertCan(actorRole, ACTIONS.COMPANY_CONFIGURE);
      if (!person?.id || !person?.name || !person?.role) throw new Error("Invalid person");
      state.people.push({ id: String(person.id), name: String(person.name), role: person.role });
      recordAudit(actorRole, "company.person.registered", { personId: person.id, role: person.role }, false);
      persist();
      return this.snapshot();
    },

    recordProject(actorRole, project) {
      assertCan(actorRole, ACTIONS.CEO_OPERATE);
      if (!project?.id || !project?.title) throw new Error("Invalid project");
      state.projects.push(structuredClone(project));
      state.company.updatedAt = project.updatedAt ?? new Date().toISOString();
      recordAudit(actorRole, "operations.project.recorded", { projectId: project.id }, false);
      persist();
      return structuredClone(project);
    },

    updateProject(actorRole, project) {
      assertCan(actorRole, ACTIONS.CEO_OPERATE);
      const index = state.projects.findIndex((item) => item.id === project?.id);
      if (index < 0) throw new Error("Unknown project");
      state.projects[index] = structuredClone(project);
      state.company.updatedAt = project.updatedAt ?? new Date().toISOString();
      recordAudit(actorRole, "operations.project.updated", { projectId: project.id, status: project.status }, false);
      persist();
      return structuredClone(project);
    },

    recordTask(actorRole, task) {
      assertCan(actorRole, ACTIONS.CEO_DELEGATE);
      if (!task?.id || !task?.projectId || !task?.assigneeId) throw new Error("Invalid task");
      state.tasks.push(structuredClone(task));
      state.company.updatedAt = task.updatedAt ?? new Date().toISOString();
      recordAudit(actorRole, "operations.task.recorded", { taskId: task.id, projectId: task.projectId }, false);
      persist();
      return structuredClone(task);
    },

    updateTask(actorRole, task) {
      const allowed = actorRole === ROLES.CEO
        ? ACTIONS.CEO_OPERATE
        : actorRole === ROLES.VICE_CEO
          ? ACTIONS.STARNET_DELEGATE
          : ACTIONS.WORKER_EXECUTE;
      assertCan(actorRole, allowed);
      const index = state.tasks.findIndex((item) => item.id === task?.id);
      if (index < 0) throw new Error("Unknown task");
      state.tasks[index] = structuredClone(task);
      state.company.updatedAt = task.updatedAt ?? new Date().toISOString();
      recordAudit(actorRole, "operations.task.updated", { taskId: task.id, status: task.status }, false);
      persist();
      return structuredClone(task);
    },

    recordRecoveryMission(actorRole, mission) {
      assertCan(actorRole, ACTIONS.CEO_OPERATE);
      if (!mission?.id || !mission?.taskId || !mission?.reason || !mission?.assignedAgentId) {
        throw new Error("Recovery mission requires id, task id, reason, and assigned agent");
      }
      const task = state.tasks.find((item) => item.id === mission.taskId);
      if (!task) throw new Error("Recovery mission requires an existing task");
      if (task.status !== "failed" && task.status !== "blocked") {
        throw new Error("Recovery mission requires a failed or blocked task");
      }
      if (state.recoveryMissions.some((item) => item.taskId === mission.taskId && item.status === "assigned")) {
        throw new Error("Recovery mission already assigned for this task");
      }
      const recorded = {
        ...structuredClone(mission),
        status: "assigned",
        createdAt: mission.createdAt ?? new Date().toISOString(),
      };
      state.recoveryMissions.push(recorded);
      state.company.updatedAt = recorded.createdAt;
      recordAudit(actorRole, "recovery.mission.assigned", {
        recoveryMissionId: recorded.id,
        taskId: recorded.taskId,
        assignedAgentId: recorded.assignedAgentId,
      }, false);
      persist();
      return structuredClone(recorded);
    },

    updateRecoveryMission(actorRole, mission) {
      const index = state.recoveryMissions.findIndex((item) => item.id === mission?.id);
      if (index < 0) throw new Error("Unknown recovery mission");
      const current = state.recoveryMissions[index];
      if (current.status === "closed") throw new Error("Recovery mission is already closed");
      if (!mission?.status || !["assigned", "in-progress", "verified", "closed"].includes(mission.status)) {
        throw new Error("Invalid recovery mission status");
      }
      const nextStatus = mission.status;
      const allowedTransitions = {
        assigned: ["in-progress"],
        "in-progress": ["verified"],
        verified: ["closed"],
      };
      if (nextStatus === "verified") {
        assertCan(actorRole, ACTIONS.PA_REVIEW);
        if (current.status !== "in-progress") throw new Error("Recovery mission must be in-progress before verification");
      } else if (nextStatus === "closed") {
        assertCan(actorRole, ACTIONS.CEO_OPERATE);
        if (current.status !== "verified") throw new Error("Recovery mission must be verified before closure");
      } else {
        assertCan(actorRole, ACTIONS.CEO_OPERATE);
        if (!allowedTransitions[current.status]?.includes(nextStatus)) {
          throw new Error("Invalid recovery mission transition");
        }
      }
      const updated = {
        ...current,
        ...structuredClone(mission),
        updatedAt: mission.updatedAt ?? new Date().toISOString(),
      };
      state.recoveryMissions[index] = updated;
      state.company.updatedAt = updated.updatedAt;
      recordAudit(actorRole, `recovery.mission.${updated.status}`, {
        recoveryMissionId: updated.id,
        taskId: updated.taskId,
        status: updated.status,
      }, false);
      persist();
      return structuredClone(updated);
    },

    verifyRecoveryMission(actorRole, missionId, evidence = []) {
      assertCan(actorRole, ACTIONS.PA_REVIEW);
      if (!missionId || !Array.isArray(evidence) || evidence.length === 0) {
        throw new Error("Recovery verification requires mission id and evidence");
      }
      const index = state.recoveryMissions.findIndex((item) => item.id === missionId);
      if (index < 0) throw new Error("Unknown recovery mission");
      const mission = state.recoveryMissions[index];
      if (mission.status !== "in-progress") {
        throw new Error("Recovery mission must be in-progress before verification");
      }
      const task = state.tasks.find((item) => item.id === mission.taskId);
      if (!task) throw new Error("Recovery verification requires an existing task");
      if (task.status !== "completed") {
        throw new Error("Recovery verification requires completed recovery work");
      }
      const now = new Date().toISOString();
      const updated = {
        ...mission,
        status: "verified",
        evidence: structuredClone(evidence),
        verifiedBy: actorRole,
        verifiedAt: now,
        updatedAt: now,
      };
      state.recoveryMissions[index] = updated;
      state.company.updatedAt = now;
      recordAudit(actorRole, "recovery.mission.verified", {
        recoveryMissionId: updated.id,
        taskId: updated.taskId,
        evidenceCount: evidence.length,
      }, false);
      persist();
      return structuredClone(updated);
    },

    recordLeadershipReport(actorRole, report) {
      assertCan(actorRole, ACTIONS.STARNET_REPORT);
      if (!report?.id || !report?.report || !Array.isArray(report.targets)) {
        throw new Error("Invalid leadership report");
      }
      state.leadershipReports.push(structuredClone(report));
      state.company.updatedAt = report.createdAt ?? new Date().toISOString();
      recordAudit(actorRole, "leadership.report.recorded", {
        reportId: report.id,
        targetCount: report.targets.length,
      }, false);
      persist();
      return structuredClone(report);
    },

    recordDecisionPacket(actorRole, packet) {
      assertCan(actorRole, ACTIONS.PA_ADVISE_CHO);
      if (!packet?.request?.id) throw new Error("Decision packet requires request id");
      const entry = { id: randomUUID(), createdAt: new Date().toISOString(), ...structuredClone(packet) };
      state.decisionPackets.push(entry);
      recordAudit(actorRole, "governance.decision-packet.recorded", { packetId: entry.id, requestId: entry.request.id }, false);
      persist();
      return structuredClone(entry);
    },

    recordBusinessOutcome(actorRole, { taskId, outcome } = {}) {
      assertCan(actorRole, ACTIONS.PA_REVIEW);
      if (!taskId || !outcome?.outcomeId) throw new Error("Business outcome requires task id and outcome id");
      const index = state.tasks.findIndex((item) => item.id === taskId);
      if (index < 0) throw new Error("Unknown task");
      const task = state.tasks[index];
      if (task.status !== "completed") throw new Error("Business outcome requires a completed task");
      if (task.assigneeSource !== "starnet") throw new Error("Business outcome requires StarNet execution");
      const recoveryMission = state.recoveryMissions.find((item) => item.taskId === task.id);
      if (recoveryMission && !["verified", "closed"].includes(recoveryMission.status)) {
        throw new Error("Business outcome requires verified recovery work");
      }
      const recorded = structuredClone(outcome);
      state.tasks[index] = { ...task, businessOutcome: recorded, updatedAt: recorded.verifiedAt ?? new Date().toISOString() };
      state.company.updatedAt = state.tasks[index].updatedAt;
      recordAudit(actorRole, recorded.verified === true ? "business.outcome.verified" : "business.outcome.recorded", {
        taskId,
        outcomeId: recorded.outcomeId,
        verified: recorded.verified === true,
      }, false);
      persist();
      return structuredClone(recorded);
    },

    recordFinanceEntry(actorRole, entry) {
      assertCan(actorRole, ACTIONS.FINANCE_RECORD);
      if (!entry?.id || !entry?.kind || !entry?.amount || !entry?.currency) {
        throw new Error("Finance entry requires id, kind, amount, and currency");
      }
      const amount = Number(entry.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Finance entry amount must be positive");
      const kind = String(entry.kind);
      if (!["capital-injection", "revenue", "expense", "tax-reserve", "liability", "liability-payment"].includes(kind)) {
        throw new Error("Invalid finance entry kind");
      }
      if (kind === "revenue" && entry.taskId) {
        const task = state.tasks.find((item) => item.id === String(entry.taskId));
        if (!task) throw new Error("Revenue requires a verified business outcome");
        const recoveryMission = state.recoveryMissions.find((item) => item.taskId === task.id);
        if (recoveryMission && !["verified", "closed"].includes(recoveryMission.status)) {
          throw new Error("Revenue requires verified recovery work");
        }
        const outcome = task.businessOutcome;
        if (entry.businessOutcomeId || entry.source === "verified-business-outcome") {
          if (!outcome?.verified || entry.businessOutcomeId !== outcome.outcomeId) {
            throw new Error("Revenue requires a verified business outcome");
          }
        } else if (outcome && outcome.verified !== true) {
          throw new Error("Revenue requires a verified business outcome");
        }
      }
      const currency = String(entry.currency).toUpperCase();
      if (currency !== state.finance.currency) throw new Error("Finance entry currency does not match company currency");
      const recorded = {
        ...structuredClone(entry),
        id: String(entry.id),
        kind,
        amount,
        currency,
        recordedBy: actorRole,
        recordedAt: entry.recordedAt ?? new Date().toISOString(),
      };
      state.finance.entries.push(recorded);
      state.company.updatedAt = recorded.recordedAt;
      recordAudit(actorRole, "finance.entry.recorded", { entryId: recorded.id, kind, amount }, false);
      persist();
      return structuredClone(recorded);
    },

    financeSnapshot(actorRole) {
      assertCan(actorRole, ACTIONS.FINANCE_REPORT);
      return financeData();
    },

    financeTelemetrySnapshot(actorRole, { limit = 5 } = {}) {
      assertCan(actorRole, ACTIONS.FINANCE_TELEMETRY);
      const safeLimit = Math.max(0, Math.min(20, Number(limit) || 0));
      const summary = financeData({ summaryOnly: true });
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      let revenue = 0;
      let expenses = 0;
      let capitalInjections = 0;
      let liabilityPayments = 0;
      for (const entry of state.finance.entries) {
        const amount = Number(entry.amount);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        if (entry.kind === "revenue") revenue += amount;
        else if (entry.kind === "expense") expenses += amount;
        else if (entry.kind === "capital-injection") capitalInjections += amount;
        else if (entry.kind === "liability-payment") liabilityPayments += amount;
      }
      const trailingExpenses = state.finance.entries.reduce((total, entry) => {
        if (entry.kind !== "expense") return total;
        const at = Date.parse(entry.recordedAt ?? "");
        return Number.isFinite(at) && at >= thirtyDaysAgo ? total + Number(entry.amount || 0) : total;
      }, 0);
      const monthlyBurn = Math.max(0, trailingExpenses);
      const runwayMonths = monthlyBurn > 0 ? Math.max(0, summary.availableCash / monthlyBurn) : null;
      return {
        ...summary,
        capitalInjections,
        revenue,
        expenses,
        liabilityPayments,
        totalInflow: capitalInjections + revenue,
        totalOutflow: expenses + summary.taxReserve + liabilityPayments,
        netCashflow: capitalInjections + revenue - expenses - summary.taxReserve - liabilityPayments,
        operatingResult: revenue - expenses - summary.taxReserve,
        monthlyBurn,
        runwayMonths,
        runwaySource: monthlyBurn > 0 ? "trailing-30-day-governed-expenses" : "unavailable-no-recent-expense-history",
        recentEntries: structuredClone(state.finance.entries.slice(-safeLimit).reverse()),
      };
    },

    capitalSnapshot(actorRole) {
      assertCan(actorRole, ACTIONS.COMPANY_READ);
      return financeData({ summaryOnly: true });
    },

    recordDecision(actorRole, decision) {
      assertCan(actorRole, ACTIONS.CHO_DECIDE);
      if (decision?.decision !== undefined && !isValidDecision(decision.decision)) throw new Error("Invalid CHO decision");
      if (decision?.requestId && !String(decision.rationale ?? "").trim()) throw new Error("CHO decision rationale is required");
      if (decision?.requestId) {
        const packet = state.decisionPackets.find(item => item.request?.id === decision.requestId);
        if (!packet) throw new Error("CHO decision requires a recorded decision packet");
        if (decision.packetId !== packet.id) throw new Error("CHO decision packet reference does not match the recorded packet");
        if (state.decisions.some(item => item.requestId === decision.requestId)) throw new Error("CHO decision already recorded for this request");
      }
      const entry = { id: randomUUID(), createdAt: new Date().toISOString(), ...decision };
      state.decisions.push(entry);
      recordAudit(actorRole, "governance.decision.recorded", {
        decisionId: entry.id, requestId: entry.requestId ?? null, packetId: entry.packetId ?? null,
      }, false);
      persist();
      return entry;
    },

  };
}
