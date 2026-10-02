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
          card.innerHTML='<div class="sf-room-avatar">◆</div><div class="sf-room-main"><b>'+esc(w.name||w.id||'Unnamed worker')+'</b><span>'+esc(w.role||'StarNet agent')+' · '+esc(w.model||'model unavailable')+'</span><small>'+esc(activity)+'</small></div><span class="sf-room-status '+(w.status==='working'?'working':'idle')+'">'+esc(String(w.status||'unknown').toUpperCase())+'</span><span class="sf-open">OPEN ›</span>';
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