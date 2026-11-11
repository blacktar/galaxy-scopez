// Independent reference coordinates: ITU-R BT.709-6, BT.2020-2,
// BT.2111-3 tables 2–4 and Tektronix 25W-27159, appendix.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFrame} from './scopes.mjs';
import {packPlanes,scopePacket,unpackScope} from './public/scope-wire.mjs';
import {twinDisplayPoint,twinDisplayBin} from './public/twin-orientation.mjs';

const colours=[
 ['R',[1,0,0],0],['Y',[1,1,0],60],['G',[0,1,0],120],
 ['C',[0,1,1],180],['B',[0,0,1],240],['M',[1,0,1],300]
];
const coefficients={bt709:[.2126,.7152,.0722],'bt2020-ncl':[.2627,.678,.0593]};
const frame=(values,options)=>({width:values.length,height:1,data:Float32Array.from(values.flat()),signal:{model:'RGB',range:'full',codeBits:16,transfer:'unknown',...options}});
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const quant=(x,n,min=0,max=1)=>Math.round((x-min)/(max-min)*(n-1));
const total=a=>a.reduce((n,v)=>n+v,0);
const check=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b}`);
function reference(rgb,k){
 const y=dot(rgb,k);
 return {y,cb:(rgb[2]-y)/(2*(1-k[2])),cr:(rgb[0]-y)/(2*(1-k[0]))};
}
function chromaBin(p,n){return quant(p.cr,n,-.5,.5)*n+quant(p.cb,n,-.5,.5);}
function twinBin(x,y,c){return quant(y,c.twinHeight,-2.5,2.5)*c.twinWidth+quant(x,c.twinWidth,-1.25,1.25);}
for(const matrix of Object.keys(coefficients))test(matrix+' primary/secondary targets and all measurement planes',()=>{
 const k=coefficients[matrix];
 for(const [label,base,hue]of colours)for(const amplitude of [.75,1]){
  const rgb=base.map(x=>x*amplitude),e=reference(rgb,k);
  const data=analyzeFrame(frame([rgb],{matrix}),{bits:12,activeScopes:[0,1,2,3,4,5,6,7,8,9,10]});
  const {config:c}=data,n=c.vectorSize;
  const target=data.targets.find(t=>t.label===label&&t.percent===amplitude*100);
  check(target.cb,e.cb);check(target.cr,e.cr);
  assert.equal(data.vector[chromaBin(e,n)],1);
  assert.equal(data[['low','mid','high'][e.y<.25?0:e.y<.75?1:2]][chromaBin(e,n)],1);
  check(data.stats[3].min,e.y);
  assert.equal(data.wave[quant(e.y,c.levels)*c.waveWidth],1);
  rgb.forEach((v,ch)=>{
   assert.equal(data.parade[(ch*c.levels+quant(v,c.levels))*c.waveWidth],1);
   assert.equal(data.hist[ch*c.histBins+quant(v,c.histBins)],1);
  });
  const [r,g,b]=rgb;
  assert.equal(data.twin[twinBin(b-g,b+g,c)],1);
  assert.equal(data.twin[twinBin(r-g,-r-g,c)],1);
  assert.equal(total(data.twin),2);
  const q=c.cubeResolution;
  assert.equal(data.cube[quant(r,q)+q*(quant(g,q)+q*quant(b,q))],1);
  assert.equal(data.satlum[quant(e.y,c.satlumSize)*c.satlumSize+c.satlumSize-1],1);
  assert.equal(data.hue[hue],1);
 }
});
test('Tektronix neutral spine, both orientations and excursion accounting',()=>{
 const rgb=[[0,0,0],[.25,.25,.25],[.5,.5,.5],[1,1,1],[1.125,.5,.375],[-.125,.5,.625]];
 const d=analyzeFrame(frame(rgb,{matrix:'bt709'}),{activeScopes:[7],min:-.25,max:1.25});
 const c=d.config;
 assert.equal(d.twin[twinBin(0,0,c)],2);
 for(const v of [.25,.5,1])for(const sign of [-1,1]){
  const y=sign*2*v;
  assert.equal(d.twin[twinBin(0,y,c)],1);
  for(const twinHorizontal of [false,true]){
   const p={...c,twinHorizontal},[x,top]=twinDisplayPoint(0,y,p);
   const {ix,iy}=twinDisplayBin(x,top,p);
   assert.equal(d.twin[iy*c.twinWidth+ix],1);
   if(twinHorizontal)assert.equal(x<.5,sign>0);else assert.equal(top<.5,sign>0);
  }
 }
 assert.equal(d.twinStats.upper.gamut,0);assert.equal(d.twinStats.lower.gamut,2);
 assert.equal(d.twinStats.lower.outside,0);assert.equal(total(d.twin),rgb.length*2);
});
for(const [name,bits,black,white,amp,range]of [
 ['HLG narrow',10,64,940,721,'video'],['HLG narrow',12,256,3760,2884,'video'],
 ['PQ narrow',10,64,940,573,'video'],['PQ narrow',12,256,3760,2292,'video'],
 ['PQ full',10,0,1023,594,'full']
])test(`BT.2111-3 ${name} ${bits}-bit codes through analysis and wire`,()=>{
 const maxCode=2**bits-1,k=coefficients['bt2020-ncl'],matrix='bt2020-ncl';
 const values=colours.map(([,rgb])=>rgb.map(x=>(x?amp:black)/maxCode));
 const d=analyzeFrame(frame(values,{matrix,range,codeBits:bits}),{bits:12,activeScopes:[0,1,2,3,7]});
 const q=unpackScope(scopePacket(d,0,1,0,packPlanes(d,d.indices)).buffer),c=q.config;
 assert.equal(q.measurement.coding.black,black);assert.equal(q.measurement.coding.white,white);
 assert.equal(q.source.signal.transfer,'unknown');
 for(const [i,[,base]]of colours.entries()){
  const rgb=base.map(x=>x*(amp-black)/(white-black)),e=reference(rgb,k);
  assert.equal(q.vector[chromaBin(e,c.vectorSize)],1);
  const x=Math.floor(i*c.waveWidth/values.length);
  assert.equal(q.wave[quant(e.y,c.levels)*c.waveWidth+x],1);
 }
 assert.equal(total(q.twin),12);
});
test('10-bit YCbCr neutral and chroma anchors, including PLUGE excursions',()=>{
 const matrix='bt2020-ncl';
 const d=analyzeFrame(frame([[4,512,512],[64,512,512],[940,512,512],[1019,512,512],[502,960,64]].map(a=>a.map(v=>v/1023)),{model:'YCbCr',range:'video',matrix,codeBits:10}),{bits:12,min:-.25,max:1.25,activeScopes:[0,1,2,3,7]});
 check(d.stats[3].min,(4-64)/876);check(d.stats[3].max,(1019-64)/876);
 assert.equal(d.stats[3].under,1);assert.equal(d.stats[3].over,1);
 assert.equal(d.vector[chromaBin({cb:0,cr:0},d.config.vectorSize)],4);
 assert.equal(d.vector[chromaBin({cb:.5,cr:-.5},d.config.vectorSize)],1);
});
test('unsupported HDR transfer cannot silently imply nits',()=>{
 for(const transfer of ['pq','hlg'])assert.throws(()=>analyzeFrame(frame([[.58,.58,.58]],{matrix:'bt2020-ncl',transfer})),/Unsupported transfer function/);
});

test('opt-in PQ waveform bins use channel-linear BT.2020 luminance',()=>{
 const f=frame([[0,0,0],[.5080784,.5080784,.5080784],[.7518271,.7518271,.7518271],[1,0,0],[0,1,0],[0,0,1],[1,1,1]],{matrix:'bt2020-ncl'});
 const options={activeScopes:[0,1,3],bits:12,waveColour:true,min:.1,max:.9};
 const encoded=analyzeFrame(f,options),pq=analyzeFrame(f,{...options,pqWave:true});
 const {waveWidth,levels}=pq.config;
 assert.equal(encoded.measurement.waveformUnit,undefined);
 assert.equal(pq.measurement.waveformUnit,'pq-nits');
 [0,100,1000,2627,6780,593,10000].forEach((nits,i)=>{
  const x=Math.floor(i*waveWidth/f.width),y=Math.sqrt(nits/10000)*(levels-1);
  const bins=[...new Set([Math.floor(y),Math.ceil(y)])];
  assert.equal(bins.reduce((sum,bin)=>sum+pq.wave[bin*waveWidth+x],0),1,`${nits} nits`);
 });
 assert.equal(total(pq.wave),f.width);
 assert.deepEqual(pq.parade,encoded.parade);
 assert.deepEqual(pq.vector,encoded.vector);
 const reused=analyzeFrame(f,options,pq);
 assert.deepEqual(reused.wave,encoded.wave);
 const incompatible=analyzeFrame({...f,signal:{...f.signal,matrix:'bt709'}},{...options,pqWave:true});
 assert.equal(incompatible.measurement.waveformUnit,undefined);
});
