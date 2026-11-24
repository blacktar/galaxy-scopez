import test from 'node:test';import assert from 'node:assert/strict';
import {pairBalance,bindBalanceGestures,balancePlotKind} from './public/gprime-balance.mjs';
import {analysisScopes} from './public/layout.mjs';
import {balanceAtDrag} from './public/balance-pad.mjs';
function pairs({x,y}){const red=1.5748*y,blue=1.8556*x,green=-(.2126*red+.0722*blue)/.7152;return {blue:blue-green,red:red-green,weighted:.2126*red+.7152*green+.0722*blue};}
test('DoubleD pair mapping is independent in the existing Gain basis and stays in native bounds',()=>{
 for(const blue of [-.5,0,.5])for(const red of [-.5,0,.5]){const xy=pairBalance(blue,red),p=pairs(xy);assert.ok(Math.abs(p.blue-blue)<1e-12);assert.ok(Math.abs(p.red-red)<1e-12);assert.ok(Math.abs(p.weighted)<1e-12);assert.ok(Math.abs(xy.x)<=.5&&Math.abs(xy.y)<=.5);}
});
test('GPrime requests one selected plane, deduplicating another DoubleD slot',()=>{
 assert.equal(balancePlotKind('vector'),3);assert.equal(balancePlotKind('doubled'),7);
 assert.deepEqual(analysisScopes([-1,-1,-1,18],{gprimeDoubleD:true}),[7]);assert.deepEqual(analysisScopes([7,-1,-1,18],{gprimeDoubleD:true}),[7]);assert.deepEqual(analysisScopes([-1,-1,-1,18]),[3]);
});
const flush=()=>new Promise(r=>setImmediate(r));
function harness(mode){
 const events={},calls=[],moves=[];let releases=0;
 const pad={addEventListener:(k,v)=>events[k]=v,getAttribute:()=> 'false',getBoundingClientRect:()=>({left:0,width:400,height:200}),setPointerCapture(){}};
 bindBalanceGestures(pad,{mode:()=>mode,sensitivity:()=>1,reserve:()=>true,release:()=>releases++,async begin(){calls.push('begin');return {gesture:'one'};},async move(v,t){assert.equal(t,'one');moves.push(v);return {};},async end(){calls.push('end');},report(){},error(e){throw e;}});
 const event=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,preventDefault(){}});
 return {events,calls,moves,event,get releases(){return releases;}};
}
test('two diamond touches share a baseline and one undo gesture, retaining a lifted finger adjustment',async()=>{
 const h=harness('doubled'),{events:e,event:v}=h;e.pointerdown(v(1,100,100));e.pointerdown(v(2,300,100));await flush();
 e.pointermove(v(1,100,50));await flush();e.pointermove(v(2,300,120));await flush();e.pointerup(v(1,100,50));await flush();assert.deepEqual(h.calls,['begin']);
 e.pointermove(v(2,300,140));await flush();const result=pairs(h.moves.at(-1));assert.ok(Math.abs(result.blue-.25)<1e-12);assert.ok(Math.abs(result.red+.2)<1e-12);
 e.pointerup(v(2,300,140));await flush();assert.deepEqual(h.calls,['begin','end']);assert.equal(h.releases,1);
});
test('vectorscope keeps its original relative XY mapping and accepts only one finger',async()=>{
 const h=harness('vector'),{events:e,event:v}=h;e.pointerdown(v(1,100,100));e.pointerdown(v(2,300,100));await flush();e.pointermove(v(2,300,0));await flush();assert.equal(h.moves.length,0);
 e.pointermove(v(1,140,80));await flush();assert.deepEqual(h.moves.at(-1),balanceAtDrag({x:0,y:0},40,-20,400));e.pointerup(v(1,140,80));await flush();assert.equal(h.releases,1);
});
test('DoubleD ignores movement along the neutral axis',async()=>{
 const h=harness('doubled'),{events:e,event:v}=h;e.pointerdown(v(1,100,100));await flush();e.pointermove(v(1,190,100));await flush();assert.deepEqual(h.moves.at(-1),pairBalance(0,0));e.pointerup(v(1,190,100));await flush();
});
