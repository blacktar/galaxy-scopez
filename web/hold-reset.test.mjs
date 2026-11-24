import test from 'node:test';import assert from 'node:assert/strict';import {bindHoldReset} from './public/hold-reset.mjs';
function setup(){const events={},progress=[];let now=0,callback=null,calls=0,ready=true;
 const button={style:{setProperty:(k,v)=>progress.push(Number(v))},addEventListener:(k,f)=>events[k]=f,setPointerCapture(){}};
 bindHoldReset(button,{clock:()=>now,frame:f=>(callback=f,1),cancelFrame:()=>callback=null,canStart:()=>ready,activate:()=>calls++});
 const e={pointerId:1,clientX:10,clientY:10,button:0,preventDefault(){}};
 return {events,e,progress,step(t){now=t;const fn=callback;callback=null;fn?.();},get calls(){return calls;},disable(){ready=false;}};
}
test('reset requires a full one-second hold, fills progressively, and fires once',()=>{const h=setup();h.events.pointerdown(h.e);h.step(500);assert.equal(h.progress.at(-1),.5);assert.equal(h.calls,0);h.step(1000);assert.equal(h.calls,1);h.step(2000);assert.equal(h.calls,1);});
test('early release, cancellation, movement and lost availability prevent reset',()=>{for(const cancel of [h=>h.events.pointerup(h.e),h=>h.events.pointercancel(h.e),h=>h.events.pointermove({...h.e,clientY:30}),h=>h.disable()]){const h=setup();h.events.pointerdown(h.e);h.step(600);cancel(h);h.step(1200);assert.equal(h.calls,0);assert.equal(h.progress.at(-1),0);}});
