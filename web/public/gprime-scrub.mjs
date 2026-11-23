export function mountHeroScrub({parent,call,reserve,release,error}){
 const box=document.createElement('div');box.className='gp-hero';box.innerHTML='<div class="gp-hero-label"><span>Park on the hero · hold for 1 second to scrub</span><output>—</output></div><div class="gp-hero-strip" tabindex="0" role="slider" aria-label="Clip position — hold for one second to scrub" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i><b></b></div>';
 const style=document.createElement('style');style.textContent='.gp-hero{order:4;margin-top:auto;position:relative;clear:both;box-sizing:border-box;width:100%;padding:8px 16px 16px;flex:0 0 auto;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.gp-hero-label{display:flex;justify-content:space-between;gap:12px;color:#999;font-size:12px;margin-bottom:8px}.gp-hero-strip{position:relative;height:44px;border:1px solid #444;background:linear-gradient(90deg,#151515 0%,#303030 50%,#151515 100%);touch-action:none;overflow:hidden}.gp-hero-strip i{position:absolute;inset:0 auto 0 0;width:0;background:#ffffff18;pointer-events:none}.gp-hero-strip b{position:absolute;top:3px;bottom:3px;width:4px;background:#999;left:0;pointer-events:none}.gp-hero-strip[data-armed=true]{border-color:#999}.gp-hero-strip[data-armed=true] b{background:#fff}';parent.append(style,box);
 const strip=box.querySelector('.gp-hero-strip'),label=box.querySelector('span'),out=box.querySelector('output'),progress=box.querySelector('i'),handle=box.querySelector('b');
 let info=null,target=null,drag=null,loading=false;
 const text='Park on the hero · hold for 1 second to scrub';
 function render(data){if(!data)return;info={...info,...data};out.value=info.timecode;const p=info.end===info.start?0:(info.frame-info.start)/(info.end-info.start)*100;handle.style.left=`calc(${Math.max(0,Math.min(100,p))}% - ${p>50?4:0}px)`;strip.setAttribute('aria-valuenow',String(Math.round(p)));strip.setAttribute('aria-valuetext',info.timecode);}
 async function load(){if(drag||loading)return;loading=true;try{const clip=await call('inspect');target=[clip.projectId,clip.timelineId,clip.clipId];render(await call('gprime-action',{operation:'scrub-info',target}));}catch(e){out.value='Unavailable';}finally{loading=false;}}
 async function pump(d){
  if(d.sending)return;d.sending=true;
  try{
   while(d.pending!==null&&!d.cancelled){const frame=d.pending;d.pending=null;render(await call('gprime-action',{operation:'scrub-set',target:d.target,gesture:d.token,frame}));d.moved=true;if(d.pending!==null)await new Promise(r=>setTimeout(r,60));}
   if(d.released||d.cancelled){await call('gprime-action',{operation:'scrub-end',target:d.target,gesture:d.token});finish(d);}
  }catch(e){error(e);finish(d);}finally{d.sending=false;if(drag===d&&(d.pending!==null||d.released||d.cancelled))void pump(d);}
 }
 function finish(d){if(drag!==d)return;clearInterval(d.timer);drag=null;strip.dataset.armed='false';progress.style.width='0';label.textContent=text;release(!!d.moved);}
 strip.addEventListener('pointerdown',event=>{
  if(drag||loading||!info||!target||!reserve())return;event.preventDefault();strip.setPointerCapture(event.pointerId);
  const d=drag={id:event.pointerId,x:event.clientX,y:event.clientY,width:strip.clientWidth,target:[...target],pending:null,token:null,released:false,cancelled:false,sending:false,started:performance.now()};
  label.textContent='Keep holding to unlock scrubbing…';
  d.timer=setInterval(async()=>{
   const elapsed=performance.now()-d.started;progress.style.width=Math.min(100,elapsed/10)+'%';if(elapsed<1000)return;clearInterval(d.timer);
   try{const data=await call('gprime-action',{operation:'scrub-begin',target:d.target});d.token=data.gesture;d.origin=data.frame;d.start=data.start;d.end=data.end;render(data);if(drag!==d||d.released||d.cancelled){await call('gprime-action',{operation:'scrub-end',target:d.target,gesture:d.token});finish(d);return;}strip.dataset.armed='true';label.textContent='Scrubbing unlocked · drag to park, release to lock';}
   catch(e){error(e);finish(d);}
  },40);
 });
 strip.addEventListener('pointermove',event=>{const d=drag;if(!d||d.id!==event.pointerId||d.released)return;event.preventDefault();if(!d.token){if(Math.hypot(event.clientX-d.x,event.clientY-d.y)>12){d.cancelled=true;finish(d);}return;}d.pending=Math.max(d.start,Math.min(d.end,Math.round(d.origin+(event.clientX-d.x)/d.width*(d.end-d.start))));void pump(d);});
 const end=event=>{const d=drag;if(!d||(event&&event.pointerId!==d.id))return;d.released=true;clearInterval(d.timer);if(d.token)void pump(d);else finish(d);};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])strip.addEventListener(type,end);
 strip.addEventListener('touchmove',e=>{if(e.cancelable)e.preventDefault();},{passive:false});strip.addEventListener('contextmenu',e=>e.preventDefault());
 document.addEventListener('visibilitychange',()=>{if(document.hidden){if(drag){drag.pending=null;drag.cancelled=true;}end();}});
 return {load,cancel(){if(drag){drag.pending=null;drag.cancelled=true;end();}}};
}
