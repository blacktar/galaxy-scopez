export function bindHoldReset(button,{canStart,activate,duration=1000,clock=()=>performance.now(),frame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}){
 let hold=null;
 const cancel=()=>{if(hold)cancelFrame(hold.frame);hold=null;button.style.setProperty('--hold-progress','0');};
 function tick(){const h=hold;if(!h)return;if(!canStart()){cancel();return;}const fraction=Math.min(1,(clock()-h.start)/duration);button.style.setProperty('--hold-progress',String(fraction));if(fraction>=1){cancel();void activate();}else h.frame=frame(tick);}
 button.addEventListener('pointerdown',e=>{if(hold||!canStart()||e.button>0)return;e.preventDefault();button.setPointerCapture(e.pointerId);hold={id:e.pointerId,x:e.clientX,y:e.clientY,start:clock()};hold.frame=frame(tick);});
 button.addEventListener('pointermove',e=>{if(hold?.id===e.pointerId){e.preventDefault();if(Math.hypot(e.clientX-hold.x,e.clientY-hold.y)>10)cancel();}});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,e=>{if(hold?.id===e.pointerId)cancel();});
 button.addEventListener('contextmenu',e=>e.preventDefault());button.addEventListener('click',e=>e.preventDefault());
 button.addEventListener('keydown',e=>{if(![' ','Enter'].includes(e.key)||e.repeat||hold||!canStart())return;e.preventDefault();hold={id:'key',start:clock()};hold.frame=frame(tick);});
 button.addEventListener('keyup',()=>{if(hold?.id==='key')cancel();});button.addEventListener('blur',cancel);return {cancel};
}
