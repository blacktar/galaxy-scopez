import test from 'node:test';
import assert from 'node:assert/strict';
import {saturationAtDrag,saturationStep,saturationSession} from './public/saturation-ribbons.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function idle(session){for(let i=0;i<100&&!session.idle;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(session.idle,true);}
test('relative drag and bounded combined updates preserve both controls',()=>{
  assert.equal(saturationAtDrag(50,0,300),50);
  assert.equal(saturationAtDrag(50,-30,300),110);
  assert.deepEqual(saturationStep({gamma:40,gain:20},{gamma:40,gain:400}),{gamma:40,gain:120});
});
test('two pointers share one session; releasing Gamma retains active Gain',async()=>{
  let beginResolve,begins=0,ends=0;const moves=[];
  const session=saturationSession({begin(){begins++;return new Promise(resolve=>beginResolve=resolve);},async move(value,token){assert.equal(token,'g');moves.push({...value});return {};},async end(){ends++;return {};},error(e){throw e;}});
  session.enable(true);session.set({gamma:0,gain:0});session.start('gamma');session.start('gain');
  session.move('gamma',40);session.move('gain',60);
  beginResolve({gesture:'g'});await tick();await tick();
  session.stop('gamma');await tick();assert.equal(ends,0);
  session.move('gain',80);session.stop('gain');await idle(session);
  assert.equal(begins,1);assert.equal(ends,1);
  assert.deepEqual(moves.at(-1),{gamma:40,gain:80});
});
test('release before preparation completes still closes session',async()=>{
  let resolveBegin,ends=0;
  const session=saturationSession({begin:()=>new Promise(resolve=>resolveBegin=resolve),async move(){assert.fail('no movement');},async end(){ends++;return {};}});
  session.enable(true);session.start('gamma');session.stop('gamma');resolveBegin({gesture:'g'});await idle(session);assert.equal(ends,1);
});
test('failed adjustment disarms paired controls and never retries delta',async()=>{
  let sends=0,errors=0;
  const session=saturationSession({async begin(){return {gesture:'g'};},async move(){sends++;throw Error('disconnected');},async end(){assert.fail('must not continue');},error(){errors++;}});
  session.enable(true);session.start('gamma');session.move('gamma',40);await idle(session);
  assert.equal(session.start('gain'),false);assert.equal(sends,1);assert.equal(errors,1);
});
