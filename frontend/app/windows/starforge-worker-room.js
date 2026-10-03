'use strict';
(function(){
  if(typeof document==='undefined'||typeof StationUI==='undefined'||!StationUI.registerWindow)return;
  const esc=StationUI.h.esc;
  function money(n,c='EUR'){const v=Number(n);return Number.isFinite(v)?new Intl.NumberFormat('en-IE',{style:'currency',currency:String(c).toUpperCase(),maximumFractionDigits:0}).format(v):'—';}
  function render(body){
    body.innerHTML='<section class="sf-worker-room"><header class="sf-room-head"><div><div class="sf-kicker">STARFORGE HQ · STARNet</div><h2>WORKER ROOM</h2><p>Live workforce surface — StarNet owns execution.</p></div><span class="sf-link-state">LIVE GOVERNANCE BRIDGE</span></header><div class="sf-room-summary"><span>WORKERS <b data-w="total">—</b></span><span>WORKING <b data-w="working">—</b></span><span>IDLE <b data-w="idle">—</b></span><span>RUNS <b data-w="runs">—</b></span></div><div class="sf-worker-grid"></div><div class="sf-room-foot">Read-only telemetry. Delegation and authorization remain behind StarForge governance.</div></section>';
    const root=body.firstElementChild, grid=root.querySelector('.sf-worker-grid'), stats={};root.querySelectorAll('[data-w]').forEach(x=>stats[x.dataset.w]=x);
    async function refresh(){
      try{
        const r=await fetch('/api/starforge/governance',{cache:'no-store'});if(!r.ok)throw new Error('feed unavailable');
        const data=await r.json(), workers=Array.isArray(data?.workforce?.workers)?data.workforce.workers:[], runs=Array.isArray(data?.activeRuns)?data.activeRuns:[];
        stats.total.textContent=workers.length;stats.working.textContent=workers.filter(w=>w.status==='working').length;stats.idle.textContent=workers.filter(w=>w.status==='idle').length;stats.runs.textContent=runs.length;
        grid.replaceChildren();
        if(!workers.length){const e=document.createElement('div');e.className='sf-empty';e.textContent='No live StarNet workers exposed.';grid.appendChild(e);return;}
        for(const w of workers){
          const card=document.createElement('button');card.type='button';card.className='sf-room-worker';
          const run=w.activeRun, activity=run?.title||run?.task||run?.label||'Awaiting assignment';
          const runId=run?.id||run?.runId||'';
          const startedAt=run?.startedAt||run?.createdAt||'';
          const capabilities=Array.isArray(w.capabilities)?w.capabilities:(Array.isArray(w.skills)?w.skills:[]);
          const performance=w.performance||{};
          const completed=Math.max(0,Number(performance.completed)||0);
          const failed=Math.max(0,Number(performance.failed)||0);
          const blocked=Math.max(0,Number(performance.blocked)||0);
          const taskCount=Math.max(0,Number(performance.taskCount)||0);
          const xp=Math.max(0,(completed*100)-(failed*50)-(blocked*25));
          const level=Math.max(1,Math.floor(xp/500)+1);
          const levelBase=(level-1)*500;
          const levelProgress=Math.max(0,Math.min(100,((xp-levelBase)/500)*100));
          const successRate=Number.isFinite(Number(performance.reliabilityPercent))?Number(performance.reliabilityPercent):(taskCount?Math.round((completed/taskCount)*100):null);
          const recovery=failed>=3||blocked>=2;
          card.innerHTML='<div class="sf-room-avatar">◆</div><div class="sf-room-main"><b>'+esc(w.name||w.id||'Unnamed worker')+'</b><span>'+esc(w.role||'StarNet agent')+' · '+esc(w.model||'model unavailable')+'</span><small>'+esc(activity)+'</small><small>'+esc(runId?'RUN '+runId:'NO ACTIVE RUN')+(startedAt?' · STARTED '+startedAt:'')+'</small><small>'+esc(capabilities.length?capabilities.slice(0,4).join(' · '):'CAPABILITIES NOT REPORTED')+'</small><small>LVL '+level+' · XP '+xp+' · '+(successRate===null?'NO HISTORY':successRate+'% SUCCESS')+'</small><small>✓ '+completed+' · ✕ '+failed+' · ▣ '+blocked+(recovery?' · RECOVERY':'')+'</small><div class="sf-xp-track"><i style="width:'+levelProgress+'%"></i></div></div><span class="sf-room-status '+(w.status==='working'?'working':'idle')+'">'+esc(String(w.status||'unknown').toUpperCase())+'</span><span class="sf-open">OPEN ›</span>';
          card.addEventListener('click',()=>{const agents=Array.isArray(StationUI.present)?StationUI.present:[];const i=agents.findIndex(a=>String(a.id||a.agentId)===String(w.id));if(i>=0&&typeof StationUI.openAgent==='function')StationUI.openAgent(i);});
          grid.appendChild(card);
        }
      }catch(_){stats.total.textContent='—';stats.working.textContent='—';stats.idle.textContent='—';stats.runs.textContent='—';}
    }
    refresh();const timer=setInterval(()=>{if(root.isConnected)refresh();else clearInterval(timer);},1000);
  }
  StationUI.registerWindow('starforge-worker-room','STARFORGE WORKER ROOM',render,{console:true,className:'starforge-worker-room-win'});
  window.StarForgeWorkerRoom=Object.freeze({refreshLabel:'/api/starforge/governance'});
})();