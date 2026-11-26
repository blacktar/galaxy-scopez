"""Offline fresh-feedback gating; no Resolve connection."""
import importlib.util
from pathlib import Path
import struct
import unittest
spec=importlib.util.spec_from_file_location('bridge',Path(__file__).resolve().parents[1]/'scripts/contrast-panel-bridge.py')
bridge=importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
def frame(pivot=None,ack=False):
    values=b'' if pivot is None else b''.join(struct.pack('<IBf',0x14 if i==0 else i+100,3,pivot if i==0 else 0) for i in range(10))
    custom=b'\x01\x00\x00\x00' if ack else b''
    return (4,0x400,0x4fff,0,struct.pack('<BII',0,2 if ack else 0,len(values))+values+struct.pack('<I',len(custom))+custom)
class PivotGateTest(unittest.TestCase):
    def test_requires_fresh_ack_and_snapshot(self):
        gate=bridge.PivotFeedback()
        gate.receive(frame(.336));self.assertFalse(gate.verified)
        gate.request();self.assertFalse(gate.receive(frame(.336)))
        self.assertFalse(gate.receive(frame(ack=True)))
        self.assertTrue(gate.receive(frame(.336)));self.assertTrue(gate.verified)
        gate.request();self.assertFalse(gate.verified)
    def test_wrong_and_nonfinite_rejected(self):
        for value in (.435,float('nan'),float('inf')):
            gate=bridge.PivotFeedback();gate.request();gate.receive(frame(ack=True))
            self.assertTrue(gate.receive(frame(value)));self.assertFalse(gate.verified)
    def test_no_encoder_send_when_verification_fails(self):
        panel=object.__new__(bridge.ContrastPanelBridge)
        def reject():raise ValueError('Pivot mismatch')
        panel.verify_pivot=reject
        panel._send=lambda *args:self.fail('Unexpected encoder event')
        with self.assertRaises(ValueError):panel.change(10)

    def test_direct_selection_sends_only_bound_number_then_verifies(self):
        import threading
        panel=object.__new__(bridge.ContrastPanelBridge)
        panel.lock=threading.RLock();panel.generation=1
        panel.status=lambda:{'ready':True,'connection':1}
        events=[]
        panel._send=lambda data,kind:events.append(bridge.wire.HEADER.unpack(data[:12])[2])
        def verify():
            self.assertEqual(events,[0x296,0x277,0x240,0x52be])
            return {'pivotVerified':True}
        panel.verify_pivot=verify
        self.assertEqual(panel.select_bound_node(18)['requestedNode'],18)
    def test_direct_selection_pivot_mismatch_aborts(self):
        import threading
        panel=object.__new__(bridge.ContrastPanelBridge)
        panel.lock=threading.RLock();panel.generation=1
        panel.status=lambda:{'ready':True,'connection':1}
        panel._send=lambda *args:None
        def reject():raise ValueError('Pivot mismatch')
        panel.verify_pivot=reject
        with self.assertRaises(ValueError):panel.select_bound_node(18)

    def test_native_hsv_packet_pair_and_readback(self):
        import threading
        panel=object.__new__(bridge.ContrastPanelBridge)
        panel.lock=threading.RLock();panel.status=lambda:{'ready':True}
        packets=[];panel._send=lambda data,kind:packets.append(data)
        panel.primary_readback=lambda:{'gamma':.02,'gain':1.04}
        result=panel.saturation_change({'gamma':10,'gain':-20})
        self.assertEqual([bridge.wire.HEADER.unpack(data[:12])[2] for data in packets],[0x1311,0x1312])
        self.assertEqual([struct.unpack('<h',data[12:])[0] for data in packets],[10,-20])
        self.assertEqual(result['gain'],1.04)
        with self.assertRaises(ValueError):panel.saturation_change({'gamma':101,'gain':0})
        self.assertEqual(len(packets),2)

    def test_incomplete_native_feedback_blocks_hsv_readback(self):
        panel=object.__new__(bridge.ContrastPanelBridge)
        import threading
        panel.lock=threading.RLock();panel.feedback=bridge.PivotFeedback()
        panel.refresh_pivot=lambda:None
        with self.assertRaisesRegex(ValueError,'incomplete'):panel.primary_readback()


