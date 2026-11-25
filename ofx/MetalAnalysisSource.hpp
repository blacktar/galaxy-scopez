static const char* analysisSource=R"METAL(#include <metal_stdlib>
using namespace metal;
#pragma clang fp contract(off)
struct Config {uint width,height,x0,x1,y0,y1,levels,vs,n,ww,hb,tw,th,ns,nh,mask,shards,stride;float mn,mx,zoom,tx,ty,lo,hi,kr,kg,kb;uint offsets[18];uint iso;float hueCenter,hueWidth,satMin,satMax,lumaMin,lumaMax;float hueSatMin,hueSatMax,hueLumaMin,hueLumaMax;uint hueWeighted,pqWave,cieSize,cieTransfer,cieModel,cieReady;float cieMatrix[9];uint sourceColourGroups;};

float pqLinear(float v){
 float p=pow(clamp(v,0.f,1.f),32.f/2523.f);
 return pow(max(p-3424.f/4096.f,0.f)/(2413.f/128.f-2392.f/128.f*p),16384.f/2610.f);
}
float pqWaveLevel(float3 rgb){
 if(!all(isfinite(rgb)))return NAN;
 return sqrt((.2627f*pqLinear(rgb.r)+.6780f*pqLinear(rgb.g))+.0593f*pqLinear(rgb.b));
}

float cieDecode(float v,uint transfer){
 float a=abs(v),sg=sign(v);
 if(transfer==1)return v;
 if(transfer>=2&&transfer<=4)return sg*pow(a,transfer==2?2.2f:transfer==3?2.4f:2.6f);
 if(transfer==5)return sg*(a<=.04045f?a/12.92f:pow((a+.055f)/1.055f,2.4f));
 if(transfer==6)return sg*(a<.081f?a/4.5f:pow((a+.099f)/1.099f,1.f/.45f));
 if(v<0)return NAN;
 if(transfer==7){float p=pow(v,32.f/2523.f),den=2413.f/128.f-2392.f/128.f*p;return den>0?pow(max(p-3424.f/4096.f,0.f)/den,16384.f/2610.f):NAN;}
 if(transfer==8)return v<=.5f?v*v/3.f:(exp((v-.55991073f)/.17883277f)+.28466892f)/12.f;
 return NAN;
}
float2 cieCoordinate(float3 q,constant Config&c){
 float X=(c.cieMatrix[0]*q.r+c.cieMatrix[1]*q.g)+c.cieMatrix[2]*q.b,Y=(c.cieMatrix[3]*q.r+c.cieMatrix[4]*q.g)+c.cieMatrix[5]*q.b,Z=(c.cieMatrix[6]*q.r+c.cieMatrix[7]*q.g)+c.cieMatrix[8]*q.b;
 float den=c.cieModel?(X+15.f*Y)+3.f*Z:(X+Y)+Z;
 if(!isfinite(Y)||Y<=1e-12f||!isfinite(den)||den<=1e-12f)return float2(NAN);
 return c.cieModel?float2(4.f*X/den,9.f*Y/den):float2(X/den,Y/den);
}

float3 colourHSV(float3 v){float hi=max(v.r,max(v.g,v.b)),lo=min(v.r,min(v.g,v.b)),d=hi-lo,h=0;if(d>0){h=hi==v.r?(v.g-v.b)/d:hi==v.g?(v.b-v.r)/d+2:(v.r-v.g)/d+4;h=fract(h/6+1);}return float3(h,hi>0?d/hi:0,hi);}
bool colourSelected(float3 v,float l,constant Config&c){if(!c.iso)return true;if(!all(isfinite(v))||!isfinite(l))return false;float3 q=colourHSV(v);float distance=fmod(abs(q.x*360-c.hueCenter),360.f);return q.y>=c.satMin&&q.y<=c.satMax&&l>=c.lumaMin&&l<=c.lumaMax&&min(distance,360-distance)<=c.hueWidth;}

