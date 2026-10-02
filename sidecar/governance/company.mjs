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
      createdAt: now,
      updatedAt: now,
    },
    people: [
      { id: "cho", name: "CHO", role: ROLES.CHO },
      { id: "main-overseer", name: "Main Overseer", role: ROLES.PA },
      { id: "board", name: "Board of Directors", role: ROLES.BOARD },
      { id: "sub-overseer", name: "Sub-Overseer", role: ROLES.CEO },
    ],
    decisions: [],
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
    decisions: Array.isArray(state?.decisions) ? state.decisions : [],
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

    setMission(actorRole, { mission = "", objective = "" } = {}) {
      assertCan(actorRole, ACTIONS.COMPANY_CONFIGURE);
      state.company.mission = String(mission);
      state.company.objective = String(objective);
      state.company.updatedAt = new Date().toISOString();
      this.audit(actorRole, "company.mission.updated", { mission, objective });
      persist();
      return this.snapshot();
    },

    registerPerson(actorRole, person) {
      assertCan(actorRole, ACTIONS.COMPANY_CONFIGURE);
      if (!person?.id || !person?.name || !person?.role) throw new Error("Invalid person");
      state.people.push({ id: String(person.id), name: String(person.name), role: person.role });
      this.audit(actorRole, "company.person.registered", { personId: person.id, role: person.role });
      persist();
      return this.snapshot();
    },

    recordDecision(actorRole, decision) {
      assertCan(actorRole, ACTIONS.CHO_DECIDE);
      const entry = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...decision,
      };
      state.decisions.push(entry);
      this.audit(actorRole, "governance.decision.recorded", { decisionId: entry.id });
      persist();
      return entry;
    },

    audit(actorRole, event, details = {}) {
      const entry = {
        id: randomUUID(),
        at: new Date().toISOString(),
        actorRole,
        event,
        details,
      };
      state.audit.push(entry);
      persist();
      return entry;
    },
  };
}