class FullscreenPivotGateTest(unittest.TestCase):
    def test_recorded_fullscreen_ack_then_real_snapshot(self):
        import json
        capture=Path(__file__).resolve().parents[1]/'docs/reverse-scopes/blackmagic-research/feedback-micro-present.json'
        snapshots=[]
        for item in json.loads(capture.read_text())['feedback']:
            payload=bytes.fromhex(item.get('payload_hex',''))
            if len(payload)<13:continue
            size=struct.unpack_from('<I',payload,5)[0]
            if size%9 or 13+size>len(payload):continue
            if any(struct.unpack_from('<I',payload,i)[0]==0x14 for i in range(9,9+size,9)):
                snapshots.append((4,0x400,0x4fff,0,payload))
        self.assertTrue(snapshots)
        # Exact readback acknowledgement recorded during the user's fullscreen failures.
        ack=(4,0x400,0x4fff,0,bytes.fromhex('0100000000000000000400000001000000'))
        gate=bridge.PivotFeedback();gate.request();self.assertFalse(gate.receive(ack))
        self.assertTrue(gate.receive(snapshots[0]));self.assertTrue(gate.verified)
        self.assertAlmostEqual(gate.pivot,.336,places=6)

    def test_ack_variant_still_needs_fresh_pivot_and_rejects_other_flags_or_tokens(self):
        for flags,token in [(1,1),(4,1),(0,2)]:
            gate=bridge.PivotFeedback();gate.request()
            ack=(4,0x400,0x4fff,0,struct.pack('<BIII',1,flags,0,4)+struct.pack('<I',token))
            gate.receive(ack);self.assertFalse(gate.receive(frame(.336)));self.assertFalse(gate.verified)
        gate=bridge.PivotFeedback();gate.receive(frame(.336));gate.request()
        gate.receive((4,0x400,0x4fff,0,bytes.fromhex('0100000000000000000400000001000000')))
        self.assertTrue(gate.pending);self.assertFalse(gate.verified)
        self.assertTrue(gate.receive(frame(.435)));self.assertFalse(gate.verified)

class PrimaryRecoveryTest(unittest.TestCase):
    def panel(self, replies):
        import threading
        from types import SimpleNamespace
        panel=object.__new__(bridge.ContrastPanelBridge)
        panel.lock=threading.RLock()
        panel.feedback_ready=threading.Condition(panel.lock)
        panel.feedback=bridge.PivotFeedback();panel.generation=1
        panel.protocol=SimpleNamespace(connected=True)
        panel.status=lambda:{'ready':True}
        packets=[]
        def send(data,kind):
            packets.append((bridge.wire.HEADER.unpack(data[:12])[1:3],kind,data[12:]))
            if kind=='user-pivot-readback':
                panel.feedback.receive(frame(ack=True))
                for response in next(replies):panel.feedback.receive(response)
        panel._send=send
        return panel,packets

    def missing(self):
        return (4,0x400,0x4fff,0,struct.pack('<BII',1,0x72000000,90)+
                b''.join(struct.pack('<IBf',0x1db+i,3,0) for i in range(10))+struct.pack('<I',0))

    def test_missing_primaries_recovers_once_then_requires_fresh_snapshot(self):
        panel,packets=self.panel(iter([[self.missing()],[frame(.336)]]))
        self.assertAlmostEqual(panel.refresh_pivot(),.336,places=6)
        self.assertTrue(panel.feedback.verified)
        self.assertEqual([p[1] for p in packets],['user-pivot-readback','recover-primary-feedback','user-pivot-readback'])
        self.assertEqual(packets[1][0],(3,0x2282))
        self.assertEqual(packets[1][2],b'\x01\x00')

    def test_healthy_or_wrong_pivot_does_not_change_palette(self):
        for value in (.336,.435):
            panel,packets=self.panel(iter([[frame(value)]]))
            self.assertAlmostEqual(panel.refresh_pivot(),value,places=6)
            self.assertEqual(len(packets),1)
            self.assertEqual(panel.feedback.verified,value==.336)

    def test_recovery_failure_is_bounded_and_cannot_accept_cached_pivot(self):
        from unittest.mock import patch
        panel,packets=self.panel(iter([[self.missing()],[self.missing()]]))
        panel.feedback.receive(frame(.336))
        with patch.object(bridge.time,'monotonic',side_effect=range(0,20,2)):
            with self.assertRaisesRegex(ValueError,'after automatic recovery'):panel.refresh_pivot()
        self.assertFalse(panel.feedback.verified)
        self.assertFalse(panel.feedback.pending)
        self.assertEqual(len(packets),3)

    def test_connection_change_aborts_without_palette_or_grade_commands(self):
        panel,packets=self.panel(iter([]))
        panel._send=lambda *_:setattr(panel,'generation',2)
        with self.assertRaisesRegex(ValueError,'connection changed'):panel.refresh_pivot()
        self.assertFalse(packets)
