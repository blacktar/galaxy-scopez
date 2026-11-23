export const GPRIME_ROLES=[['exposure','Exposure'],['contrast','Contrast'],['balance','Balance'],['saturation','Saturation']];
export const nodeName=node=>node?`${node.node??node.index} · ${node.label||'Unnamed node'}`:'not assigned';
export function gprimePreflight(bindings={}){
 const name=role=>nodeName(bindings[role]);
 const instructions=[
  `Exposure — ${name('exposure')}: set the node’s Gamma to Linear.`,
  `Balance — ${name('balance')}: set the node’s Gamma to Linear.`,
  `Contrast — ${name('contrast')}: set Pivot to 0.336 for this DWG/Intermediate setup; use your intended S-curve setting.`
 ];
 instructions.push(`Sat Gamma and Sat Gain — ${name('saturation')}: set Color Space to HSV, enable only channel 2/S, and disable channels 1/H and 3/V.`);
 const disabled=[...new Map(Object.values(bindings).filter(node=>!node.enabled).map(node=>[node.node,node])).values()];
 if(disabled.length)instructions.push(`Enable these assigned nodes before grading: ${disabled.map(nodeName).join('; ')}.`);
 instructions.push('For native Contrast and saturation controls, keep the clip-level node graph and Primaries wheels active, with Printer Lights OFF.');
 instructions.push('Keep GTap after your output transform so the scopes show the displayed grade.');
 return instructions;
}
export function mountGPrimeBindings({before,call}){
 const box=document.createElement('fieldset');box.className='gprime-bindings';
 box.innerHTML=`<legend>GPrime · node assignments</legend>
 <style>
 .gprime-bindings{min-width:0;flex-basis:100%;width:100%;box-sizing:border-box}.gprime-bindings .gp-fetch{min-height:44px}.gprime-bindings .gp-map{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;margin:18px 0;align-items:stretch}
 .gprime-bindings .gp-control{min-width:0;display:flex;flex-direction:column;align-items:stretch;border:1px solid #444;border-radius:8px;padding:12px;background:#151515}
 .gprime-bindings .gp-title{text-align:center;font-weight:600}.gprime-bindings .gp-art{height:118px;display:grid;place-items:center;margin:12px 0}.gprime-bindings .gp-ribbon{height:96px;width:28px;border:1px solid #888;border-radius:5px;background:linear-gradient(to top,#222,#ddd)}
 .gprime-bindings [data-gp-role="saturation"]{grid-column:span 2}.gprime-bindings .gp-art-pair{display:flex;justify-content:space-evenly;gap:12px}.gprime-bindings .gp-sat-control{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px}
 .gprime-bindings .gp-vector{width:96px;height:96px;color:#aaa}.gprime-bindings .gp-bind-row{display:flex;gap:6px;margin-top:auto;align-items:center}.gprime-bindings .gp-bind-row select{width:100%;min-width:0;flex:1 1 0;min-height:44px}.gprime-bindings .gp-bind-row button{flex:none;min-height:44px;min-width:44px;padding:6px 9px}
 .gprime-bindings .gp-assigned{font-size:12px;overflow-wrap:anywhere;min-height:2.8em;margin:10px 0 0;color:#bbb}.gprime-bindings .gp-status{white-space:pre-wrap;overflow-wrap:anywhere}.gprime-bindings ol{padding-left:24px;line-height:1.6}.gprime-bindings li{margin:8px 0}
 @media(max-width:900px){.gprime-bindings .gp-map{grid-template-columns:repeat(2,minmax(0,1fr))}.gprime-bindings [data-gp-role="balance"]{grid-column:1/-1}}
 @media(max-width:480px){.gprime-bindings .gp-map{grid-template-columns:minmax(0,1fr)}.gprime-bindings [data-gp-role="balance"],.gprime-bindings [data-gp-role="saturation"]{grid-column:auto}}
 </style>
 <button type="button" class="gp-fetch">Fetch nodes from current clip</button>
 <p class="gp-clip">Fetch the current clip, then assign each control below.</p>
 <div class="gp-map"></div><h3>Before grading</h3><ol></ol>
 <p>These assignments do not change your grade. Check the listed settings in Resolve; node processing settings are not verified automatically.</p>
 <p class="gp-status" role="status"></p>`;
 before.before(box);
 window.dispatchEvent(new Event('gprime-settings-mounted'));
 let info=null,bindings={},busy=false;
 const rows=new Map(),fetchButton=box.querySelector('.gp-fetch'),status=box.querySelector('.gp-status');
 const map=box.querySelector('.gp-map');
 function render(){
  for(const [role,row]of rows){
   const assigned=bindings[role];
   row.summary.textContent=assigned?`Bound: ${nodeName(assigned)}${assigned.enabled?'':' (disabled)'}`:'Not bound';
   row.select.disabled=busy||!info?.nodes?.length;
   for(const option of row.select.options){const other=Object.entries(bindings).find(([key,value])=>key!==role&&value.node===Number(option.value));option.disabled=!!other;}
   const conflict=Object.entries(bindings).some(([key,value])=>key!==role&&value.node===Number(row.select.value));
   row.button.disabled=busy||!info?.nodes?.length||!row.select.value||conflict;
  }
  fetchButton.disabled=busy;
  box.querySelector('ol').replaceChildren(...gprimePreflight(bindings).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 }
 for(const [role,title]of GPRIME_ROLES){
  const card=document.createElement('div');card.className='gp-control';card.dataset.gpRole=role;
  card.innerHTML=`<div class="gp-title"></div><div class="gp-art" aria-hidden="true">${role==='balance'?'<svg class="gp-vector" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="currentColor"/><circle cx="50" cy="50" r="23" fill="none" stroke="#555"/><path d="M4 50h92M50 4v92M18 18l64 64M18 82l64-64" fill="none" stroke="#555"/></svg>':'<span class="gp-ribbon"></span>'}</div><div class="gp-bind-row"><select disabled></select><button type="button" disabled>Bind</button></div><p class="gp-assigned"></p>`;
  if(role==='saturation'){const art=card.querySelector('.gp-art');art.classList.add('gp-art-pair');art.innerHTML='<span class="gp-sat-control"><span>Gamma</span><span class="gp-ribbon"></span></span><span class="gp-sat-control"><span>Gain</span><span class="gp-ribbon"></span></span>';}
  card.querySelector('.gp-title').textContent=title;
  const select=card.querySelector('select'),button=card.querySelector('button'),summary=card.querySelector('.gp-assigned');
  select.setAttribute('aria-label',`${title} node`);button.setAttribute('aria-label',`Bind ${title} node`);
  rows.set(role,{select,button,summary});select.addEventListener('change',render);
  button.addEventListener('click',async()=>{
   if(busy||!info)return;busy=true;render();
   try{const result=await call('gprime-bind',{role,node:Number(select.value),nodeLabel:info.nodes.find(node=>node.index===Number(select.value))?.label,nodeCount:info.nodes.length,target:[info.projectId,info.timelineId,info.clipId]});bindings=result.gprimeBindings;window.dispatchEvent(new Event('gprime-bindings-changed'));status.textContent=`${title} bound to ${nodeName(bindings[role])}.`;}
   catch(error){status.textContent=error.message;}
   finally{busy=false;render();}
  });
  map.append(card);
 }
 fetchButton.addEventListener('click',async()=>{
  if(busy)return;busy=true;render();
  try{
   info=await call('inspect');bindings=info.gprimeBindings||{};
   box.querySelector('.gp-clip').textContent=`${info.project} · ${info.clip}`;
   for(const [role,row]of rows){
    row.select.replaceChildren(new Option('Select node…',''),...info.nodes.map(node=>new Option(`${nodeName(node)}${node.enabled?'':' (disabled)'}`,String(node.index))));
    row.select.value=bindings[role]?String(bindings[role].node):'';
   }
   status.textContent='Nodes fetched. To skip manual node setup, apply the default GPrime PowerGrade supplied with the release to your clip, then fetch its nodes here and bind each GPrime control to its corresponding node.';
  }catch(error){info=null;bindings={};status.textContent=error.message;}
  finally{busy=false;render();}
 });
 render();return box;
}
