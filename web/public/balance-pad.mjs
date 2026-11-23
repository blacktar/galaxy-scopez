export function balanceAtDrag(start,dx,dy,size){return {x:Math.max(-.5,Math.min(.5,start.x+dx/size)),y:Math.max(-.5,Math.min(.5,start.y-dy/size))};}
export function balancePad(onChange){
  const box=document.createElement('div');
  box.innerHTML=`<p><strong>Linear Gain balance audition</strong> · relative X/Y drag</p><div role="group" aria-label="Colour balance touch pad" style="width:min(100%,360px);aspect-ratio:1;position:relative;border:1px solid #777;border-radius:50%;background:radial-gradient(circle,#222,#080808);touch-action:none;user-select:none"><svg viewBox="0 0 100 100" style="width:100%;height:100%;pointer-events:none"><circle cx="50" cy="50" r="40" fill="none" stroke="#777"/><path d="M10 50H90 M50 10V90" stroke="#444"/><text x="26" y="17" fill="#f66" font-size="6">R</text><text x="78" y="66" fill="#79f" font-size="6">B</text><text x="20" y="82" fill="#6d8" font-size="6">G</text><circle data-point cx="50" cy="50" r="2" fill="white"/></svg></div><output style="display:block;margin:10px 0"></output><p>Direction uses a 709 chroma basis. This tests RGB Gain mapping; native Gain-wheel equivalence is not yet verified.</p>`;
  const pad=box.querySelector('[role=group]'),point=box.querySelector('[data-point]'),output=box.querySelector('output');
  let value={x:0,y:0},enabled=false,drag=null;
  function set(v){value={...v};point.setAttribute('cx',50+v.x*80);point.setAttribute('cy',50-v.y*80);output.value=`X ${v.x.toFixed(3)} · Y ${v.y.toFixed(3)}`;}
  set(value);
  pad.addEventListener('pointerdown',e=>{if(!enabled||drag)return;e.preventDefault();drag={id:e.pointerId,start:{...value},x:e.clientX,y:e.clientY,size:pad.getBoundingClientRect().width};pad.setPointerCapture(e.pointerId);});
  pad.addEventListener('pointermove',e=>{if(!enabled||drag?.id!==e.pointerId)return;set(balanceAtDrag(drag.start,e.clientX-drag.x,e.clientY-drag.y,drag.size));onChange(value);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(name,e=>{if(drag?.id===e.pointerId)drag=null;});
  return {box,get value(){return {...value};},set,enable(v){enabled=v;if(!v)drag=null;pad.setAttribute('aria-disabled',String(!v));pad.style.opacity=v?'1':'.4';}};
}
