export const WAVEFORM_COLOURS=['mono','source','false'];
export function falseColour(level){const h=(1-Math.max(0,Math.min(1,level)))*4,x=1-Math.abs(h%2-1);return h<1?[1,x,0]:h<2?[x,1,0]:h<3?[0,1,x]:[0,x,1];}
export function sourceInk(rgb){const peak=Math.max(...rgb);return peak>0?rgb.map(v=>v/peak):[1,1,1];}
export const WAVEFORM_COLOUR_SHADER=`
// Integrate count and RGB sums over the same footprint in one traversal.
vec4 waveformSourceDensity(){
 ivec2 sz=textureSize(dataTex,0);vec4 f=waveformFootprint(ivec2(gl_FragCoord.xy),sz);ivec2 columns=waveformBinsX(f,sz.x);vec4 n=vec4(0);
 for(int y=int(floor(f.y));y<min(sz.y,int(ceil(f.w)));y++)for(int x=columns.x;x<=columns.y;x++){
  ivec2 at=ivec2(x,y);float count=float(texelFetch(dataTex,at,0).r);uint packed=texelFetch(redTex,at,0).r;vec3 mean=vec3(float(packed&511u),float((packed>>9)&511u),float((packed>>18)&511u))*exp2(float(packed>>27)-24.)/256.;
  n+=vec4(count,mean*count)*waveformWeightX(f,x,sz.x)*waveformWeightY(f,y);
 }return n;
}
vec3 falseColour(float level){float h=(1.-clamp(level,0.,1.))*4.,x=1.-abs(mod(h,2.)-1.);return h<1.?vec3(1,x,0):h<2.?vec3(x,1,0):h<3.?vec3(0,1,x):vec3(0,x,1);}
`;
