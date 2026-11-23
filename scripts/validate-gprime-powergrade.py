#!/usr/bin/env python3
"""Read-only structural checks of the supplied GPrime DRX; never invokes Resolve."""
import argparse,json,re,struct
from pathlib import Path
try:from compression.zstd import decompress
except ImportError:
 import zstandard
 decompress=zstandard.ZstdDecompressor().decompress

def varint(b,i):
 n=shift=0
 while True:
  v=b[i];i+=1;n|=(v&127)<<shift
  if v<128:return n,i
  shift+=7
  if shift>70:raise ValueError('Invalid protobuf varint')
def fields(b):
 out=[];i=0
 while i<len(b):
  key,i=varint(b,i);k,t=key>>3,key&7
  if not k:raise ValueError('Invalid field')
  if t==0:v,i=varint(b,i)
  elif t in (1,5):n=8 if t==1 else 4;v=b[i:i+n];i+=n
  elif t==2:n,i=varint(b,i);v=b[i:i+n];i+=n
  else:raise ValueError('Unsupported wire type')
  if i>len(b):raise ValueError('Truncated field')
  out.append((k,t,v))
 return out

def properties(b):
 result={}
 def walk(data):
  try:f=fields(data)
  except (ValueError,IndexError):return
  ids=[v for k,t,v in f if k==1 and t==0 and v>1000000]
  values=[v for k,t,v in f if k==2 and t==2]
  if len(ids)==len(values)==1:
   try:
    scalar=fields(values[0])
    if len(scalar)==1:
     k,t,v=scalar[0];result[str(ids[0])]=struct.unpack('<f',v)[0] if t==5 else v if t==0 else None
   except (ValueError,IndexError):pass
  for _,t,v in f:
   if t==2:walk(v)
 walk(b);return result
p=argparse.ArgumentParser(description=__doc__);p.add_argument('drx',type=Path);p.add_argument('--output',type=Path);a=p.parse_args()
s=a.drx.read_text();bodies=[]
for text in re.findall(r'<Body>(.*?)</Body>',s,re.S):
 b=bytes.fromhex(text.strip());offset=b.find(bytes.fromhex('28b52ffd'));assert offset>=0
 bodies.append(decompress(b[offset:]))
assert len(bodies)==2
outer=fields(bodies[0]);clip=next(v for k,t,v in outer if k==1 and t==2)
nodes=[]
for k,t,v in fields(clip):
 if k!=7 or t!=2:continue
 f=fields(v);labels=[z.decode() for j,w,z in f if j==6 and w==2]
 nodes.append({'label':labels[0] if labels else '', 'properties':properties(v)})
roles={n['label']:n for n in nodes if n['label'] in ('EXPOSURE','BALANCE','SATURATION','CONTRAST/RATIO')}
assert len(roles)==4
for role in ('EXPOSURE','BALANCE'):assert roles[role]['properties']['3221225623']==12
assert roles['SATURATION']['properties']['3221225622']==46
assert roles['SATURATION']['properties']['3221225554']==0
assert roles['SATURATION']['properties']['3221225556']==0
assert abs(roles['CONTRAST/RATIO']['properties']['2248147136']-.336)<1e-6
report={'status':'structural checks passed','source':a.drx.name,'clipNodeCount':len(nodes),'roleProperties':roles,'inputCST':'DWG_COLORSPACE and DAV_INTER_OETF_GAMMA encoded in clip body','timelineReferences':re.findall(rb'[ -~]{12,}',bodies[1]),'scope':'Offline DRX decode; no import or Resolve UI operation. Property enum interpretation follows the supplied configured template; this is not an official DRX schema validator. The user has tested the GPrime controls in Resolve.','sources':['https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Colorist-Guide.pdf','https://cullenkellycolor.com/toolkit/referent']}
report['timelineReferences']=[v.decode() for v in report['timelineReferences'] if b'cube' in v or b'resolvetap' in v]
text=json.dumps(report,indent=2)
if a.output:a.output.write_text(text+'\n')
print(text)
