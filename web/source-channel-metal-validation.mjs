// Offline packed mean RGB verification. No Resolve writes or live source input.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {MATRICES} from './public/signal.mjs';import {selected} from './public/colour-analysis.mjs';
import {configuration,analyzeFrame} from './scopes.mjs';import {inputPacket,decodeInput} from './resolve-input.mjs';import {scopePacket,unpackScope} from './public/scope-wire.mjs';
const dir=path.resolve('docs/research/source-channel-colour/validation');fs.mkdirSync(dir,{recursive:true});const manifest=path.join(dir,'manifest.json'),load=(p,o)=>decodeInput(Uint8Array.from(fs.readFileSync(p)).buffer,o);
function oracle(frame,c){
 const f=Math.fround,m=MATRICES[frame.signal.matrix],kr=f(m.kr),kg=f(m.kg),kb=f(m.kb),names=c.sourceColourMode==='ycbcr'?['y','cb','cr']:['cb','cr'],size=c.waveWidth*c.levels,out=new Uint32Array(size*names.length),counts=new Uint32Array(size*names.length);
 for(const [group,name]of names.entries()){
  const bins=new Map();for(let y=c.y0;y<(c.y1??frame.height);y++)for(let x=c.x0;x<(c.x1??frame.width);x++){
   const at=(y*frame.width+x)*3,r=frame.data[at],g=frame.data[at+1],b=frame.data[at+2],l=f(f(f(kr*r)+f(kg*g))+f(kb*b));if(![r,g,b].every(Number.isFinite)||!selected(r,g,b,l,c))continue;
   const level=name==='y'?l:name==='cb'?f(f(f(b-l)/f(2*f(1-kb)))+.5):f(f(f(r-l)/f(2*f(1-kr)))+.5);if(!Number.isFinite(level)||level<f(c.min)||level>f(c.max))continue;
   const iy=Math.floor(f(f(f(f(level-f(c.min))/f(f(c.max)-f(c.min)))*(c.levels-1))+.5)),ix=Math.floor((x-c.x0)*c.waveWidth/((c.x1??frame.width)-c.x0)),i=iy*c.waveWidth+ix,bin=bins.get(i)??[0,0,0,0];for(const [ch,v]of [r,g,b].entries())bin[ch]+=Math.floor(f(f(Math.max(0,Math.min(1,v))*255)+.5));bin[3]++;bins.set(i,bin);
  }
  for(const [i,bin]of bins){let rgb=0;for(let ch=0;ch<3;ch++)rgb|=Math.floor((bin[ch]+Math.floor(bin[3]/2))/bin[3])<<(ch*8);out[group*size+i]=rgb;counts[group*size+i]=bin[3];}
 }return {colour:out,counts};
}
if(process.argv[2]!=='compare'){
 const rows=[],pixels=[[1,1,0],[0,1,1],[1,0,1],[.5,.5,.5],[.2,.2,.2],[1,0,0],[0,1,0],[0,0,1],[0,0,0],[NaN,0,1],[1.2,.2,.1],[-.1,.2,.9]];
 for(const matrix of ['bt709','bt2020-ncl']){
 const f={width:pixels.length,height:2,data:Float32Array.from([...pixels,...pixels.map((rgb,i)=>i===3?[.8,.8,.8]:rgb)].flat()),signal:{model:'RGB',range:'full',matrix,codeBits:10},producer:'resolve-ofx',instanceId:'source-colour',time:0,renderScale:{x:1,y:1}},input=path.join(dir,matrix+'.rif1');fs.writeFileSync(input,inputPacket(f));
 for(const sourceColourMode of ['cbcr','ycbcr'])for(const variant of ['plain','roi','isolation','pq','q4']){
 const pqWave=variant==='pq',config=configuration({sourceColourMode,paradeMode:'ycbcr',waveMode:'cbcr',pqWave,activeScopes:[0,12,14,...(pqWave?[13]:[])],...(variant==='roi'?{x0:1,x1:9,y0:1,y1:2}:{}),...(variant==='isolation'?{isolation:'colour',hueCenter:60,hueWidth:10}:{}),...(variant==='q4'?{vectorDisplayScale:4}:{})}),name=[matrix,sourceColourMode,variant].join('-');rows.push({name,input,matrix,config,output:path.join(dir,name+'.gaf1'),runs:1});
 }
 }
 fs.writeFileSync(manifest,JSON.stringify(rows));console.log('Prepared',rows.length,'GPU source-colour cases');
}else{
 for(const row of JSON.parse(fs.readFileSync(manifest))){const cpu=analyzeFrame(load(row.input),row.config),expected=oracle(load(row.input),cpu.config),gpu=analyzeFrame(load(row.output),row.config),r=unpackScope(scopePacket(gpu,0,0).buffer),compact=load(row.output,{compact:true}),c=analyzeFrame(compact,row.config),forwarded=unpackScope(scopePacket(c,0,0,0,compact.gpu.body).buffer);
 assert.deepEqual(gpu.channelColour,expected.colour,row.name+' independent float32 packed RGB means');assert.deepEqual(r.channelColour,gpu.channelColour);assert.deepEqual(forwarded.channelColour,gpu.channelColour);const size=gpu.config.waveWidth*gpu.config.levels;assert.deepEqual(gpu.waveChroma,expected.counts.subarray(expected.counts.length-2*size),row.name+' independent float32 chroma bins');
 }
 console.log('PASS 20 independent float32/Metal source-colour cases: exact rgb8 means, exact count bins, compact forwarding and wire round trips');
}
