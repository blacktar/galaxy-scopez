import {FUNCTIONS,defaultMappings,validateProfile,snapshot,describe,signature,restingInputs,armingMessage} from './gamepad-input.mjs';
import {GamepadGradingSession,mappedValues} from './gamepad-grading.mjs';
export function createGamepadEngine({getGPrime,active=()=>true,onStatus=()=>{},onUI=()=>{},hasUI=()=>true}){
 let paused=false,menu=null,choice=0,errorUntil=0;const status={set textContent(value){if(performance.now()>=errorUntil)onStatus(value);}};const fail=error=>{errorUntil=performance.now()+5000;onStatus(error.message);};const dialog={open:false,close(){this.open=false;menu=null;onUI({kind:'close'});}};
 let config=null,profile=defaultMappings(),padID='',last=0,enabled=false,armed=false,blocked=false,modifiers='',lastTarget={role:'exposure',control:'exposure'},acc=null,held=new Map(),tapTimers=new Map(),sensitivity=1,lastSend=0,epoch=0,previousButtons=[],browseViewDown=false;
 const adapter={begin:(...a)=>getGPrime().gamepad.begin(...a),set:(...a)=>getGPrime().gamepad.set(...a),end:(...a)=>getGPrime()?.gamepad.end(...a)};
 const session=new GamepadGradingSession(adapter,e=>{armed=false;acc=null;blocked=true;fail(e);});
 const labels={exposure:'Exposure',contrast:'Contrast',balance:'Balance',saturation:'Saturation',scrub:'Clip position'};
 function shutdown(){epoch++;session.stop();armed=false;acc=null;held.clear();for(const t of tapTimers.values())clearTimeout(t);tapTimers.clear();last=0;previousButtons=[];if(dialog.open)dialog.close();menu=null;}
 function actionMenu(){menu=['undo','reset','apply1','apply2','fullscreen','balanceView'];choice=0;dialog.open=true;renderMenu();}
 function renderMenu(){onUI({kind:'actions',items:menu,choice});}
 async function invoke(id,confirmed=false){const token=epoch;errorUntil=0;if(acc||session.busy||session.current){status.textContent='Release the grading controls before using this action.';return;}
  if(confirmed&&dialog.open)dialog.close();
  if(['actions','mapping','view','balanceView'].includes(id)&&!hasUI()){status.textContent='Open a viewer to use controller menus and change its view.';return;}
  if(id==='actions'){actionMenu();return;}if(id==='mapping'){menu=null;dialog.open=true;onUI({kind:'mapping',profile});return;}
  if(id==='cancel'){dialog.close();menu=null;return;}if(id==='menuUp'||id==='menuDown'){if(menu){choice=(choice+(id==='menuUp'?-1:1)+menu.length)%menu.length;renderMenu();}return;}
  if(id==='confirm'){if(menu){const selected=menu[choice];dialog.close();menu=null;return invoke(selected,true);}if(dialog.open)dialog.close();return;}
  if(id==='sensitivity'){sensitivity=sensitivity===1?2:sensitivity===2?.25:1;status.textContent='Gamepad · '+(sensitivity===1?'Normal':sensitivity===2?'Coarse':'Fine');return;}
  if(id==='normal'){sensitivity=1;status.textContent='Gamepad · Normal';return;}if(id==='view'){onUI({kind:'view'});return;}if(id==='balanceView'){onUI({kind:'balanceView'});return;}
  if(dialog.open)return;
  try{if(token!==epoch||!active())return;await getGPrime().gamepad.action(id,lastTarget,()=>token===epoch&&enabled&&!paused);armed=false;acc=null;}catch(e){fail(e);armed=false;}
 }
 function tick(time,pad){const visible=enabled&&!paused;if(!visible){if(last||session.current||session.busy)shutdown();return;}
  if(!pad){status.textContent='Select a connected controller in GPrime Settings.';shutdown();return;}
  const id=pad.id+'|'+pad.mapping;if(padID!==id){shutdown();padID=id;profile=validateProfile(config?.profile??defaultMappings());status.textContent='Controller connected.';}
  const s=snapshot(pad),rest=restingInputs(profile,s,pad.mapping),zero=rest.length===0,dt=last?Math.min(.05,(time-last)/1000):0;last=time;
  if(!active()){session.stop();acc=null;armed=false;const down=!!mappedValues(profile,s).view;if(browseViewDown&&!down)onUI({kind:'view'});browseViewDown=down;return;}browseViewDown=false;
  if(!armed){const gp=getGPrime()?.gamepad;const waiting=gp?.available()?'':gp?.waiting?.()??'Open GPrime and connect its grading controls.';const message=armingMessage({waiting,busy:session.busy,inputs:rest});if(message)status.textContent=message;if(!message&&zero&&gp?.available()&&!session.busy){armed=true;blocked=false;modifiers='[]';previousButtons=s.buttons.map(b=>b.pressed||b.value>.25);held.clear();session.recover();status.textContent='Gamepad · '+(sensitivity===1?'Normal':sensitivity===2?'Coarse':'Fine');}return;}
  const mod=JSON.stringify(s.buttons.map((b,i)=>b.pressed&&i>=4&&i<=5?i:null).filter(i=>i!==null));if(mod!==modifiers){if(acc){blocked=true;session.stop();acc=null;}modifiers=mod;}
  const v=mappedValues(profile,s);
  // Any combined input consumes a shoulder tap, including unassigned combinations.
  for(const [id,h]of held){const b=profile[id];if([4,5].includes(b?.button)&&(s.axes.some(n=>Math.abs(n)>.2)||s.buttons.some((x,i)=>i!==b.button&&(x.pressed||x.value>.25))))h.used=true;}
  for(const f of FUNCTIONS.filter(f=>f.kind==='action')){
   const binding=profile[f.id],physical=!!binding&&(s.buttons[binding.button]?.pressed||s.buttons[binding.button]?.value>.25),on=!!v[f.id];let h=held.get(f.id);
   // Qualifiers may arrive a frame after the main button. Keep the chord until
   // that button is released, rather than mistaking lost eligibility for a tap.
   if(on&&!h&&(!previousButtons[binding.button]||binding.modifiers?.length)){
    h={start:time,used:false,fired:false};held.set(f.id,h);
    if(binding.modifiers?.length)for(const [other,prior]of held){const previous=profile[other];if(other!==f.id&&(binding.modifiers.includes(previous?.button)||previous?.button===binding.button&&(previous.modifiers?.length??0)<binding.modifiers.length))prior.used=true;}
   }
   if(h&&physical&&!on&&!(binding.modifiers?.length))h.used=true;
   const dangerous=['reset','apply1','apply2'].includes(f.id);if(dangerous&&h&&!on)h.start=time;
   if(on&&h&&dangerous&&!h.used&&!h.fired&&time-h.start>=1000){h.fired=true;void invoke(f.id);}
   if(!physical&&h){held.delete(f.id);if(h.used||dangerous||['fineBalance','fineScrub'].includes(f.id))continue;
    const double=FUNCTIONS.find(other=>profile[other.id]?.gesture==='double'&&signature({...profile[other.id],gesture:'tap'})===signature({...binding,gesture:'tap'}));
    if(binding?.gesture==='double')continue;
    if(double){if(tapTimers.has(f.id)){clearTimeout(tapTimers.get(f.id));tapTimers.delete(f.id);void invoke(double.id);}else tapTimers.set(f.id,setTimeout(()=>{tapTimers.delete(f.id);void invoke(f.id);},280));}else void invoke(f.id);
   }
  }
  previousButtons=s.buttons.map(b=>b.pressed||b.value>.25);
  if(blocked){if(zero)blocked=false;else status.textContent=armingMessage({inputs:rest});return;}
  const drives={exposure:(v.exposureUp??0)-(v.exposureDown??0),contrast:(v.contrastUp??0)-(v.contrastDown??0),balance:v.balance??[0,0],saturation:[(v.satGammaUp??0)-(v.satGammaDown??0),(v.satGainUp??0)-(v.satGainDown??0)],scrub:v.scrub??0};
  const moving=role=>Array.isArray(drives[role])?drives[role].some(n=>Math.abs(n)>.001):Math.abs(drives[role])>.001;
  const role=acc&&moving(acc.role)?acc.role:Object.keys(drives).find(moving);
  if(dialog.open||!role){if(acc){session.stop();acc=null;}return;}
  if(acc&&acc.role!==role){session.stop();acc=null;blocked=true;return;}
  if(!acc&&!getGPrime()?.gamepad.available()){status.textContent='Gamepad · waiting for GPrime';return;}
  if(!acc&&(session.busy||session.current)){blocked=true;session.stop();return;}
  if(!acc){acc={role,x:0,y:0,a:0,b:0};if(role!=='scrub')lastTarget=role==='saturation'?{role,control:Math.abs(drives.saturation[0])>0?'gamma':'gain'}:{role,control:role};}
  const a=acc,fine=(role==='balance'&&v.fineBalance||role==='scrub'&&v.fineScrub)?.25:1,speed=dt*sensitivity*fine;
  if(role==='balance'){a.x=Math.max(-.5,Math.min(.5,a.x+drives.balance[0]*speed*.04));a.y=Math.max(-.5,Math.min(.5,a.y-drives.balance[1]*speed*.04));}
  else if(role==='saturation'){a.a+=drives.saturation[0]*speed*60;a.b+=drives.saturation[1]*speed*60;}
  else a.a+=drives[role]*speed*(role==='exposure'?.5:role==='contrast'?160:30);
  status.textContent='Gamepad · '+labels[role];
  if(time-lastSend>50){lastSend=time;const copy={...a};session.update(role,result=>role==='exposure'?{exposure:Math.max(-6,Math.min(6,copy.a))}:role==='contrast'?{position:Math.round(copy.a)}:role==='balance'?{x:copy.x,y:copy.y}:role==='saturation'?{gamma:Math.round((result.positions?.gamma??0)+copy.a),gain:Math.round((result.positions?.gain??0)+copy.b)}:{frame:Math.max(result.start,Math.min(result.end,result.frame+copy.a))});}
  
 }

 return {dismissUI(){if(dialog.open)dialog.close();},step:tick,configure(value){shutdown();config=value;enabled=value?.enabled===true;padID='';getGPrime()?.gamepad.enable(enabled);},pause(value){if(value!==paused){paused=value;shutdown();}},stop(){enabled=false;shutdown();},invoke, get busy(){return session.busy||!!session.current||!!acc;}};
}
