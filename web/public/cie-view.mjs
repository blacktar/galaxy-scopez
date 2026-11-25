import {CIE_PRIMARIES,cieBounds,xyToCie,cieReady} from './cie-model.mjs';
import {SPECTRAL_LOCUS,BLACK_BODY_LOCUS} from './cie-locus-data.mjs';
const cache=new WeakMap();
// Two bounded, reusable diagram rasters; display colours are illustrative sRGB.
const diagrams=new Map();
function colourDiagram(model){
 if(diagrams.has(model))return diagrams.get(model);
 const n=256,canvas=document.createElement('canvas');canvas.width=canvas.height=n;const ctx=canvas.getContext('2d'),image=ctx.createImageData(n,n),[bx,by]=cieBounds(model);
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  let x=i/(n-1)*bx,y=(1-j/(n-1))*by;if(model==='uv'){const den=6*x-16*y+12,xx=9*x/den;y=4*y/den;x=xx;}
  if(y<=0)continue;const X=x/y,Z=(1-x-y)/y;
  let rgb=[3.2409699419*X-1.5373831776-.4986107603*Z,-.9692436363*X+1.8759675015+.0415550574*Z,.0556300797*X-.2039769589+1.0569715142*Z].map(v=>Math.max(0,v)),max=Math.max(...rgb);if(!Number.isFinite(max)||max<=0)continue;
  const at=(j*n+i)*4;rgb=rgb.map(v=>v/max);for(let ch=0;ch<3;ch++)image.data[at+ch]=Math.round(255*(rgb[ch]<=.0031308?12.92*rgb[ch]:1.055*rgb[ch]**(1/2.4)-.055));image.data[at+3]=60;
 }
 ctx.putImageData(image,0,0);diagrams.set(model,canvas);return canvas;
}
export function cieGeometry(w,h,model){const [bx,by]=cieBounds(model),scale=Math.max(1,Math.min((w-90)/bx,(h-105)/by));return {bx,by,scale,left:(w-bx*scale)/2,top:25+(h-105-by*scale)/2};}
export function drawCie(canvas,data,style={gain:1,brightness:100},options={}){
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,c=data.config,model=c.cieModel??'xy',geo=cieGeometry(w,h,model),{bx,by,scale,left,top}=geo;
 const guides=options.guides!==false,target=CIE_PRIMARIES[options.target??'bt709'],second=CIE_PRIMARIES[options.second];
 const point=(x,y)=>{const p=xyToCie(x,y,model);return [left+p[0]*scale,top+(by-p[1])*scale];};
 ctx.clearRect(0,0,w,h);if(!options.transparentBackground){ctx.fillStyle='#090909';ctx.fillRect(0,0,w,h);}
 if(guides){ctx.save();ctx.globalAlpha=(options.graticule??100)/100;
  if(options.colour!==false){ctx.save();ctx.beginPath();SPECTRAL_LOCUS.forEach(([nm,x,y],i)=>ctx[i?'lineTo':'moveTo'](...point(x,y)));ctx.closePath();ctx.clip();ctx.drawImage(colourDiagram(model),left,top,bx*scale,by*scale);ctx.restore();}
  ctx.font=`${Math.max(10,Math.min(14,w/65))}px sans-serif`;ctx.lineWidth=1;ctx.strokeStyle='#272727';ctx.fillStyle='#888';
  for(let x=0;x<=bx+1e-6;x+=.1){const px=left+x*scale;ctx.beginPath();ctx.moveTo(px,top);ctx.lineTo(px,top+by*scale);ctx.stroke();ctx.fillText(x.toFixed(1),px-9,top+by*scale+18);}
  for(let y=0;y<=by+1e-6;y+=.1){const py=top+(by-y)*scale;ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(left+bx*scale,py);ctx.stroke();ctx.fillText(y.toFixed(1),left-30,py+4);}
  ctx.strokeStyle='#777';ctx.beginPath();SPECTRAL_LOCUS.forEach(([nm,x,y],i)=>ctx[i?'lineTo':'moveTo'](...point(x,y)));ctx.closePath();ctx.stroke();
  if(options.locus!==false){ctx.setLineDash([3,4]);ctx.strokeStyle='#666';ctx.beginPath();BLACK_BODY_LOCUS.forEach(([t,x,y],i)=>ctx[i?'lineTo':'moveTo'](...point(x,y)));ctx.stroke();ctx.setLineDash([]);}
  for(const [gamut,colour] of [[target,'#bbb'],[second,'#80a6b6']])if(gamut){ctx.strokeStyle=colour;ctx.lineWidth=1.5;ctx.beginPath();gamut.rgb.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](...point(x,y)));ctx.closePath();ctx.stroke();const [wx,wy]=point(...gamut.white);ctx.beginPath();ctx.arc(wx,wy,3,0,Math.PI*2);ctx.stroke();gamut.rgb.forEach(([x,y],i)=>{const p=point(x,y);ctx.fillStyle=colour;ctx.fillText('RGB'[i],p[0]+5,p[1]-5);});}
  ctx.fillStyle='#bbb';ctx.fillText(model==='uv'?'CIE 1976 u′v′':'CIE 1931 xy',left,Math.max(16,top-12));
  ctx.fillStyle='#999';ctx.fillText([target?.name,second?.name].filter(Boolean).join(' / ')+' · D65 '+xyToCie(.3127,.3290,model).map(v=>v.toFixed(4)).join(','),left,top+by*scale+39);
  if(target){ctx.font='10px monospace';ctx.fillText(target.rgb.map(([x,y],i)=>{const p=xyToCie(x,y,model);return `${'RGB'[i]} ${p[0].toFixed(3)},${p[1].toFixed(3)}`;}).join(' · '),left,top+by*scale+55);}
 }
 if(guides)ctx.restore();
 if(!cieReady(c)||!data.cie){if(guides){ctx.fillStyle='#bbb';ctx.textAlign='center';ctx.fillText(!cieReady(c)?'Choose CIE input primaries and transfer in Settings.':'CIE data unavailable — update GTap to the CIE build.',w/2,h/2);ctx.textAlign='start';}return;}
 const n=c.cieSize,counts=data.cie;
 let entry=cache.get(canvas);if(!entry||entry.data!==data||entry.gain!==style.gain||entry.brightness!==style.brightness){
  const image=ctx.createImageData(n,n),rgba=image.data;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=counts[y*n+x];if(!v)continue;const i=((n-1-y)*n+x)*4,a=Math.min(255,Math.round(Math.log1p(v*(style.gain??1))*.25*(style.brightness??100)/100*255));rgba[i]=rgba[i+1]=rgba[i+2]=220;rgba[i+3]=a;}
  const layer=entry?.layer??document.createElement('canvas');layer.width=layer.height=n;layer.getContext('2d').putImageData(image,0,0);entry={data,gain:style.gain,brightness:style.brightness,layer};cache.set(canvas,entry);
 }
 ctx.imageSmoothingEnabled=style.smooth===true;ctx.drawImage(entry.layer,left,top,bx*scale,by*scale);
}
