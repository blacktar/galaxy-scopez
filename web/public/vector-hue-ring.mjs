import {MATRICES} from './signal.mjs';

// Use the inverse of the same Cb/Cr transform as the plotted signal.
// Normalising the RGB differences gives a display hue without clipping channels.
export function vectorHueColour(angle,matrix='bt709'){
 const {kr,kg,kb}=MATRICES[matrix]??MATRICES.bt709;
 const r=2*(1-kr)*Math.sin(angle),b=2*(1-kb)*Math.cos(angle),g=-(kr*r+kb*b)/kg;
 const min=Math.min(r,g,b),span=Math.max(r,g,b)-min;
 return 'rgb('+[r,g,b].map(v=>Math.round(65+155*(v-min)/span)).join(',')+')';
}
const palettes=new Map();
export function vectorHueRing(matrix){
 if(!MATRICES[matrix])matrix='bt709';
 if(!palettes.has(matrix))palettes.set(matrix,Array.from({length:120},(_,i)=>({start:i*Math.PI/60,end:(i+1.1)*Math.PI/60,colour:vectorHueColour((i+.5)*Math.PI/60,matrix)})));
 return palettes.get(matrix);
}
export function drawVectorHueRing(ctx,cx,cy,r,matrix){
 ctx.save();ctx.lineWidth=r*.025;
 for(const {start,end,colour} of vectorHueRing(matrix)){ctx.strokeStyle=colour;ctx.beginPath();ctx.arc(cx,cy,r,-end,-start);ctx.stroke();}
 ctx.font=`${Math.max(8,Math.round(r*.055))}px sans-serif`;ctx.fillStyle='#bbb';ctx.textAlign='center';ctx.textBaseline='middle';
 for(let d=0;d<360;d+=60){const a=d*Math.PI/180,k=r*.90;ctx.fillText(d+'°',cx+k*Math.cos(a),cy-k*Math.sin(a));}
 ctx.restore();
}
