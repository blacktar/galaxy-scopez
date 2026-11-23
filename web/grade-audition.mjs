import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

export function gradeAudition(root) {
  let worker, pending=null, epoch=0, queued=0, tail=Promise.resolve(), log=[], clients=new Map();
  const publish=entry=>{
    log.push({...entry,time:new Date().toISOString()});
    log=log.slice(-100);
    const state=process.env.GS_STATE_DIR||path.join(root,'../docs/reverse-scopes');
    fs.mkdirSync(state,{recursive:true});
    fs.writeFileSync(path.join(state,'viewer-audition-log.json'),JSON.stringify(log,null,2));
  };
  function stop() {
    worker?.kill();
    worker=null;
    epoch++;
    if(pending){clearTimeout(pending.timer);pending.reject(Error('Resolve bridge stopped'));pending=null;}
  }
  function invoke(request) {
    if(pending)return Promise.reject(Error('Wait for the current command.'));
    if(!worker){
      const child=spawn(process.env.GS_PYTHON||'python3',[path.join(root,'../scripts/native-grade-worker.py')],{stdio:['pipe','pipe','inherit']});
      worker=child;
      createInterface({input:child.stdout}).on('line',line=>{
        if(worker!==child)return;
        try{
          const response=JSON.parse(line),job=pending;
          pending=null;
          if(job){clearTimeout(job.timer);publish({action:job.action,role:job.role,control:job.control,operation:job.operation,...response});job.resolve(response);}
        }catch{stop();}
      });
      child.stdin.on('error',()=>{if(worker===child)stop();});
      child.on('exit',()=>{if(worker===child)stop();});
      child.on('error',()=>{if(worker===child)stop();});
    }
    return new Promise((resolve,reject)=>{
      pending={resolve,reject,action:request.action,role:request.role,control:request.control,operation:request.operation,timer:setTimeout(stop,5000)};
      worker.stdin.write(JSON.stringify(request)+'\n');
    });
  }
  function enqueue(request){
    if(queued>=16)return Promise.reject(Error('Too many pending grading commands. Try again after the current action finishes.'));
    const generation=epoch,expires=Date.now()+5000;queued++;
    const result=tail.then(()=>{
      if(generation!==epoch)throw Error('Resolve connection restarted. Try the action again.');
      if(Date.now()>expires)throw Error('Grading command expired before execution. Try again.');
      return invoke(request);
    });
    tail=result.catch(()=>{});
    return result.finally(()=>{queued--;});
  }
  return {stop, async handle(req,res){
    const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    res.setHeader('Cache-Control','no-store');
    if(req.method==='GET'&&local){
      res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({enabled:true,multiViewer:true,commandPending:!!pending,queuedCommands:queued,clients:[...clients.values()],log}));
      return;
    }
    const origin=req.headers.origin;
    if(req.method!=='POST'||!origin||!['http://'+req.headers.host,'https://'+req.headers.host].includes(origin)){
      res.writeHead(403).end();return;
    }
    let raw='';
    try {
      for await(const part of req){raw+=part;if(raw.length>2048)throw Error('Request too large');}
      const request=JSON.parse(raw);
      if(request.action==='client-diagnostics'){
        const d=request.diagnostic;
        if(!d||typeof d.client!=='string'||d.client.length>80)throw Error('Invalid diagnostic client');
        if(d.off){clients.delete(d.client);}else{
          const text=(v,n)=>typeof v==='string'?v.slice(0,n):'';
          clients.delete(d.client);
          clients.set(d.client,{client:d.client,time:new Date().toISOString(),status:text(d.status,900),selectedNode:text(d.selectedNode,100),visibility:text(d.visibility,20),bound:d.bound===true,busy:d.busy===true,mode:text(d.mode,20),disabled:Array.isArray(d.disabled)?d.disabled.slice(0,16).map(v=>text(v,40)):[],width:Number(d.width)||0,height:Number(d.height)||0});
          if(clients.size>8)clients.delete(clients.keys().next().value);
        }
        res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true}));return;
      }
      if(!['inspect','bind','read','set','restore','release','contrast-select','contrast-confirm','contrast-begin','contrast-end','contrast-nav','hsv-begin','hsv-end','gprime-bind','gprime-ready','gprime-disarm','gprime-begin','gprime-set','gprime-end','gprime-undo','gprime-action'].includes(request.action))throw Error('Unsupported action');
      const response=await enqueue(request);
      res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(response));
    }catch(error){
      publish({action:'request-rejected',ok:false,error:error.message});
      res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({ok:false,error:error.message}));
    }
  }};
}
