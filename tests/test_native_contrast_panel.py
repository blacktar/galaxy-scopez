"""Offline protocol/arming checks; never contacts Resolve."""
import importlib.util
import json
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('contrast_probe', ROOT / 'scripts/native-contrast-panel-test.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ContrastPanelTest(unittest.TestCase):
    def test_actual_capture_arbitrary_tcp_boundaries(self):
        capture = json.loads((ROOT / 'docs/reverse-scopes/blackmagic-research/first-resolve-connection.json').read_text())
        chunks = []
        for event in capture['capture']['events']:
            if event['event'] == 'disconnected':
                break
            if event['event'] == 'received':
                self.assertEqual(len(bytes.fromhex(event['hex'])), event['bytes'])
                chunks.append(bytes.fromhex(event['hex']))
        stream = b''.join(chunks)
        expected = [(4, 0x400, 0x4fff, 168), (4, 0x400, 0x4fff, 13),
                    (4, 0x400, 0x4fff, 155), (4, 0x400, 0x4fff, 155), (0, 10, 0x0fff, 8)]
        for chunk_size in [1, 7, 12, 37, len(stream)]:
            decoder = probe.Frames()
            frames = []
            for offset in range(0, len(stream), chunk_size):
                frames.extend(decoder.feed(stream[offset:offset + chunk_size]))
            self.assertEqual([(d, c, t, len(p)) for d, c, t, f, p in frames], expected)
            self.assertEqual(decoder.buffer, b'')

    def test_oversize_rejected_before_payload_allocation(self):
        with self.assertRaises(ValueError):
            probe.Frames().feed(struct.pack('<HHHHI', 0, 10, 0x0fff, 0, 65537))

    def test_initialization_is_not_grading_event(self):
        state = probe.Audition()
        self.assertEqual(state.connect().hex(), '0000000400000000080000000000000000000000')
        self.assertFalse(state.armed)
        self.assertEqual(state.steps, 0)

    def test_known_status_reply_golden(self):
        state = probe.Audition()
        state.connect()
        frame, = probe.Frames().feed(bytes.fromhex('01000a00ff1f0000080000000000000000000000'))
        self.assertEqual(state.receive(frame).hex(), '00000a0000300000080000000000000000000000')
        self.assertFalse(state.armed)

    def test_unknown_command_does_not_reply_or_arm(self):
        state = probe.Audition()
        state.connect()
        for frame in [(4, 10, 0x4fff, 0, bytes(8)), (0, 4, 0x1151, 0, bytes(2)),
                      (0, 10, 0x0fff, 1, bytes(8)), (0, 10, 0x0fff, 0, bytes(7))]:
            self.assertIsNone(state.receive(frame))
        self.assertEqual(state.status_replies, 0)
        with self.assertRaises(ValueError):
            state.arm()

    def test_positive_negative_are_only_fixed_contrast_target(self):
        state = probe.Audition()
        with self.assertRaises(ValueError):
            state.increment(1)
        state.connect()
        state.receive((0, 10, 0x0fff, 0, bytes(8)))
        with self.assertRaises(ValueError):
            state.increment(1)
        state.arm()
        self.assertEqual(state.increment(1).hex(), '0000040051110000020000000100')
        self.assertEqual(state.increment(-1).hex(), '000004005111000002000000ffff')
        for invalid in [0, 101, -101, 1.5, True]:
            with self.assertRaises(ValueError):
                state.increment(invalid)

    def test_reconnect_requires_new_status_and_manual_arm(self):
        state = probe.Audition()
        state.connect()
        state.receive((0, 10, 0x0fff, 0, bytes(8)))
        state.arm()
        state.disconnect()
        state.connect()
        with self.assertRaises(ValueError):
            state.arm()
        state.receive((1, 10, 0x1fff, 0, bytes(8)))
        with self.assertRaises(ValueError):
            state.increment(-1)

    def test_node_selection_packet_sequence_does_not_grade(self):
        spec = importlib.util.spec_from_file_location('bridge', ROOT / 'scripts/contrast-panel-bridge.py')
        bridge = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bridge)
        packets=bridge.node_packets(3)
        decoded=[probe.Frames().feed(data)[0] for data in packets]
        self.assertEqual([frame[2] for frame in decoded],[0x02a5,0x52fe,0x02a1,0x02a1])
        self.assertTrue(all(frame[1]==3 and frame[4]==b'\x01\x00' for frame in decoded))
        self.assertEqual(len(bridge.node_packets(1)),2)
        for bad in [0,100,True,1.5]:
            with self.assertRaises(ValueError): bridge.node_packets(bad)


if __name__ == '__main__':
    unittest.main()
