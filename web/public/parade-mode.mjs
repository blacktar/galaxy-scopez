// Parade presentation reuses exact waveform/channel counts; it never derives
// luma from independent RGB distributions (which would lose correlation).
export function paradeMode(value='rgb'){if(!['rgb','yrgb','ycbcr'].includes(value))throw Error('Invalid parade mode');return value;}
export function paradeScopes(mode='rgb',pqWave=false){return mode==='yrgb'?[pqWave?13:0,1]:mode==='ycbcr'?[pqWave?13:0,12]:[1];}
export function paradeChannels(data){
 const c=data.config,mode=paradeMode(c.paradeMode),size=c.waveWidth*c.levels,cut=(field,ch=0)=>data[field]?.subarray(ch*size,(ch+1)*size),rgb=['R','G','B'].map((name,ch)=>({name,values:cut('parade',ch),ink:[[1,.22,.18],[.23,.9,.36],[.25,.48,1]][ch]})),y={name:'Y',values:cut(data.measurement?.waveformUnit==='pq-nits'?'waveEncoded':'wave'),ink:[1,1,1]};
 return mode==='yrgb'?[y,...rgb]:mode==='ycbcr'?[y,{name:'Cb',values:cut('waveChroma'),ink:[.25,.48,1]},{name:'Cr',values:cut('waveChroma',1),ink:[1,.22,.18]}]:rgb;
}
export function encodedLumaWave(frame,c,decode,selected,matrix){
 const out=new Uint32Array(c.activeScopes.includes(13)?c.waveWidth*c.levels:1);if(!c.activeScopes.includes(13))return out;
 for(let y=c.y0;y<c.y1;y++)for(let x=c.x0;x<c.x1;x++){
  const at=(y*frame.width+x)*3,rgb=decode(frame.data[at],frame.data[at+1],frame.data[at+2],frame.signal),l=(matrix.kr*rgb[0]+matrix.kg*rgb[1])+matrix.kb*rgb[2];
  if(!selected(...rgb,l,c)||!Number.isFinite(l)||l<c.min||l>c.max)continue;
  const iy=Math.round((l-c.min)/(c.max-c.min)*(c.levels-1)),ix=Math.floor((x-c.x0)*c.waveWidth/(c.x1-c.x0));out[iy*c.waveWidth+ix]++;
 }return out;
}
