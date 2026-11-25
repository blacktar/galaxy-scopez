import {sourceColumnCoordinate} from './waveform-footprint.mjs';
import {histogramPlane,histogramChannels} from './histogram-mode.mjs';
import {sourceColourLayer,sourceColourInk} from './source-channel-colour.mjs';
import {paradeChannels} from './parade-mode.mjs';
import {unpackMean,WAVE_COLOUR_ENCODING} from './wave-colour-codec.mjs';
import {falseColour,sourceInk} from './waveform-colour.mjs';
import {smoothDensity,smoothHistogram} from './trace-style.mjs';
// Exact-count Canvas fallback when Safari cannot supply a working GPU context.
// Summed-area integration visits every covered bin; there is no source sampling.
const clamp=x=>Math.max(0,Math.min(1,x));
const inks=[[1,.22,.18],[.23,.9,.36],[.25,.48,1]];
function summed(values,w,h,sourceColumns=w){const stride=w+1,a=new Float64Array((w+1)*(h+1));for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=values[y*w+x];a[(y+1)*stride+x+1]=a[y*stride+x+1]+row;}}return {a,w:sourceColumns,h,stride,physicalWidth:w};}
function integral(s,x,y){x=Math.max(0,Math.min(s.w,x));y=Math.max(0,Math.min(s.h,y));const physical=s.physicalWidth;if(physical!==s.w)x=sourceColumnCoordinate(x,physical,s.w);const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(ix+1,physical),jy=Math.min(iy+1,s.h),tx=x-ix,ty=y-iy,a=s.a,k=s.stride;return a[iy*k+ix]*(1-tx)*(1-ty)+a[iy*k+jx]*tx*(1-ty)+a[jy*k+ix]*(1-tx)*ty+a[jy*k+jx]*tx*ty;}
function area(s,x0,y0,x1,y1){x0=Math.max(0,Math.min(s.w,x0));x1=Math.max(x0,Math.min(s.w,x1));return (integral(s,x1,y1)-integral(s,x0,y1)-integral(s,x1,y0)+integral(s,x0,y0))/Math.min(x1-x0||1,1)/Math.min(y1-y0||1,1);}
function smoothstep(a,b,x){const t=clamp((x-a)/(b-a));return t*t*(3-2*t);}
function density(s,x,y,w,h,rotate=false){return rotate?area(s,(h-1-y)*s.w/h,(w-1-x)*s.h/w,(h-y)*s.w/h,(w-x)*s.h/w):area(s,x*s.w/w,(h-1-y)*s.h/h,(x+1)*s.w/w,(h-y)*s.h/h);}
function traceMap(s,w,h,style,rotate,magnification=null){let a=new Float64Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a[y*w+x]=magnification===null?density(s,x,y,w,h,rotate):area(s,((x-w/2)/(Math.min(w,h)*magnification)+.5)*s.w,((h/2-y-1)/(Math.min(w,h)*magnification)+.5)*s.h,((x+1-w/2)/(Math.min(w,h)*magnification)+.5)*s.w,((h/2-y)/(Math.min(w,h)*magnification)+.5)*s.h);if(style.smooth)a=smoothDensity(a,w,h);for(let i=0;i<a.length;i++)a[i]=clamp(Math.log1p(a[i]*style.gain)*.25*style.brightness/100);return a;}

