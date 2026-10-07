'use strict';
(function(){
  if(typeof document==='undefined'||typeof StationUI==='undefined'||!StationUI.registerWindow)return;
  const esc=StationUI.h.esc;
  function money(n,c='EUR'){const v=Number(n);return Number.isFinite(v)?new Intl.NumberFormat('en-IE',{style:'currency',currency:String(c).toUpperCase(),maximumFractionDigits:0}).format(v):'—';}
  function stationLabel(worker,index){
    const reported=worker?.stationName??worker?.station??worker?.roomName??worker?.room;
    return String(reported||('WORKFORCE DESK '+(index+1))).trim()||('WORKFORCE DESK '+(index+1));
  }
  function render(body){
    body.innerHTML='<section class="sf-worker-room"><header class="sf-room-head"><div><div class="sf-kicker">STARFORGE HQ · STARNet</div><h2>WORKER ROOM</h2><p>Live workforce surface — StarNet owns execution.</p></div><span class="sf-link-state">LIVE GOVERNANCE BRIDGE</span></header><div class="sf-room-summary"><span>WORKERS <b data-w="total">—</b></span><span>WORKING <b data-w="working">—</b></span><span>IDLE <b data-w="idle">—</b></span><span>RUNS <b data-w="runs">—</b></span></div><div class="sf-worker-grid"></div><section class="sf-room-activity"><div class="sf-section-label">LIVE ACTIVITY</div><div class="sf-activity-list"></div></section><aside class="sf-worker-detail" hidden aria-live="polite"><div class="sf-section-label">WORKER DETAIL</div><button type="button" class="sf-detail-close" data-detail-close>CLOSE ×</button><div class="sf-detail-head"><b data-detail-name>WORKER</b><span data-detail-status>STATUS UNKNOWN</span></div><div class="sf-detail-run" data-detail-run>NO ACTIVE RUN</div><div class="sf-detail-tasks" data-detail-tasks>NO GOVERNED TASK HISTORY</div></aside><div class="sf-room-foot">Read-only telemetry. Delegation and authorization remain behind StarForge governance.</div></section>';
    const root=body.firstElementChild, grid=root.querySelector('.sf-worker-grid'), activityList=root.querySelector('.sf-activity-list'), detail=root.querySelector('.sf-worker-detail'), detailName=root.querySelector('[data-detail-name]'), detailStatus=root.querySelector('[data-detail-status]'), detailRun=root.querySelector('[data-detail-run]'), detailTasks=root.querySelector('[data-detail-tasks]'), stats={};root.querySelectorAll('[data-w]').forEach(x=>stats[x.dataset.w]=x);root.querySelector('[data-detail-close]').addEventListener('click',()=>{detail.hidden=true;});
    function showDetail(worker, recentTasks){const id=String(worker?.id||worker?.agentId||'');detail.hidden=false;detailName.textContent=String(worker?.name||id||'WORKER');detailStatus.textContent=String(worker?.status||'unknown').toUpperCase();const run=worker?.activeRun;detailRun.textContent=stationLabel(worker,0)+' · '+(run?'RUN '+String(run.id||run.runId||'unknown')+' · '+String(run.title||run.task||run.label||'ACTIVE EXECUTION'):'NO ACTIVE RUN');const tasks=recentTasks.filter(task=>String(task.assigneeId||'')===id).slice().reverse().slice(0,8);detailTasks.replaceChildren();if(!tasks.length){detailTasks.textContent='NO GOVERNED TASK HISTORY';return;}for(const task of tasks){const row=document.createElement('div');row.className='sf-detail-task';row.innerHTML='<b>'+esc(task.title||'Governed task')+'</b><span>'+esc(String(task.status||'unknown').toUpperCase())+' · '+esc(task.updatedAt||task.createdAt||'TIME NOT REPORTED')+'</span>';detailTasks.appendChild(row);}}
    async function refresh(){
      try{
        const r=await fetch('/api/starforge/governance',{cache:'no-store'});if(!r.ok)throw new Error('feed unavailable');
        const data=await r.json(), workers=Array.isArray(data?.workforce?.workers)?data.workforce.workers:[], runs=Array.isArray(data?.activeRuns)?data.activeRuns:[], recentTasks=Array.isArray(data?.execution?.recentTasks)?data.execution.recentTasks:[];
        activityList.replaceChildren();
        const events=[...runs.map(run=>({kind:'RUN',title:run.title||run.task||run.label||'StarNet run',status:'WORKING',agentId:run.agentId||'unassigned',at:run.startedAt||run.createdAt||''})),...recentTasks.map(task=>({kind:'TASK',title:task.title||'Governed task',status:String(task.status||'unknown').toUpperCase(),agentId:task.assigneeId||'unassigned',at:task.updatedAt||task.createdAt||''}))].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,12);
        if(!events.length){activityList.textContent='No governed StarNet activity recorded yet.';}else events.forEach(event=>{const row=document.createElement('div');row.className='sf-activity-row';const stamp=event.at?new Date(event.at).toLocaleString():'TIME NOT REPORTED';row.innerHTML='<span class="sf-activity-kind">'+esc(event.kind)+'</span><b>'+esc(event.title)+'</b><span>'+esc(event.status)+' · '+esc(String(event.agentId))+' · '+esc(stamp)+'</span>';activityList.appendChild(row);});
        stats.total.textContent=workers.length;stats.working.textContent=workers.filter(w=>w.status==='working').length;stats.idle.textContent=workers.filter(w=>w.status==='idle').length;stats.runs.textContent=runs.length;
        grid.replaceChildren();
        if(!workers.length){const e=document.createElement('div');e.className='sf-empty';e.textContent='No live StarNet workers exposed.';grid.appendChild(e);return;}
        for(const [index,w] of workers.entries()){
          const card=document.createElement('button');card.type='button';card.className='sf-room-worker';
          const run=w.activeRun, activity=run?.title||run?.task||run?.label||'Awaiting assignment';
          const runId=run?.id||run?.runId||'';
          const startedAt=run?.startedAt||run?.createdAt||'';
          const capabilities=Array.isArray(w.capabilities)?w.capabilities:(Array.isArray(w.skills)?w.skills:[]);
          const performance=w.performance||{};
          const station=stationLabel(w,index);
          const completed=Math.max(0,Number(performance.completed)||0);
          const failed=Math.max(0,Number(performance.failed)||0);
          const blocked=Math.max(0,Number(performance.blocked)||0);
          const xp=Math.max(0,Number(performance.xp)||0);
          const level=Math.max(1,Number(performance.level)||1);
          const levelProgress=Math.max(0,Math.min(100,Number(performance.xpProgressPercent)||0));
          const successRate=Number.isFinite(Number(performance.successRate))?Number(performance.successRate):null;
          const recovery=performance.recovery===true;
          const portrait = (typeof AgentPortraits !== 'undefined' && typeof AgentPortraits.thumbHTML === 'function')
            ? AgentPortraits.thumbHTML(w, 42, 50, 'sf-room-portrait')
            : '<span class="sf-room-avatar">◆</span>';
          card.innerHTML='<div class="sf-room-avatar-wrap">'+portrait+'</div><div class="sf-room-main"><b>'+esc(w.name||w.id||'Unnamed worker')+'</b><span>'+esc(station)+' · '+esc(w.role||'StarNet agent')+' · '+esc(w.model||'model unavailable')+'</span><small>'+esc(activity)+'</small><small>'+esc(runId?'RUN '+runId:'NO ACTIVE RUN')+(startedAt?' · STARTED '+startedAt:'')+'</small><small>'+esc(capabilities.length?capabilities.slice(0,4).join(' · '):'CAPABILITIES NOT REPORTED')+'</small><small>LVL '+level+' · XP '+xp+' · '+(successRate===null?'NO HISTORY':successRate+'% SUCCESS')+'</small><small>✓ '+completed+' · ✕ '+failed+' · ▣ '+blocked+(recovery?' · RECOVERY':'')+'</small><div class="sf-xp-track"><i style="width:'+levelProgress+'%"></i></div></div><span class="sf-room-status '+(w.status==='working'?'working':'idle')+'">'+esc(String(w.status||'unknown').toUpperCase())+'</span><span class="sf-open">OPEN ›</span>';
          card.addEventListener('click',()=>{showDetail(w,recentTasks);const agents=Array.isArray(StationUI.present)?StationUI.present:[];const i=agents.findIndex(a=>String(a.id||a.agentId)===String(w.id));if(i>=0&&typeof StationUI.openAgent==='function')StationUI.openAgent(i);});
          grid.appendChild(card);
        }
      }catch(_){stats.total.textContent='—';stats.working.textContent='—';stats.idle.textContent='—';stats.runs.textContent='—';}
    }
    refresh();const timer=setInterval(()=>{if(root.isConnected)refresh();else clearInterval(timer);},1000);
  }
  StationUI.registerWindow('starforge-worker-room','STARFORGE WORKER ROOM',render,{console:true,className:'starforge-worker-room-win'});
  window.StarForgeWorkerRoom=Object.freeze({refreshLabel:'/api/starforge/governance'});
})();