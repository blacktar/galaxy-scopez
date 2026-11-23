#!/usr/bin/env python3
"""Local, user-operated native Contrast protocol audition. Not a production bridge.

Only the fixed, statically traced Contrast encoder is exposed. No UI automation,
node selection, reset, parameter scan or automatic grading writes. Panel events
affect Resolve's CURRENTLY SELECTED node, not the GPrime scripting binding.
"""
import argparse
from collections import deque
import json
from pathlib import Path
import queue
import selectors
import socket
import struct
import threading
import time

HEADER = struct.Struct('<HHHHI')
MAX_PAYLOAD = 65536
# InitDVPLPanelMenus: top knob 3 -> [10, 0x251]. ExecuteRaw opcode 10 ->
# EncoderCommand; getPanel(0x251)=2, getControl=0x51; PotWheelToApp -> 0x1151.
# Native acceptance/scaling remain experimental until user verifies Contrast.
CONTRAST_TARGET = 0x1151


def packet(command, target, payload=b''):
    return HEADER.pack(0, command, target, 0, len(payload)) + payload


def greeting():
    # ApplicationConnected / PanelInitToApp: connected-panel count is zero.
    # The uint32 at payload offset4 is a panel COUNT, not an API version.
    return packet(0x400, 0, bytes(8))


class Frames:
    """TCP stream decoder: handles split and coalesced frames, rejects oversize."""
    def __init__(self):
        self.buffer = bytearray()

    def feed(self, data):
        self.buffer.extend(data)
        result = []
        while len(self.buffer) >= HEADER.size:
            dest, command, target, flags, length = HEADER.unpack_from(self.buffer)
            if length > MAX_PAYLOAD:
                raise ValueError('Panel payload exceeds the audition limit')
            size = HEADER.size + length
            if len(self.buffer) < size:
                break
            payload = bytes(self.buffer[HEADER.size:size])
            del self.buffer[:size]
            result.append((dest, command, target, flags, payload))
        return result