void inc(device atomic_uint*p,uint i,uint n=1){if(n)atomic_fetch_add_explicit(p+i,n,memory_order_relaxed);}
void bin(device atomic_uint*out,uint offset,uint ix){if(offset!=0xffffffff)inc(out,offset+ix);}
uint rnd(float v){return uint(floor(v+.5f));}
// Eight interleaved pixels per thread: neighboring lanes retain coalesced reads.
// Every ROI pixel is visited once; metadata reductions are amortized eightfold.
// Counts remain uint32 and the per-pixel float32 expressions are unchanged.
struct Meta {uint4 lo,hi,invalid,under,over,vu,vo;uint3 splitPixels,splitOutside;uint4 upper,lower;uint3 cube;uint4 cie;};
void sumCounter(device atomic_uint*s,uint at,uint v,uint lane){uint n=simd_sum(v);if(lane==0)inc(s,at,n);}
kernel void analyze(device const float*rgb [[buffer(0)]],device atomic_uint*counts [[buffer(1)]],device atomic_uint*summaryInput [[buffer(2)]],constant Config&c [[buffer(3)]],uint threadId [[thread_position_in_grid]],uint lane [[thread_index_in_simdgroup]],uint group [[threadgroup_position_in_grid]],uint gridSize [[threads_per_grid]]){
 Meta m={};m.lo=uint4(0xffffffff);device atomic_uint*out=counts+(group%c.shards)*c.stride;uint rw=c.x1-c.x0,rh=c.y1-c.y0;
 for(uint item=0;item<8;item++){uint id=threadId+item*gridSize;if(id>=rw*rh)continue;uint x=c.x0+id%rw,y=c.y0+id/rw,at=(y*c.width+x)*3;float r=rgb[at],g=rgb[at+1],b=rgb[at+2],l=(c.kr*r+c.kg*g)+c.kb*b;if(!colourSelected(float3(r,g,b),l,c))continue;float4 val=float4(r,g,b,l);bool4 finite=isfinite(val);uint4 bits=as_type<uint4>(val),ordered=select(bits^0x80000000u,~bits,(bits&0x80000000u)!=0);m.lo=min(m.lo,select(uint4(0xffffffff),ordered,finite));m.hi=max(m.hi,select(uint4(0),ordered,finite));m.invalid+=uint4(!finite);m.under+=uint4(finite&&(val<0));m.over+=uint4(finite&&(val>1));m.vu+=uint4(finite&&(val<c.mn));m.vo+=uint4(finite&&(val>c.mx));
 if((c.mask&131072)&&isfinite(l)&&l>=c.mn&&l<=c.mx)bin(out,c.offsets[17],rnd((l-c.mn)/(c.mx-c.mn)*float(c.hb-1)));
 if((c.mask&32768)&&isfinite(l)&&l>=c.mn&&l<=c.mx){uint wx=min(c.ww-1,(x-c.x0)*c.ww/rw);bin(out,c.offsets[15],rnd((l-c.mn)/(c.mx-c.mn)*float(c.levels-1))*c.ww+wx);}
 if(c.mask&7){uint wx=min(c.ww-1,(x-c.x0)*c.ww/rw);for(uint ch=0;ch<4;ch++){if(ch<3&&!(c.mask&6))continue;bool pq=ch==3&&c.pqWave;float v=pq?pqWaveLevel(float3(r,g,b)):val[ch],lo=pq?0:c.mn,hi=pq?1:c.mx;if(isfinite(v)&&v>=lo&&v<=hi){uint iy=rnd((v-lo)/(hi-lo)*float(c.levels-1));if(ch==3)bin(out,c.offsets[0],iy*c.ww+wx);else{bin(out,c.offsets[1],(ch*c.levels+iy)*c.ww+wx);bin(out,c.offsets[2],ch*c.hb+rnd((v-c.mn)/(c.mx-c.mn)*float(c.hb-1)));}}}}

 bool valid=isfinite(r)&&isfinite(g)&&isfinite(b);float u=(b-l)/(2*(1-c.kb)),v=(r-l)/(2*(1-c.kr)),extent=.5f/c.zoom,edge=extent+1.1920929e-7f;uint band=l<c.lo?0:l<c.hi?1:2;bool outside=valid&&(u< -edge||u>edge||v< -edge||v>edge);if(valid){m.splitPixels[band]++;m.splitOutside[band]+=outside;if(!outside){uint ix=rnd((u+extent)/(2*extent)*float(c.vs-1)),iy=rnd((v+extent)/(2*extent)*float(c.vs-1));bin(out,c.offsets[3],iy*c.vs+ix);bin(out,c.offsets[4+band],iy*c.vs+ix);}}
 if((c.mask&16384)&&valid){uint wx=min(c.ww-1,(x-c.x0)*c.ww/rw);float2 chroma=float2(u,v)+.5f;for(uint ch=0;ch<2;ch++){float q=chroma[ch];if(isfinite(q)&&q>=c.mn&&q<=c.mx)bin(out,c.offsets[14],(ch*c.levels+rnd((q-c.mn)/(c.mx-c.mn)*float(c.levels-1)))*c.ww+wx);}}
 for(uint pair=0;pair<2;pair++){float a=pair==0?b:r,dx=a-g,dy=pair==0?a+g:-(a+g);bool ok=isfinite(a)&&isfinite(g),off=ok&&(abs(dx)>c.tx||abs(dy)>c.ty);uint4 st=uint4(ok&&!off,off,!ok,ok&&(a<0||a>1||g<0||g>1));if(pair==0)m.upper+=st;else m.lower+=st;if(ok&&!off)bin(out,c.offsets[7],rnd((dy+c.ty)/(2*c.ty)*float(c.th-1))*c.tw+rnd((dx+c.tx)/(2*c.tx)*float(c.tw-1)));}
 if(c.mask&6144){float3 q=colourHSV(float3(r,g,b));if(valid&&isfinite(l)){if((c.mask&2048)&&l>=c.mn&&l<=c.mx&&q.y>=0&&q.y<=1)bin(out,c.offsets[11],rnd((l-c.mn)/(c.mx-c.mn)*float(c.ns-1))*c.ns+rnd(q.y*float(c.ns-1)));if((c.mask&4096)&&q.z>min(r,min(g,b))&&q.z>0&&q.z<=1&&min(r,min(g,b))>=0&&q.y>=c.hueSatMin&&q.y<=c.hueSatMax&&l>=c.hueLumaMin&&l<=c.hueLumaMax){uint weight=c.hueWeighted?rnd((q.z-min(r,min(g,b)))/max(c.hueSatMax,1e-12f)*255.f):1;inc(out,c.offsets[12]+min(c.nh-1,uint(floor(q.x*float(c.nh)))),weight);}}}
 if((c.mask&8192)&&c.cieReady){
  float3 rgbCie=float3(r,g,b);float3 decoded=float3(cieDecode(r,c.cieTransfer),cieDecode(g,c.cieTransfer),cieDecode(b,c.cieTransfer));
  if(!all(isfinite(decoded))){m.cie[2]++;}else{float2 p=cieCoordinate(decoded,c),bounds=c.cieModel?float2(.65f):float2(.8f,.9f);
   if(!all(isfinite(p))){m.cie[1]++;}else if(any(p<0)||any(p>bounds)){m.cie[3]++;}else{uint2 at=rnd(p.x/bounds.x*float(c.cieSize-1))*uint2(1,0)+rnd(p.y/bounds.y*float(c.cieSize-1))*uint2(0,1);bin(out,c.offsets[13],at.y*c.cieSize+at.x);m.cie[0]++;}
  }
 }
 if(c.mask&256){bool off=valid&&(r<c.mn||r>c.mx||g<c.mn||g>c.mx||b<c.mn||b>c.mx);m.cube+=uint3(valid&&!off,off,!valid);if(valid&&!off){float scale=float(c.n-1)/(c.mx-c.mn);uint ix=rnd((r-c.mn)*scale)+c.n*(rnd((g-c.mn)*scale)+c.n*rnd((b-c.mn)*scale));bin(out,c.offsets[8],ix);}}
 }
 device atomic_uint*s=summaryInput+(group%c.shards)*64;
 for(uint ch=0;ch<4;ch++){uint lo=simd_min(m.lo[ch]),hi=simd_max(m.hi[ch]),at=ch*8;if(lane==0){if(lo<atomic_load_explicit(s+at,memory_order_relaxed))atomic_fetch_min_explicit(s+at,lo,memory_order_relaxed);if(hi>atomic_load_explicit(s+at+1,memory_order_relaxed))atomic_fetch_max_explicit(s+at+1,hi,memory_order_relaxed);}sumCounter(s,at+3,m.invalid[ch],lane);sumCounter(s,at+4,m.under[ch],lane);sumCounter(s,at+5,m.over[ch],lane);sumCounter(s,at+6,m.vu[ch],lane);sumCounter(s,at+7,m.vo[ch],lane);}
 for(uint b=0;b<3;b++){sumCounter(s,32+b*3,m.splitPixels[b],lane);sumCounter(s,33+b*3,m.splitPixels[b]-m.splitOutside[b],lane);sumCounter(s,34+b*3,m.splitOutside[b],lane);}for(uint k=0;k<4;k++){sumCounter(s,41+k,m.upper[k],lane);sumCounter(s,45+k,m.lower[k],lane);}if(c.mask&256)for(uint k=0;k<3;k++)sumCounter(s,49+k,m.cube[k],lane);if(c.mask&8192)for(uint k=0;k<4;k++)sumCounter(s,52+k,m.cie[k],lane);
}
kernel void merge(device const uint*input [[buffer(0)]],device uint*output [[buffer(1)]],constant Config&c [[buffer(3)]],uint id [[thread_position_in_grid]]){if(id>=c.stride)return;uint n=0;for(uint k=0;k<c.shards;k++)n+=input[k*c.stride+id];output[id]=n;}

