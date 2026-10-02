import { runIntegrationScenario } from "../sidecar/governance/integration-lab.mjs";

try {
  const result = runIntegrationScenario();
  console.log("STARFORGE INTEGRATION TEST LAB");
  console.log("MODE:", result.lab.mode);
  console.log("SIDE EFFECTS:", result.lab.sideEffects);
  console.log("REQUEST STATUS:", result.lab.requests[0]?.status);
  console.log("RISK ASSESSMENTS:", result.lab.riskAssessments.length);
  console.log("BOARD MEETINGS:", result.lab.meetings.length);
  console.log("CHO DECISIONS:", result.lab.approvals.length);
  console.log("RECOVERY MISSIONS:", result.lab.recoveries.length);
  console.log("AUDIT EVENTS:", result.lab.events.length);
  console.log("RESULT: SAFE TO PROCEED TO NEXT INTEGRATION PHASE");
} catch (error) {
  console.error("RESULT: DO NOT PROCEED");
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}
