import test from 'node:test';import assert from 'node:assert/strict';
import {CIE_PRIMARIES,cieConfig,ciePoint,decodeCie,xyToCie} from './public/cie-model.mjs';
import {analyzeFrame,makeFixture,configuration} from './scopes.mjs';
import {scopePacket,unpackScope} from './public/scope-wire.mjs';
import {captureSnapshot,snapshotCompatibility} from './public/snapshots.mjs';
import {analysisScopes,validLayout} from './public/layout.mjs';
const close=(a,b,t=2e-8)=>assert.ok(Math.abs(a-b)<=t,`${a} vs ${b}`);
const config={activeScopes:[11],ciePrimaries:'bt709',cieTransfer:'linear'};
const frame=pixels=>({...makeFixture('bars',0,1),width:pixels.length,height:1,data:Float32Array.from(pixels.flat())});
test('CIE does not infer unknown input colourimetry and validates explicit choices',()=>{
 const d=analyzeFrame(frame([[1,0,0]]),{activeScopes:[11]});assert.equal(d.cieStats.ready,false);assert.equal(d.cie.reduce((a,b)=>a+b,0),0);
 for(const c of [{ciePrimaries:'auto'},{cieTransfer:'auto'},{cieModel:'RGB'}])assert.throws(()=>configuration(c));
 assert.equal(cieConfig().ciePrimaries,'unset');assert.ok(validLayout([-1,-1,-1,19]));assert.deepEqual(analysisScopes([19,7,-1,-1]),[7,11]);
});
test('CIE plots known primaries and D65 correctly in xy and u-prime/v-prime',()=>{
 for(const ciePrimaries of Object.keys(CIE_PRIMARIES))for(const cieModel of ['xy','uv']){
  const c=cieConfig({ciePrimaries,cieModel,cieTransfer:'linear'});
  for(let i=0;i<3;i++){const p=ciePoint([0,0,0].map((_,j)=>Number(i===j)),c),target=xyToCie(...CIE_PRIMARIES[ciePrimaries].rgb[i],cieModel);p.forEach((v,k)=>close(v,target[k]));}
  const white=ciePoint([1,1,1],c),expected=cieModel==='xy'?[.3127,.3290]:[.1978300066428368,.468319994938791];white.forEach((v,i)=>close(v,expected[i]));
  const grey=ciePoint([.18,.18,.18],c);grey.forEach((v,i)=>close(v,white[i]));
 }
});
test('CIE transfer decoding uses explicit EOTFs without silently clipping negative or superwhite values',()=>{
 close(decodeCie(.04045,'srgb'),.04045/12.92);close(decodeCie(.5,'gamma24'),.5**2.4);close(decodeCie(.5,'hlg'),1/12);
 close(decodeCie(.508078421517399,'pq'),.01,1e-10);close(decodeCie(1,'pq'),1,1e-10);assert.ok(Number.isNaN(decodeCie(-.1,'pq')));assert.ok(decodeCie(1.1,'gamma24')>1);assert.ok(decodeCie(-.1,'linear')<0);
 assert.notDeepEqual(ciePoint([.5,.7,.3],{...cieConfig(config),cieTransfer:'linear'}),ciePoint([.5,.7,.3],{...cieConfig(config),cieTransfer:'gamma24'}));
});
test('CIE accounts for black, nonfinite and out-of-plot samples; RGB source remains untouched',()=>{
 const f=frame([[0,0,0],[1,0,0],[0,1,0],[0,0,1],[NaN,.2,.3],[-.5,.3,.3]]),before=f.data.slice(),d=analyzeFrame(f,config);
 assert.equal(d.cieStats.plotted+d.cieStats.undefined+d.cieStats.invalid+d.cieStats.outside+d.cieStats.excluded,6);assert.equal(d.cieStats.undefined,1);assert.equal(d.cieStats.invalid,1);assert.equal(d.cie.reduce((a,b)=>a+b,0),d.cieStats.plotted);assert.deepEqual(f.data,before);
 const roi=analyzeFrame(f,{...config,x0:1,x1:3});assert.equal(roi.cieStats.plotted,2);
});
test('CIE count plane survives the wire, captures independently, and hides incompatible reference models',()=>{
 const d=analyzeFrame(frame([[1,0,0],[0,1,0],[0,0,1]]),config),decoded=unpackScope(scopePacket(d,1,2).buffer);assert.deepEqual(decoded.cie,d.cie);assert.equal(decoded.planes.at(-1).name,'cie');
 const snap=captureSnapshot(d,19);d.cie.fill(0);assert.equal(snap.data.cie.reduce((a,b)=>a+b,0),3);assert.ok(snapshotCompatibility(snap.data,decoded,19));assert.ok(!snapshotCompatibility(snap.data,{...decoded,config:{...decoded.config,cieModel:'uv'}},19));
 const old=analyzeFrame(frame([[1,0,0]]),{activeScopes:[3]});assert.equal(old.planes.length,13);assert.equal(unpackScope(scopePacket(old,0,0).buffer).planes.length,13);
});
