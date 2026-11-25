export const DEFAULT_LAYOUT=[4,5,6,7];
export const SCOPE_NAMES=['Waveform','Parade','Histogram','Vectorscope','Vectorscope · Lows','Vectorscope · Mids','Vectorscope · Highs','DoubleD','Histogram · Separate','Vectorscopes · High / Mid / Low','Red histogram','Green histogram','Blue histogram','3D colour cube','Saturation vs luma','Hue histogram','Scopez Quest','Galaxy Synth (experimental)','GPrime','CIE Chromaticity'];
export function validLayout(a){return Array.isArray(a)&&a.length===4&&a.every(v=>Number.isInteger(v)&&v>=-1&&v<SCOPE_NAMES.length)&&[16,17,18].every(k=>a.filter(v=>v===k).length<=1);}
export function assignSlot(layout,slot,scope){if(!validLayout(layout)||!Number.isInteger(slot)||slot<0||slot>3||!Number.isInteger(scope)||scope< -1||scope>=SCOPE_NAMES.length)throw Error('Invalid scope layout');const next=[...layout];if([16,17,18].includes(scope)){const other=next.indexOf(scope);if(other>=0&&other!==slot)next[other]=next[slot];}next[slot]=scope;return next;}
export const LAYOUT_MODES=['top','bottom','left','right','grid','row','column','single','two'];
export function singleLayout(layout){const scope=layout.includes(16)?16:layout[3]>=0?layout[3]:layout.find(v=>v>=0)??-1;return [-1,-1,-1,scope];}
export function twoLayout(layout){if(layout[1]<0&&layout[2]<0)return [...layout];const main=layout[3]>=0?layout[3]:layout.includes(16)?16:layout.find(v=>v>=0)??-1;const mainSlot=layout[3]>=0?3:layout.includes(16)?layout.indexOf(16):layout.findIndex(v=>v>=0);const left=layout.includes(16)&&main!==16?16:layout.find((v,i)=>v>=0&&i!==mainSlot)??-1;return [left,-1,-1,main];}
// Return only occupied tracks. Slots 0–2 form a group; slot 3 is the main panel.
export function arrangeLayout(layout,mode='top',share=40){
 if(!validLayout(layout)||!LAYOUT_MODES.includes(mode)||!Number.isFinite(share)||share<20||share>80)throw Error('Invalid scope arrangement');
 if(mode==='single')layout=singleLayout(layout);
 if(mode==='two')layout=twoLayout(layout);
 const active=layout.map((v,slot)=>({v,slot})).filter(x=>x.v>=0),group=active.filter(x=>x.slot<3),main=active.find(x=>x.slot===3),positions={};
 const repeat=n=>`repeat(${Math.max(1,n)},minmax(0,1fr))`;
 const put=(slot,column,row)=>{positions[slot]={column:String(column),row:String(row)};};
 let columns='minmax(0,1fr)',rows='minmax(0,1fr)';
 if(['top','bottom','left','right'].includes(mode)){
  const side=mode==='left'||mode==='right',reverse=mode==='bottom'||mode==='right';
  if(group.length&&main){
   const weights=reverse?[100-share,share]:[share,100-share];
   if(side){columns=weights.map(v=>`minmax(0,${v}fr)`).join(' ');rows=repeat(group.length);[...group].reverse().forEach((x,i)=>put(x.slot,reverse?2:1,i+1));put(3,reverse?1:2,'1 / -1');}
   else{columns=repeat(group.length);rows=weights.map(v=>`minmax(0,${v}fr)`).join(' ');group.forEach((x,i)=>put(x.slot,i+1,reverse?2:1));put(3,'1 / -1',reverse?1:2);}
  }else if(group.length){if(side){rows=repeat(group.length);[...group].reverse().forEach((x,i)=>put(x.slot,1,i+1));}else{columns=repeat(group.length);group.forEach((x,i)=>put(x.slot,i+1,1));}}
  else if(main)put(3,1,1);
 }else if(mode==='column'){rows=repeat(active.length);[...group].reverse().concat(main?[main]:[]).forEach((x,i)=>put(x.slot,1,i+1));}
 else if(mode==='row'||mode==='two'){columns=repeat(active.length);active.forEach((x,i)=>put(x.slot,i+1,1));}
 else{const cols=active.length>1?2:1;columns=repeat(cols);rows=repeat(Math.ceil(active.length/cols));active.forEach((x,i)=>put(x.slot,active.length===3&&i===2?'1 / -1':i%cols+1,Math.floor(i/cols)+1));}
 return {columns,rows,positions};
}

// Both histogram views share the same exact count plane; never analyse it twice.
export function analysisScopes(layout,{gprimeDoubleD=false,gprimeWaveform=false,paradeMode='rgb',paradePq=false,histogramMode='rgb'}={}){return [...new Set(layout.filter(i=>i>=0).flatMap(i=>(i===2||i===8)&&histogramMode==='yrgb'?[2,15]:i===1?(paradeMode==='yrgb'?[paradePq?13:0,1]:paradeMode==='ycbcr'?[paradePq?13:0,12]:[1]):i===19?[11]:i===18?[gprimeDoubleD?7:3,...(gprimeWaveform?[0]:[])]:i===17?[3,9]:i===9?[4,5,6]:[i===16?3:i===14?9:i===15?10:i===13?8:i===8||i>=10?2:i]))].sort((a,b)=>a-b);}

// An active Scopez Quest has no second menu entry, even in alternate settings controls.
export function scopeChoices(layout,current=-1){return SCOPE_NAMES.map((name,id)=>({name,id})).filter(item=>item.id!==16||!layout.includes(16)||current===16);}
