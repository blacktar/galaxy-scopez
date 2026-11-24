import {balanceAtDrag} from './balance-pad.mjs';
export const balancePlotKind=mode=>mode==='doubled'?7:3;
// Pair differences B-G and R-G, with the existing Gain balance basis unchanged.
export function pairBalance(blueGreen,redGreen){
 const green=-(.0722*blueGreen+.2126*redGreen);
 return {x:(blueGreen+green)/1.8556,y:(redGreen+green)/1.5748};
}
export function bindBalanceGestures(pad,{mode,sensitivity,reserve,release,begin,move,end,report,error}){
 let drag=null;
 async function pump(d){
  if(d.sending)return;d.sending=true;
  try{
   if(!d.token){const result=await begin();d.token=result.gesture;report(result);}
   while(d.pending){const values=d.pending;d.pending=null;report(await move(values,d.token));if(d.pending)await new Promise(r=>setTimeout(r,50));}
   if(d.released){await end(d.token);if(drag===d){drag=null;release();}}
  }catch(e){drag=null;release();error(e);}
  finally{d.sending=false;if(drag===d&&(d.pending||d.released))void pump(d);}
 }
 pad.addEventListener('pointerdown',e=>{
  if(pad.getAttribute('aria-disabled')==='true'||drag?.released)return;
  const rect=pad.getBoundingClientRect(),doubled=mode()==='doubled',pair=e.clientX<rect.left+rect.width/2?'blue':'red';
  if(drag&&(!doubled||[...drag.pointers.values()].some(p=>p.pair===pair)))return;
  if(!drag){if(!reserve())return;drag={pointers:new Map(),pairs:{blue:0,red:0},sensitivity:sensitivity(),doubled,width:rect.width,height:rect.height,pending:null,released:false,sending:false};}
  e.preventDefault();pad.setPointerCapture(e.pointerId);
  drag.pointers.set(e.pointerId,{pair,x:e.clientX,y:e.clientY,start:drag.pairs[pair]});void pump(drag);
 });
 pad.addEventListener('pointermove',e=>{
  const d=drag,p=d?.pointers.get(e.pointerId);if(!p||d.released)return;e.preventDefault();
  if(d.doubled){d.pairs[p.pair]=Math.max(-.5,Math.min(.5,p.start-(e.clientY-p.y)/Math.max(1,d.height)*d.sensitivity));d.pending=pairBalance(d.pairs.blue,d.pairs.red);}
  else d.pending=balanceAtDrag({x:0,y:0},(e.clientX-p.x)*d.sensitivity,(e.clientY-p.y)*d.sensitivity,d.width);
  void pump(d);
 });
 const finish=e=>{const d=drag;if(!d||!d.pointers.has(e.pointerId))return;d.pointers.delete(e.pointerId);if(!d.pointers.size)d.released=true;void pump(d);};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,finish);
 return {cancel(){if(drag){drag.pointers.clear();drag.released=true;void pump(drag);}}};
}
