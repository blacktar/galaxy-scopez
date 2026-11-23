"""Persistent panel transport for user-triggered Contrast/node-selection auditions."""
import importlib.util
import json
from pathlib import Path
import socket
import threading
import time
import math
import struct
from collections import deque

spec = importlib.util.spec_from_file_location('contrast_wire', Path(__file__).with_name('native-contrast-panel-test.py'))
wire = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wire)

PIVOT_TARGET = .336
PIVOT_TOLERANCE = .00001


class PivotFeedback:
    """Readback gate, not a node identity or navigation implementation."""
    def __init__(self):
        self.pivot = None
        self.values = {}
        self.pending = False
        self.acknowledged = False
        self.verified = False

    def request(self):
        self.pending = True
        self.acknowledged = self.verified = False

    def receive(self, frame):
        dest, command, target, flags, payload = frame
        if (dest,command,target,flags)!=(4,0x400,0x4fff,0) or len(payload)<13:
            return False
        _,state_flags,size=struct.unpack_from('<BII',payload)
        end=9+size
        if size%9 or end+4>len(payload):return False
        custom,=struct.unpack_from('<I',payload,end)
        if end+4+custom!=len(payload):return False
        if self.pending and state_flags==2 and payload[end+4:]==b'\x01\x00\x00\x00':
            self.acknowledged=True
        found=False
        snapshot={}
        for offset in range(9,end,9):
            param,=struct.unpack_from('<I',payload,offset)
            raw_value,=struct.unpack_from('<f',payload,offset+5)
            if math.isfinite(raw_value):snapshot[param]=raw_value
            if param==0x14:
                pivot,=struct.unpack_from('<f',payload,offset+5)
                self.pivot=pivot if math.isfinite(pivot) else None
                found=True
                if self.pivot is None or abs(self.pivot-PIVOT_TARGET)>PIVOT_TOLERANCE:
                    self.verified=False
        if self.pending and self.acknowledged and size>=90 and found:
            self.pending=False
            self.values=snapshot
            self.verified=self.pivot is not None and abs(self.pivot-PIVOT_TARGET)<=PIVOT_TOLERANCE
            return True
        return False


def node_packets(index):
    if type(index) is not int or not 1 <= index <= 99:
        raise ValueError('The node-selection audition supports nodes 1–99.')
    # InitDVPLPanelMenus: Shift Down + Prev Node -> packed key 0x24fe.
    # ResolveDispatcher emits the one-shot Shift Down key (0x3a5), then
    # actual control 0x4fe. KeyPressToApp adds panel base + 0x200.
    # No OS keyboard/mouse automation. Next Node is packed key 0x3a1.
    key = lambda target: wire.packet(3, target, b'\x01\x00')
    return [key(0x02a5), key(0x52fe)] + [key(0x02a1)] * (index - 1)


DIRECT_DIGITS=dict(zip('1234567890',(0x296,0x297,0x298,0x286,0x287,0x288,0x276,0x277,0x278,0x2a7)))
def direct_node_packets(index):
    if type(index) is not int or not 1<=index<=99:
        raise ValueError('Direct node selection supports API indexes 1–99.')
    # User-validated Advanced SELECT NODE: packed0x14be -> ShiftUp0x0240 +0x52be.
    return [wire.packet(3,target,b'\x01\x00') for target in
            [DIRECT_DIGITS[digit] for digit in str(index)]+[0x0240,0x52be]]


