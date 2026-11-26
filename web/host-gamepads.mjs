import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {createGamepadEngine} from './public/gamepad-engine.mjs';
import {defaultMappings,validateProfile} from './public/gamepad-input.mjs';

// Same-user authenticated native socket, one outstanding poll, bounded reply.
export function readNativeGamepads(){return new Promise((resolve,reject)=>{
 let endpoint;try{endpoint=JSON.parse(fs.readFileSync(`/tmp/galaxy-scopez-control-${process.getuid()}/endpoint.json`,'utf8'));}catch(e){reject(e);return;}
 const socket=net.createConnection(endpoint.socket);let raw='',done=false;
 const finish=(error,value)=>{if(done)return;done=true;socket.destroy();error?reject(error):resolve(value);};
 socket.setTimeout(600,()=>finish(Error('GS controller listener did not respond.')));
 socket.on('connect',()=>socket.write(JSON.stringify({token:endpoint.token,action:'gamepads'})+'\n'));
 socket.on('data',chunk=>{raw+=chunk;if(raw.length>32768){finish(Error('Controller reply too large.'));return;}if(raw.includes('\n'))try{const value=JSON.parse(raw);if(!value.ok)throw Error(value.error||'Native controller listener unavailable.');finish(null,value);}catch(e){finish(e);}});
 socket.on('error',e=>finish(e));socket.on('end',()=>{if(!done)finish(Error('Native controller listener disconnected.'));});
});}
export function normalisePad(raw,key,location){
 if(!raw||typeof raw.id!=='string'||!Array.isArray(raw.axes)||!Array.isArray(raw.buttons)||raw.axes.length>64||raw.buttons.length>64)throw Error('Invalid controller snapshot');
 const number=(n,min,max)=>{if(!Number.isFinite(n)||n<min||n>max)throw Error('Invalid controller input');return n;};
 return {id:raw.id.slice(0,200),key,index:key,location:location.slice(0,120),mapping:raw.mapping==='standard'?'standard':'',connected:true,
  axes:raw.axes.map(v=>number(v,-1,1)),buttons:raw.buttons.map(b=>{const value=number(typeof b==='number'?b:b?.value,0,1);return {value,pressed:typeof b==='number'?value>.25:b.pressed===true};})};
}
export function createHostGradeAdapter(request,onResult=()=>{}){
 let ready=false,waiting='Connecting GPrime to Resolve…',current=null,preparing=false,preparation=null,actionBusy=false,bindings={},panelReady=false;
 async function call(action,extra={}){const response=await request({action,...extra});if(!response?.ok)throw Error(response?.error||'GPrime is unavailable.');onResult(action,response.result);return response.result;}
 function prepare(){if(preparation)return preparation;if(current||actionBusy)return Promise.resolve();preparing=true;preparation=(async()=>{try{const result=await call('gprime-ready');bindings=result.bindings??{};panelReady=result.panelReady;ready=Object.values(bindings).some(b=>b.enabled);waiting=ready?'':'Assign the GPrime nodes in Settings first.';}catch(e){ready=false;waiting=e.message;}finally{preparing=false;preparation=null;}})();return preparation;}
 const api={enable(){},available:()=>ready&&!current&&!preparing&&!actionBusy,waiting:()=>preparing?'Connecting GPrime to Resolve…':actionBusy?'Finishing the current action…':current?'Finish the current adjustment.':waiting,
  async begin(role){if(!api.available())throw Error(api.waiting());if(role!=='scrub'&&(!bindings[role]?.enabled||['contrast','saturation'].includes(role)&&!panelReady))throw Error('Bind this control and connect GPrime first.');
   if(role==='scrub'){const info=await call('inspect'),target=[info.projectId,info.timelineId,info.clipId];const result=await call('gprime-action',{operation:'scrub-begin',target});current={role,target,gesture:result.gesture};return result;}
   const result=await call('gprime-begin',{role});current={role,gesture:result.gesture};return result;},
  async set(role,gesture,values){if(current?.gesture!==gesture||current.role!==role)throw Error('Controller gesture ended.');return role==='scrub'?call('gprime-action',{operation:'scrub-set',target:current.target,gesture,frame:Math.round(values.frame)}):call('gprime-set',{role,gesture,values});},
  async end(){const old=current;current=null;if(!old)return;try{await (old.role==='scrub'?call('gprime-action',{operation:'scrub-end',target:old.target,gesture:old.gesture}):call('gprime-end',{role:old.role,gesture:old.gesture}));}catch(e){ready=false;waiting=e.message;throw e;}},
  async action(id,last,valid=()=>true){if(preparation)await preparation;if(!valid())return;if(!api.available())throw Error(api.waiting());actionBusy=true;try{if(['undo','reset'].includes(id))await call('gprime-'+id,last);else{const operation={previous:'previous',next:'next',apply1:'apply-one',apply2:'apply-two',fullscreen:'fullscreen'}[id];if(!operation)return;const info=await call('inspect');if(!valid())return;await call('gprime-action',{operation,target:[info.projectId,info.timelineId,info.clipId]});}}finally{actionBusy=false;}ready=false;await prepare();}
 };
 return {gamepad:api,prepare};
}
export function createGamepadHub({request,readNative=readNativeGamepads,stateFile,now=()=>Date.now(),clock=()=>performance.now(),autoStart=true}={}){
 const clients=new Map(),hostPads=new Map();let capture=null,owner=null,polling=false,closed=false,hostName=os.hostname(),nativeError='',status='',lastPrepare=0,lastBroadcast=0,lastPoll=0,sequence=0,configRevision=0;
 let config={version:2,enabled:false,controller:'',profiles:{}};
 try{const saved=JSON.parse(fs.readFileSync(stateFile,'utf8'));config.controller=String(saved.controller||'').slice(0,300);for(const [id,profile]of Object.entries(saved.profiles??{}).slice(0,16))if(id.length<=300)config.profiles[id]=validateProfile(profile);}catch{}
 function save(){if(!stateFile)return;fs.mkdirSync(path.dirname(stateFile),{recursive:true});const temp=stateFile+'.tmp';fs.writeFileSync(temp,JSON.stringify({...config,enabled:false}),{mode:0o600});fs.renameSync(temp,stateFile);}
 const devices=()=>[...hostPads.values(),...[...clients.values()].flatMap(c=>now()-c.at<1500?[...c.pads.values()]:[])].filter(p=>now()-p.at<1500);
 const selected=()=>devices().find(p=>p.key===config.controller&&now()-p.at<250)??null;
 const profileFor=pad=>config.profiles[(pad.id+'|'+pad.mapping).slice(0,300)]??defaultMappings();
 const send=(client,value)=>{if(client.ws.readyState===1&&client.ws.bufferedAmount<65536)client.ws.send(JSON.stringify(value));};
 const ui=value=>{if(owner&&clients.has(owner))send(clients.get(owner),{type:'gamepad_ui',value});};
 const adapter=createHostGradeAdapter(request,(action,result)=>{if(['gprime-set','gprime-end','gprime-undo','gprime-reset','gprime-action'].includes(action))for(const c of clients.values())send(c,{type:'gamepad_result',action,result});});
 const engine=createGamepadEngine({getGPrime:()=>adapter,onStatus:value=>{status=value;},onUI:ui,hasUI:()=>!!owner&&clients.has(owner)});
 function configure(){const pad=selected();engine.configure({enabled:config.enabled,profile:pad?profileFor(pad):defaultMappings()});lastPrepare=0;}
 let selectedKey='';
 function broadcast(){const pads=devices();for(const c of clients.values()){const update=c.revision===configRevision?{}:{config};c.revision=configRevision;send(c,{...update,type:'gamepad_state',sequence:++sequence,client:c.id,devices:pads.map(({axes,buttons,at,...p})=>p),pad:selected(),capture:capture?.id??null,status:config.enabled?status:'Gamepad mode is off.',nativeError});}}
 async function pollNative(){if(polling||closed)return;polling=true;try{const result=await readNative();if(closed)return;const fresh=new Map();hostName=String(result.host||hostName).slice(0,80);for(const raw of (result.controllers??[]).slice(0,8)){if(typeof raw.device!=='string'||raw.device.length>100)continue;const key='host:'+raw.device;fresh.set(key,{...normalisePad(raw,key,'GS host — '+hostName),at:now()});}hostPads.clear();for(const [k,v]of fresh)hostPads.set(k,v);nativeError='';}catch{nativeError='Host controller discovery is unavailable. Check that the GS app is running and up to date.';}finally{polling=false;}}
 function step(){if(closed)return;const time=now();if(capture&&time-capture.at>3000)capture=null;
  for(const [key,c]of clients)if(time-c.at>5000){clients.delete(key);if(capture?.id===key)capture=null;if(owner===key){engine.dismissUI();owner=null;}}
  const pad=selected(),key=pad?.key??'';if(key!==selectedKey){selectedKey=key;configure();}
  engine.pause(!!capture);engine.step(clock(),pad);
  if(config.enabled&&pad&&!engine.busy&&!capture&&time-lastPrepare>2500){lastPrepare=time;void adapter.prepare();}
  if(time-lastPoll>=(config.enabled&&config.controller.startsWith('host:')?16:250)){lastPoll=time;void pollNative();}
  if(time-lastBroadcast>=(capture?16:80)){lastBroadcast=time;broadcast();}
 }
 function handle(ws,msg){
  if(typeof msg.type!=='string'||!msg.type.startsWith('gamepad_'))return false;
  try{
   let c=[...clients.values()].find(c=>c.ws===ws);
   if(msg.type==='gamepad_join'){
    if(c)return true;if(clients.size>=16)throw Error('Too many controller viewers connected.');
    const id='viewer:'+crypto.randomUUID(),label=String(msg.label||'Viewer').replace(/[\x00-\x1f\x7f]/g,'').slice(0,70);c={ws,id,label,pads:new Map(),revision:-1,at:now()};clients.set(id,c);if(!owner&&config.enabled)owner=id;
    // Import existing mappings once, but never silently enable/select a source.
    if(!Object.keys(config.profiles).length&&msg.profiles&&typeof msg.profiles==='object'){for(const [k,v]of Object.entries(msg.profiles).slice(0,16))if(k.length<=300)config.profiles[k]=validateProfile(v);save();}
    broadcast();return true;
   }
   if(!c)throw Error('Connect the controller viewer first.');c.at=now();
   if(msg.type==='gamepad_inputs'){
    const pads=new Map();for(const raw of (Array.isArray(msg.pads)?msg.pads:[]).slice(0,8)){if(!Number.isInteger(raw.index)||raw.index<0||raw.index>63)continue;const device=typeof raw.device==='string'?raw.device:raw.id;if(typeof device!=='string'||device.length>200)throw Error('Invalid controller identity');const key=c.id+':'+raw.index+':'+device;pads.set(key,{...normalisePad(raw,key,'Viewer — '+c.label),at:now()});}c.pads=pads;
    if(capture?.id===c.id)capture.at=now();
   }else if(msg.type==='gamepad_config'){
    if(capture&&capture.id!==c.id)throw Error('Another viewer is assigning a mapping.');
    const next=msg.config;if(!next||typeof next.enabled!=='boolean')throw Error('Invalid controller configuration.');
    const controller=String(next.controller??'');if(controller&&controller!==config.controller&&!devices().some(p=>p.key===controller))throw Error('Choose a connected controller.');
    const profiles={};for(const [k,v]of Object.entries(next.profiles??{}).slice(0,16))if(k.length<=300)profiles[k]=validateProfile(v);
    config={version:2,enabled:next.enabled,controller,profiles};owner=c.id;configRevision++;configure();save();broadcast();
   }else if(msg.type==='gamepad_capture'){
    if(msg.active){if(capture&&capture.id!==c.id)throw Error('Another viewer is assigning a mapping.');capture={id:c.id,at:now()};engine.pause(true);}else if(capture?.id===c.id){capture=null;engine.pause(false);}broadcast();
   }else if(msg.type==='gamepad_ui_action'){if(owner!==c.id)throw Error('Use the viewer that enabled this controller.');if(!['undo','reset','apply1','apply2','fullscreen','balanceView','cancel'].includes(msg.action))throw Error('Unsupported controller action.');void engine.invoke(msg.action,true);}
  }catch(e){if(ws.readyState===1)ws.send(JSON.stringify({type:'gamepad_error',message:e.message}));}
  return true;
 }
 const timer=autoStart?setInterval(step,16):null;timer?.unref();if(autoStart)void pollNative();
 return {handle,step,pollNative,get state(){return {config,devices:devices(),capture,status};},disconnect(ws){for(const [key,c]of clients)if(c.ws===ws){clients.delete(key);if(capture?.id===key){capture=null;engine.pause(false);}if(owner===key){engine.dismissUI();owner=null;}}step();},stop(){closed=true;clearInterval(timer);engine.stop();clients.clear();hostPads.clear();}};
}
