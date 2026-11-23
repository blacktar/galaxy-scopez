export const exposureAtDrag=(start,dy,height)=>Math.max(-6,Math.min(6,start-dy/Math.max(1,height)*4));
export function exposureRibbon(onChange){
  const box=document.createElement('div');
  box.innerHTML=`<p><strong>Linear exposure</strong> · drag up / down · ±6 stops</p><div role="slider" aria-label="Linear exposure in stops" aria-valuemin="-6" aria-valuemax="6" aria-valuenow="0" tabindex="0" style="width:min(100%,320px);height:300px;background:linear-gradient(to top,#333,#fff);border:1px solid #888;border-radius:12px;touch-action:none;user-select:none;position:relative"><span style="position:absolute;left:0;right:0;top:50%;border-top:2px solid #ff2980;pointer-events:none"></span></div><output style="display:block;margin:10px 0">0.00 stops</output>`;
  const pad=box.querySelector('[role=slider]'),out=box.querySelector('output');
  let value=0,enabled=false,drag=null;
  function display(v){value=v;pad.setAttribute('aria-valuenow',v.toFixed(2));out.value=`${v>=0?'+':''}${v.toFixed(2)} stops`;}
  function change(v){display(v);onChange(v);}
  pad.addEventListener('pointerdown',e=>{if(!enabled||drag)return;e.preventDefault();drag={id:e.pointerId,y:e.clientY,start:value,height:pad.getBoundingClientRect().height};pad.setPointerCapture(e.pointerId);});
  pad.addEventListener('pointermove',e=>{if(!enabled||drag?.id!==e.pointerId)return;change(exposureAtDrag(drag.start,e.clientY-drag.y,drag.height));});
  const end=e=>{if(drag?.id===e.pointerId)drag=null;};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(name,end);
  pad.addEventListener('keydown',e=>{if(enabled&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();change(Math.max(-6,Math.min(6,value+(e.key==='ArrowUp'?1:-1)*(e.shiftKey?.01:.1))));}});
  return {box,get value(){return value;},set:display,enable(v){enabled=v;if(!v)drag=null;pad.setAttribute('aria-disabled',String(!v));pad.style.opacity=v?'1':'.4';pad.tabIndex=v?0:-1;}};
}
