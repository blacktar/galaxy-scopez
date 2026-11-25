// Integrate piecewise-constant bin density over the exact pixel footprint.
// Integer interval endpoints avoid boundary drift; counts remain uint32 in texels.
export const DENSITY_SHADER=`
uniform int waveColumns;uniform int paradeCount;uniform vec2 densityYRange;
// Every waveform/parade uses the same original-image-column footprint.
// A grid bin may pool several source columns; divide its count by that exact
// population when distributing it across the image interval it represents.
vec4 waveformFootprint(ivec2 pixel,ivec2 size){
 int channels=mode==1&&paradeCount>=3?paradeCount:1,ch=(2*pixel.x+1)*channels/(2*viewportSize.x);
 float dx=float(channels*waveColumns)/float(viewportSize.x),left=float(pixel.x*channels-ch*viewportSize.x)*float(waveColumns)/float(viewportSize.x);
 left=clamp(left,0.,max(0.,float(waveColumns)-dx));
 vec2 bounds=mode==1&&densityYRange.y>densityYRange.x?densityYRange:vec2(0,1);return vec4(left,(bounds.x+float(pixel.y)/float(viewportSize.y)*(bounds.y-bounds.x))*float(size.y),min(float(waveColumns),left+dx),(bounds.x+float(pixel.y+1)/float(viewportSize.y)*(bounds.y-bounds.x))*float(size.y));
}
ivec2 waveformBinsX(vec4 f,int width){return ivec2(clamp(int(floor(f.x)),0,waveColumns-1)*width/waveColumns,clamp(int(ceil(f.z))-1,0,waveColumns-1)*width/waveColumns);}
float waveformWeightX(vec4 f,int x,int width){
 int first=(x*waveColumns+width-1)/width,last=((x+1)*waveColumns+width-1)/width;if(last<=first)return 0.;
 return max(0.,min(f.z,float(last))-max(f.x,float(first)))/float(last-first)/min(f.z-f.x,1.);
}
float waveformWeightY(vec4 f,int y){return max(0.,min(f.w,float(y+1))-max(f.y,float(y)))/min(f.w-f.y,1.);}
float densityAtPixel(usampler2D tex,vec2 q,ivec2 pixel){
 ivec2 sz=textureSize(tex,0),scale=viewportSize;
 if((mode==0||mode==1||mode==7||mode==8)&&waveColumns>0){
  vec4 f=waveformFootprint(pixel,sz);ivec2 columns=waveformBinsX(f,sz.x);float n=0.;
  for(int y=max(0,int(floor(f.y)));y<min(sz.y,int(ceil(f.w)));y++)for(int x=columns.x;x<=columns.y;x++)n+=float(texelFetch(tex,ivec2(x,y),0).r)*waveformWeightX(f,x,sz.x)*waveformWeightY(f,y);
  return n;
 }
 int channels=mode==1&&paradeCount>=3?paradeCount:mode==5?textureSize(tex,0).y:3;
 int ch=(2*pixel.x+1)*channels/(2*viewportSize.x);
 int left=(mode==1||mode==5)?pixel.x*channels-ch*viewportSize.x:pixel.x;
 int right=(mode==1||mode==5)?(pixel.x+1)*channels-ch*viewportSize.x:pixel.x+1;
 ivec2 begin=ivec2(left*sz.x,pixel.y*sz.y),end=ivec2(right*sz.x,(pixel.y+1)*sz.y);
 if(mode==3){
  // Project onto the full rectangular surface; chroma retains equal axis scale.
  // Integrate the mapped footprint, including partial bins at the plot edge.
  vec2 extent=vec2(viewportSize)/float(min(viewportSize.x,viewportSize.y))/vectorMagnification;
  vec2 a=(vec2(pixel)/vec2(viewportSize)-.5)*extent+.5;
  vec2 b=(vec2(pixel+1)/vec2(viewportSize)-.5)*extent+.5;
  if(any(lessThanEqual(b,vec2(0)))||any(greaterThanEqual(a,vec2(1))))return 0.;
  vec2 first=max(a*vec2(sz),vec2(0)),last=min(b*vec2(sz),vec2(sz));
  ivec2 lo=ivec2(floor(first)),hi=min(sz-1,ivec2(ceil(last))-1);float n=0.;
  vec2 footprint=(b-a)*vec2(sz);
  for(int y=lo.y;y<=hi.y;y++)for(int x=lo.x;x<=hi.x;x++){
   vec2 overlap=max(vec2(0),min(last,vec2(x+1,y+1))-max(first,vec2(x,y)));
   n+=float(texelFetch(tex,ivec2(x,y),0).r)*overlap.x*overlap.y;
  }
  return n/min(footprint.x,1.)/min(footprint.y,1.);
 }
 if(mode==4&&twinHorizontal){scale=viewportSize.yx;begin=ivec2(pixel.y*sz.x,(viewportSize.x-1-pixel.x)*sz.y);end=ivec2((pixel.y+1)*sz.x,(viewportSize.x-pixel.x)*sz.y);}
 if(mode==2||mode==5||mode==6){begin.y=clamp(int(q.y*float(sz.y)),0,sz.y-1)*scale.y;end.y=begin.y+scale.y;}
 begin=clamp(begin,ivec2(0),sz*scale-1);end=clamp(end,begin+1,sz*scale);
 ivec2 lo=begin/scale,hi=(end+scale-1)/scale-1;
 vec2 extent=vec2(end-begin);float n=0.;
 for(int y=lo.y;y<=hi.y;y++){float wy=float(min(end.y,(y+1)*scale.y)-max(begin.y,y*scale.y))/extent.y;
  for(int x=lo.x;x<=hi.x;x++){float wx=float(min(end.x,(x+1)*scale.x)-max(begin.x,x*scale.x))/extent.x;n+=float(texelFetch(tex,ivec2(x,y),0).r)*wx*wy;}}
 // Preserve integrated counts on minification; on magnification a bin keeps
 // its density instead of fading as the display grows. No bin is skipped.
 return n*max(extent.x/float(scale.x),1.)*max(extent.y/float(scale.y),1.);
}
float density(usampler2D tex,vec2 q,vec2 footprint){return densityAtPixel(tex,q,ivec2(gl_FragCoord.xy));}
`;
