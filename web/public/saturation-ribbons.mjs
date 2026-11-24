// Two independent pointers, one serialized native session and latest-state queue.
export const saturationAtDrag=(start,dy,height,sensitivity=1)=>Math.round(start-dy/Math.max(1,height)*600*sensitivity);
export const saturationStep=(confirmed,desired)=>Object.fromEntries(['gamma','gain'].map(key=>[key,confirmed[key]+Math.max(-100,Math.min(100,desired[key]-confirmed[key]))]));
export function saturationSession({begin,move,end,report=()=>{},error=()=>{}}){
  let confirmed={gamma:0,gain:0},desired={...confirmed},gesture=null,running=false,enabled=false,epoch=0;
  const active=new Set();
  const pending=()=>['gamma','gain'].some(key=>desired[key]!==confirmed[key]);
  async function pump(){
    if(running||!enabled)return;
    running=true;const version=epoch;
    try{
      if(!gesture&&active.size){const result=await begin();if(version!==epoch)return;gesture=result.gesture;report(result);}
      while(gesture&&pending()&&enabled&&version===epoch){
        const target=saturationStep(confirmed,desired);
        const result=await move(target,gesture);
        if(version!==epoch)return;
        confirmed=target;report(result);
        if(pending())await new Promise(resolve=>setTimeout(resolve,50));
      }
      if(gesture&&!active.size&&version===epoch){const token=gesture;gesture=null;report(await end(token));}
    }catch(e){enabled=false;active.clear();gesture=null;epoch++;error(e);}
    finally{running=false;if(enabled&&version===epoch&&((gesture&&pending())||(!active.size&&gesture)))void pump();}
  }
  return {
    start(key){if(!enabled||!['gamma','gain'].includes(key))return false;active.add(key);void pump();return true;},
    move(key,value){if(enabled&&active.has(key)){desired[key]=value;void pump();}},
    stop(key){active.delete(key);void pump();},
    set(value){confirmed={...value};desired={...value};},
    get positions(){return {...desired};},
    enable(value){enabled=value;if(!value){epoch++;active.clear();gesture=null;}},
    get idle(){return !running&&!gesture&&!active.size;}
  };
}
export function saturationRibbons(callbacks){
  const box=document.createElement('div');
  box.innerHTML='<p>Native Primaries master Gamma and Gain on your HSV/S-only node. Use either ribbon or both together. Dragging up increases the native control. Values below come from panel readback.</p><div data-pair style="display:flex;gap:24px;flex-wrap:wrap"></div><p>Keep the clip-level graph and Primaries wheels active; Printer Lights OFF. Do not select other nodes while dragging. Restore in Resolve manually during this audition.</p>';
  const controls={},outputs={},sensitivity={gamma:1,gain:1};
  const session=saturationSession({...callbacks,report(result){
    if(result.native)for(const key of ['gamma','gain'])outputs[key].value=Number(result.native[key]).toFixed(3);
    callbacks.report?.(result);
  }});
  for(const key of ['gamma','gain']){
    const wrap=document.createElement('div');wrap.style.cssText='flex:1 1 130px;max-width:240px';
    wrap.innerHTML=`<strong>Sat ${key==='gamma'?'Gamma':'Gain'}</strong><div role="slider" tabindex="0" aria-label="HSV Saturation ${key}" aria-valuetext="Readback pending" style="height:300px;width:90px;max-width:100%;margin:12px 0;background:linear-gradient(to top,#222,#eee);border:1px solid #888;border-radius:12px;touch-action:none;user-select:none"></div><output style="display:block">—</output><div style="display:flex;align-items:center;gap:8px;margin:10px 0"><button type="button" data-minus style="min-width:44px;min-height:44px">−</button><span data-sensitivity>1×</span><button type="button" data-plus style="min-width:44px;min-height:44px">+</button></div>`;
    const pad=wrap.querySelector('[role=slider]');let drag=null;
    outputs[key]=wrap.querySelector('output');controls[key]={pad,wrap,cancel:()=>{drag=null;}};
    const update=()=>{wrap.querySelector('[data-sensitivity]').textContent=`${sensitivity[key]}×`;};
    for(const [selector,factor]of [['[data-minus]',.5],['[data-plus]',2]])wrap.querySelector(selector).addEventListener('click',()=>{if(session.idle){sensitivity[key]=Math.max(.125,Math.min(8,sensitivity[key]*factor));update();}});
    pad.addEventListener('pointerdown',e=>{if(drag||pad.getAttribute('aria-disabled')==='true')return;e.preventDefault();if(!session.start(key))return;drag={id:e.pointerId,y:e.clientY,start:session.positions[key],height:pad.getBoundingClientRect().height,sensitivity:sensitivity[key]};pad.setPointerCapture(e.pointerId);});
    pad.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;e.preventDefault();session.move(key,saturationAtDrag(drag.start,e.clientY-drag.y,drag.height,drag.sensitivity));});
    const finish=e=>{if(drag?.id===e.pointerId){drag=null;session.stop(key);}};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,finish);
    pad.addEventListener('keydown',e=>{if(pad.getAttribute('aria-disabled')==='true'||!['ArrowUp','ArrowDown'].includes(e.key)||!session.idle)return;e.preventDefault();session.start(key);session.move(key,session.positions[key]+(e.key==='ArrowUp'?1:-1)*Math.max(1,Math.round(10*sensitivity[key])));session.stop(key);});
    box.querySelector('[data-pair]').append(wrap);
  }
  return {box,set(value){session.set(value);},readback(result){if(result.native)for(const key of ['gamma','gain']){outputs[key].value=Number(result.native[key]).toFixed(3);controls[key].pad.setAttribute('aria-valuetext',outputs[key].value);}},enable(value,available=value){session.enable(value);for(const {pad,wrap,cancel}of Object.values(controls)){if(!value)cancel();pad.setAttribute('aria-disabled',String(!value));pad.style.opacity=available?'1':'.4';pad.tabIndex=value?0:-1;for(const button of wrap.querySelectorAll('button')){button.disabled=!value;button.style.opacity=available?'1':'';}}}};
}
