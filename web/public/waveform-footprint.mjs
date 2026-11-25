// Original-image column intervals, shared by the regular Canvas waveform and
// GPrime's bounded backdrop. Empty upsampled bins never become screen gaps.
export function sourceColumnCoordinate(x,gridColumns,sourceColumns){
 if(x>=sourceColumns)return gridColumns;
 const column=Math.floor(Math.floor(x)*gridColumns/sourceColumns),first=Math.ceil(column*sourceColumns/gridColumns),last=Math.ceil((column+1)*sourceColumns/gridColumns);
 return column+(x-first)/(last-first);
}
const cache=new Map();
function axisWeights(bins,domain,pixels){
 const footprint=domain/pixels,normalisation=Math.min(footprint,1),offsets=new Uint32Array(bins+1),indices=[],weights=[];
 for(let bin=0;bin<bins;bin++){
  offsets[bin]=indices.length;const first=Math.ceil(bin*domain/bins),last=Math.ceil((bin+1)*domain/bins),population=last-first;
  if(!population)continue;
  for(let pixel=Math.floor(first*pixels/domain);pixel<Math.min(pixels,Math.ceil(last*pixels/domain));pixel++){
   const overlap=Math.max(0,Math.min(last,(pixel+1)*footprint)-Math.max(first,pixel*footprint));
   if(overlap){indices.push(pixel);weights.push(overlap/population/normalisation);}
  }
 }
 offsets[bins]=indices.length;return {offsets,indices:Uint32Array.from(indices),weights:Float64Array.from(weights)};
}
export function rasterWaveformDensity(values,columns,levels,sourceColumns,width,height){
 const key=[columns,levels,sourceColumns,width,height].join(':'),old=cache.get(key);
 const workspace=old??{x:axisWeights(columns,sourceColumns,width),y:axisWeights(levels,levels,height),horizontal:new Float64Array(width*levels)};
 if(!old){cache.set(key,workspace);if(cache.size>4)cache.delete(cache.keys().next().value);}
 const {x,y,horizontal}=workspace;horizontal.fill(0);const counts=new Float64Array(width*height);
 // Separable exact footprint integration avoids a full-size summed-area table
 // and reuses the bounded horizontal workspace across frames.
 for(let row=0;row<levels;row++)for(let column=0;column<columns;column++){
  const value=values[row*columns+column];if(!value)continue;
  for(let j=x.offsets[column];j<x.offsets[column+1];j++)horizontal[row*width+x.indices[j]]+=value*x.weights[j];
 }
 for(let row=0;row<levels;row++)for(let j=y.offsets[row];j<y.offsets[row+1];j++){
  const source=row*width,target=(height-1-y.indices[j])*width,weight=y.weights[j];
  for(let column=0;column<width;column++)counts[target+column]+=horizontal[source+column]*weight;
 }
 return counts;
}