export function renderSoftware(data,scope,w,h,style={gain:1,brightness:100,smooth:false},options={}){
 if(scope===18)scope=options.gprimeDoubleD?7:3;
 const overlayWave=scope===0&&(data.config.waveMode==='rgb'||data.config.waveMode==='cbcr'),chromaWave=overlayWave&&data.config.waveMode==='cbcr';
 const paradeRange=options.paradeRange??[0,1],paradeY=y=>paradeRange[0]+y*(paradeRange[1]-paradeRange[0]);
 const c=data.config,vector=scope===3||scope>=4&&scope<=6,twin=scope===7,hist=scope===2||scope===8||scope>=10;
 const name=vector?['vector','low','mid','high'][scope===3?0:scope-3]:twin?'twin':scope===0?(overlayWave?(chromaWave?'waveChroma':'parade'):'wave'):scope===1?'parade':'hist';
 const bw=vector?c.vectorSize:twin?c.twinWidth:hist?c.histBins:c.waveWidth,bh=vector?c.vectorSize:twin?c.twinHeight:hist?1:c.levels;
 const sourceColumns=scope===0||scope===1?data.source?.region?.width??bw:bw;
 const parade=scope===1?paradeChannels(data):null;
 const histViews=hist&&[2,8].includes(scope)?histogramChannels(data):null,histValues=histViews?histogramPlane(data):data.hist;
 const channels=overlayWave?(chromaWave?2:3):scope===1?parade.length:hist?(histViews?.length??3):1,planes=[];for(let ch=0;ch<channels;ch++)planes.push(summed(hist&&style.smooth?smoothHistogram(histValues.subarray(ch*bw*bh,(ch+1)*bw*bh),bw):(scope===1?parade[ch].values:hist?histValues.subarray(ch*bw*bh,(ch+1)*bw*bh):data[name].subarray(ch*bw*bh,(ch+1)*bw*bh)),bw,bh,sourceColumns));
 const filtered=style.smooth&&!hist&&!vector&&!twin?planes.map(p=>{const a=new Float64Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a[y*w+x]=scope===1?area(p,x*p.w/w,paradeY((h-1-y)/h)*bh,(x+1)*p.w/w,paradeY((h-y)/h)*bh):density(p,x,y,w,h);return smoothDensity(a,w,h);}):null;
 let sourceColours=null;if(scope===0&&!overlayWave&&options.waveColourMode==='source'&&c.waveColour){if(data.waveColourEncoding===WAVE_COLOUR_ENCODING){const values=Array.from({length:3},()=>new Float64Array(bw*bh));for(let i=0;i<bw*bh;i++){const mean=unpackMean(data.waveColour[i]);for(let ch=0;ch<3;ch++)values[ch][i]=mean[ch]*data.wave[i];}sourceColours=values.map(a=>summed(a,bw,bh,sourceColumns));}else sourceColours=Array.from({length:3},(_,ch)=>summed(data.waveColour.subarray(ch*bw*bh,(ch+1)*bw*bh),bw,bh,sourceColumns));}
 const horizontal=options.twinHorizontal!==false,trace=vector||twin?traceMap(planes[0],w,h,style,twin&&horizontal,vector?(options.vectorMagnification??1):null):null,pixels=new Uint8ClampedArray(w*h*4);
 const matrix=data.measurement.matrix==='bt2020-ncl'?[.2627,.0593]:[.2126,.0722],kr=matrix[0],kb=matrix[1],kg=1-kr-kb;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=(x+.5)/w,v=1-(y+.5)/h;let bg=options.background??.035,r=bg,g=bg,b=bg;
  if(vector){let ink=[.85,.85,.85];if(options.vectorColour){const cx=(u-.5)*w/Math.min(w,h)/(options.vectorMagnification??1)/c.vectorZoom,cy=(v-.5)*h/Math.min(w,h)/(options.vectorMagnification??1)/c.vectorZoom,rr=2*(1-kr)*cy,bb=2*(1-kb)*cx,gg=-(kr*rr+kb*bb)/kg,lo=Math.min(rr,gg,bb),range=Math.max(rr,gg,bb)-lo,sat=clamp(Math.hypot(cx,cy)*4);ink=[rr,gg,bb].map(z=>.85*(1-sat+(z-lo)/Math.max(range,.000001)*sat));}const t=trace[y*w+x];r+=ink[0]*t;g+=ink[1]*t;b+=ink[2]*t;
  }else if(twin){const xx=(horizontal?v-.5:u-.5)*2*c.twinX,yy=(horizontal?.5-u:v-.5)*2*c.twinY,edge=Math.min(Math.abs(Math.abs(xx)+Math.abs(yy-1)-1),Math.abs(Math.abs(xx)+Math.abs(yy+1)-1));bg=options.background??.035;let ink=[.85,.85,.85];if(options.twinColour){const strength=clamp(Math.abs(xx)/Math.max(Math.abs(yy),.000001)),tint=xx<0?inks[1]:yy>=0?inks[2]:inks[0];ink=tint.map(z=>.85*(1-strength)+z*strength);}const t=trace[y*w+x];r=bg+ink[0]*t;g=bg+ink[1]*t;b=bg+ink[2]*t;
  }else if(overlayWave){for(let ch=0;ch<channels;ch++){if(!chromaWave&&options.waveChannels?.[ch]===false)continue;const d=filtered?filtered[ch][y*w+x]:density(planes[ch],x,y,w,h),t=clamp(Math.log1p(d*style.gain)*.25*style.brightness/100)*.82,ink=options.waveColourMode==='mono'?[1,1,1]:chromaWave?sourceColourInk(data,data.waveChroma.subarray(ch*bw*bh,(ch+1)*bw*bh),sourceColourLayer(data,ch===0?'cb':'cr'),x/w,(h-1-y)/h,(x+1)/w,(h-y)/h):inks[ch];r+=t*ink[0];g+=t*ink[1];b+=t*ink[2];}
  }else if(hist){const ch=Math.min(channels-1,Math.floor(u*channels)),split=scope===8;for(let j=0;j<channels;j++){if((split&&j!==ch)||(scope>=10&&j!==scope-10))continue;const x0=(split?x*channels-ch*w:x)*bw/w,x1=(split?(x+1)*channels-ch*w:x+1)*bw/w,d=area(planes[j],x0,0,x1,1);if(v<Math.log1p(d*style.gain)/Math.log1p(data.samples)*style.brightness/100){const ink=histViews?.[j]?.ink??inks[j];r+=ink[0]*.5;g+=ink[1]*.5;b+=ink[2]*.5;}}
  }else if(scope===1){const ch=Math.min(channels-1,Math.floor(u*channels)),localX=x*channels-ch*w,d=area(planes[ch],localX*planes[ch].w/w,paradeY((h-1-y)/h)*bh,((x+1)*channels-ch*w)*planes[ch].w/w,paradeY((h-y)/h)*bh),t=clamp(Math.log1p((filtered?filtered[ch][y*w+Math.min(w-1,Math.floor(localX))]:d)*style.gain)*.25*style.brightness/100),ink=options.paradeColour===false?[1,1,1]:c.paradeMode==='ycbcr'?sourceColourInk(data,parade[ch].values,sourceColourLayer(data,['y','cb','cr'][ch]),localX/w,paradeY((h-1-y)/h),((x+1)*channels-ch*w)/w,paradeY((h-y)/h)):parade[ch].ink;r+=ink[0]*t;g+=ink[1]*t;b+=ink[2]*t;
  }else{const t=clamp(Math.log1p((filtered?filtered[0][y*w+x]:density(planes[0],x,y,w,h))*style.gain)*.25*style.brightness/100)*.82,ink=sourceColours?sourceInk(sourceColours.map(p=>density(p,x,y,w,h))):options.waveColourMode==='false'?falseColour(data.measurement?.waveformUnit==='pq-nits'?v:c.min+v*(c.max-c.min)):[1,1,1];r+=t*ink[0];g+=t*ink[1];b+=t*ink[2];}
  const at=(y*w+x)*4;pixels[at]=Math.round(clamp(r)*255);pixels[at+1]=Math.round(clamp(g)*255);pixels[at+2]=Math.round(clamp(b)*255);pixels[at+3]=255;
  if(options.transparentBackground){const alpha=Math.max(pixels[at],pixels[at+1],pixels[at+2]);pixels[at+3]=alpha;if(alpha)for(let ch=0;ch<3;ch++)pixels[at+ch]=Math.round(pixels[at+ch]*255/alpha);}
 }
 return pixels;
}
