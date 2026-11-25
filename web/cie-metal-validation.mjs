// Offline Metal fixtures; never connects to Resolve. Run prepare, the Metal harness, then compare.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'),{configuration}=await import('file://'+root+'/web/scopes.mjs'),{inputPacket}=await import('file://'+root+'/web/resolve-input.mjs');
if(process.argv[2]!=='compare'){
const out=path.join(root,'docs/research/cie/validation');fs.mkdirSync(out,{recursive:true});
const base=[[0,0,0],[1,1,1],[1,0,0],[0,1,0],[0,0,1],[.18,.18,.18],[.75,.25,.125],[-.05,.1,.2],[1.1,.2,.8],[NaN,.2,.1],[.001,.002,.003],[.5,.7,.3]];
const frame={width:base.length,height:1,data:Float32Array.from(base.flat()),signal:{model:'RGB',range:'full',matrix:'bt709',codeBits:10},producer:'resolve-ofx',instanceId:'cie-fixture',time:0,renderScale:{x:1,y:1}};
const input=path.join(out,'cie.rif1');fs.writeFileSync(input,inputPacket(frame));const rows=[];
for(const cieModel of ['xy','uv'])for(const ciePrimaries of ['bt709','p3d65','bt2020'])for(const cieTransfer of ['linear','gamma24','srgb','pq','hlg']){const name=[cieModel,ciePrimaries,cieTransfer].join('-');rows.push({name,input,matrix:'bt709',config:configuration({activeScopes:[11],cieModel,ciePrimaries,cieTransfer}),output:path.join(out,name+'.gaf1'),runs:1});}
rows.push({name:'unset',input,matrix:'bt709',config:configuration({activeScopes:[11]}),output:path.join(out,'unset.gaf1'),runs:1});fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(rows));console.log(rows.length,'cases');
}else{
const {analyzeFrame}=await import('file://'+root+'/web/scopes.mjs'),{decodeInput}=await import('file://'+root+'/web/resolve-input.mjs'),{scopePacket,unpackScope}=await import('file://'+root+'/web/public/scope-wire.mjs');
const rows=JSON.parse(fs.readFileSync(path.join(root,'docs/research/cie/validation/manifest.json')));let worst=0,moved=0;
for(const row of rows){const load=p=>decodeInput(Uint8Array.from(fs.readFileSync(p)).buffer),cpu=analyzeFrame(load(row.input),row.config),gpu=analyzeFrame(load(row.output),row.config),packet=scopePacket(gpu,0,0),r=unpackScope(packet.buffer);
 for(const key of ['ready','plotted','undefined','invalid','outside','excluded'])assert.deepEqual(gpu.cieStats[key],cpu.cieStats[key],row.name+key);
 assert.deepEqual(r.cie,gpu.cie);assert.equal(gpu.cie.reduce((a,b)=>a+b,0),gpu.cieStats.plotted);
 const a=[],b=[];cpu.cie.forEach((n,i)=>{for(let j=0;j<n;j++)a.push(i)});gpu.cie.forEach((n,i)=>{for(let j=0;j<n;j++)b.push(i)});
 for(const ix of a){const size=cpu.config.cieSize;let best=Infinity;for(const j of b)best=Math.min(best,Math.hypot(ix%size-j%size,Math.floor(ix/size)-Math.floor(j/size)));worst=Math.max(worst,best);assert.ok(best<=Math.SQRT2,row.name+' moved more than one bin');}
 if(a.some((n,i)=>n!==b[i]))moved++;
}
const report={cases:rows.length,classification:'exact',countConservation:'exact',wire:'exact',maxNearestBinDistance:worst,casesWithBinChanges:moved};fs.writeFileSync(path.join(root,'docs/research/cie/validation/comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(report);

}