// Each group owns one waveform column and a bounded 1024-level tile.
// Keep exact colour sums in threadgroup memory; publish each bin once.
kernel void waveformColour(device const float*rgb [[buffer(0)]],device uint*output [[buffer(1)]],constant Config&c [[buffer(3)]],uint tid [[thread_index_in_threadgroup]],uint3 group [[threadgroup_position_in_grid]],uint3 groupSize [[threads_per_threadgroup]]){
 uint threads=groupSize.x;
 threadgroup atomic_uint local[3072];
 for(uint i=tid;i<3072;i+=threads)atomic_store_explicit(local+i,0,memory_order_relaxed);
 threadgroup_barrier(mem_flags::mem_threadgroup);
 uint rw=c.x1-c.x0,rh=c.y1-c.y0,wx=group.x,base=group.y*1024;
 uint left=(wx*rw+c.ww-1)/c.ww,right=((wx+1)*rw+c.ww-1)/c.ww,cols=right-left;
 for(uint i=tid;i<cols*rh;i+=threads){uint x=c.x0+left+i%cols,y=c.y0+i/cols,at=(y*c.width+x)*3;
  float3 v=float3(rgb[at],rgb[at+1],rgb[at+2]);float l=(c.kr*v.r+c.kg*v.g)+c.kb*v.b;
  float level=c.pqWave?pqWaveLevel(v):l,lo=c.pqWave?0:c.mn,hi=c.pqWave?1:c.mx;
  if(colourSelected(v,l,c)&&all(isfinite(v))&&isfinite(level)&&level>=lo&&level<=hi){uint iy=rnd((level-lo)/(hi-lo)*float(c.levels-1));
   if(iy>=base&&iy<base+1024)for(uint ch=0;ch<3;ch++){uint q=rnd(clamp(v[ch],0.f,1.f)*255.f);if(q)atomic_fetch_add_explicit(local+ch*1024+iy-base,q,memory_order_relaxed);}
  }
 }
 threadgroup_barrier(mem_flags::mem_threadgroup);
 for(uint i=tid;i<3072;i+=threads){uint ch=i/1024,iy=base+i%1024;output[c.offsets[9]+ch*c.levels*c.ww+iy*c.ww+wx]=atomic_load_explicit(local+i,memory_order_relaxed);}
}

