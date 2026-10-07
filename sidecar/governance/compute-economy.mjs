const DEFAULT_BUDGETS = Object.freeze({ missionCents: 100, workerCents: 50, taskCents: 10 });
const STATUS = Object.freeze(["available", "rate-limited", "unavailable", "paid-only"]);
function money(value) { const n=Number(value); if(!Number.isFinite(n)||n<0) throw new Error("Compute Economy requires a non-negative amount"); return Math.round(n*100)/100; }
function cents(value) { return Math.round(money(value)*100); }
function id(value,label){const v=String(value||"").trim(); if(!v) throw new Error("Compute Economy requires "+label); return v;}
export function makeComputeEconomy({budgets={},providerStatuses={}}={}) {
 const limits=Object.freeze({
  missionCents:Number.isFinite(Number(budgets.missionCents))?Math.max(0,Math.round(Number(budgets.missionCents))):DEFAULT_BUDGETS.missionCents,
  workerCents:Number.isFinite(Number(budgets.workerCents))?Math.max(0,Math.round(Number(budgets.workerCents))):DEFAULT_BUDGETS.workerCents,
  taskCents:Number.isFinite(Number(budgets.taskCents))?Math.max(0,Math.round(Number(budgets.taskCents))):DEFAULT_BUDGETS.taskCents,
 });
 const providers=new Map(Object.entries(providerStatuses).map(([k,v])=>[String(k).trim().toLowerCase(),v]));
 const ledger=[];
 function providerStatus(provider){return providers.get(id(provider,"provider").toLowerCase())||"available";}
 function assertProvider(provider){const status=providerStatus(provider); if(!STATUS.includes(status)) throw new Error("Compute Economy has invalid provider status: "+status); if(status!=="available") throw new Error("Compute Economy rejected provider "+provider+": "+status);}
 function remaining({missionId,workerId=null,taskId=null}={}) {
  const rows=ledger.filter(e=>e.missionId===missionId);
  const spent=rows.reduce((s,e)=>s+e.costCents,0);
  const ws=workerId?rows.filter(e=>e.workerId===workerId).reduce((s,e)=>s+e.costCents,0):0;
  const ts=taskId?rows.filter(e=>e.taskId===taskId).reduce((s,e)=>s+e.costCents,0):0;
  return {missionCents:limits.missionCents-spent,workerCents:limits.workerCents-ws,taskCents:limits.taskCents-ts};
 }
 function authorize({missionId,workerId,taskId,provider,model,estimatedCost=0,complexity="normal"}={}) {
  const mission=id(missionId,"mission id"), worker=id(workerId,"worker id"), task=id(taskId,"task id");
  const providerId=id(provider,"provider").toLowerCase(), modelId=id(model,"model"), costCents=cents(estimatedCost);
  assertProvider(providerId); const left=remaining({missionId:mission,workerId:worker,taskId:task});
  if(costCents>left.missionCents||costCents>left.workerCents||costCents>left.taskCents) throw new Error("Compute Economy budget exceeded");
  return Object.freeze({approved:true,missionId:mission,workerId:worker,taskId:task,provider:providerId,model:modelId,complexity:String(complexity),estimatedCost:money(estimatedCost),budgetRemaining:Object.freeze({mission:money((left.missionCents-costCents)/100),worker:money((left.workerCents-costCents)/100),task:money((left.taskCents-costCents)/100)})});
 }
 function recordUsage({authorization,inputTokens=null,outputTokens=null,estimatedCost=null,actualCost=null}={}) {
  if(!authorization?.approved) throw new Error("Compute Economy usage requires approved compute");
  const usageCost=actualCost==null?(estimatedCost==null?authorization.estimatedCost:estimatedCost):actualCost;
  const entry=Object.freeze({id:crypto.randomUUID(),missionId:authorization.missionId,workerId:authorization.workerId,taskId:authorization.taskId,provider:authorization.provider,model:authorization.model,complexity:authorization.complexity,inputTokens:inputTokens==null?null:Number(inputTokens),outputTokens:outputTokens==null?null:Number(outputTokens),estimatedCost:authorization.estimatedCost,actualCost:money(usageCost),costCents:cents(usageCost),recordedAt:new Date().toISOString()});
  const left=remaining(entry); if(entry.costCents>limits.missionCents||entry.costCents>limits.workerCents||entry.costCents>limits.taskCents) throw new Error("Compute Economy usage exceeds a hard budget ceiling");
  ledger.push(entry); return entry;
 }
 function report({missionId=null}={}) {const entries=ledger.filter(e=>!missionId||e.missionId===missionId); return Object.freeze({missionId,requestCount:entries.length,totalCost:money(entries.reduce((s,e)=>s+e.costCents,0)/100),entries:entries.map(e=>({...e}))});}
 return Object.freeze({limits:Object.freeze({...limits}),providerStatus,authorize,recordUsage,remaining,report});
}
export {DEFAULT_BUDGETS,STATUS};
