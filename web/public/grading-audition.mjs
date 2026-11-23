import {enqueueGradingRequest} from './grading-request-queue.mjs';
import {mountGPrimeBindings} from './gprime-bindings.mjs';
import {balancePad} from './balance-pad.mjs';
import {exposureRibbon} from './exposure-ribbon.mjs';
import {contrastRibbon} from './contrast-ribbon.mjs';
import {saturationRibbons} from './saturation-ribbons.mjs';
export function mountGradingAudition(){
  const panel=document.createElement('fieldset');
  panel.innerHTML=`<legend>Native grading audition</legend>
  <p>Use your DWG/Intermediate pipeline. Choose a fresh clip node before your output transform, assign its control role below, and keep GTap after the correction.</p>
  <label><input type="checkbox" data-diagnostics> Share audition interface diagnostics with the local server</label>
  <button type="button" data-action="inspect">Fetch nodes from current clip</button>
  <select aria-label="Audition node" disabled></select>
  <label>Control role <select data-role><option value="primary">Primary test controls</option><option value="exposure">Linear exposure</option><option value="balance">Linear colour balance</option><option value="contrast">Native Contrast</option><option value="hsv-saturation">HSV Saturation Gamma / Gain</option></select></label>
  <label data-contrast-node-label hidden>Contrast node index <input data-contrast-node type="number" inputmode="numeric" min="1" max="99" step="1" value="1" disabled style="width:80px;min-height:44px"> <span>Choose the Contrast node by name in the fetched list above. This index matches that list; it is not the node’s position on screen.</span></label>
  <button type="button" data-action="bind" disabled>Bind this node</button>
  <label><input type="checkbox" data-linear> I have set the selected Exposure or Balance node’s Gamma to Linear.</label>
  <p>For Exposure or Balance, use a fresh node with Gamma set to Linear. Node names are unrestricted. The connection cannot verify that setting.</p>
  <label data-hsv-confirm hidden><input type="checkbox" data-hsv> I set this clip node to HSV, enabled only channel 2/S (H and V off), selected Primaries wheels and turned Printer Lights OFF.</label>
  <div data-hsv-ribbons hidden></div>
  <div data-controls></div><div data-ribbon hidden></div><div data-balance hidden></div>
  <div data-contrast hidden><p>In Resolve's <strong>clip-level</strong> graph, manually select your Contrast node with Pivot <strong>0.336</strong>. Keep Printer Lights OFF and this the only node using that Pivot. After initial confirmation, each ribbon drag directly selects the bound node and verifies fresh Pivot feedback before adjusting. The verification button itself does not navigate.</p><button type="button" data-action="contrast-select" disabled>Verify selected Pivot 0.336</button><button type="button" data-action="contrast-confirm" disabled>Clip graph active; Printer Lights OFF; Contrast verified</button><div data-navigation hidden><button type="button" data-action="contrast-nav" data-direction="first" disabled>Test: first node</button><button type="button" data-action="contrast-nav" data-direction="next" disabled>Test: next node</button><button type="button" data-action="contrast-nav" data-direction="previous" disabled>Test: previous node</button></div><div data-contrast-ribbon></div></div>
  <button type="button" data-action="read" disabled>Read back</button>
  <button type="button" data-action="restore" disabled>Restore starting grade</button>
  <button type="button" data-action="release" disabled>Release controls</button>
  <p role="status" style="white-space:pre-wrap;overflow-wrap:anywhere">Audition is disconnected.</p>
  <p>These controls test native CDL values in the node's current processing space. The exposure ribbon applies equal RGB gain in a separately configured Linear node. Compare its result with HDR Global Exposure; equivalence is not yet verified.</p>`;
  const debug=document.createElement('details');
  const summary=document.createElement('summary');summary.textContent='Debug · individual control auditions';debug.append(summary,panel);
  document.getElementById('settingsfiles').after(debug);
  const status=panel.querySelector('[role="status"]'),select=panel.querySelector('select[aria-label="Audition node"]');
  const contrastNode=panel.querySelector('[data-contrast-node]'),roleSelect=panel.querySelector('[data-role]');
  function syncContrastNode(){contrastNode.value=select.value||'';}
  roleSelect.addEventListener('change',()=>{setMode(roleSelect.value);panel.querySelector('[data-contrast-node-label]').hidden=roleSelect.value!=='contrast';syncContrastNode();});
  select.addEventListener('change',syncContrastNode);
  contrastNode.addEventListener('input',()=>{
    const number=Number(contrastNode.value),option=[...select.options].find(o=>Number(o.value)===number);
    contrastNode.setCustomValidity(Number.isInteger(number)&&option?'':'Choose a node number from the fetched clip.');
    if(option)select.value=option.value;
  });
  const limits={slope:[.8,1.2,1],offset:[-.05,.05,0],power:[.8,1.2,1],saturation:[.5,1.5,1],red:[.8,1.2,1]};
  const labels={slope:'Master slope',offset:'Master offset',power:'Master power',saturation:'Saturation',red:'Red slope multiplier'};
  const sliders={};
  for(const [key,[min,max,value]] of Object.entries(limits)){
    const label=document.createElement('label');
    label.style.cssText='display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0';
    label.textContent=labels[key];
    const input=document.createElement('input');
    input.type='range';input.min=min;input.max=max;input.step=.001;input.value=value;input.disabled=true;
    input.style.cssText='width:min(100%,320px);min-height:44px';
    const output=document.createElement('output');output.value=String(value);
    input.addEventListener('input',()=>{output.value=input.value;if(bound){queued=values();void pump();}});
    label.append(input,output);
    panel.querySelector('[data-controls]').append(label);
    sliders[key]=input;
  }
  const sessionKey='gs-grading-audition-token';
  let savedToken=null;
  try{savedToken=sessionStorage.getItem(sessionKey);}catch{}
  let mode='primary';
  const ribbon=exposureRibbon(()=>{if(bound&&mode==='exposure'){queued=values();void pump();}});
  panel.querySelector('[data-ribbon]').append(ribbon.box);
  const balance=balancePad(()=>{if(bound&&mode==='balance'){queued=values();void pump();}});
  panel.querySelector('[data-balance]').append(balance.box);
  const contrast=contrastRibbon({
    async begin(){if(busy||!bound||mode!=='contrast')throw Error('Wait for the current command.');busy=true;try{const result=await call('contrast-begin');show(result);return result.gesture;}catch(e){busy=false;throw e;}},
    async move(position,gesture){show(await call('set',{values:{position},gesture}));},
    async end(gesture){try{show(await call('contrast-end',{gesture}));}finally{busy=false;}},
    error(error){busy=false;enable(false);if(token){panel.querySelector('[data-action="read"]').disabled=false;panel.querySelector('[data-action="contrast-select"]').disabled=false;}status.textContent=error.message;}
  });
  panel.querySelector('[data-contrast-ribbon]').append(contrast.box);
  const saturation=saturationRibbons({
    async begin(){if(busy||!bound||mode!=='hsv-saturation')throw Error('Wait for the current command.');busy=true;try{return await call('hsv-begin');}catch(e){busy=false;throw e;}},
    async move(positions,gesture){return await call('set',{values:positions,gesture});},
    async end(gesture){try{return await call('hsv-end',{gesture});}finally{busy=false;}},
    report(result){show(result);},
    error(error){busy=false;enable(false);if(token)panel.querySelector('[data-action="read"]').disabled=false;status.textContent=error.message;}
  });
  panel.querySelector('[data-hsv-ribbons]').append(saturation.box);
  function setMode(value){mode=value;panel.querySelector('[data-hsv-confirm]').hidden=mode!=='hsv-saturation';panel.querySelector('[data-hsv-ribbons]').hidden=mode!=='hsv-saturation';panel.querySelector('[data-controls]').hidden=mode!=='primary';panel.querySelector('[data-balance]').hidden=mode!=='balance';panel.querySelector('[data-ribbon]').hidden=mode!=='exposure';panel.querySelector('[data-contrast]').hidden=mode!=='contrast';}
  let token=savedToken,info=null,bound=false,busy=false,queued=null,lastSent=0;
  function rememberToken(value){
    token=value;
    try{if(value)sessionStorage.setItem(sessionKey,value);else sessionStorage.removeItem(sessionKey);}catch{}
  }
  if(token){
    panel.querySelector('[data-action="read"]').disabled=false;
    panel.querySelector('[data-action="release"]').disabled=false;
    status.textContent='Previous session found. Tap Read back to reconnect without changing the grade.';
  }
  const values=()=>mode==='balance'?balance.value:mode==='exposure'?{exposure:ribbon.value}:Object.fromEntries(Object.entries(sliders).map(([key,input])=>[key,Number(input.value)]));
  function enable(value){
    bound=value;
    roleSelect.disabled=value;
    contrastNode.disabled=value||!info?.nodes?.length;
    ribbon.enable(value&&mode==='exposure');
    balance.enable(value&&mode==='balance');
    saturation.enable(value&&mode==='hsv-saturation');
    contrast.enable(false);
    for(const input of Object.values(sliders))input.disabled=!value;
    for(const action of ['read','restore'])panel.querySelector(`[data-action="${action}"]`).disabled=!value;
    if(['contrast','hsv-saturation'].includes(mode))panel.querySelector('[data-action="restore"]').disabled=true;
    panel.querySelector('[data-action="contrast-select"]').disabled=!value||mode!=='contrast';
    panel.querySelector('[data-action="contrast-confirm"]').disabled=true;
    for(const button of panel.querySelectorAll('[data-navigation] button'))button.disabled=!value||mode!=='contrast';
  }
  async function call(action,extra={}){
   return enqueueGradingRequest(async()=>{
    try{token=sessionStorage.getItem(sessionKey)||token;}catch{}
    const response=await fetch('/api/grade-audition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...extra})});
    if(response.status===404)throw Error('Start the GS grading audition server with the supplied command script.');
    const data=await response.json();
    if(!data.ok)throw Error(data.error);
    if(data.token)rememberToken(data.token);
    return data.result;
   });
  }
  function show(result){
    status.textContent=JSON.stringify(result,null,2);
  }
  async function pump(){
    if(busy||!bound||!queued)return;
    busy=true;
    try{
      while(queued&&bound){
        const wait=Math.max(0,50-(performance.now()-lastSent));
        if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
        const next=queued;queued=null;lastSent=performance.now();
        show(await call('set',{values:next}));
      }
    }catch(error){queued=null;enable(false);status.textContent=error.message;}
    finally{busy=false;}
  }
  panel.addEventListener('click',async event=>{
    const action=event.target.dataset.action;
    if(!action)return;
    if(busy){status.textContent='Wait for the current correction to finish.';return;}
    busy=true;
    try{
      if(action==='inspect'){
        info=await call('inspect');show(info);
        select.replaceChildren(...info.nodes.map(n=>new Option(n.index+' · '+(n.label||'Unnamed node')+(n.enabled?'':' (disabled)'),String(n.index))));
        select.disabled=!select.options.length;
        syncContrastNode();contrastNode.disabled=select.disabled||bound;
        panel.querySelector('[data-action="bind"]').disabled=select.disabled||bound;
        panel.querySelector('[data-action="release"]').disabled=false;
      }else if(action==='bind'){
        const nextMode=panel.querySelector('[data-role]').value;
        const node=Number(nextMode==='contrast'?contrastNode.value:select.value);
        if(nextMode==='contrast'&&(!Number.isInteger(node)||node<1||node>99||!info.nodes.some(n=>n.index===node)))throw Error('Choose a Contrast node number from the fetched clip (1–99).');
        const result=await call('bind',{node,mode:nextMode,linearConfirmed:panel.querySelector('[data-linear]').checked,hsvConfirmed:panel.querySelector('[data-hsv]').checked,printerLightsOff:panel.querySelector('[data-hsv]').checked,target:[info.projectId,info.timelineId,info.clipId]});show(result);
        setMode(nextMode);ribbon.set(0);balance.set({x:0,y:0});
        enable(true);
        panel.querySelector('[data-action="bind"]').disabled=true;
        select.disabled=true;
        if(mode==='hsv-saturation'){saturation.set(result.positions);status.textContent+='\nDrag either HSV ribbon or both. Check native Gamma/Gain and confirm only saturation changes.';}
        if(mode==='contrast'){contrast.set(result.relativeUnits||0);status.textContent+='\nNext: manually select Contrast in Resolve, then Verify selected Pivot 0.336.';}
      }else if(action==='contrast-nav'){
        contrast.enable(false);panel.querySelector('[data-action="contrast-confirm"]').disabled=true;
        show(await call(action,{direction:event.target.dataset.direction}));
      }else if(action==='contrast-select'){
        contrast.enable(false);show(await call(action));enable(true);
        panel.querySelector('[data-action="contrast-confirm"]').disabled=false;
      }else if(action==='contrast-confirm'){
        show(await call(action,{clipNodeConfirmed:true,uniquePivotConfirmed:true,printerLightsOff:true}));contrast.enable(true);
        panel.querySelector('[data-action="contrast-confirm"]').disabled=true;
      }else{
        queued=null;
        const result=await call(action);
        show(result);
        if(action==='read'){
          setMode(result.mode||'primary');
          roleSelect.value=mode;panel.querySelector('[data-contrast-node-label]').hidden=mode!=='contrast';
          if(mode==='hsv-saturation'){saturation.set(result.positions);saturation.readback(result);enable(true);}
          else if(mode==='contrast'){
            contrastNode.value=result.node;
            contrast.set(result.relativeUnits||0);show(result);enable(true);
            // Always require a fresh visible targeting check after reconnect.
            status.textContent+='\nManually select Contrast in Resolve, then verify Pivot 0.336 before dragging.';
          }else{
          const slope=result.cdl.Slope.trim().split(/\s+/).map(Number);
          const state={slope:slope[1],red:slope[0]/slope[1],offset:Number(result.cdl.Offset.trim().split(/\s+/)[0]),power:Number(result.cdl.Power.trim().split(/\s+/)[0]),saturation:result.cdl.Saturation};
          for(const [key,input]of Object.entries(sliders)){input.value=state[key];input.nextElementSibling.value=input.value;}
          if(mode==='exposure')ribbon.set(Math.log2(slope[1]));
          if(mode==='balance')balance.set({x:(slope[2]-1)/1.8556,y:(slope[0]-1)/1.5748});
          show(result);enable(true);
          }
        }
        if(action==='restore'){
          balance.set({x:0,y:0});
          ribbon.set(0);
          for(const [key,input]of Object.entries(sliders)){
            input.value=limits[key][2];
            input.nextElementSibling.value=input.value;
          }
        }
        if(action==='release'){
          rememberToken(null);info=null;enable(false);
          panel.querySelector('[data-action="bind"]').disabled=true;
          panel.querySelector('[data-action="release"]').disabled=true;
          select.disabled=true;
          contrastNode.disabled=true;
        }
      }
    }catch(error){enable(false);if(mode==='contrast'&&token){panel.querySelector('[data-action="read"]').disabled=false;panel.querySelector('[data-action="contrast-select"]').disabled=false;}status.textContent=error.message;}
    finally{busy=false;}
  });
  const diagnostics=panel.querySelector('[data-diagnostics]');
  let diagnosticClient=(globalThis.crypto?.randomUUID?.()||'ipad-'+Date.now()+'-'+Math.random().toString(36).slice(2)),diagnosticTimer=null;
  try{diagnosticClient=sessionStorage.getItem('gs-audition-diagnostic-client')||diagnosticClient;sessionStorage.setItem('gs-audition-diagnostic-client',diagnosticClient);diagnostics.checked=sessionStorage.getItem('gs-audition-diagnostics')==='on';}catch{}
  function reportDiagnostics(){
    clearTimeout(diagnosticTimer);
    if(!diagnostics.checked)return;
    diagnosticTimer=setTimeout(()=>{
      const diagnostic={client:diagnosticClient,status:status.textContent.slice(0,900),selectedNode:select.selectedOptions[0]?.textContent||'',visibility:document.visibilityState,bound,busy,mode,disabled:[...panel.querySelectorAll('button:disabled')].map(b=>b.dataset.action),width:innerWidth,height:innerHeight};
      fetch('/api/grade-audition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'client-diagnostics',diagnostic}),keepalive:true}).catch(()=>{});
    },300);
  }
  diagnostics.addEventListener('change',()=>{
    try{sessionStorage.setItem('gs-audition-diagnostics',diagnostics.checked?'on':'off');}catch{}
    if(diagnostics.checked)reportDiagnostics();else{
      clearTimeout(diagnosticTimer);
      fetch('/api/grade-audition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'client-diagnostics',diagnostic:{client:diagnosticClient,off:true}})}).catch(()=>{});
    }
  });
  new MutationObserver(reportDiagnostics).observe(panel,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled']});
  select.addEventListener('change',reportDiagnostics);
  document.addEventListener('visibilitychange',reportDiagnostics);
  reportDiagnostics();
  mountGPrimeBindings({before:debug,call});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){queued=null;enable(false);if(token){panel.querySelector('[data-action="read"]').disabled=false;status.textContent='Controls paused while Safari was in the background. Tap Read back to resume.';}}});
}
