// Native input normalization shared by grading and future game consumers.
export const FUNCTIONS=[
 ['exposureUp','Increase Exposure','analog',{button:7}],['exposureDown','Decrease Exposure','analog',{button:6}],
 ['balance','Balance','vector',{axes:[2,3]}],
 ['contrastUp','Increase Contrast','analog',{button:7,modifiers:[4]}],['contrastDown','Decrease Contrast','analog',{button:6,modifiers:[4]}],
 ['satGainUp','Increase Sat Gain','analog',{button:7,modifiers:[5]}],['satGainDown','Decrease Sat Gain','analog',{button:6,modifiers:[5]}],
 ['satGammaUp','Increase Sat Gamma','analog',{axis:1,direction:-1,modifiers:[5]}],['satGammaDown','Decrease Sat Gamma','analog',{axis:1,direction:1,modifiers:[5]}],
 ['previous','Previous clip','action',{button:4}],['next','Next clip','action',{button:5}],
 ['scrub','Scrub clip','axis',{axis:0}],['fineBalance','Fine Balance (hold)','action',{button:11}],['fineScrub','Fine scrubbing (hold)','action',{button:10}],
 ['confirm','Confirm selection','action',{button:2}],['cancel','Close / cancel','action',{button:1}],['actions','Open grading actions','action',{button:0}],
 ['sensitivity','Cycle sensitivity','action',{button:3}],['normal','Normal sensitivity','action',{button:3,gesture:'double'}],
 ['undo','Undo last adjusted control','action',{button:2,modifiers:[4]}],['reset','Reset last adjusted control (hold)','action',{button:3,modifiers:[5]}],
 ['apply1','Apply 1 Prior','action',{button:0,modifiers:[4]}],['apply2','Apply 2 Prior','action',{button:0,modifiers:[5]}],['fullscreen','Clip Fullscreen','action',{button:1,modifiers:[4]}],['balanceView','Switch Balance vectorscope / DoubleD','action',{button:1,modifiers:[5]}],
 ['menuUp','Previous menu item','action',{button:12}],['menuDown','Next menu item','action',{button:13}],
 ['mapping','Show controller mapping','action',{button:9}],['view','Switch Scopes / GPrime','action',{button:8}]
].map(([id,label,kind,binding])=>({id,label,kind,binding}));
const validIndex=n=>Number.isInteger(n)&&n>=0&&n<64;
export function validateBinding(binding,kind){
 if(!binding||typeof binding!=='object'||Array.isArray(binding))throw Error('Invalid mapping.');
 const b=JSON.parse(JSON.stringify(binding)),sources=['button','axis','axes'].filter(k=>b[k]!==undefined);
 if(sources.length!==1||Object.keys(b).some(k=>!['button','axis','axes','direction','modifiers','gesture'].includes(k)))throw Error('Choose one control.');
 if(b.modifiers!==undefined&&(!Array.isArray(b.modifiers)||b.modifiers.length>3||b.modifiers.some(n=>!validIndex(n))||new Set(b.modifiers).size!==b.modifiers.length))throw Error('Invalid modifier.');
 if(b.button!==undefined&&!validIndex(b.button)||b.axis!==undefined&&!validIndex(b.axis))throw Error('Invalid control.');
 if(b.axes!==undefined&&(!Array.isArray(b.axes)||b.axes.length!==2||b.axes.some(n=>!validIndex(n))||b.axes[0]===b.axes[1]))throw Error('Use a two-axis thumbstick.');
 if(kind==='vector'&&!b.axes)throw Error('Move a thumbstick for Balance.');
 if(kind==='axis'&&b.axis===undefined)throw Error('Move a thumbstick axis for scrubbing.');
 if(kind==='action'&&b.button===undefined)throw Error('Press a button for this function.');
 if(kind==='analog'&&(b.axes||b.axis!==undefined&&![1,-1].includes(b.direction)))throw Error('Pull a trigger or move a stick in one direction.');
 if(b.direction!==undefined&&(b.axis===undefined||![1,-1].includes(b.direction)))throw Error('Invalid axis direction.');
 if(b.gesture!==undefined&&(!['tap','double'].includes(b.gesture)||b.button===undefined||kind!=='action'))throw Error('Invalid button gesture.');
 if(b.modifiers?.includes(b.button))throw Error('A control cannot modify itself.');
 if(b.modifiers)b.modifiers.sort((a,c)=>a-c);
 return b;
}
export function defaultMappings(){return Object.fromEntries(FUNCTIONS.map(f=>[f.id,structuredClone(f.binding)]));}
export function validateProfile(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid controller profile.');
 const result={};for(const f of FUNCTIONS)result[f.id]=(raw[f.id]===null||raw[f.id]===undefined&&f.binding===null)?null:validateBinding(raw[f.id]??f.binding,f.kind);return result;
}
export function signature(b){return b?JSON.stringify([b.button??null,b.axis??null,b.axes??null,b.direction??null,[...(b.modifiers??[])].sort(),b.gesture??'tap']):'';}
const standard=['A / Cross','B / Circle','X / Square','Y / Triangle','L1 / LB','R1 / RB','L2 / LT','R2 / RT','View / Share','Menu / Options','L3','R3','D-pad up','D-pad down','D-pad left','D-pad right','Home'];
export function describe(b,mapping='standard'){
 if(!b)return 'Not assigned';const button=n=>mapping==='standard'?standard[n]??`Button ${n+1}`:`Button ${n+1}`;
 const axis=n=>mapping==='standard'?['Left stick horizontal','Left stick vertical','Right stick horizontal','Right stick vertical'][n]??`Axis ${n+1}`:`Axis ${n+1}`;
 const main=b.axes?(mapping==='standard'&&b.axes[0]===0?'Left stick':mapping==='standard'&&b.axes[0]===2?'Right stick':`Axes ${b.axes.map(n=>n+1).join(' / ')}`):b.axis!==undefined?axis(b.axis)+(b.direction?(b.axis%2?(b.direction<0?' up':' down'):(b.direction<0?' left':' right')):''):button(b.button);
 return [...(b.modifiers??[]).map(n=>'Hold '+button(n)),main+(b.gesture==='double'?' (double press)':'')].join(' + ');
}
export function snapshot(pad){return {axes:Array.from(pad.axes??[],n=>Number.isFinite(n)?Math.max(-1,Math.min(1,n)):0),buttons:Array.from(pad.buttons??[],b=>({value:Number.isFinite(b.value)?Math.max(0,Math.min(1,b.value)):0,pressed:!!b.pressed}))};}
export function neutral(s){return s.axes.every(n=>Math.abs(n)<.2)&&s.buttons.every(b=>!b.pressed&&b.value<.15);}
// Capture is pure: it never dispatches actions or communicates with Resolve.
export class MappingCapture{
 constructor(kind,{mapping='standard',gesture}={}){this.kind=kind;this.mapping=mapping;this.gesture=gesture;this.armed=false;this.candidate=null;this.held=new Set();this.analogButtons=new Set();this.movedAxes=new Set();this.previous=new Set();}
 sample(s){
  if(!this.armed){if(neutral(s))this.armed=true;return null;}
  const pressed=s.buttons.flatMap((b,i)=>b.pressed||b.value>.25?[i]:[]),moving=s.axes.map((v,i)=>({v,i})).filter(x=>Math.abs(x.v)>.6);
  const rising=pressed.filter(i=>!this.previous.has(i));this.previous=new Set(pressed);
  for(const i of pressed){this.held.add(i);if(s.buttons[i].value>0&&s.buttons[i].value<.95||this.mapping==='standard'&&[6,7].includes(i))this.analogButtons.add(i);}
  for(const {i}of moving)this.movedAxes.add(i);
  if(moving.length&&this.kind!=='action'){
   const dominant=moving.reduce((a,b)=>Math.abs(a.v)>=Math.abs(b.v)?a:b);
   if(this.kind==='vector'){
    const pair=this.mapping==='standard'&&dominant.i<4?[Math.floor(dominant.i/2)*2,Math.floor(dominant.i/2)*2+1]:[...this.movedAxes].sort((a,b)=>a-b);
    if(pair.length===2)this.candidate={axes:pair,modifiers:[...this.held].filter(i=>!this.analogButtons.has(i))};
   }else this.candidate={axis:dominant.i,...(this.kind==='analog'?{direction:Math.sign(dominant.v)}:{}),modifiers:[...this.held].filter(i=>!this.analogButtons.has(i))};
  }else if(!this.candidate?.axes&&this.candidate?.axis===undefined&&(this.kind==='action'?rising.length:pressed.length)){
   const trigger=[...this.analogButtons].at(-1),main=this.kind==='analog'?trigger:rising.at(-1);
   if(main!==undefined)this.candidate={button:main,modifiers:[...this.held].filter(i=>i!==main),...(this.gesture?{gesture:this.gesture}:{})};
  }
  if(!neutral(s)||!this.held.size&&!this.movedAxes.size)return null;
  if(!this.candidate)throw Error(this.kind==='analog'?'Use a trigger or stick, rather than a digital button.':this.kind==='vector'?'Move both axes of a thumbstick.':'Use a compatible control.');
  return validateBinding(this.candidate,this.kind);
 }
}

// Only mapped inputs can prevent arming; unrelated vendor axes/buttons are ignored.
export function restingInputs(profile,s,mapping='standard'){
 const axes=new Set(),buttons=new Set();for(const b of Object.values(profile)){if(!b)continue;if(b.axis!==undefined)axes.add(b.axis);for(const n of b.axes??[])axes.add(n);if(b.button!==undefined)buttons.add(b.button);for(const n of b.modifiers??[])buttons.add(n);}
 const result=[];for(const n of axes)if(Math.abs(s.axes[n]??0)>=.18)result.push('centre '+describe({axis:n},mapping));for(const n of buttons)if(s.buttons[n]?.pressed||(s.buttons[n]?.value??0)>=.15)result.push('release '+describe({button:n},mapping));return result;
}
export function armingMessage({waiting='',busy=false,inputs=[]}={}){if(waiting)return waiting;if(busy)return 'Finishing the previous adjustment…';if(inputs.length)return 'To start: '+inputs.slice(0,3).join('; ')+(inputs.length>3?'; and other held controls.':'.');return ''; }
