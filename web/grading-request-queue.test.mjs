import test from 'node:test';
import assert from 'node:assert/strict';
import {createGradingQueue,missingGPrimeRoles} from './public/grading-request-queue.mjs';
test('refresh and settings requests run one at a time; failure is never replayed',async()=>{
 const queue=createGradingQueue();let active=0,peak=0;const calls=[];
 const send=id=>queue(async()=>{active++;peak=Math.max(peak,active);calls.push(id);await new Promise(r=>setTimeout(r,2));active--;if(id===2)throw Error('failed');return id;});
 const results=await Promise.allSettled([send(1),send(2),send(3)]);
 assert.equal(peak,1);assert.deepEqual(calls,[1,2,3]);assert.equal(results[1].status,'rejected');assert.equal(results[2].value,3);
});
test('queue is bounded',async()=>{
 const queue=createGradingQueue(1);let release;const first=queue(()=>new Promise(r=>{release=r;}));
 await assert.rejects(queue(()=>{}),/Finish/);release();await first;
});
test('assignment state depends on bindings, independently of connection readiness',()=>{
 const bindings=Object.fromEntries(['exposure','contrast','balance','saturation'].map(role=>[role,{enabled:true}]));
 assert.deepEqual(missingGPrimeRoles(bindings),[]);
 assert.equal(missingGPrimeRoles({}).length,4);
 bindings.balance.enabled=false;assert.deepEqual(missingGPrimeRoles(bindings),['balance']);
});