// One column, channel and 1024-level tile per group. Publish rgb8 means,
// not unbounded source pixels or nine planes of colour sums.
kernel void sourceChannelColour(device const float*rgb [[buffer(0)]],device uint*output [[buffer(1)]],constant Config&c [[buffer(3)]],uint tid [[thread_index_in_threadgroup]],uint3 group [[threadgroup_position_in_grid]],uint3 groupSize [[threads_per_threadgroup]]){
 threadgroup atomic_uint local[4096];uint threads=groupSize.x;for(uint i=tid;i<4096;i+=threads)atomic_store_explicit(local+i,0,memory_order_relaxed);threadgroup_barrier(mem_flags::mem_threadgroup);
 uint rw=c.x1-c.x0,rh=c.y1-c.y0,wx=group.x,base=group.y*1024,component=c.sourceColourGroups==3?group.z:group.z+1,left=(wx*rw+c.ww-1)/c.ww,right=((wx+1)*rw+c.ww-1)/c.ww,cols=right-left;
 for(uint i=tid;i<cols*rh;i+=threads){uint x=c.x0+left+i%cols,y=c.y0+i/cols,at=(y*c.width+x)*3;float3 v=float3(rgb[at],rgb[at+1],rgb[at+2]);float l=(c.kr*v.r+c.kg*v.g)+c.kb*v.b,level=component==0?l:component==1?(v.b-l)/(2*(1-c.kb))+.5f:(v.r-l)/(2*(1-c.kr))+.5f;
  if(all(isfinite(v))&&colourSelected(v,l,c)&&isfinite(level)&&level>=c.mn&&level<=c.mx){uint iy=rnd((level-c.mn)/(c.mx-c.mn)*float(c.levels-1));if(iy>=base&&iy<base+1024){uint bin=iy-base;atomic_fetch_add_explicit(local+3072+bin,1,memory_order_relaxed);for(uint ch=0;ch<3;ch++)atomic_fetch_add_explicit(local+ch*1024+bin,rnd(clamp(v[ch],0.f,1.f)*255.f),memory_order_relaxed);}}
 }
 threadgroup_barrier(mem_flags::mem_threadgroup);
 for(uint i=tid;i<1024;i+=threads){uint count=atomic_load_explicit(local+3072+i,memory_order_relaxed),packed=0;if(count)for(uint ch=0;ch<3;ch++){uint sum=atomic_load_explicit(local+ch*1024+i,memory_order_relaxed),mean=(sum+count/2)/count;packed|=mean<<(ch*8);}output[c.offsets[16]+(group.z*c.levels+base+i)*c.ww+wx]=packed;}
}
)METAL";
