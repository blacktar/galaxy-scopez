// Relative native encoder movement; deliberately not an absolute Contrast value.
export const contrastUnitsAtDrag=(start,dy,height,sensitivity=1)=>Math.round(start-dy/Math.max(1,height)*1500*sensitivity);

export function contrastRibbon({begin,move,end,error}){
  const box=document.createElement('div');
  box.innerHTML=`<p><strong>Native Contrast</strong> · drag up to increase, down to decrease.</p>
  <label>Baseline touch sensitivity <input data-base type="number" min="0.1" max="4" step="0.1" value="1" style="width:75px;min-height:44px"></label>
  <div style="display:flex;align-items:center;gap:12px;margin:12px 0">
    <div role="slider" aria-label="Relative Contrast adjustment" aria-valuetext="Relative adjustment" tabindex="0" style="width:76px;height:300px;flex:none;background:linear-gradient(to top,#282828,#ddd);border:1px solid #888;border-radius:12px;touch-action:none;user-select:none;position:relative"><span style="position:absolute;left:0;right:0;top:50%;border-top:2px solid #ff2980;pointer-events:none"></span></div>
    <div><button type="button" data-less aria-label="Decrease Contrast touch sensitivity" style="min-width:44px;min-height:44px">−</button><output data-sensitivity style="margin:0 8px">1×</output><button type="button" data-more aria-label="Increase Contrast touch sensitivity" style="min-width:44px;min-height:44px">+</button></div>
  </div><p>Read the actual Contrast value in Resolve. Starting a drag directly selects the bound Contrast node, then verifies Pivot 0.336 before adjusting. Keep the clip-level graph active, Printer Lights OFF and 0.336 unique. Live Pivot is checked again before each adjustment.</p>`;
  const pad=box.querySelector('[role=slider]'),base=box.querySelector('[data-base]'),out=box.querySelector('[data-sensitivity]');
  let enabled=false,value=0,multiplier=1,drag=null;
  try{const v=Number(localStorage.getItem('gs-gprime-contrast-sensitivity'));if(v>=.1&&v<=4)base.value=v;}catch{}
  const sensitivity=()=>Number(base.value)*multiplier;
  const update=()=>{out.value=`${multiplier.toFixed(2).replace(/\.?0+$/,'')}×`;};
  base.addEventListener('change',()=>{base.value=Math.min(4,Math.max(.1,Number(base.value)||1));try{localStorage.setItem('gs-gprime-contrast-sensitivity',base.value);}catch{}});
  box.querySelector('[data-less]').addEventListener('click',()=>{if(!drag){multiplier=Math.max(.125,multiplier/2);update();}});
  box.querySelector('[data-more]').addEventListener('click',()=>{if(!drag){multiplier=Math.min(8,multiplier*2);update();}});
  function fail(e){drag=null;enabled=false;pad.setAttribute('aria-disabled','true');pad.style.opacity='.4';error(e);}
  async function flush(d){
    if(d.sending||!d.gesture)return;
    d.sending=true;
    try{
      while(d.pending!==null&&enabled){
        const wait=Math.max(0,50-(performance.now()-d.sentAt));
        if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
        if(!enabled)break;
        // Bound one event while preserving the latest requested position.
        const target=d.pending,next=value+Math.max(-800,Math.min(800,target-value));
        d.pending=next===target?null:target;
        if(next!==value){d.sentAt=performance.now();await move(next,d.gesture);value=next;}
      }
    }catch(e){d.pending=null;fail(e);}
    finally{
      d.sending=false;
      if(d.released&&d.gesture){
        const gesture=d.gesture;d.gesture=null;
        try{await end(gesture);}catch(e){fail(e);}
        if(drag===d)drag=null;
      }
    }
  }
  async function start(id,y){
    if(!enabled||drag)return;
    const d=drag={id,y,start:value,height:pad.getBoundingClientRect().height,sensitivity:sensitivity(),pending:null,sending:false,released:false,sentAt:0};
    try{d.gesture=await begin();void flush(d);}catch(e){fail(e);}
  }
  pad.addEventListener('pointerdown',e=>{if(!enabled||drag)return;e.preventDefault();pad.setPointerCapture(e.pointerId);void start(e.pointerId,e.clientY);});
  pad.addEventListener('pointermove',e=>{const d=drag;if(!enabled||!d||d.id!==e.pointerId||d.released)return;e.preventDefault();d.pending=contrastUnitsAtDrag(d.start,e.clientY-d.y,d.height,d.sensitivity);void flush(d);});
  const finish=e=>{const d=drag;if(!d||d.id!==e.pointerId)return;d.released=true;void flush(d);};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,finish);
  pad.addEventListener('keydown',async e=>{
    if(!enabled||drag||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
    const d=drag={id:'keyboard',pending:null,sending:false,released:true,sentAt:0};
    try{d.gesture=await begin();d.pending=value+Math.round((e.key==='ArrowUp'?1:-1)*(e.shiftKey?5:50)*sensitivity());void flush(d);}catch(err){fail(err);}
  });
  return {box,set(v){value=v;},enable(v){enabled=v;if(!v&&drag){drag.pending=null;drag.released=true;void flush(drag);}pad.setAttribute('aria-disabled',String(!v));pad.style.opacity=v?'1':'.4';pad.tabIndex=v?0:-1;}};
}