class Audition:
    def __init__(self):
        self.connected = False
        self.armed = False
        self.status_replies = 0
        self.last_status = None
        self.steps = 0

    def connect(self):
        self.connected = True
        self.armed = False
        self.status_replies = 0
        self.last_status = None
        return greeting()

    def disconnect(self):
        self.connected = self.armed = False
        self.status_replies = 0

    def receive(self, frame):
        dest, command, target, flags, payload = frame
        # Match known status requests only. Do not reply to unknown commands.
        if command != 0x0a or flags or len(payload) != 8:
            return None
        if (dest, target) not in {(0, 0x0fff), (1, 0x1fff), (2, 0x2fff)}:
            return None
        self.status_replies += 1
        self.last_status = time.monotonic()
        # HandleStatusCheck in this native version returns true for all three
        # legacy destinations; initial translator menu/state is zero.
        return packet(0x0a, 0x3000, bytes(8))

    def arm(self):
        if not self.connected or not self.status_replies:
            raise ValueError('Wait for a Resolve connection and status request first.')
        self.armed = True

    def increment(self, delta):
        if not self.connected or not self.armed:
            raise ValueError('Not armed. Select the test node in Resolve, then type arm.')
        if type(delta) is not int or not 1 <= abs(delta) <= 100:
            raise ValueError('One increment must be between 1 and 100 encoder units.')
        return packet(4, CONTRAST_TARGET, struct.pack('<h', delta))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=20324)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Use an unprivileged port')
    output = Path(__file__).resolve().parents[1] / 'docs/reverse-scopes/blackmagic-research/contrast-test-status.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    events = deque(maxlen=64)
    state = Audition()
    commands = queue.Queue(maxsize=8)
    selector = selectors.DefaultSelector()
    conn = None
    frames = None
    unit = 1

    def log(event, **details):
        events.append(dict(time=time.time(), event=event, **details))
        snapshot = dict(connected=state.connected, armed=state.armed,
                        status_replies=state.status_replies, increments_sent=state.steps,
                        port=args.port, target=hex(CONTRAST_TARGET), events=list(events))
        temporary = output.with_suffix('.tmp')
        temporary.write_text(json.dumps(snapshot, indent=2) + '\n')
        temporary.replace(output)

    def close_peer():
        nonlocal conn
        if conn is not None:
            selector.unregister(conn)
            conn.close()
            conn = None
        state.disconnect()
        # Never replay a command across a disconnect / new selected node.
        while not commands.empty():
            try:
                commands.get_nowait()
            except queue.Empty:
                break
        log('disconnected')

    def send(data, kind):
        if conn is None:
            raise ValueError('Resolve is not connected.')
        # Tiny bounded packets; socket timeout prevents an indefinite write.
        conn.sendall(data)
        if kind == 'user-contrast-increment':
            state.steps += 1
        log('sent', kind=kind, hex=data.hex())

    def stdin_loop():
        while True:
            try:
                line = input().strip()
            except EOFError:
                line = 'quit'
            try:
                commands.put_nowait(line)
            except queue.Full:
                print('Command ignored: wait before entering another.', flush=True)
            if line == 'quit':
                break

    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            listener.bind(('127.0.0.1', args.port))
        except OSError as error:
            raise SystemExit(f'Cannot listen on {args.port}: {error}. Stop the receive-only probe first.')
        listener.listen(1)
        selector.register(listener, selectors.EVENT_READ)
        print(f'Native Contrast audition ready on 127.0.0.1:{args.port}.', flush=True)
        print('Select your test clip and Contrast node yourself. Keep Primaries visible.\n'
              'This targets the SELECTED node; it does not use the GPrime binding.\n'
              'Commands, followed by Return:\n'
              '  arm       confirm your test node is selected\n'
              '  + / -     send ONE Contrast encoder increment (default 1 unit)\n'
              '  unit 10   change increment size (1–100; units are not Contrast values)\n'
              '  disarm    stop accepting grading commands\n'
              '  status    show connection and event counts\n'
              '  quit      stop; leaves your grade as it is\n'
              'Use Resolve Undo yourself if needed. No automatic restore.', flush=True)
        log('listening')
        threading.Thread(target=stdin_loop, daemon=True).start()
        try:
            running = True
            while running:
                for key, _ in selector.select(0.1):
                    if key.fileobj is listener:
                        peer, address = listener.accept()
                        if conn is not None:
                            peer.close()
                            continue
                        conn = peer
                        conn.settimeout(0.5)
                        frames = Frames()
                        selector.register(conn, selectors.EVENT_READ)
                        send(state.connect(), 'initialization')
                        print('Resolve connected. Initialization sent; waiting for status request.', flush=True)
                    else:
                        try:
                            data = conn.recv(4096)
                            if not data:
                                close_peer()
                                print('Resolve disconnected; disarmed.', flush=True)
                                continue
                            for frame in frames.feed(data):
                                dest, command, target, flags, payload = frame
                                log('received', destination=dest, command=hex(command), target=hex(target),
                                    flags=flags, payload_bytes=len(payload), payload_prefix=payload[:128].hex())
                                response = state.receive(frame)
                                if response:
                                    send(response, 'status-response')
                                    if state.status_replies == 1:
                                        print('Status request answered. Ready for your manual arm and +/- test.\n'
                                              'A reply being sent does not yet prove native Contrast acceptance.', flush=True)
                        except (OSError, ValueError) as error:
                            print(f'Connection closed: {error}', flush=True)
                            close_peer()
                try:
                    line = commands.get_nowait()
                except queue.Empty:
                    continue
                try:
                    if line == 'quit':
                        running = False
                    elif line == 'arm':
                        state.arm()
                        log('user-armed')
                        print('Armed. Each + or - sends one event to the currently selected node.', flush=True)
                    elif line == 'disarm':
                        state.armed = False
                        log('user-disarmed')
                        print('Disarmed.', flush=True)
                    elif line in {'+', '-'}:
                        delta = unit if line == '+' else -unit
                        send(state.increment(delta), 'user-contrast-increment')
                        print(f'Sent {delta:+d} encoder unit(s). Check the native Contrast field.', flush=True)
                    elif line.startswith('unit '):
                        candidate = int(line.split()[1])
                        if not 1 <= candidate <= 100:
                            raise ValueError('Use a unit size from 1 to 100.')
                        unit = candidate
                        print(f'Increment size is {unit} encoder unit(s).', flush=True)
                    elif line == 'status':
                        print(f'Connected={state.connected}; armed={state.armed}; '
                              f'status replies={state.status_replies}; increments={state.steps}; unit={unit}', flush=True)
                    elif line:
                        print('Use arm, +, -, unit 10, disarm, status or quit.', flush=True)
                except (ValueError, OSError) as error:
                    state.armed = False
                    log('command-rejected', reason=str(error))
                    print(f'{error} Disarmed.', flush=True)
                    if isinstance(error, OSError):
                        close_peer()
        except KeyboardInterrupt:
            pass
        finally:
            if conn is not None:
                close_peer()
            selector.close()
            log('stopped')


if __name__ == '__main__':
    main()
