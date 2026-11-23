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
