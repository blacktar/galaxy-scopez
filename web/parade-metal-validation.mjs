// Offline only: validates shared parade planes and encoded Y alongside PQ.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {configuration,analyzeFrame} from './scopes.mjs';import {decodeInput} from './resolve-input.mjs';import {scopePacket,unpackScope} from './public/scope-wire.mjs';import {paradeChannels,paradeScopes} from './public/parade-mode.mjs';
const root=path.resolve('docs/research/parades/validation');fs.mkdirSync(root,{recursive:true});const manifest=path.join(root,'manifest.json'),load=(p,o)=>decodeInput(Uint8Array.from(fs.readFileSync(p)).buffer,o);
if(process.argv[2]!=='compare'){
 const rows=[];
 for(const matrix of ['bt709','bt2020-ncl'])for(const paradeMode of ['rgb','yrgb','ycbcr'])for(const variant of ['plain','pq','roi','isolation']){
 const pqWave=variant==='pq',activeScopes=[...new Set([...paradeScopes(paradeMode,pqWave),...(pqWave?[0]:[])])].sort((a,b)=>a-b),config=configuration({paradeMode,pqWave,activeScopes,...(variant==='roi'?{x0:2,x1:8,y0:1,y1:2}:{}),...(variant==='isolation'?{isolation:'colour',hueCenter:0,hueWidth:10}:{})}),name=[matrix,paradeMode,variant].join('-');
 rows.push({name,input:path.resolve('docs/research/waveforms/validation/'+matrix+'.rif1'),matrix,config,output:path.join(root,name+'.gaf1'),runs:1});
 }
 rows.push({name:'all-optional',input:path.resolve('docs/research/waveforms/validation/bt2020-ncl.rif1'),matrix:'bt2020-ncl',config:configuration({paradeMode:'ycbcr',pqWave:true,activeScopes:[0,1,11,12,13],ciePrimaries:'bt2020',cieTransfer:'pq'}),output:path.join(root,'all-optional.gaf1'),runs:1});fs.writeFileSync(manifest,JSON.stringify(rows));console.log('Prepared',rows.length,'cases');
}else{
 let moved=0;
 for(const row of JSON.parse(fs.readFileSync(manifest))){const cpu=analyzeFrame(load(row.input),row.config),gpu=analyzeFrame(load(row.output),row.config),compactFrame=load(row.output,{compact:true}),compact=analyzeFrame(compactFrame,row.config),wire=unpackScope(scopePacket(gpu,0,0).buffer),compactWire=unpackScope(scopePacket(compact,0,0,0,compactFrame.gpu.body).buffer);
 for(const key of row.config.activeScopes.includes(13)?['waveEncoded']:[]){assert.deepEqual(wire[key],gpu[key]);assert.deepEqual(compactWire[key],gpu[key]);assert.equal(cpu[key].reduce((a,b)=>a+b,0),gpu[key].reduce((a,b)=>a+b,0),row.name+' luma conservation');}
 for(const [ch,actual]of paradeChannels(gpu).entries()){
 const expected=paradeChannels(cpu)[ch],encoded=paradeChannels(wire)[ch],forwarded=paradeChannels(compactWire)[ch];assert.deepEqual(encoded.values,actual.values);assert.deepEqual(forwarded.values,actual.values);assert.equal(expected.values.reduce((a,b)=>a+b,0),actual.values.reduce((a,b)=>a+b,0),row.name+' '+actual.name+' conservation');
 const w=gpu.config.waveWidth;for(let i=0;i<actual.values.length;i++)if(actual.values[i]!==expected.values[i]){if(!actual.values[i])continue;moved++;assert.ok(expected.values[i]||expected.values[i-w]||expected.values[i+w],row.name+' '+actual.name+' more than one vertical bin');}
 }
 }
 console.log('PASS 25 CPU/Metal cases; exact compact/wire counts; count conservation; differing occupied bins',moved);
}
