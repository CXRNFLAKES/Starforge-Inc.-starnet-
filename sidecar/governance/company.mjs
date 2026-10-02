import { randomUUID } from "node:crypto";
import { ROLES } from "./roles.mjs";
import { ACTIONS, assertCan } from "./authority.mjs";

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
      cho: {
        id: "cho",
        name: "Human Owner",
        role: ROLES.CHO,
      },
      createdAt: now,
      updatedAt: now,
    },
    objectives: [],
    people: [
      { id: "cho", name: "CHO", role: ROLES.CHO },
      { id: "main-overseer", name: "Main Overseer", role: ROLES.PA },
      { id: "board", name: "Board of Directors", role: ROLES.BOARD },
      { id: "sub-overseer", name: "Sub-Overseer", role: ROLES.CEO },
    ],
    decisions: [],
    boardMeetings: [],
    decisionPackets: [],
    audit: [],
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
    decisions: Array.isArray(state?.decisions) ? state.decisions : [],
    boardMeetings: Array.isArray(state?.boardMeetings) ? state.boardMeetings : [],
    decisionPackets: Array.isArray(state?.decisionPackets) ? state.decisionPackets : [],
    audit: Array.isArray(state?.audit) ? state.audit : [],
  };
}

export function makeCompany({ load, save } = {}) {
  let state = normalize(load?.());

  const persist = () => save?.(structuredClone(state));

  return {
    snapshot() {
      return structuredClone(state);
    },

    setChoProfile(actorRole, { id = "cho", name = "Human Owner" } = {}) {
      assertCan(actorRole, ACTIONS.COMPANY_CONFIGURE);
      state.company.cho = { id: String(id), name: String(name), role: ROLES.CHO };
      state.company.updatedAt = new Date().toISOString();
      this.audit(actorRole, "company.cho.profile.updated", { choId: state.company.cho.id } , false);
      persist();
      return this.snapshot();
    },

    setMission(actorRole, { mission = "", objective = "" } = {}) {
      assertCan(actorRole, ACTIONS.COMPANY_CONFIGURE);
      state.company.mission = String(mission);
      state.company.objective = String(objective);
      state.company.updatedAt = new Date().toISOString();
      this.audit(actorRole, "company.mission.updated", { mission, objective } , false);
      persist();
      return this.snapshot();
    },

    createObjective(actorRole, { title, description = "", status = "active" } = {}) {
      assertCan(actorRole, ACTIONS.COMPANY_CONFIGURE);
      if (!title) throw new Error("Objective title is required");
      const objective = {
        id: randomUUID(),
        title: String(title),
        description: String(description),
        status: String(status),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.objectives.push(objective);
      state.company.updatedAt = objective.updatedAt;
      this.audit(actorRole, "company.objective.created", { objectiveId: objective.id } , false);
      persist();
      return structuredClone(objective);
    },

    recordBoardMeeting(actorRole, meeting) {
      assertCan(actorRole, ACTIONS.BOARD_CONVENE);
      if (!meeting?.id || !meeting?.objective) throw new Error("Invalid board meeting");
      state.boardMeetings.push(structuredClone(meeting));
      state.company.updatedAt = meeting.updatedAt;
      this.audit(actorRole, "board.meeting.convened", {
        meetingId: meeting.id,
        objective: meeting.objective,
      }, false);
      persist();
      return structuredClone(meeting);
    },

    updateBoardMeeting(actorRole, meeting) {
      assertCan(actorRole, ACTIONS.BOARD_DECIDE);
      const index = state.boardMeetings.findIndex((item) => item.id === meeting?.id);
      if (index < 0) throw new Error("Unknown board meeting");
      state.boardMeetings[index] = structuredClone(meeting);
      state.company.updatedAt = meeting.updatedAt;
      this.audit(actorRole, "board.decision.recorded", {
        meetingId: meeting.id,
        decisionCount: meeting.decisions?.length ?? 0,
        actionItemCount: meeting.actionItems?.length ?? 0,
      }, false);
      persist();
      return structuredClone(meeting);
    },

    registerPerson(actorRole, person) {
      assertCan(actorRole, ACTIONS.COMPANY_CONFIGURE);
      if (!person?.id || !person?.name || !person?.role) throw new Error("Invalid person");
      state.people.push({ id: String(person.id), name: String(person.name), role: person.role });
      this.audit(actorRole, "company.person.registered", { personId: person.id, role: person.role } , false);
      persist();
      return this.snapshot();
    },

    recordDecisionPacket(actorRole, packet) {
      assertCan(actorRole, ACTIONS.PA_ADVISE_CHO);
      if (!packet?.request?.id) throw new Error("Decision packet requires request id");
      const entry = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...structuredClone(packet),
      };
      state.decisionPackets.push(entry);
      this.audit(actorRole, "governance.decision-packet.recorded", { packetId: entry.id, requestId: entry.request.id }, false);
      persist();
      return structuredClone(entry);
    },

    recordDecision(actorRole, decision) {
      assertCan(actorRole, ACTIONS.CHO_DECIDE);
      if (decision?.requestId) {
        const packet = state.decisionPackets.find(
          (item) => item.request?.id === decision.requestId,
        );
        if (!packet) throw new Error("CHO decision requires a recorded decision packet");
        if (decision.packetId !== packet.id) {
          throw new Error("CHO decision packet reference does not match the recorded packet");
        }
        if (state.decisions.some((item) => item.requestId === decision.requestId)) {
          throw new Error("CHO decision already recorded for this request");
        }
      }
      const entry = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...decision,
      };
      state.decisions.push(entry);
      this.audit(actorRole, "governance.decision.recorded", {
        decisionId: entry.id,
        requestId: entry.requestId ?? null,
        packetId: entry.packetId ?? null,
      } , false);
      persist();
      return entry;
    },

    audit(actorRole, event, details = {}, persistAudit = true) {
      const entry = {
        id: randomUUID(),
        at: new Date().toISOString(),
        actorRole,
        event,
        details,
      };
      state.audit.push(entry);
      if (persistAudit) persist();
      return entry;
    },
  };
}
