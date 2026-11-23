import test from 'node:test';
import assert from 'node:assert/strict';
import {mountHeroScrub} from './public/gprime-scrub.mjs';
test('a completed scrub requests background refresh; a cancelled hold does not',async()=>{
 const saved={document:globalThis.document,performance:globalThis.performance,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
 class Element{constructor(){this.style={};this.dataset={};this.events={};this.clientWidth=500;}append(){}setAttribute(){}setPointerCapture(){}addEventListener(type,fn){this.events[type]=fn;}querySelector(key){return this.children[key];}set innerHTML(_){this.children=Object.fromEntries(['.gp-hero-strip','span','output','i','b'].map(k=>[k,new Element()]));}}
 const made=[];let tick,now=0;globalThis.document={createElement(){const e=new Element();made.push(e);return e;},addEventListener(){}};globalThis.performance={now:()=>now};globalThis.setInterval=fn=>(tick=fn,1);globalThis.clearInterval=()=>{};
 try{
  const released=[],calls=[];
  const data={frame:50,start:0,end:100,timecode:'00:00:02:02'};
  const hero=mountHeroScrub({parent:new Element(),reserve:()=>true,release:moved=>released.push(moved),error:e=>{throw e;},async call(action,request){if(action==='inspect')return {projectId:'p',timelineId:'t',clipId:'c'};calls.push(request.operation);if(request.operation==='scrub-begin')return {...data,gesture:'g'};return {...data,frame:request.frame??data.frame};}});
  await hero.load();const strip=made[0].querySelector('.gp-hero-strip');const event=x=>({pointerId:1,clientX:x,clientY:0,preventDefault(){}});
  strip.events.pointerdown(event(100));strip.events.pointerup(event(100));assert.deepEqual(released,[false]);
  strip.events.pointerdown(event(100));now=900;await tick();assert.ok(!calls.includes('scrub-begin'));now=1100;await tick();strip.events.pointermove(event(200));await new Promise(r=>setImmediate(r));strip.events.pointerup(event(200));await new Promise(r=>setImmediate(r));
  assert.deepEqual(released,[false,true]);assert.ok(calls.includes('scrub-set'));assert.equal(calls.at(-1),'scrub-end');
 }finally{Object.assign(globalThis,saved);}
});
