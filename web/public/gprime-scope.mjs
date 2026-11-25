import {bindHoldReset} from './hold-reset.mjs';
import {mountWaveformBackdrop} from './gprime-waveform.mjs';
import {bindBalanceGestures} from './gprime-balance.mjs';
import {mountHeroScrub} from './gprime-scrub.mjs';
import {enqueueGradingRequest,missingGPrimeRoles} from './grading-request-queue.mjs';
import {balanceAtDrag} from './balance-pad.mjs';
import {saturationRibbons} from './saturation-ribbons.mjs';
const SESSION_KEY='gs-grading-audition-token';
export async function gprimeCall(action,extra={}){
 const send=async()=>{
 let token;try{token=sessionStorage.getItem(SESSION_KEY);}catch{}
 const response=await fetch('/api/grade-audition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...extra})});
 if(response.status===404)throw Error('Start the Galaxy Scopez grading host to connect GPrime.');
 const data=await response.json();if(!data.ok)throw Error(data.error||'GPrime is unavailable.');
 if(data.token)try{sessionStorage.setItem(SESSION_KEY,data.token);}catch{}
 return data.result;
 };
 return action==='client-diagnostics'?send():enqueueGradingRequest(send);
}
export function mountGPrimeScope({card,openSettings,captureBackground,onBalanceViewChange=()=>{},onInteract=()=>{}}){
 card.addEventListener('pointerdown',event=>{if(event.target.closest?.('.gp-surface,.gp-shortcuts,.gp-hero'))onInteract();},{capture:true,passive:true});
 card.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter'].includes(event.key)&&event.target.closest?.('.gp-surface,.gp-shortcuts,.gp-hero'))onInteract();},{capture:true});
 card.classList.add('gprime-scope');card.querySelector('.unit').textContent='';
 card.querySelector('.ticks').hidden=true;card.querySelector('.xaxis').hidden=true;
 const plot=card.querySelector('.scopeplot');plot.classList.add('gp-live-plot');plot.setAttribute('aria-label','Live vectorscope · drag to adjust Balance');plot.style.touchAction='none';
 const waveform=mountWaveformBackdrop(card);let waveformOn=false;try{waveformOn=localStorage.getItem('gprime-waveform')==='true';}catch{}
 const surface=document.createElement('div');surface.className='gp-surface';
 const bar=document.createElement('div');bar.className='gp-top';bar.innerHTML='<button type="button" data-setup>Node assignments</button><span role="status">Assign nodes in Settings to enable their controls.</span>';
 const style=document.createElement('style');style.textContent=`
 .gprime-scope .ticks{display:none!important}.gprime-scope .gp-unbound canvas{visibility:hidden!important}.gprime-scope .gp-live-plot>span[hidden]{display:none!important}
 #scopes.gprime-only{min-height:var(--gp-viewport-space,0px)}.gprime-scope{min-width:0;overflow:auto!important}.gprime-scope>.scopeplot,.gprime-scope>.xaxis{display:none}
 .gprime-scope .gp-top{display:flex;gap:8px;align-items:center;padding:4px 12px;flex-wrap:wrap}.gprime-scope .gp-top button{min-height:36px}.gprime-scope [role=status]{font-size:11px;overflow-wrap:anywhere}
 .gprime-scope .gp-surface{display:grid;grid-template-columns:minmax(105px,1fr) minmax(105px,1fr) minmax(260px,3.2fr) minmax(210px,2fr);gap:16px;align-items:stretch;flex:0 0 auto;min-height:320px;height:min(460px,max(320px,calc(var(--gp-viewport-space,700px) - 210px)));padding:8px 16px 4px;box-sizing:border-box;order:1}
 .gprime-scope .gp-primary{display:grid;grid-template-columns:minmax(44px,1fr) 44px;grid-template-rows:32px minmax(0,1fr);gap:8px;min-width:0}.gprime-scope .gp-primary>strong{grid-column:1/-1;text-align:center;font-size:17px;font-weight:500}
 .gprime-scope .gp-touch{grid-column:1;grid-row:2;width:100%;height:100%;min-height:240px;background:linear-gradient(to top,#080808,#f4f4f4);border:1px solid #777;border-radius:0;touch-action:none;user-select:none;box-sizing:border-box}
 .gprime-scope .gp-gain{font-size:11px;line-height:1.3;white-space:pre-line;text-align:center;overflow-wrap:anywhere}.gprime-scope .gp-primary>.gp-gain{grid-column:1/-1;grid-row:3;align-self:start}
 .gprime-scope .gp-sensitivity{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px;grid-column:2;grid-row:2;padding-bottom:0}.gprime-scope .gp-sensitivity output{order:0;font-size:14px;margin-bottom:8px}.gprime-scope .gp-sensitivity button{width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border-radius:0;font-size:22px}.gprime-scope .gp-sensitivity button:last-child{order:1}.gprime-scope .gp-sensitivity button:first-child{order:2}
 .gprime-scope .gp-balance{position:relative;min-width:0;display:grid;grid-template-columns:44px minmax(0,1fr) 44px;grid-template-rows:32px minmax(0,1fr);gap:8px;align-items:center}.gprime-scope .gp-balance>strong{grid-column:1/-1;text-align:center;font-size:17px;font-weight:500}.scopes-page #scopes .gprime-scope .gp-live-plot{grid-column:1/-1;grid-row:2;display:block!important;position:relative;padding:0!important;width:100%;aspect-ratio:auto;max-height:none;height:100%!important;min-height:0;justify-self:center;overflow:visible!important;touch-action:none;align-self:center}.gprime-scope .gp-live-plot canvas{width:100%;height:100%;position:absolute;inset:0}.gprime-scope .gp-balance>.gp-gain{grid-column:2;grid-row:3}.gprime-scope .gp-balance>.gp-sensitivity{grid-column:3;grid-row:2;flex-direction:column;justify-content:flex-end;pointer-events:none}.gprime-scope .gp-balance>.gp-sensitivity>*{pointer-events:auto}.gprime-scope .gp-balance>.gp-sensitivity output{position:static;transform:none;margin:0 0 8px}.gprime-scope .gp-balance>.gp-sensitivity button:last-child{order:0}.gprime-scope .gp-balance>.gp-sensitivity button:first-child{order:2}
 .gprime-scope .gp-saturation{min-width:0}.gprime-scope .gp-saturation>div{height:100%}.gprime-scope .gp-saturation>div>p{display:none}.gprime-scope .gp-saturation [data-pair]{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px!important;height:100%;flex-wrap:nowrap!important}.gprime-scope .gp-saturation [data-pair]>div{display:grid!important;grid-template-columns:minmax(44px,1fr) 44px;grid-template-rows:32px minmax(0,1fr);gap:8px;min-width:0;max-width:none!important}.gprime-scope .gp-saturation strong{grid-column:1/-1;text-align:center;font-size:17px;font-weight:500;white-space:nowrap}.gprime-scope .gp-saturation [role=slider]{grid-column:1;grid-row:2;width:100%!important;height:100%!important;min-height:240px;margin:0!important;border-radius:0!important;background:linear-gradient(to top,#080808,#f4f4f4)!important;box-sizing:border-box}.gprime-scope .gp-saturation output{grid-column:1/-1;grid-row:3;text-align:center;font-size:14px}.gprime-scope .gp-saturation [data-pair]>div>div:last-child{grid-column:2;grid-row:2;flex-direction:column;justify-content:flex-end;margin:0!important;gap:8px!important}.gprime-scope .gp-saturation [data-sensitivity]{order:0;margin-bottom:8px;font-size:14px}.gprime-scope .gp-saturation button{width:44px;height:44px;min-width:44px!important;padding:0;font-size:22px;border-radius:0}.gprime-scope .gp-saturation [data-plus]{order:1}.gprime-scope .gp-saturation [data-minus]{order:2}
 @media(max-width:800px) and (orientation:portrait){.gprime-scope .gp-surface{grid-template-columns:repeat(2,minmax(0,1fr));min-height:1000px;height:auto}.gprime-scope .gp-balance{grid-column:1/-1;grid-row:2;min-height:340px}.gprime-scope .gp-live-plot{max-width:360px;justify-self:center}.gprime-scope .gp-saturation{grid-column:1/-1;min-height:320px}}
 @media(max-height:600px) and (orientation:landscape){.gprime-scope .gp-surface{gap:8px;padding:8px;min-height:280px;grid-template-columns:minmax(88px,1fr) minmax(88px,1fr) minmax(180px,3.2fr) minmax(176px,2fr)}.gprime-scope .gp-touch,.gprime-scope .gp-saturation [role=slider]{min-height:180px}.gprime-scope .gp-primary>strong,.gprime-scope .gp-balance>strong,.gprime-scope .gp-saturation strong{font-size:14px}}

 .gprime-scope .gp-surface{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none}.gprime-scope .gp-surface *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}.gprime-scope .gp-touch,.gprime-scope .gp-saturation [role=slider]{background:linear-gradient(to top,rgba(8,8,8,.2348125),rgba(244,244,244,.2348125))!important;border:1px solid rgba(40,40,40,.5)!important;box-shadow:none!important;outline:none}.gprime-scope .gp-primary>strong,.gprime-scope .gp-saturation strong{grid-column:1!important;justify-self:center;width:100%;text-align:center;white-space:nowrap}

 .gprime-scope .gp-sensitivity button,.gprime-scope .gp-saturation [data-plus],.gprime-scope .gp-saturation [data-minus]{background:transparent!important;border:1px solid #3c3c3c!important;color:#3c3c3c!important;box-shadow:none!important}

 .gprime-scope .gp-sensitivity .gp-undo,.gprime-scope .gp-saturation .gp-undo{order:-1!important;margin-bottom:auto;background:transparent!important;border:1px solid #3c3c3c!important;color:#3c3c3c!important;font-size:25px}.gprime-scope .gp-balance .gp-sensitivity .gp-undo{position:absolute;right:0;top:40px;transform:none;margin:0;z-index:3}

 .gprime-scope,.gprime-scope .gp-surface{overscroll-behavior:none}.gprime-scope .gp-touch,.gprime-scope .gp-live-plot,.gprime-scope .gp-saturation [role=slider]{touch-action:none;-webkit-user-drag:none}

 .gprime-scope .gp-primary .gp-sensitivity [data-plus]{order:1!important}.gprime-scope .gp-primary .gp-sensitivity [data-minus]{order:2!important}.gprime-scope .gp-primary .gp-sensitivity output{order:0!important}.gprime-scope .gp-balance .gp-sensitivity [data-plus]{order:1!important}.gprime-scope .gp-balance .gp-sensitivity [data-minus]{order:2!important}.gprime-scope .gp-balance .gp-sensitivity output{left:auto;right:0;width:44px;text-align:center}

 .gprime-scope .gp-balance>.gp-sensitivity{grid-row:2;align-self:stretch;margin-bottom:0;z-index:5}.gprime-scope .gp-balance>.gp-live-plot{z-index:auto;background:transparent!important}

 .gprime-scope .gp-top[hidden]{display:none!important}

 .gprime-scope{position:relative;isolation:isolate}.gprime-scope>.gp-background{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.25;pointer-events:none;z-index:-2}.gprime-scope>.gp-background[hidden]{display:none}.gprime-scope .gp-live-plot canvas{mix-blend-mode:normal;background:transparent!important;pointer-events:none}

 .gprime-scope .gp-assignment-prompt{color:#ff6060;text-align:center;font-size:13px;padding:8px 12px;order:0;width:100%;flex:none}.gprime-scope .gp-assignment-prompt[hidden]{display:none!important}

 .gprime-scope .gp-shortcuts{order:3;display:grid;grid-template-columns:1fr 1fr auto auto auto 1fr 1fr;gap:12px;padding:4px 16px 8px;flex:none}.gprime-scope .gp-shortcuts button{min-height:44px;min-width:0;padding:10px 8px;white-space:normal;border-color:#3c3c3c;color:#999;background:transparent}.gprime-scope .gp-shortcuts button:first-child{text-align:left}.gprime-scope .gp-shortcuts button:last-child{text-align:right}@media(max-width:600px){.gprime-scope .gp-shortcuts{gap:6px;padding:8px}.gprime-scope .gp-shortcuts button{font-size:11px}}

 .gprime-scope .gp-connection-status[data-error=true]{color:#ff6060!important}.gprime-scope .gp-connection-status:empty{display:none!important}

 .gprime-scope .gp-readouts{order:2;display:grid;grid-template-columns:minmax(105px,1fr) minmax(105px,1fr) minmax(260px,3.2fr) minmax(210px,2fr);gap:16px;padding:4px 16px 8px;flex:none;align-items:start}.gprime-scope .gp-readouts output{display:block;font-size:11px;line-height:1.3;text-align:center;white-space:pre-line;overflow-wrap:anywhere;min-width:0}.gprime-scope .gp-sat-readouts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
 @media(max-height:600px) and (orientation:landscape){.gprime-scope .gp-readouts{grid-template-columns:minmax(88px,1fr) minmax(88px,1fr) minmax(180px,3.2fr) minmax(176px,2fr);gap:8px;padding:4px 8px}}
 @media(max-width:800px) and (orientation:portrait){.gprime-scope .gp-readouts{grid-template-columns:repeat(2,minmax(0,1fr))}}
 .gprime-scope .gp-shortcuts [data-operation=fullscreen][aria-pressed=true]{background:#2b2b2b;color:#ddd;border-color:#777}

 .gprime-scope .gp-balance .gp-sensitivity .gp-balance-view{position:absolute;left:0;right:auto;top:40px;transform:none;margin:0;z-index:6;background:transparent!important;border:1px solid #3c3c3c!important;color:#3c3c3c!important;width:44px;height:44px;padding:8px;display:grid;place-items:center}.gp-balance-view svg{width:24px;height:26px;fill:none;stroke:currentColor;stroke-width:1.5;pointer-events:none}
 .scopes-page #scopes .gprime-scope .gp-live-plot.gp-double-d{height:auto!important;aspect-ratio:2;max-height:100%;align-self:center}
 /* DoubleD nominal diamonds occupy 80% of the raster; fill the Balance width. */
 .scopes-page #scopes .gprime-scope .gp-double-d>canvas,.scopes-page #scopes .gprime-scope .gp-double-d>svg{scale:1.25;transform-origin:center center}
 .gprime-scope>.gp-waveform-background{position:absolute;inset:var(--gp-wave-top,80px) 0 12px;width:100%;height:calc(100% - var(--gp-wave-top,80px) - 12px);opacity:.25;pointer-events:none;z-index:-1;background:transparent}.gprime-scope>.gp-waveform-background[hidden]{display:none}
 .gprime-scope .gp-primary>.gp-sensitivity{position:relative}.gprime-scope .gp-sensitivity .gp-waveform-toggle{position:absolute;right:0;top:112px;color:#3c3c3c!important}.gp-waveform-toggle svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.5;pointer-events:none}.gprime-scope .gp-sensitivity .gp-waveform-toggle[aria-pressed=true]{color:#3c3c3c!important;border-color:#777!important;background:rgba(90,90,90,.2)!important}
 .gprime-scope>.gp-waveform-guides{position:absolute;inset:var(--gp-wave-top,80px) 0 12px;pointer-events:none;z-index:-1;opacity:.10}.gprime-scope>.gp-waveform-guides[hidden]{display:none}.gp-waveform-guides>i{position:absolute;left:0;right:0;height:2px;background:#ddd;transform:translateY(-1px)}.gp-waveform-guides>i[hidden]{display:none}
 .gprime-scope .gp-sensitivity .gp-reset,.gprime-scope .gp-saturation .gp-reset{position:absolute;right:0;top:56px;order:0!important;margin:0;padding:8px;color:#3c3c3c!important;background:transparent!important;border:1px solid #3c3c3c!important;overflow:hidden;touch-action:none;isolation:isolate}
 .gprime-scope .gp-saturation [data-pair]>div>div:last-child{position:relative}
 .gprime-scope .gp-balance .gp-sensitivity .gp-reset{top:96px;z-index:6}
 .gp-reset::before{content:'';position:absolute;inset:0;background:rgba(255,255,255,.8);transform:scaleX(var(--hold-progress,0));transform-origin:left center;z-index:-1;pointer-events:none}.gp-reset svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.5;pointer-events:none}
 .gprime-scope .gp-hero{opacity:.5}
 .gprime-scope .gp-pair-labels{position:absolute;left:0;right:0;top:-24px;display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:center;font-size:10px;color:#999;pointer-events:none}.gprime-scope .gp-pair-labels[hidden]{display:none!important}
 `;
 card.append(style,bar,surface);
 // Safari can begin a viewport/pull-down gesture despite pointer touch-action.
 // Cancel native touch moves locally; pointer events drive ribbons and both Balance views.
 let lastControlTouch=null,lastPointerCancel=null;
 const recordTouch=event=>{const t=event.touches?.[0]??event.changedTouches?.[0];lastControlTouch={type:event.type,at:Date.now(),x:t?.clientX,y:t?.clientY,touches:event.touches?.length,cancelable:event.cancelable,prevented:event.defaultPrevented};};
 // Claim custom drag surfaces from the initial touch. Leave buttons to normal taps.
 surface.addEventListener('touchstart',event=>{if(event.target.closest?.('.gp-touch,.gp-live-plot,.gp-saturation [role=slider]')&&!event.target.closest?.('button')){if(event.cancelable)event.preventDefault();recordTouch(event);}},{passive:false,capture:true});
 surface.addEventListener('touchmove',event=>{if(event.cancelable)event.preventDefault();recordTouch(event);},{passive:false,capture:true});
 surface.addEventListener('pointercancel',event=>{lastPointerCancel={at:Date.now(),pointerType:event.pointerType,x:event.clientX,y:event.clientY};},true);
 let wasFullscreen=!!document.fullscreenElement;
 document.addEventListener('fullscreenchange',()=>{const full=!!document.fullscreenElement;if(wasFullscreen&&!full&&visible)void gprimeCall('client-diagnostics',{diagnostic:{client:'gprime-fullscreen-exit',mode:'gprime-touch',status:JSON.stringify({activeRole,lastControlTouch,lastPointerCancel,viewport:{width:innerWidth,height:innerHeight}}),visibility:document.visibilityState,width:innerWidth,height:innerHeight}}).catch(()=>{});wasFullscreen=full;});
 surface.addEventListener('contextmenu',event=>event.preventDefault());
 surface.addEventListener('selectstart',event=>event.preventDefault());
 surface.addEventListener('dragstart',event=>event.preventDefault());
 for(const type of ['gesturestart','gesturechange','gestureend'])surface.addEventListener(type,event=>event.preventDefault(),{passive:false});
 const status=bar.querySelector('[role=status]');
 status.className='gp-connection-status';status.style.cssText='font-size:12px;text-align:center;padding:6px 12px;overflow-wrap:anywhere;color:#aaa';
 bar.before(status);
 function showError(error){status.dataset.error='true';status.textContent=error.message;}
 status.hidden=true;
 const assignmentPrompt=document.createElement('div');assignmentPrompt.className='gp-assignment-prompt';assignmentPrompt.textContent='Assign the four GPrime nodes for this clip in settings first.';bar.before(assignmentPrompt);
 let hasTrace=false,ready=false,panelReady=false,bindings={},activeRole=null,retry=null,attempts=0,visible=false,preparing=false;
 const unbound=document.createElement("span");unbound.textContent="Assign a Balance node in Settings";unbound.style.cssText="position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#999;font-size:13px;white-space:pre-line;pointer-events:none";plot.append(unbound);
 let balanceMode='vector';try{if(localStorage.getItem('gprime-balance-view')==='doubled')balanceMode='doubled';}catch{}
 const controls=new Map();
 function report(result){
  if(result.cdl&&result.role){const rgb=result.cdl.Slope.trim().split(/\s+/).map(Number);controls.get(result.role).out.value='Gain RGB\n'+rgb.map(v=>v.toFixed(3)).join(' / ');}
  if(result.native?.contrast!==undefined&&result.native?.contrast!==null){controls.get('contrast').out.value=Number(result.native.contrast).toFixed(3)+'\nPivot '+Number(result.native.pivot).toFixed(3);}
 }
 function enabled(){
  bar.querySelector('[data-setup]').hidden=ready&&['exposure','contrast','balance','saturation'].every(role=>bindings[role]?.enabled);
  bar.hidden=bar.querySelector('[data-setup]').hidden;
  const allAssigned=missingGPrimeRoles(bindings).length===0;
  assignmentPrompt.hidden=allAssigned;
  if(!allAssigned&&status.textContent==='Assign the four GPrime nodes for this clip in Settings first.')status.textContent='';
  const balanceBound=ready&&!!bindings.balance?.enabled;
  plot.classList.toggle("gp-unbound",!balanceBound);unbound.hidden=balanceBound&&hasTrace;unbound.textContent=balanceBound?(document.body.classList.contains('standalone-app')?'Waiting for Resolve data.\nTouch a grading control to start listening, then scrub or play the clip in Resolve if needed.':'Waiting for Resolve data.\nStart listening or go fullscreen, then scrub or play the clip in Resolve to show the Balance trace.'):'Assign a Balance node in Settings';
  for(const [role,{pad}]of controls){const available=ready&&bindings[role]?.enabled&&(role!=='contrast'||panelReady),value=available&&(!activeRole||activeRole===role);pad.setAttribute('aria-disabled',String(!value));pad.style.opacity=available?'1':'.4';}
  const saturationAvailable=!!(ready&&panelReady&&bindings.saturation?.enabled);
  sat.enable(saturationAvailable&&(!activeRole||activeRole==='saturation'),saturationAvailable);
 }
 function fail(error){ready=false;activeRole=null;showError(error);enabled();}
 function sensitivity(wrap,role){
  let value=1;try{value=Number(localStorage.getItem('gprime-sensitivity-'+role))||1;}catch{}
  const row=document.createElement('div');row.className='gp-sensitivity';row.innerHTML='<button type="button" data-minus aria-label="Decrease sensitivity">−</button><output></output><button type="button" data-plus aria-label="Increase sensitivity">+</button>';
  const out=row.querySelector('output'),update=()=>out.value=value+'×';
  [...row.querySelectorAll('button')].forEach((button,index)=>button.onclick=()=>{if(activeRole)return;value=Math.max(.125,Math.min(8,value*(index?2:.5)));try{localStorage.setItem('gprime-sensitivity-'+role,value);}catch{}update();});update();if(role!=='balance'){row.querySelector('[data-plus]').style.setProperty('order','1','important');row.querySelector('[data-minus]').style.setProperty('order','2','important');}wrap.append(row);return ()=>value;
 }
 function bindGesture(pad,role,getSensitivity){
  let drag=null;
  async function pump(d){
   if(d.sending)return;d.sending=true;
   try{
    if(!d.token){const result=await gprimeCall('gprime-begin',{role});d.token=result.gesture;report(result);}
    while(d.pending&&ready){
     let values=d.pending;d.pending=null;
     if(role==='contrast'){const next=d.sent+Math.max(-800,Math.min(800,values.position-d.sent));if(next!==values.position)d.pending=values;values={position:next};d.sent=next;}
     report(await gprimeCall('gprime-set',{role,gesture:d.token,values}));
     if(d.pending)await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(d.released&&d.token){await gprimeCall('gprime-end',{role,gesture:d.token});d.token=null;drag=null;activeRole=null;enabled();}
   }catch(error){drag=null;fail(error);}
   finally{d.sending=false;if(drag===d&&(d.pending||d.released))void pump(d);}
  }
  pad.addEventListener('pointerdown',event=>{
   if(pad.getAttribute('aria-disabled')==='true'||drag||activeRole)return;event.preventDefault();pad.setPointerCapture(event.pointerId);activeRole=role;enabled();
   const rect=pad.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,width:rect.width,height:rect.height,sensitivity:getSensitivity(),pending:null,sent:0,released:false};void pump(drag);
  });
  pad.addEventListener('pointermove',event=>{
   const d=drag;if(!d||d.released||d.id!==event.pointerId)return;event.preventDefault();const dy=event.clientY-d.y;
   d.pending=role==='exposure'?{exposure:Math.max(-6,Math.min(6,-dy/d.height*4*d.sensitivity))}:role==='contrast'?{position:Math.round(-dy/d.height*1500*d.sensitivity)}:balanceAtDrag({x:0,y:0},(event.clientX-d.x)*d.sensitivity,dy*d.sensitivity,d.width);void pump(d);
  });
  const end=event=>{if(drag?.id===event.pointerId){drag.released=true;void pump(drag);}};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,end);
 }
 for(const [role,title]of [['exposure','Exposure'],['contrast','Contrast'],['balance','Balance']]){
  const wrap=document.createElement('div');wrap.className=role==='balance'?'gp-balance':'gp-primary';const label=document.createElement('strong');label.textContent=title;wrap.append(label);
  const pad=role==='balance'?plot:document.createElement('div');if(role!=='balance')pad.className='gp-touch';pad.setAttribute('role','group');pad.setAttribute('aria-label',title+' touch control');wrap.append(pad);
  const out=document.createElement('output');out.className='gp-gain';out.value='—';wrap.append(out);const getSensitivity=sensitivity(wrap,role);controls.set(role,{pad,out});
  if(role==='balance'){
   bindBalanceGestures(pad,{mode:()=>balanceMode,sensitivity:getSensitivity,reserve(){if(!ready||activeRole)return false;activeRole='balance';enabled();return true;},release(){activeRole=null;enabled();},begin:()=>gprimeCall('gprime-begin',{role}),move:(values,gesture)=>gprimeCall('gprime-set',{role,values,gesture}),end:gesture=>gprimeCall('gprime-end',{role,gesture}),report,error:fail});
  }else bindGesture(pad,role,getSensitivity);surface.append(wrap);
 }
 const satWrap=document.createElement('div');satWrap.className='gp-saturation';surface.append(satWrap);
 const sat=saturationRibbons({
  async begin(){if(!ready||activeRole)throw Error('Finish the current gesture first.');activeRole='saturation';enabled();try{return await gprimeCall('gprime-begin',{role:'saturation'});}catch(error){activeRole=null;throw error;}},
  async move(values,gesture){return await gprimeCall('gprime-set',{role:'saturation',values,gesture});},
  async end(gesture){try{return await gprimeCall('gprime-end',{role:'saturation',gesture});}finally{activeRole=null;enabled();}},error:fail
 });satWrap.append(sat.box);
 function addUndo(parent,role,control=role){
  const button=document.createElement('button');button.type='button';button.className='gp-undo';button.textContent='↶';button.setAttribute('aria-label','Undo last '+(control==='gamma'?'Sat Gamma':control==='gain'?'Sat Gain':role)+' action');
  button.onclick=async()=>{if(!ready||activeRole)return;button.disabled=true;activeRole=role;enabled();try{const result=await gprimeCall('gprime-undo',{role,control});report(result);if(result.positions)sat.set(result.positions);sat.readback(result);status.textContent='Last '+control+' action undone.';}catch(error){showError(error);}finally{activeRole=null;button.disabled=false;enabled();}};
  const reset=document.createElement('button');reset.type='button';reset.className='gp-reset';const title=control==='gamma'?'Sat Gamma':control==='gain'?'Sat Gain':role[0].toUpperCase()+role.slice(1);reset.title='Reset '+title+' · hold for 1 second';reset.setAttribute('aria-label',reset.title);reset.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M24 11A10 10 0 1 0 26 19M24 4V12H16"/></svg>';
  bindHoldReset(reset,{canStart:()=>ready&&bindings[role]?.enabled&&!activeRole&&(role==='exposure'||role==='balance'||panelReady),async activate(){if(!ready||activeRole)return;activeRole=role;reset.disabled=true;enabled();try{const result=await gprimeCall('gprime-reset',{role,control});report(result);if(result.positions)sat.set(result.positions);sat.readback(result);status.textContent=title+' reset.';}catch(error){showError(error);}finally{activeRole=null;reset.disabled=false;enabled();}}});
  parent.prepend(button);parent.append(reset);
 }
 for(const role of ['exposure','contrast','balance'])addUndo(controls.get(role).pad.parentElement.querySelector('.gp-sensitivity'),role);
 [...satWrap.querySelectorAll('[data-pair]>div')].forEach((wrap,index)=>addUndo(wrap.lastElementChild,'saturation',index?'gain':'gamma'));
 const waveSwitch=document.createElement('button');waveSwitch.type='button';waveSwitch.className='gp-waveform-toggle';waveSwitch.title='Waveform background';waveSwitch.setAttribute('aria-label','Waveform background');waveSwitch.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 5V27H30M5 23L9 17L13 20L17 9L21 14L25 6L29 10"/></svg>';
 const applyWaveform=()=>{waveSwitch.setAttribute('aria-pressed',String(waveformOn));waveform.show(waveformOn);};
 waveSwitch.onclick=()=>{waveformOn=!waveformOn;applyWaveform();try{localStorage.setItem('gprime-waveform',String(waveformOn));}catch{}onBalanceViewChange();};
 controls.get('exposure').pad.parentElement.querySelector('.gp-sensitivity').append(waveSwitch);applyWaveform();
 const balanceSwitch=document.createElement('button');balanceSwitch.type='button';balanceSwitch.className='gp-balance-view';
 const pairLabels=document.createElement('div');pairLabels.className='gp-pair-labels';pairLabels.innerHTML='<span>B / G · ↑ blue · ↓ green</span><span>R / G · ↑ red · ↓ green</span>';plot.append(pairLabels);
 function applyBalanceMode(){
  const doubled=balanceMode==='doubled';plot.classList.toggle('gp-double-d',doubled);pairLabels.hidden=!doubled;
  balanceSwitch.innerHTML=doubled?'<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="5"/><path d="M16 2V9M16 23V30M2 16H9M23 16H30"/></svg>':'<svg viewBox="0 0 32 40" aria-hidden="true"><path d="M16 2L5 11L16 20L27 11ZM16 20L5 29L16 38L27 29Z"/></svg>';
  balanceSwitch.setAttribute('aria-label',doubled?'Show vectorscope balance':'Show DoubleD balance');balanceSwitch.title=balanceSwitch.getAttribute('aria-label');balanceSwitch.setAttribute('aria-pressed',String(doubled));
  plot.setAttribute('aria-label',doubled?'DoubleD balance: left blue/green, right red/green; drag up or down':'Live vectorscope · drag to adjust Balance');
 }
 balanceSwitch.onclick=()=>{if(activeRole||preparing)return;balanceMode=balanceMode==='vector'?'doubled':'vector';hasTrace=false;const canvas=plot.querySelector('canvas');if(canvas)canvas.width=canvas.width;plot.querySelector('svg')?.replaceChildren();applyBalanceMode();enabled();try{localStorage.setItem('gprime-balance-view',balanceMode);}catch{}onBalanceViewChange();};
 controls.get('balance').pad.parentElement.querySelector('.gp-sensitivity').append(balanceSwitch);applyBalanceMode();
 const shortcuts=document.createElement('div');shortcuts.className='gp-shortcuts';
 for(const [operation,label]of [['previous','← Previous clip'],['apply-two','Apply 2 Prior'],['undo','↶'],['fullscreen','Clip Fullscreen'],['undo','↶'],['apply-one','Apply 1 Prior'],['next','Next clip →']]){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.className='quiet';button.dataset.operation=operation;if(operation==='undo'){button.setAttribute('aria-label','Undo latest Resolve action');button.title='Undo latest Resolve action (⌘Z)';}if(operation==='fullscreen')button.setAttribute('aria-pressed','mixed');shortcuts.append(button);
  button.onclick=async()=>{if(activeRole||preparing||backgroundBusy){status.textContent='Finish the current operation first.';return;}let completed=false;status.dataset.error='false';activeRole='shortcut';enabled();for(const b of shortcuts.querySelectorAll('button'))b.disabled=true;
   try{const info=await gprimeCall('inspect');const result=await gprimeCall('gprime-action',{operation,target:[info.projectId,info.timelineId,info.clipId]});completed=true;if(operation==='fullscreen'){const active=result.nativeAction?.fullscreen;button.setAttribute('aria-pressed',typeof active==='boolean'?String(active):'mixed');status.textContent=typeof active==='boolean'?'Clip fullscreen '+(active?'on.':'off.'):'Clip fullscreen command sent; Resolve state is not confirmed yet.';}else{clearBackground();status.textContent=result.missing.length?'Assign for this clip: '+result.missing.join(', ')+'.':operation==='undo'?'Resolve Undo sent. Bindings recovered.':'Bindings recovered.';}}
   catch(error){showError(error);}
   finally{activeRole=null;for(const b of shortcuts.querySelectorAll('button'))b.disabled=false;enabled();if(completed&&operation!=='fullscreen'){attempts=0;await prepare();}if(completed)void updateBackground();}
  };
 }
 const readouts=document.createElement('div');readouts.className='gp-readouts';
 for(const role of ['exposure','contrast','balance'])readouts.append(controls.get(role).out);
 const satReadouts=document.createElement('div');satReadouts.className='gp-sat-readouts';
 for(const out of satWrap.querySelectorAll('[data-pair]>div>output'))satReadouts.append(out);
 readouts.append(satReadouts);surface.after(readouts,shortcuts);
 const hero=mountHeroScrub({parent:card,call:gprimeCall,reserve(){if(activeRole||preparing||backgroundBusy||!visible)return false;activeRole='scrub';enabled();return true;},release(moved){if(activeRole==='scrub')activeRole=null;enabled();if(moved){clearBackground();void updateBackground();}},error:showError});
 const background=document.createElement('img');background.className='gp-background';background.alt='';background.hidden=true;card.prepend(background);
 let backgroundEnabled=true,capturedClip=null,capturedSourceFrame=null,backgroundBusy=false,backgroundTimer=null,backgroundEpoch=0;
 try{backgroundEnabled=localStorage.getItem('gprime-background')!=='off';}catch{}
 const options=document.createElement('div');options.className='gp-background-option';options.style.cssText='margin:14px 0';options.innerHTML='<label><input type="checkbox" data-auto-background> Current clip background · 25% opacity</label>';
 const toggle=options.querySelector('input');toggle.checked=backgroundEnabled;
 const placeBackgroundOption=()=>{const section=document.querySelector('.gprime-bindings');if(section)section.querySelector('ol').after(options);};
 window.addEventListener('gprime-settings-mounted',placeBackgroundOption);placeBackgroundOption();
 function clearBackground(){background.hidden=true;background.removeAttribute('src');card.classList.remove('gp-has-background');capturedClip=null;backgroundEpoch++;}
 toggle.onchange=()=>{backgroundEnabled=toggle.checked;try{localStorage.setItem('gprime-background',backgroundEnabled?'on':'off');}catch{}clearBackground();if(backgroundEnabled)void updateBackground();};
 async function updateBackground(){
  if(!visible||document.visibilityState!=='visible'||!backgroundEnabled||backgroundBusy||activeRole||preparing)return;
  backgroundBusy=true;const epoch=backgroundEpoch;
  try{const info=await gprimeCall('inspect');const clip=JSON.stringify([info.projectId,info.timelineId,info.clipId]);if(clip===capturedClip)return;
   background.hidden=true;card.classList.remove('gp-has-background');
   const data=await captureBackground({excludeFrame:capturedSourceFrame});if(!visible||!backgroundEnabled||epoch!==backgroundEpoch)return;
   const check=await gprimeCall('inspect');if(JSON.stringify([check.projectId,check.timelineId,check.clipId])!==clip)return;
   const plane=data.planes.find(p=>p.name==='preview');if(!plane||!data.preview?.length)return;
   const canvas=document.createElement('canvas');canvas.width=plane.width;canvas.height=plane.height;const rgba=new Uint8ClampedArray(plane.width*plane.height*4);
   for(let i=0;i<data.preview.length;i++)for(let ch=0;ch<4;ch++)rgba[i*4+ch]=(data.preview[i]>>>(ch*8))&255;
   canvas.getContext('2d').putImageData(new ImageData(rgba,plane.width,plane.height),0,0);background.src=canvas.toDataURL('image/png');background.hidden=false;card.classList.add('gp-has-background');capturedClip=clip;capturedSourceFrame=data.source.frameId;
  }catch{}finally{backgroundBusy=false;}
 }
 bar.querySelector('[data-setup]').onclick=openSettings;
 async function prepare(retryAttempt=false){
  if(activeRole||preparing||!visible)return;preparing=true;
  try{
   if(!retryAttempt)await gprimeCall('inspect');
   status.dataset.error='false';
   const result=await gprimeCall('gprime-ready');bindings=result.bindings;ready=true;panelReady=result.panelReady;const missing=['exposure','contrast','balance','saturation'].filter(role=>!bindings[role]);status.textContent=Object.keys(bindings).length?`${panelReady?'Controls connected.':'Native panel connecting…'}${missing.length?' Assign: '+missing.join(', ')+'.':''}`:'Assign the four GPrime nodes for this clip in Settings first.';
   sat.set(result.positions);for(const [role,cdl]of Object.entries(result.cdl||{}))if(cdl)report({role,cdl});enabled();
   if(!panelReady&&attempts++<8)retry=setTimeout(()=>void prepare(true),800);
  }catch(error){fail(error);}finally{preparing=false;void hero.load();}
 }
 async function refreshBindings(){if(!visible||activeRole)return;clearTimeout(retry);attempts=0;await prepare();void updateBackground();}
 window.addEventListener('gprime-bindings-changed',refreshBindings);
 enabled();
 let traceReportAt=0;
 return {waveformEnabled:()=>waveformOn,paintWaveform:data=>{if(visible)waveform.paint(data);},isDoubleD:()=>balanceMode==='doubled',clearTrace(){hasTrace=false;enabled();},traceReport(trace){if(!hasTrace){hasTrace=true;enabled();}if(!visible||performance.now()-traceReportAt<2000)return;traceReportAt=performance.now();void gprimeCall('client-diagnostics',{diagnostic:{client:'gprime-trace-controls',mode:'gprime-trace',status:JSON.stringify({...trace,layout:{viewport:window.visualViewport?.height??innerHeight,cardBottom:Math.round(card.getBoundingClientRect().bottom),valuesBottom:Math.round(readouts.getBoundingClientRect().bottom),shortcutsTop:Math.round(shortcuts.getBoundingClientRect().top),scrubBottom:Math.round(card.querySelector('.gp-hero').getBoundingClientRect().bottom)}}),bound:!!bindings.balance?.enabled,visibility:document.visibilityState,width:innerWidth,height:innerHeight}}).catch(()=>{});},setVisible(value){status.hidden=!value;if(value===visible)return;visible=value;if(value){void refreshBindings();backgroundTimer=setInterval(()=>void updateBackground(),3000);}else{hero.cancel();clearInterval(backgroundTimer);clearBackground();clearTimeout(retry);if(!activeRole){ready=false;enabled();}}}};
}
