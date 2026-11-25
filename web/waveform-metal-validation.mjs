// Offline GPU checks only; never connects to Resolve.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {configuration,analyzeFrame} from './scopes.mjs';import {inputPacket,decodeInput} from './resolve-input.mjs';import {scopePacket,unpackScope} from './public/scope-wire.mjs';
const root=path.resolve('docs/research/waveforms/validation');fs.mkdirSync(root,{recursive:true});const manifest=path.join(root,'manifest.json');
const load=(p,options)=>decodeInput(Uint8Array.from(fs.readFileSync(p)).buffer,options);
if(process.argv[2]!=='compare'){
 const rows=[];
 for(const matrix of ['bt709','bt2020-ncl']){
 const pixels=[[0,0,0],[1,1,1],[1,0,0],[0,1,0],[0,0,1],[.1,.2,.3],[.75,.25,.125],[-.1,.2,.9],[2,0,0],[NaN,0,0]];
 const f={width:10,height:2,data:Float32Array.from([...pixels,...pixels].flat()),signal:{model:'RGB',range:'full',matrix,codeBits:10},producer:'resolve-ofx',instanceId:'waveforms-test',time:0,renderScale:{x:1,y:1}},input=path.join(root,matrix+'.rif1');fs.writeFileSync(input,inputPacket(f));
 for(const [name,settings] of Object.entries({chroma:{activeScopes:[12]},rgb:{activeScopes:[0,1]},both:{activeScopes:[0,1,3,11,12],ciePrimaries:'bt709',cieTransfer:'linear'},roi:{activeScopes:[12],x0:2,x1:8,y0:1,y1:2},isolation:{activeScopes:[12],isolation:'colour',hueCenter:0,hueWidth:10},precision:{activeScopes:[12],bits:12,min:-.25,max:1.25},source:{activeScopes:[0,12],waveColour:true}}))rows.push({name:matrix+'-'+name,input,matrix,config:configuration({waveMode:name==='rgb'?'rgb':'cbcr',...settings}),output:path.join(root,matrix+'-'+name+'.gaf1'),runs:1});
 }
 fs.writeFileSync(manifest,JSON.stringify(rows));console.log('Prepared',rows.length,'GPU cases');
}else{
 let moved=0,worst=0;
 for(const row of JSON.parse(fs.readFileSync(manifest))){const cpu=analyzeFrame(load(row.input),row.config),gpu=analyzeFrame(load(row.output),row.config);const compact=analyzeFrame(load(row.output,{compact:true}),row.config),compactWire=unpackScope(scopePacket(compact,0,0,0,load(row.output,{compact:true}).gpu.body).buffer),wire=unpackScope(scopePacket(gpu,0,0).buffer);
 for(const name of row.config.activeScopes.includes(12)?['waveChroma']:['parade']){
 assert.deepEqual(wire[name],gpu[name]);assert.deepEqual(compactWire[name],gpu[name]);assert.equal(cpu[name].reduce((a,b)=>a+b,0),gpu[name].reduce((a,b)=>a+b,0),row.name+' conservation');
 const w=cpu.config.waveWidth,h=cpu.config.levels;let delta=0;for(let i=0;i<gpu[name].length;i++)if(gpu[name][i]){if(gpu[name][i]===cpu[name][i])continue;delta++;let found=false;for(const dy of [-1,0,1]){const j=i+dy*w;if(j>=0&&j<cpu[name].length&&Math.floor(j/(w*h))===Math.floor(i/(w*h))&&cpu[name][j]){found=true;worst=Math.max(worst,Math.abs(dy));}}assert.ok(found,row.name+' bin distance');}moved+=delta;
 }
 }
 console.log('PASS 14 CPU/GPU cases; exact wire and compact forwarding; count conservation; differing occupied bins',moved,'maximum vertical bin distance',worst);
}