class ContrastPanelBridge:
    def __init__(self, port=20324):
        self.lock = threading.RLock()
        self.feedback_ready = threading.Condition(self.lock)
        self.feedback = PivotFeedback()
        self.peer = None
        self.closed = False
        self.protocol = wire.Audition()
        self.events = deque(maxlen=64)
        self.last_error = None
        self.generation = 0
        self.output = Path(__file__).resolve().parents[1] / 'docs/reverse-scopes/blackmagic-research/contrast-bridge-status.json'
        self.listener = socket.socket()
        self.listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            self.listener.bind(('127.0.0.1', port))
            self.listener.listen(1)
            self.listener.settimeout(.5)
        except OSError:
            self.listener.close()
            raise ValueError('Panel test port 20324 is busy. Quit the earlier Contrast test script.')
        self._log('listening', port=port)
        threading.Thread(target=self._loop, daemon=True).start()

    def _log(self, event, **details):
        self.events.append(dict(time=time.time(), event=event, **details))
        self.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.output.with_suffix('.tmp')
        temporary.write_text(json.dumps(self.status() | {'events': list(self.events)}, indent=2) + '\n')
        temporary.replace(self.output)

    def status(self):
        with self.lock:
            return dict(connected=self.protocol.connected,
                        statusReplies=self.protocol.status_replies,
                        ready=self.protocol.connected and self.protocol.status_replies > 0,
                        connection=self.generation,
                        pivot=self.feedback.pivot, pivotVerified=self.feedback.verified,
                        error=self.last_error)

    def _send(self, data, kind):
        if self.peer is None:
            raise ValueError('Resolve panel connection is unavailable. Wait for it to reconnect.')
        try:
            self.peer.sendall(data)
        except OSError as error:
            self._disconnect()
            raise ValueError('Panel connection dropped; stop and select/confirm the assigned node again.') from error
        self._log('sent', kind=kind, hex=data.hex())

    def _disconnect(self):
        with self.lock:
            if self.peer:
                self.peer.close()
            self.peer = None
            self.protocol.disconnect()
            self.feedback=PivotFeedback()
            self.feedback_ready.notify_all()
            self._log('disconnected')

    def _loop(self):
        while not self.closed:
            try:
                peer, _ = self.listener.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            peer.settimeout(.5)
            decoder = wire.Frames()
            try:
                with self.lock:
                    if self.closed:
                        peer.close()
                        return
                    self.peer = peer
                    self.generation += 1
                    self.last_error = None
                    self.protocol.connect()
                    self.feedback=PivotFeedback()
                    self._send(wire.packet(0x400,0,struct.pack('<II',0,1)), 'initialization-one-panel')
                    self._send(wire.packet(0x400,0x3000,b'\x02\x00'+struct.pack('<IHIHBB',0x424d444c,4,1,0,3,255)), 'micro-discovery')
                while not self.closed:
                    try:
                        data = peer.recv(4096)
                    except socket.timeout:
                        continue
                    if not data:
                        break
                    with self.lock:
                        for frame in decoder.feed(data):
                            dest, command, target, flags, payload = frame
                            self._log('received', destination=dest, command=hex(command),
                                      target=hex(target), bytes=len(payload), prefix=payload[:64].hex())
                            if self.feedback.receive(frame):
                                self._log('pivot-refresh',pivot=self.feedback.pivot,verified=self.feedback.verified)
                                self.feedback_ready.notify_all()
                            response = self.protocol.receive(frame)
                            if response:
                                self._send(response, 'status-response')
            except (OSError, ValueError) as error:
                self.last_error = str(error)
            finally:
                self._disconnect()

    def refresh_pivot(self):
        """Request readback only; never selects or navigates a Resolve node."""
        with self.feedback_ready:
            if not self.status()['ready']:raise ValueError('Waiting for Resolve panel connection.')
            connection=self.generation
            self.feedback.request()
            self._send(wire.packet(0x400,0,struct.pack('<II',1,1)), 'user-pivot-readback')
            deadline=time.monotonic()+1.5
            while self.feedback.pending:
                remaining=deadline-time.monotonic()
                if remaining<=0:
                    self.feedback.verified=False
                    raise ValueError('Fresh Pivot feedback timed out. No Contrast adjustment sent.')
                self.feedback_ready.wait(remaining)
                if connection!=self.generation or not self.protocol.connected:
                    raise ValueError('Panel connection changed during Pivot verification.')
            return self.feedback.pivot

    def verify_pivot(self):
        pivot=self.refresh_pivot()
        if pivot is None or abs(pivot-PIVOT_TARGET)>PIVOT_TOLERANCE:
            raise ValueError(f'Active Pivot is {pivot}; expected 0.336. Select RAT/CONT manually. No Contrast adjustment sent.')
        return {'pivot':pivot,'pivotVerified':True,'nodeIdentityVerified':False}

    def select_number(self, index):
        packets=direct_node_packets(index)
        with self.lock:
            if not self.status()['ready']:
                raise ValueError('Waiting for Resolve panel connection.')
            connection=self.generation
            for data in packets:
                self._send(data,'user-direct-bound-node-selection')
                time.sleep(.04)
        time.sleep(.15)
        if self.status()['connection']!=connection:
            raise ValueError('Panel connection changed during selection.')
        return connection

    def select_bound_node(self, index):
        """Contrast only: direct numeric selection, then fresh Pivot gate."""
        connection=self.select_number(index)
        verified=self.verify_pivot()
        if self.status()['connection']!=connection:
            raise ValueError('Panel connection changed during selection. No Contrast adjustment sent.')
        return verified | {'requestedNode':index,'selectionMethod':'direct-number'}

    def primary_readback(self):
        self.refresh_pivot()
        with self.lock:
            values=dict(self.feedback.values)
        if any(key not in values for key in range(5,13)):
            raise ValueError('Fresh native Gamma/Gain feedback is incomplete. Controls stopped.')
        return {'gamma':values[8],'gain':values[12],'contrast':values.get(0x13),'pivot':values.get(0x14),
                'gammaRGB':[values[key] for key in (5,6,7)],
                'gainRGB':[values[key] for key in (9,10,11)]}

    def select_saturation_node(self, index):
        connection=self.select_number(index)
        values=self.primary_readback()
        if self.status()['connection']!=connection:
            raise ValueError('Panel connection changed during selection.')
        return values

    def saturation_change(self, deltas):
        if set(deltas)!={'gamma','gain'} or any(type(value) is not int or abs(value)>100 for value in deltas.values()):
            raise ValueError('Native saturation movement exceeds 100 units per control per update.')
        with self.lock:
            if not self.status()['ready']:
                raise ValueError('Resolve panel connection dropped; prepare the HSV node again.')
            # Native Micro master wheels: InitDVPL opcode12 wheel1/2;
            # ResolveDispatcher TrackBallZMoveToApp(panel2,index) ->0x1311/0x1312.
            # Incremental commands preserve the other wheel's state.
            for key,target in (('gamma',0x1311),('gain',0x1312)):
                if deltas[key]:
                    self._send(wire.packet(4,target,struct.pack('<h',deltas[key])), 'user-hsv-'+key)
        return self.primary_readback()

    def select_node(self, index):
        with self.lock:
            if not self.status()['ready']:
                raise ValueError('Waiting for Resolve panel connection. Keep the remote panel address at 127.0.0.1:20324.')
            for data in node_packets(index):
                self._send(data, 'user-node-selection')
                time.sleep(.015)
            return {'requestedNode': index, 'selectionVerified': False}

    def navigate(self, direction):
        with self.lock:
            if not self.status()['ready']:
                raise ValueError('Waiting for Resolve panel connection.')
            if direction == 'first':
                packets = node_packets(1)
            elif direction in ('next', 'previous'):
                packets = [wire.packet(3, 0x02a1 if direction == 'next' else 0x02a0, b'\x01\x00')]
            else:
                raise ValueError('Choose first, next or previous node.')
            for data in packets:
                self._send(data, 'user-navigation-diagnostic-' + direction)
                time.sleep(.1)

    def change(self, delta):
        # Called only by an explicitly confirmed, user-operated ribbon. Fresh
        # feedback gates each event; the bridge performs no automatic selection.
        self.verify_pivot()
        with self.lock:
            if not self.status()['ready']:
                raise ValueError('Resolve panel connection dropped. Select/confirm the assigned node again.')
            if type(delta) is not int or not 1 <= abs(delta) <= 1000:
                raise ValueError('Contrast movement is outside the audition limit; drag more slowly.')
            self._send(wire.packet(4, wire.CONTRAST_TARGET, wire.struct.pack('<h', delta)), 'user-contrast-ribbon')

    def close(self):
        self.closed = True
        self.listener.close()
        self._disconnect()
