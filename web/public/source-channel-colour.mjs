// Display colour only: each bin stores the mean source RGB as rgb8.
// Input rounding and averaging together are bounded by 1/255 per component.
export function sourceColourMode(value='off'){if(!['off','cbcr','ycbcr'].includes(value))throw Error('Invalid source trace colour mode');return value;}
export function sourceColourNames(config){return config.sourceColourMode==='ycbcr'?['y','cb','cr']:config.sourceColourMode==='cbcr'?['cb','cr']:[];}
export function sourceColourLayer(data,name){return sourceColourNames(data.config).indexOf(name);}
export function sourceColourRequest({wave=false,waveMode='y',waveColour='mono',parade=false,paradeMode='rgb',paradeColour=true}={}){return parade&&paradeMode==='ycbcr'&&paradeColour?'ycbcr':wave&&waveMode==='cbcr'&&waveColour!=='mono'?'cbcr':'off';}
export function packSourceMean(r,g,b,count){return count?(Math.floor(r/count+.5)|Math.floor(g/count+.5)<<8|Math.floor(b/count+.5)<<16)>>>0:0;}
export function unpackSourceMean(value){return [value&255,value>>>8&255,value>>>16&255];}
export function channelColourDistribution(frame,c,decode,selected,matrix){
 const names=sourceColourNames(c),size=c.waveWidth*c.levels,out=new Uint32Array(c.activeScopes.includes(14)?size*names.length:1);if(!c.activeScopes.includes(14))return out;
 const sums=new Uint32Array(size*4),active=[];
 for(const [group,name]of names.entries()){
  for(const i of active)for(let ch=0;ch<4;ch++)sums[ch*size+i]=0;active.length=0;
  for(let y=c.y0;y<c.y1;y++)for(let x=c.x0;x<c.x1;x++){
   const at=(y*frame.width+x)*3,rgb=decode(frame.data[at],frame.data[at+1],frame.data[at+2],frame.signal),l=(matrix.kr*rgb[0]+matrix.kg*rgb[1])+matrix.kb*rgb[2];if(!rgb.every(Number.isFinite)||!selected(...rgb,l,c))continue;
   const level=name==='y'?l:name==='cb'?(rgb[2]-l)/(2*(1-matrix.kb))+.5:(rgb[0]-l)/(2*(1-matrix.kr))+.5;if(!Number.isFinite(level)||level<c.min||level>c.max)continue;
   const bin=Math.round((level-c.min)/(c.max-c.min)*(c.levels-1))*c.waveWidth+Math.floor((x-c.x0)*c.waveWidth/(c.x1-c.x0));if(!sums[3*size+bin])active.push(bin);sums[3*size+bin]++;
   for(let ch=0;ch<3;ch++)sums[ch*size+bin]+=Math.round(Math.fround(Math.fround(Math.max(0,Math.min(1,rgb[ch])))*255));
  }
  for(const i of active)out[group*size+i]=packSourceMean(sums[i],sums[size+i],sums[2*size+i],sums[3*size+i]);
 }
 return out;
}
// Integrate source RGB over the same original-column footprint as count density.
// Direct integration avoids allocating three full-size colour integral images.
export function sourceColourInk(data,counts,layer,x0,y0,x1,y1){
 if(layer<0||!data.channelColour)return [1,1,1];const c=data.config,w=c.waveWidth,h=c.levels,logical=Math.min(w,data.source?.region?.width??w),size=w*h;
 const source=data.source?.region?.width??w,a=Math.max(0,x0*source),b=Math.min(source,x1*source),lo=Math.max(0,y0*h),hi=Math.min(h,y1*h),sum=[0,0,0];
 const first=Math.floor(Math.floor(a)*w/source),last=Math.floor((Math.ceil(b)-1)*w/source);
 for(let y=Math.floor(lo);y<Math.ceil(hi);y++)for(let x=first;x<=last;x++){
  const left=Math.ceil(x*source/w),right=Math.ceil((x+1)*source/w);if(right<=left)continue;
  const i=y*w+x,n=counts[i]*Math.max(0,Math.min(b,right)-Math.max(a,left))/(right-left)*(Math.min(hi,y+1)-Math.max(lo,y)),rgb=unpackSourceMean(data.channelColour[layer*size+i]);for(let ch=0;ch<3;ch++)sum[ch]+=rgb[ch]*n;
 }
 const peak=Math.max(...sum);return peak?sum.map(v=>v/peak):[1,1,1];
}
