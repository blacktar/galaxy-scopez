#!/usr/bin/env python3
"""Observe Resolve panel feedback; only established init/status replies, no controls."""
from collections import deque
import importlib.util
import json
from pathlib import Path
import socket
import struct
import time
import argparse

spec = importlib.util.spec_from_file_location('wire', Path(__file__).with_name('native-contrast-panel-test.py'))
wire = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wire)


def discovery():
    # Exact BMDLightDevice::CreatePanelDiscoveryCmd / DataToApp layout:
    # magic, discovery kind4, local device ID1, reserved, Micro model3,
    # unknown battery. No key/encoder command; ephemeral connection identity.
    return wire.packet(0x400,0x3000,b'\x02\x00'+struct.pack('<IHIHBB',0x424d444c,4,1,0,3,255))


def panel_present():
    # PanelDevice constructor increments global current-panel COUNT; native
    # ApplicationConnected serializes that count at init payload offset4.
    return wire.packet(0x400,0,struct.pack('<II',0,1))


def request_refresh():
    return wire.packet(0x400,0,struct.pack('<II',1,1))


def describe(frame):
    dest, command, target, flags, payload = frame
    result = dict(destination=dest, command=command, target=target, flags=flags,
                  bytes=len(payload), truncated=len(payload)>8192, payload_hex=payload[:8192].hex())
    # StateChange parser in native translator: one-byte state, four-byte flags,
    # four-byte value-list byte length, then packed nine-byte value records,
    # then four-byte custom-data length and custom-data bytes.
    if command == 0x400 and len(payload) >= 13:
        state, state_flags, count = struct.unpack_from('<BII',payload)
        end=9+count
        if count % 9 == 0 and end+4 <= len(payload):
            custom_size, = struct.unpack_from('<I',payload,end)
            if end+4+custom_size == len(payload):
                result['stateCandidate'] = dict(state=state, flags=state_flags,
                    valueRecords=[dict(id=struct.unpack_from('<I',payload,o)[0],
                                       raw=payload[o:o+9].hex())
                                  for o in range(9,min(end,9+9*256),9)],
                    customBytes=custom_size,customHex=payload[end+4:end+4+8192].hex())
    return result


def send_protocol_only(peer, data, allow_discovery=False):
    if allow_discovery and data in (discovery(),panel_present(),request_refresh()):
        peer.sendall(data)
        return
    dest, command, target, flags, length = wire.HEADER.unpack_from(data)
    if dest != 0 or flags != 0 or length != 8 or data[12:] != bytes(8) or (command,target) not in {(0x400,0),(10,0x3000)}:
        raise ValueError('Observer refuses every packet except zero init/status replies.')
    peer.sendall(data)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--micro-discovery',action='store_true',help='Advertise only the statically recovered virtual Micro discovery record; never send controls.')
    parser.add_argument('--refresh-check',action='store_true',help='Send one native PanelInitToApp(1) refresh after connecting; no controls.')
    args=parser.parse_args()
    profile='micro-present' if args.micro_discovery else 'basic'
    output=Path(__file__).resolve().parents[1]/f'docs/reverse-scopes/blackmagic-research/feedback-{profile}.json'
    events=deque(maxlen=64)
    feedback=deque(maxlen=32)
    counts={}
    connections=0
    def log(event, **details):
        events.append(dict(time=time.time(),event=event,**details))
        data=dict(protocolOnly=True,profile=profile,port=20324,connections=connections,counts=counts,
                  events=list(events),feedback=list(feedback))
        temporary=output.with_suffix('.tmp')
        temporary.write_text(json.dumps(data,indent=2)+'\n')
        temporary.replace(output)
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
        listener.bind(('127.0.0.1',20324))
        listener.listen(1)
        print('Feedback observer ready on 127.0.0.1:20324. No node navigation or grading commands.',flush=True)
        log('listening')
        try:
            while True:
                peer,_=listener.accept()
                connections+=1
                protocol=wire.Audition()
                decoder=wire.Frames()
                peer.settimeout(.5)
                with peer:
                    connected_at=time.monotonic();refreshed=False
                    greeting=protocol.connect()
                    send_protocol_only(peer,panel_present() if args.micro_discovery else greeting,allow_discovery=args.micro_discovery)
                    if args.micro_discovery:
                        send_protocol_only(peer,discovery(),allow_discovery=True)
                        log('micro-discovery-sent',hex=discovery().hex())
                    log('connected')
                    print('Resolve connected; observing feedback.',flush=True)
                    try:
                        while True:
                            if args.refresh_check and args.micro_discovery and not refreshed and time.monotonic()-connected_at>2:
                                send_protocol_only(peer,request_refresh(),True)
                                refreshed=True;log('refresh-request')
                                print('Sent one protocol-only parameter refresh request.',flush=True)
                            try:data=peer.recv(4096)
                            except socket.timeout:continue
                            if not data:break
                            for frame in decoder.feed(data):
                                dest,command,target,flags,payload=frame
                                key=f'{dest}:{command:#x}:{target:#x}'
                                counts[key]=counts.get(key,0)+1
                                if len(counts)>64:counts.pop(next(iter(counts)))
                                if command!=10:
                                    description=describe(frame)
                                    feedback.append(dict(time=time.time(),**description))
                                    print(f'Feedback {key}, {len(payload)} bytes',flush=True)
                                    log('feedback',key=key,bytes=len(payload))
                                response=protocol.receive(frame)
                                if response:
                                    send_protocol_only(peer,response)
                                    log('status-response')
                    except (OSError,ValueError) as error:
                        log('connection-error',error=str(error))
                    log('disconnected')
        except KeyboardInterrupt:
            log('stopped')


if __name__=='__main__':main()
