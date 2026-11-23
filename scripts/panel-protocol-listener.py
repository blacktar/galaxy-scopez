#!/usr/bin/env python3
"""Receive-only loopback probe. No handshake replies, panel announcements or grade events."""
import argparse,json,socket,time
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=20324);args=parser.parse_args()
    if not 1024<=args.port<=65535:parser.error('Use an unprivileged port')
    out=Path(__file__).resolve().parents[1]/'docs/reverse-scopes/blackmagic-research/listener-status.json'
    out.parent.mkdir(parents=True,exist_ok=True)
    events=[]
    def log(event,**details):
        events.append(dict(time=time.time(),event=event,**details));del events[:-32]
        out.write_text(json.dumps(dict(receive_only=True,port=args.port,events=events),indent=2))
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
        listener.bind(('127.0.0.1',args.port));listener.listen(1)
        print(f'Receive-only listener ready on 127.0.0.1:{args.port}. No data will be sent. Ctrl-C stops.',flush=True);log('listening')
        try:
            while True:
                conn,addr=listener.accept();log('connected',peer=addr[0]);conn.settimeout(5)
                total=0
                with conn:
                    try:
                        while total<65536:
                            chunk=conn.recv(min(4096,65536-total))
                            if not chunk:break
                            total+=len(chunk);log('received',bytes=len(chunk),total=total,hex=chunk[:256].hex())
                    except socket.timeout:log('idle-timeout',bytes=total)
                log('disconnected',bytes=total)
        except KeyboardInterrupt:log('stopped')
if __name__=='__main__':main()
