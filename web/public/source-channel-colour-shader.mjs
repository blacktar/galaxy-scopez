// Shared count/RGB integration for coloured CbCr waveforms and YCbCr parades.
// Same footprint helpers as monochrome density: no separate sampling grid.
export const SOURCE_CHANNEL_COLOUR_SHADER=`
uniform highp usampler2DArray sourceColourTex;
uniform ivec3 sourceLayers;
vec4 channelSourceDensity(usampler2D tex,int layer){
 ivec2 sz=textureSize(tex,0);vec4 f=waveformFootprint(ivec2(gl_FragCoord.xy),sz);ivec2 columns=waveformBinsX(f,sz.x);vec4 n=vec4(0);
 for(int y=max(0,int(floor(f.y)));y<min(sz.y,int(ceil(f.w)));y++)for(int x=columns.x;x<=columns.y;x++){
  float count=float(texelFetch(tex,ivec2(x,y),0).r);uint packed=texelFetch(sourceColourTex,ivec3(x,y,layer),0).r;
  vec3 mean=vec3(float(packed&255u),float((packed>>8)&255u),float((packed>>16)&255u));
  n+=vec4(count,mean*count)*waveformWeightX(f,x,sz.x)*waveformWeightY(f,y);
 }return n;
}
vec3 channelSourceInk(vec4 bins){float peak=max(bins.y,max(bins.z,bins.w));return peak>0.?bins.yzw/peak:vec3(1);}
`;
