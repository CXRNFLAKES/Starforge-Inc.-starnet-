import { randomUUID } from "node:crypto";
import { ROLES } from "./roles.mjs";
import { ACTIONS, assertCan } from "./authority.mjs";

const DEFAULT_BOARD_COMMITTEES = Object.freeze([
  "strategy",
  "finance",
  "risk",
  "operations",
  "ai",
  "revenue",
]);

function findPerson(company, role) {
  return company.snapshot().people.find((person) => person.role === role) ?? null;
}

export function makeBoard({ company } = {}) {
  if (!company || typeof company.snapshot !== "function" || typeof company.recordBoardMeeting !== "function") {
    throw new Error("makeBoard requires a company with board meeting persistence");
  }

  function roster() {
    const state = company.snapshot();
    return {
      chair: state.company.cho,
      ceo: findPerson(company, ROLES.CEO),
      pa: findPerson(company, ROLES.PA),
      committees: [...DEFAULT_BOARD_COMMITTEES],
    };
  }

  function convene(actorRole, { objective, agenda = [], reason = "" } = {}) {
    assertCan(actorRole, ACTIONS.BOARD_CONVENE);
    if (!objective) throw new Error("Board meeting objective is required");

    const now = new Date().toISOString();
    const meeting = {
      id: randomUUID(),
      chairRole: ROLES.CHO,
      calledBy: actorRole,
      objective: String(objective),
      agenda: Array.isArray(agenda) ? agenda.map(String) : [String(agenda)],
      reason: String(reason),
      status: "open",
      createdAt: now,
      updatedAt: now,
      decisions: [],
      actionItems: [],
    };

    company.recordBoardMeeting(actorRole, meeting);
    return structuredClone(meeting);
  }

  function decide(actorRole, meetingId, { decision, rationale = "", actionItems = [] } = {}) {
    assertCan(actorRole, ACTIONS.BOARD_DECIDE);
    if (!meetingId || !decision) throw new Error("Meeting ID and board decision are required");

    const state = company.snapshot();
    const meeting = state.boardMeetings.find((item) => item.id === meetingId);
    if (!meeting) throw new Error(`Unknown board meeting: ${meetingId}`);
    if (meeting.status !== "open") throw new Error("Board meeting is not open");

    meeting.decisions.push({
      id: randomUUID(),
      decision: String(decision),
      rationale: String(rationale),
      createdAt: new Date().toISOString(),
    });
    meeting.actionItems = Array.isArray(actionItems) ? actionItems.map(String) : [String(actionItems)];
    meeting.status = "decided";
    meeting.updatedAt = new Date().toISOString();

    company.updateBoardMeeting(actorRole, meeting);
    return structuredClone(meeting);
  }

  return { roster, convene, decide };
}

export { DEFAULT_BOARD_COMMITTEES };
