#!/usr/bin/env python3
"""Offline pcapng/usbmon analysis. Never opens a device or network connection."""
import argparse, collections, json, struct
from pathlib import Path

def packets(data):
    offset=0
    while offset<len(data):
        if offset+12>len(data):raise ValueError('Truncated block')
        kind,length=struct.unpack_from('<II',data,offset)
        if length<12 or offset+length>len(data) or struct.unpack_from('<I',data,offset+length-4)[0]!=length:raise ValueError('Invalid block length')
        if kind==1:
            if struct.unpack_from('<H',data,offset+8)[0]!=220:raise ValueError('Expected Linux USB mmap capture')
        if kind==6:
            size=struct.unpack_from('<I',data,offset+20)[0]
            if offset+28+size>offset+length-4:raise ValueError('Invalid packet length')
            yield data[offset+28:offset+28+size]
        offset+=length

def analyse(data):
    rows=list(packets(data));devices={}
    for p in rows:
        if len(p)<64:continue
        key=(struct.unpack_from('<H',p,12)[0],p[11]);payload=p[64:]
        if p[8]==ord('C') and p[9]==2 and payload[:2]==b'\x12\x01' and len(payload)>=18:
            devices[key]=(struct.unpack_from('<H',payload,8)[0],struct.unpack_from('<H',payload,10)[0])
    panel_keys={k for k,v in devices.items() if v==(0x1edb,0xda0f)}
    reports=collections.Counter();encoders=[];requests=[]
    for p in rows:
        if len(p)<64 or (struct.unpack_from('<H',p,12)[0],p[11]) not in panel_keys:continue
        payload=p[64:]
        if p[8]==ord('C') and p[9]==1 and payload:
            reports[(payload[0],len(payload))]+=1
            if payload[0]==6 and len(payload)==65:encoders.append(struct.unpack('<16i',payload[1:]))
        if p[8]==ord('S') and p[9]==2:
            bm,req,value,index,length=struct.unpack('<BBHHH',p[40:48])
            requests.append(dict(request_type=bm,request=req,value=value,interface=index,length=length,data=payload.hex()))
    return dict(total_packets=len(rows),panel_usb_addresses=[list(k) for k in sorted(panel_keys)],reports=[dict(report=hex(i),bytes=n,count=c) for (i,n),c in sorted(reports.items())],encoder_format='report 0x06: sixteen little-endian signed int32 values; units unverified',encoder_slots=[dict(slot=i,nonzero_reports=sum(r[i]!=0 for r in encoders),minimum=min((r[i] for r in encoders),default=0),maximum=max((r[i] for r in encoders),default=0)) for i in range(16)],control_requests=requests,limitations=['USB capture only; no TCP remote-panel packets.','No synchronized native Contrast value readback.','HID report descriptor not present in observed control requests.','No authentication exchange identified; absence here does not prove none required.'])
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('capture',type=Path);parser.add_argument('--output',type=Path);args=parser.parse_args()
    result=json.dumps(analyse(args.capture.read_bytes()),indent=2)+'\n'
    if args.output:args.output.write_text(result)
    else:print(result,end='')
