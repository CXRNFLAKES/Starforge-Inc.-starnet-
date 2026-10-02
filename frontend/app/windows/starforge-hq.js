'use strict';
// Economic campaign ceiling: LVL 100 = €10M net operating capital. The live finance bridge will supply the actual balance.
(function(){
  if(typeof document==='undefined'||typeof StationUI==='undefined'||!StationUI.registerWindow)return;
  const esc=StationUI.h.esc;
  const MILESTONES=Object.freeze([[1,0],[5,1000],[10,5000],[20,25000],[30,75000],[40,200000],[50,500000],[60,1000000],[70,2000000],[80,3500000],[90,6000000],[99,9000000],[100,10000000]]);
  function levelForCapital(capital){const n=Number(capital);if(!Number.isFinite(n)||n<0)return null;let level=1;for(const [candidate,threshold] of MILESTONES){if(n>=threshold)level=candidate;else break;}return Math.min(100,level);}
  function nextMilestone(level){return MILESTONES.find(([candidate])=>candidate>level)||null;}
  function statusForAgent(agent){const id=String(agent&&(agent.id||agent.agentId)||'');let running=false;try{running=!!(StationUI.isAgentRunning&&StationUI.isAgentRunning(id));}catch(_){}return running?['WORKING','working']:['IDLE','idle'];}
  function render(body){
    body.innerHTML='';const root=document.createElement('section');root.className='sf-hq';
    root.innerHTML='<div class="sf-hq-head"><div><div class="sf-kicker">STARFORGE HQ</div><h2>COMPANY COMMAND ROOM</h2><p>StarNet workforce · governed by StarForge</p></div><div class="sf-link-state" role="status">STARFORGE LINK · UI BRIDGE</div></div><article class="sf-capital"><div class="sf-section-label">COMPANY LEVEL</div><div class="sf-level-line"><strong class="sf-level">LVL —</strong><span class="sf-capital-value">CAPITAL FEED PENDING</span></div><div class="sf-meter"><i></i></div><div class="sf-next">Finance bridge not connected — no balance is invented.</div></article><div class="sf-leadership"></div><section class="sf-execution"><div class="sf-section-label">STARFORGE EXECUTION FEED</div><div class="sf-execution-stats"><span>IN PROGRESS <b data-sf="in-progress">—</b></span><span>COMPLETED <b data-sf="completed">—</b></span><span>FAILED <b data-sf="failed">—</b></span><span>BLOCKED <b data-sf="blocked">—</b></span></div><div class="sf-recent"></div></section><section class="sf-roster"><div class="sf-section-label">STARNET WORKFORCE</div><div class="sf-roster-meta"></div><div class="sf-workers"></div></section>';
    const leaders=root.querySelector('.sf-leadership');[['CHO','HUMAN OWNER'],['PA','OVERSIGHT'],['CEO','OPERATIONS'],['VICE CEO','STARNET LEAD']].forEach(([n,r])=>{const c=document.createElement('div');c.className='sf-leader';c.innerHTML='<b>'+esc(n)+'</b><span>'+esc(r)+'</span>';leaders.appendChild(c);});
    const meta=root.querySelector('.sf-roster-meta'),workers=root.querySelector('.sf-workers');
    const executionStats={}; root.querySelectorAll('[data-sf]').forEach(el=>executionStats[el.dataset.sf]=el); const recentEl=root.querySelector('.sf-recent');
    const levelEl=root.querySelector('.sf-level'),capitalEl=root.querySelector('.sf-capital-value'),meterEl=root.querySelector('.sf-meter i'),nextEl=root.querySelector('.sf-next');
    async function refreshGovernance(){
      try{
        const response=await fetch('/api/starforge/governance',{cache:'no-store'});
        if(!response.ok) throw new Error('governance feed unavailable');
        const data=await response.json();
        const capital=data&&data.capital;
        const execution=data&&data.execution;
        for(const key of ['in-progress','completed','failed','blocked']) executionStats[key].textContent=Number(execution?.[{ 'in-progress':'inProgress', completed:'completed', failed:'failed', blocked:'blocked' }[key]] ?? 0);
        const recent=Array.isArray(execution?.recentTasks)?execution.recentTasks.slice().reverse():[];
        recentEl.replaceChildren();
        if(!recent.length){recentEl.textContent='No governed StarNet tasks recorded yet.';} else recent.slice(0,5).forEach(task=>{const row=document.createElement('div');row.className='sf-task';row.innerHTML='<b>'+esc(task.title||'Untitled task')+'</b><span>'+esc(String(task.status||'unknown').toUpperCase())+' · '+esc(task.assigneeId||'unassigned')+'</span>';recentEl.appendChild(row);});
        const net=Number(capital&&capital.netOperatingCapital);
        const level=levelForCapital(net);
        if(level===null) throw new Error('governance feed returned invalid capital');
        levelEl.textContent='LVL '+level;
        capitalEl.textContent=new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(net)+' NET OPERATING CAPITAL';
        const next=nextMilestone(level);
        const previous=MILESTONES.find(([,threshold],i)=>MILESTONES[i+1]&&MILESTONES[i+1][0]===level)?.[1] ?? 0;
        const target=next?next[1]:10000000;
        const span=Math.max(1,target-previous);
        const progress=next?Math.max(0,Math.min(100,((net-previous)/span)*100)):100;
        meterEl.style.width=progress+'%';
        nextEl.textContent=next?'NEXT LEVEL · '+new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(next[1])+' · '+new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Math.max(0,next[1]-net))+' TO GO':'MAX LEVEL · €10,000,000+';
      }catch(_){ levelEl.textContent='LVL —'; capitalEl.textContent='CAPITAL FEED PENDING'; meterEl.style.width='0'; nextEl.textContent='Finance bridge unavailable — no balance is invented.'; }
    }
    refreshGovernance();
    function paint(){const agents=Array.isArray(StationUI.present)?StationUI.present:[];const live=agents.map(agent=>({agent,status:statusForAgent(agent)}));const working=live.filter(x=>x.status[1]==='working').length;meta.textContent=agents.length+' WORKER'+(agents.length===1?'':'S')+' · '+working+' WORKING · '+(agents.length-working)+' IDLE';workers.replaceChildren();if(!agents.length){const e=document.createElement('div');e.className='sf-empty';e.textContent='No StarNet workers are currently exposed by the live station roster.';workers.appendChild(e);return;}for(const item of live){const a=item.agent,c=document.createElement('article');c.className='sf-worker';c.innerHTML='<div class="sf-avatar">◆</div><div class="sf-worker-main"><b>'+esc(a.name||a.id||'Unnamed worker')+'</b><span>'+esc(a.role||'StarNet agent')+'</span></div><span class="sf-status '+item.status[1]+'">'+item.status[0]+'</span>';workers.appendChild(c);}}
    paint();const timer=window.setInterval(()=>{if(root.isConnected)paint();else window.clearInterval(timer);},500);body.appendChild(root);
  }
  StationUI.registerWindow('starforge-hq','STARFORGE HQ',render,{console:true,className:'starforge-hq-win'});
  window.StarForgeHQ=Object.freeze({levelForCapital,nextMilestone,milestones:MILESTONES});
})();