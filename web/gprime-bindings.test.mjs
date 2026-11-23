import test from 'node:test';
import assert from 'node:assert/strict';
import {GPRIME_ROLES,gprimePreflight} from './public/gprime-bindings.mjs';
test('assignment order mirrors GPrime, including one shared saturation binding',()=>{
 assert.deepEqual(GPRIME_ROLES.map(([key])=>key),['exposure','contrast','balance','saturation']);
});
test('preflight names assigned nodes and groups shared HSV setup once',()=>{
 const bindings={exposure:{node:1,label:'EXP',enabled:true},balance:{node:2,label:'BAL',enabled:true},contrast:{node:18,label:'RAT/CONT',enabled:true},saturation:{node:3,label:'SAT HSV',enabled:true}};
 const lines=gprimePreflight(bindings);
 assert.ok(lines[0].includes('1 · EXP'));assert.ok(lines[1].includes('2 · BAL'));
 assert.ok(lines[2].includes('18 · RAT/CONT'));
 assert.equal(lines.filter(line=>line.includes('Color Space to HSV')).length,1);
 assert.ok(lines.some(line=>line.includes('Printer Lights OFF')));
});
test('one disabled saturation assignment covers both ribbons in preflight',()=>{
 const lines=gprimePreflight({saturation:{node:3,label:'SAT HSV',enabled:false}});
 assert.equal(lines.filter(line=>line.includes('Color Space to HSV')).length,1);
 assert.ok(lines.some(line=>line.includes('Sat Gamma and Sat Gain — 3 · SAT HSV')));
 assert.ok(lines.some(line=>line.includes('Enable these assigned nodes')&&line.includes('3 · SAT HSV')));
 assert.ok(lines[0].includes('not assigned'));
});
