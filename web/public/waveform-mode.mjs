// Waveform channels share source x coordinates; chroma is centred on zero.
export function waveformMode(value='y'){if(!['y','rgb','cbcr'].includes(value))throw Error('Invalid waveform mode');return value;}
export function waveformScopes(layout,mode,options={}){const scopes=options.scopes??[];return [...new Set([...scopes,...(layout.includes(0)&&mode==='rgb'?[1]:layout.includes(0)&&mode==='cbcr'?[12]:[])])].sort((a,b)=>a-b);}
export function chromaWaveform(frame,c,decode,selected,matrix){
 const counts=new Uint32Array(c.activeScopes.includes(12)?c.waveWidth*c.levels*2:1);
 if(!c.activeScopes.includes(12))return counts;
 for(let y=c.y0;y<c.y1;y++)for(let x=c.x0;x<c.x1;x++){
  const at=(y*frame.width+x)*3,rgb=decode(frame.data[at],frame.data[at+1],frame.data[at+2],frame.signal),l=(matrix.kr*rgb[0]+matrix.kg*rgb[1])+matrix.kb*rgb[2];
  if(!selected(...rgb,l,c)||!rgb.every(Number.isFinite))continue;
  const values=[(rgb[2]-l)/(2*(1-matrix.kb)),(rgb[0]-l)/(2*(1-matrix.kr))],wx=Math.floor((x-c.x0)*c.waveWidth/(c.x1-c.x0));
  values.forEach((v,ch)=>{v+=.5;if(v>=c.min&&v<=c.max){const iy=Math.round((v-c.min)/(c.max-c.min)*(c.levels-1));counts[(ch*c.levels+iy)*c.waveWidth+wx]++;}});
 }
 return counts;
}
