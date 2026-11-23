#!/usr/bin/env node
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const socketPath=`/tmp/galaxy-scopez-audition-${process.getuid()}.sock`;
const action=process.argv[2]||'status';
if(action!=='serve'){
  if(!['status','restart','reload-worker','stop'].includes(action))throw Error('Use status, restart, reload-worker or stop.');
  const socket=net.createConnection(socketPath);
  socket.setTimeout(15000,()=>socket.destroy(Error('Session control timed out')));
  socket.on('connect',()=>socket.end(JSON.stringify({action})+'\n'));
  socket.on('data',data=>process.stdout.write(data));
  socket.on('error',error=>{console.error(error.message);process.exitCode=1;});
}else{
  process.chdir(root);
  const dir=process.env.GS_STATE_DIR||path.join(root,'docs/reverse-scopes');fs.mkdirSync(dir,{recursive:true});
  const logfile=path.join(dir,'audition-server.log');
  let child=null,ready=false,changing=false,closing=false;
  async function start(){
    ready=false;
    const output=fs.openSync(logfile,'a');
    child=spawn(process.execPath,['web/server.mjs'],{cwd:root,env:{...process.env,GS_GRADING_AUDITION:'1',HOST:'0.0.0.0'},stdio:['ignore',output,output,'ipc']});
    fs.closeSync(output);
    const current=child;
    current.on('exit',()=>{if(child===current){child=null;ready=false;}});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{current.kill();reject(Error('Server did not become ready; inspect audition-server.log'));},10000);
      current.once('error',e=>{clearTimeout(timer);reject(e);});
      current.once('exit',()=>{clearTimeout(timer);reject(Error('Server exited; inspect audition-server.log'));});
      current.on('message',m=>{if(m.event==='audition-ready'){clearTimeout(timer);ready=true;resolve();}});
    });
  }
  async function halt(){
    if(!child)return;
    const current=child;
    await new Promise(resolve=>{const timer=setTimeout(()=>current.kill('SIGKILL'),3000);current.once('exit',()=>{clearTimeout(timer);resolve();});current.kill('SIGTERM');});
  }
  const control=net.createServer({allowHalfOpen:true},socket=>{
    socket.setTimeout(15000,()=>socket.destroy());
    let raw='';socket.on('data',data=>{raw+=data;if(raw.length>256)socket.destroy();});
    socket.on('end',async()=>{
      try{
        const {action}=JSON.parse(raw);
        if(action==='status'){socket.end(JSON.stringify({ready,serverPid:child?.pid||null,supervisorPid:process.pid,root,logfile})+'\n');return;}
        if(changing)throw Error('A session operation is already running.');
        changing=true;
        try{
          if(action==='restart'){await halt();await start();}
          else if(action==='reload-worker'){
            if(!ready||!child)throw Error('Server is not running. Use restart.');
            const current=child;
            await new Promise((resolve,reject)=>{
              const listener=m=>{if(m.event==='audition-worker-reloaded'){clearTimeout(timer);current.off('message',listener);resolve();}};
              const timer=setTimeout(()=>{current.off('message',listener);reject(Error('Worker reload timed out'));},5000);
              current.on('message',listener);current.send({action:'reload-grading-worker'});
            });
          }else if(action==='stop'){closing=true;await halt();}
          else throw Error('Unsupported session operation.');
          socket.end(JSON.stringify({ok:true,action,ready})+'\n');
          if(closing)control.close(()=>process.exit(0));
        }finally{changing=false;}
      }catch(error){socket.end(JSON.stringify({ok:false,error:error.message})+'\n');}
    });
  });
  // Only remove a stale socket; never replace a live controller.
  if(fs.existsSync(socketPath)){
    const live=await new Promise(resolve=>{const s=net.createConnection(socketPath);s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));});
    if(live)throw Error('An audition controller is already running.');
    fs.unlinkSync(socketPath);
  }
  await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(socketPath,resolve);});
  fs.chmodSync(socketPath,0o600);
  process.on('exit',()=>{try{fs.unlinkSync(socketPath);}catch{}});
  const shutdown=async()=>{if(closing)return;closing=true;await halt();control.close(()=>process.exit(0));};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  try{await start();}catch(error){console.error(error.message);await shutdown();process.exitCode=1;}
  if(ready){
    fs.writeFileSync(path.join(dir,'audition-session.json'),JSON.stringify({socketPath,root,supervisorPid:process.pid,logfile},null,2));
    console.log('Audition ready. Codex can now reload the worker, restart or stop this server.');
    console.log('Keep this window open. Ctrl-C stops the session.');
    console.log('Local viewer: http://localhost:8765/scopes.html?grading=1');
    console.log('iPad addresses and server output: '+logfile);
  }
}
