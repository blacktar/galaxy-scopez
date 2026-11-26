import {FUNCTIONS,describe} from './gamepad-input.mjs';
export function mountGamepadClient({toggleView,balanceView,onResult=()=>{}}={}){
 let ws=null,state=null,stopped=false,timer=0,retry=0,uiOwner=false;const deviceIDs=new Map(),listeners=new Set(),key='gprimeGamepadSetupV1';
 const status=document.createElement('p');status.className='gamepad-grading-status';status.style.cssText='margin:4px 16px;color:#aaa;font-size:12px';status.hidden=true;document.getElementById('scopeview').before(status);
 const dialog=document.createElement('dialog');dialog.style.cssText='max-width:min(90vw,640px);max-height:80dvh;overflow:auto;background:#161616;color:#ddd;border:1px solid #666';document.body.append(dialog);
 const send=value=>{if(ws?.readyState===1&&ws.bufferedAmount<32768)ws.send(JSON.stringify(value));};
 function renderUI(value){if(value.kind==='view'){toggleView?.();return;}if(value.kind==='balanceView'){balanceView?.();return;}if(value.kind==='close'){uiOwner=false;dialog.close();return;}
  uiOwner=true;dialog.replaceChildren();const title=document.createElement('h3');title.textContent=value.kind==='mapping'?'Controller mappings':'GPrime actions';dialog.append(title);
  for(const [i,id]of (value.kind==='mapping'?FUNCTIONS.map(f=>f.id):value.items).entries()){const f=FUNCTIONS.find(f=>f.id===id),row=document.createElement(value.kind==='mapping'?'p':'button');row.textContent=value.kind==='mapping'?f.label+': '+describe(value.profile[id]):(i===value.choice?'› ':'')+f.label;if(value.kind!=='mapping'){row.type='button';row.style.cssText='display:block;margin:8px 0;width:100%;text-align:left';row.onclick=()=>send({type:'gamepad_ui_action',action:id});}dialog.append(row);}
  const close=document.createElement('button');close.textContent='Close';close.onclick=()=>send({type:'gamepad_ui_action',action:'cancel'});dialog.append(close);if(!dialog.open)dialog.showModal();
 }
 dialog.addEventListener('cancel',()=>send({type:'gamepad_ui_action',action:'cancel'}));
 function updateStatus(){status.hidden=!state?.config.enabled;status.textContent=state?.status??'';}
 window.addEventListener('gamepaddisconnected',event=>deviceIDs.delete(event.gamepad.index));window.addEventListener('gamepadconnected',event=>deviceIDs.delete(event.gamepad.index));
 function publish(){if(stopped)return;let pads=[];if(!document.hidden)try{pads=Array.from(navigator.getGamepads?.()??[]).filter(p=>p?.connected).slice(0,8).map(p=>{let entry=deviceIDs.get(p.index);if(!entry||entry.id!==p.id){entry={id:p.id,device:(crypto.randomUUID?.()??Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-'))};deviceIDs.set(p.index,entry);}return {device:entry.device,id:p.id,index:p.index,mapping:p.mapping,axes:Array.from(p.axes).slice(0,64),buttons:Array.from(p.buttons).slice(0,64).map(b=>({value:b.value,pressed:b.pressed}))};});}catch{}
  send({type:'gamepad_inputs',pads});const selected=state?.config.controller?.startsWith(state?.client+':');timer=setTimeout(publish,!document.hidden&&state?.config.enabled&&selected?16:250);
 }
 function connect(){if(stopped)return;ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host);
  ws.onopen=()=>{let profiles;try{profiles=JSON.parse(localStorage.getItem(key))?.profiles;}catch{}const label=(document.getElementById('viewerlabel')?.value||'Viewer')+' — '+(/iPad/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1?'iPad':/iPhone/.test(navigator.userAgent)?'iPhone':/Android/.test(navigator.userAgent)?'Android':navigator.platform||'browser');send({type:'gamepad_join',label,profiles});clearTimeout(timer);publish();};
  ws.onmessage=event=>{try{const message=JSON.parse(event.data);if(message.type==='gamepad_state'){if(!message.config)message.config=state?.config;state=message;updateStatus();for(const fn of listeners)fn(state);}else if(message.type==='gamepad_ui')renderUI(message.value);else if(message.type==='gamepad_result')onResult(message.action,message.result);else if(message.type==='gamepad_error'){status.hidden=false;status.textContent=message.message;}}catch{}};
  ws.onclose=()=>{clearTimeout(timer);state=null;if(uiOwner)dialog.close();status.hidden=false;status.textContent='Gamepad connection lost. Reconnecting…';for(const fn of listeners)fn(null);retry=setTimeout(connect,1000);};
 }
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);publish();if(document.hidden)send({type:'gamepad_capture',active:false});});
 document.addEventListener('gprime-gamepad-capture',()=>send({type:'gamepad_capture',active:document.documentElement.dataset.gamepadCapture==='true'}));
 connect();
 return {get state(){return state;},subscribe(fn){listeners.add(fn);if(state)fn(state);return ()=>listeners.delete(fn);},
  navigator:{getGamepads(){if(!state)return [];return state.devices.map(p=>({...p,id:p.id+' ('+p.location+')',profileKey:(p.id+'|'+p.mapping).slice(0,300),index:p.key,axes:state.pad?.key===p.key?state.pad.axes:[],buttons:state.pad?.key===p.key?state.pad.buttons:[]}));}},
  storage:{getItem(){return JSON.stringify(state?.config??{enabled:false,profiles:{}});},setItem(_,value){const config=JSON.parse(value);send({type:'gamepad_config',config});}},
  capturing:()=>state?.capture===state?.client,
  stop(){stopped=true;clearTimeout(timer);clearTimeout(retry);send({type:'gamepad_capture',active:false});ws?.close();}
 };
}
