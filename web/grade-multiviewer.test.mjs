import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gradeAudition} from './grade-audition.mjs';
test('multiple displays with absent or stale tokens share an ordered worker; foreign origins remain blocked',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'gs-multi-'));await mkdir(path.join(dir,'scripts'));await mkdir(path.join(dir,'web'));
 await writeFile(path.join(dir,'scripts/native-grade-worker.py'),`import json,sys,time\nn=0\nfor line in sys.stdin:\n r=json.loads(line);time.sleep(.01);n+=1\n print(json.dumps({'ok':True,'result':{'n':n,'id':r.get('id')}}),flush=True)\n`);
 const bridge=gradeAudition(path.join(dir,'web'));
 const call=async(body,host='ipad.local:8765',origin='http://'+host)=>{
  const req=Readable.from([JSON.stringify(body)]);req.method='POST';req.headers={host,origin};req.socket={remoteAddress:'192.168.0.4'};
  let code,output;const res={setHeader(){},writeHead(n){code=n;return this;},end(s){output=s;}};await bridge.handle(req,res);return {code,...(output?JSON.parse(output):{})};
 };
 try{
  const results=await Promise.all([call({action:'inspect',id:'ipad'}),call({action:'inspect',token:'stale',id:'mac'},'localhost:8765'),call({action:'gprime-action',operation:'scrub-info',id:'third'})]);
  assert.deepEqual(results.map(r=>r.result.id),['ipad','mac','third']);assert.deepEqual(results.map(r=>r.result.n),[1,2,3]);assert.ok(results.every(r=>r.ok));
  const foreign=await call({action:'inspect'},'ipad.local:8765','https://foreign.example');assert.equal(foreign.code,403);
 }finally{bridge.stop();await new Promise(r=>setTimeout(r,50));await rm(dir,{recursive:true,force:true});}
});
