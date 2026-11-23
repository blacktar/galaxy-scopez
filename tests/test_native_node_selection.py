"""Offline selection-only packet checks. Never connects to Resolve."""
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('selection_test',ROOT/'scripts/test-direct-node-selection.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class DirectSelectionTest(unittest.TestCase):
    def test_number_and_select_translation(self):
        frames=[module.wire.HEADER.unpack(packet[:12])+(packet[12:],) for packet in module.selection_packets(18)]
        self.assertEqual([frame[2] for frame in frames],[0x296,0x277,0x240,0x52be])
        for dest,cmd,target,flags,length,payload in frames:
            self.assertEqual((dest,cmd,flags,length,payload),(0,3,0,2,b'\x01\x00'))
    def test_strict_number_range(self):
        for value in (True,0,-1,100,1.0,'18'):
            with self.assertRaises(ValueError):module.selection_packets(value)
    def test_guard_rejects_encoder_and_unrequested_keys(self):
        panel=object.__new__(module.SelectionOnly);panel.expected_keys=[]
        for packet in (module.wire.packet(4,0x1151,b'\x01\x00'),
                       module.wire.packet(3,0x2a1,b'\x01\x00'),
                       module.selection_packets(18)[0]):
            with self.assertRaises(ValueError):panel._send(packet,'test')
    def test_no_adjustment_or_traversal_methods(self):
        panel=object.__new__(module.SelectionOnly)
        with self.assertRaises(ValueError):panel.change(10)
        with self.assertRaises(ValueError):panel.navigate('first')
