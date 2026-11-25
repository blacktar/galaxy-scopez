import {rasterWaveformDensity} from './waveform-footprint.mjs';
// Bounded decorative waveform raster. Use existing measured bins; no source pixels retained.
export function waveformBackdrop(data,width=384,height=192){
 const {waveWidth:sw,levels:sh}=data.config,w=Math.min(width,sw),h=Math.min(height,sh);
 const counts=rasterWaveformDensity(data.wave,sw,sh,data.source?.region?.width??sw,w,h),pixels=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<counts.length;i++){const alpha=Math.round(Math.min(1,Math.log1p(counts[i])*.25)*.82*255);if(!alpha)continue;const at=i*4;pixels[at]=pixels[at+1]=pixels[at+2]=220;pixels[at+3]=alpha;}
 return {width:w,height:h,pixels};
}
export function waveformLimits({min=0,max=1}){
 return [1,0].map(value=>({value,top:(max-value)/(max-min)*100})).filter(line=>Number.isFinite(line.top)&&line.top>=0&&line.top<=100);
}
export function mountWaveformBackdrop(card){
 const canvas=document.createElement('canvas');canvas.className='gp-waveform-background';canvas.hidden=true;canvas.setAttribute('aria-hidden','true');card.prepend(canvas);
 const guides=document.createElement('div');guides.className='gp-waveform-guides';guides.hidden=true;guides.setAttribute('aria-hidden','true');card.prepend(guides);
 const lines=[1,0].map(value=>{const line=document.createElement('i');line.title=value+' signal reference';line.style.top=value===1?'0%':'100%';guides.append(line);return {value,line};});
 let shown=false,lastFrame=null;
 return {show(value){shown=value;canvas.hidden=guides.hidden=!value;if(!value){lastFrame=null;canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);}},paint(data){if(!shown||!data.wave||data.config.activeScopes?.includes(0)===false||lastFrame===data)return;lastFrame=data;const surface=card.querySelector?.('.gp-surface');if(surface)card.style.setProperty('--gp-wave-top',(surface.offsetTop+2)+'px');const limits=waveformLimits(data.config);for(const {value,line}of lines){const limit=limits.find(p=>p.value===value);line.hidden=!limit;if(limit)line.style.top=limit.top+'%';}const raster=waveformBackdrop(data);canvas.width=raster.width;canvas.height=raster.height;canvas.getContext('2d').putImageData(new ImageData(raster.pixels,raster.width,raster.height),0,0);}};
}
