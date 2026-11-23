"""Validate the command adapter with a fake Resolve session, without opening Resolve."""
import copy
import io
import runpy
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


class Node:
    def __init__(self):
        self.value = {"NodeIndex": 1, "Slope": "1 1 1", "Offset": "0 0 0",
                      "Power": "1 1 1", "Saturation": 1.0}
        self.writes = 0
        self.identity = "clip-a"

    def GetUniqueId(self): return self.identity
    def GetName(self): return "Audition"
    def GetNumNodes(self): return 1
    def GetNodeLabel(self, index): return "GScopez Primary"
    def GetNodeEnabled(self, index): return True
    def GetToolsInNode(self, index): return []
    def GetNodeGraph(self): return self
    def GetCDL(self, index): return copy.deepcopy(self.value)
    def SetCDL(self, value):
        self.writes += 1
        self.value = copy.deepcopy(value)
        return True


class NativeGradeAuditionTests(unittest.TestCase):
    def setUp(self):
        self.node = Node()
        timeline = types.SimpleNamespace(GetUniqueId=lambda:"timeline", GetCurrentVideoItem=lambda:self.node)
        project = types.SimpleNamespace(GetUniqueId=lambda:"project", GetName=lambda:"Audition",
                                        GetCurrentTimeline=lambda:timeline)
        resolve = types.SimpleNamespace(GetVersionString=lambda:"21.2",
                   GetProjectManager=lambda:types.SimpleNamespace(GetCurrentProject=lambda:project))
        module = types.SimpleNamespace(scriptapp=lambda name:resolve)
        source = Path(__file__).parents[1] / "scripts/native-grade-worker.py"
        with patch.dict(sys.modules, {"DaVinciResolveScript":module}), patch("sys.stdin",io.StringIO("")):
            self.worker = runpy.run_path(str(source))
        self.command = self.worker["command"]
        self.command({"action":"bind","target":["project","timeline","clip-a"],"node":1})

    def bind_exposure(self, confirmed=True):
        self.command({"action":"release"})
        self.node.GetNodeLabel=lambda index:"GScopez Exposure"
        return self.command({"action":"bind","target":["project","timeline","clip-a"],"node":1,"mode":"exposure","linearConfirmed":confirmed})

    def test_exposure_requires_linear_confirmation(self):
        with self.assertRaisesRegex(ValueError,"DWG/Linear"):
            self.bind_exposure(False)
        self.assertEqual(self.node.writes,0)

    def test_exposure_stops_and_restore(self):
        original=copy.deepcopy(self.node.value)
        self.bind_exposure()
        for stops,gain in [(1,2),(-1,.5),(6,64),(-6,1/64),(0,1)]:
            result=self.command({"action":"set","values":{"exposure":stops}})
            self.assertEqual(result["mode"],"exposure")
            self.assertEqual([float(v) for v in result["cdl"]["Slope"].split()],[gain]*3)
            self.assertEqual(result["cdl"]["Power"],"1 1 1")
        self.command({"action":"restore"})
        self.assertEqual(self.node.value,original)

    def test_exposure_rejects_invalid_or_wrong_control_state(self):
        self.bind_exposure()
        for values in ({"exposure":7},{"exposure":float("nan")},{"exposure":True},{"slope":1}):
            with self.assertRaises(ValueError):self.command({"action":"set","values":values})
        self.assertEqual(self.node.writes,0)

    def test_balance_axes_restore_and_bounds(self):
        self.command({"action":"release"})
        self.node.GetNodeLabel=lambda index:"GScopez Balance"
        self.command({"action":"bind","target":["project","timeline","clip-a"],"node":1,"mode":"balance","linearConfirmed":True})
        for x,y in [(0,0),(.5,0),(0,.5),(-.5,-.5),(.5,.5)]:
            result=self.command({"action":"set","values":{"x":x,"y":y}})
            red,green,blue=map(float,result["cdl"]["Slope"].split())
            self.assertGreater(min(red,green,blue),0)
            self.assertAlmostEqual((blue-1)/1.8556,x)
            self.assertAlmostEqual((red-1)/1.5748,y)
            self.assertAlmostEqual(.2126*red+.7152*green+.0722*blue,1)
        count=self.node.writes
        for values in ({"x":.6,"y":0},{"x":0,"y":float("nan")},{"x":0}):
            with self.assertRaises(ValueError):self.command({"action":"set","values":values})
        self.assertEqual(self.node.writes,count)
        self.command({"action":"restore"})
        self.assertEqual(self.node.value["Slope"],"1 1 1")

    def test_arbitrary_node_name_allowed_for_explicit_role(self):
        self.command({"action":"release"})
        self.node.GetNodeLabel=lambda index:"My balance node"
        result=self.command({"action":"bind","target":["project","timeline","clip-a"],"node":1,"mode":"balance","linearConfirmed":True})
        self.assertTrue(result["bound"])
        self.assertEqual(result["mode"],"balance")

    def test_combined_write_and_restore(self):
        original = copy.deepcopy(self.node.value)
        response = self.command({"action":"set","values":{
            "slope":1.1,"offset":.02,"power":.9,"saturation":.8,"red":1.1}})
        self.assertTrue(response["bound"])
        self.assertAlmostEqual(float(response["cdl"]["Slope"].split()[0]),1.21)
        self.assertAlmostEqual(response["cdl"]["Saturation"],.8)
        self.command({"action":"restore"})
        self.assertEqual(self.node.value,original)

    def test_changed_clip_disarms_without_writing(self):
        self.node.identity = "clip-b"
        with self.assertRaisesRegex(ValueError,"Binding changed"):
            self.command({"action":"restore"})
        self.assertEqual(self.node.writes,0)
        with self.assertRaisesRegex(ValueError,"bind"):
            self.command({"action":"read"})

    def test_external_correction_disarms_without_overwriting(self):
        self.node.value["Saturation"] = .7
        with self.assertRaisesRegex(ValueError,"outside"):
            self.command({"action":"restore"})
        self.assertEqual(self.node.writes,0)
        self.assertEqual(self.node.value["Saturation"],.7)

    def test_incomplete_or_out_of_range_state_cannot_write(self):
        for values in ({}, {"slope":5,"offset":0,"power":1,"saturation":1,"red":1}):
            with self.assertRaises(ValueError):
                self.command({"action":"set","values":values})
        self.assertEqual(self.node.writes,0)

    def test_release_leaves_current_grade_and_disables_writes(self):
        self.command({"action":"release"})
        self.assertEqual(self.node.writes,0)
        with self.assertRaisesRegex(ValueError,"bind"):
            self.command({"action":"restore"})

    def bind_contrast(self):
        self.command({"action":"release"})
        class Panel:
            connection = 1
            selections = []
            deltas = []
            def status(self): return {"ready":True,"connection":self.connection}
            pivot = .336
            def select_bound_node(self, index):
                self.selections.append(index)
                return self.verify_pivot()
            def verify_pivot(self):
                if abs(self.pivot-.336)>.00001: raise ValueError("Pivot mismatch")
                return {"pivot":self.pivot,"pivotVerified":True}
            def change(self,delta):
                if not 1<=abs(delta)<=1000: raise ValueError('movement limit')
                self.deltas.append(delta)
        self.panel = Panel()
        self.command.__globals__["contrast_panel"] = self.panel
        return self.command({"action":"bind","target":["project","timeline","clip-a"],"node":1,"mode":"contrast"})

    def test_contrast_requires_target_check_and_gesture(self):
        self.bind_contrast()
        for request in [{"action":"set","values":{"position":50}},
                        {"action":"contrast-begin"},
                        {"action":"contrast-confirm","clipNodeConfirmed":True,"uniquePivotConfirmed":True,"printerLightsOff":True}]:
            with self.assertRaises(ValueError): self.command(request)
        self.command({"action":"contrast-select"})
        self.assertEqual(self.panel.selections,[])
        self.assertEqual(self.panel.deltas,[])
        self.command({"action":"contrast-confirm","clipNodeConfirmed":True,"uniquePivotConfirmed":True,"printerLightsOff":True})
        gesture=self.command({"action":"contrast-begin"})["gesture"]
        self.assertEqual(self.panel.selections,[1])
        self.command({"action":"set","values":{"position":50},"gesture":gesture})
        self.command({"action":"set","values":{"position":100},"gesture":gesture})
        self.command({"action":"set","values":{"position":0},"gesture":gesture})
        self.assertEqual(self.panel.deltas,[50,50,-100])
        self.command({"action":"contrast-end","gesture":gesture})
        with self.assertRaises(ValueError):
            self.command({"action":"set","values":{"position":50},"gesture":gesture})
        self.assertEqual(self.node.writes,0)

    def test_contrast_clip_and_reconnection_guards(self):
        self.bind_contrast()
        self.command({"action":"contrast-select"})
        self.command({"action":"contrast-confirm","clipNodeConfirmed":True,"uniquePivotConfirmed":True,"printerLightsOff":True})
        self.panel.connection=2
        with self.assertRaisesRegex(ValueError,'confirm'):
            self.command({"action":"contrast-begin"})
        self.node.identity='different-clip'
        with self.assertRaisesRegex(ValueError,'Binding changed'):
            self.command({"action":"contrast-select"})
        self.assertEqual(self.panel.deltas,[])
        self.assertEqual(self.node.writes,0)

    def test_contrast_cannot_use_cdl_restore_or_wrong_gesture(self):
        self.bind_contrast()
        self.command({"action":"contrast-select"})
        self.command({"action":"contrast-confirm","clipNodeConfirmed":True,"uniquePivotConfirmed":True,"printerLightsOff":True})
        self.command({"action":"contrast-begin"})
        for request in [{"action":"restore"},{"action":"set","values":{"position":50},"gesture":"stale"}]:
            with self.assertRaises(ValueError): self.command(request)
        self.assertEqual(self.node.writes,0)
        self.assertEqual(self.panel.deltas,[])

    def bind_hsv(self, confirmed=True):
        self.command({'action':'release'})
        class Panel:
            def __init__(self):self.connection=1;self.selections=[];self.deltas=[]
            def status(self):return {'ready':True,'connection':self.connection}
            def select_saturation_node(self,index):
                self.selections.append(index)
                return {'gamma':0,'gain':1,'gammaRGB':[0]*3,'gainRGB':[1]*3}
            def saturation_change(self,delta):
                self.deltas.append(dict(delta))
                return {'gamma':.02,'gain':1.03,'gammaRGB':[.02]*3,'gainRGB':[1.03]*3}
        self.panel=Panel()
        self.command.__globals__['contrast_panel']=self.panel
        return self.command({'action':'bind','target':['project','timeline','clip-a'],
            'node':1,'mode':'hsv-saturation','hsvConfirmed':confirmed,'printerLightsOff':confirmed})

    def test_hsv_requires_explicit_node_configuration(self):
        with self.assertRaisesRegex(ValueError,'only channel 2'):
            self.bind_hsv(False)
        self.assertEqual(self.node.writes,0)

    def test_hsv_relative_pair_preserves_other_wheel_without_cdl_writes(self):
        self.bind_hsv()
        begin=self.command({'action':'hsv-begin'})
        gesture=begin['gesture']
        for value in ({'gamma':40,'gain':0},{'gamma':40,'gain':60},{'gamma':10,'gain':60}):
            result=self.command({'action':'set','values':value,'gesture':gesture})
            self.assertEqual(result['positions'],value)
            self.assertEqual(result['native']['gain'],1.03)
        self.assertEqual(self.panel.deltas,[{'gamma':40,'gain':0},{'gamma':0,'gain':60},{'gamma':-30,'gain':0}])
        self.assertEqual(self.panel.selections,[1]);self.assertEqual(self.node.writes,0)
        self.command({'action':'hsv-end','gesture':gesture})
        with self.assertRaises(ValueError):self.command({'action':'set','values':{'gamma':0,'gain':0},'gesture':gesture})

    def test_hsv_rejects_bad_deltas_restore_and_connection_change(self):
        self.bind_hsv();gesture=self.command({'action':'hsv-begin'})['gesture']
        for values in ({'gamma':101,'gain':0},{'gamma':True,'gain':0},{'gamma':0},{'gamma':float('nan'),'gain':0}):
            with self.assertRaises(ValueError):self.command({'action':'set','values':values,'gesture':gesture})
        with self.assertRaises(ValueError):self.command({'action':'restore'})
        self.panel.connection=2
        with self.assertRaisesRegex(ValueError,'connection changed'):
            self.command({'action':'set','values':{'gamma':1,'gain':1},'gesture':gesture})
        self.assertEqual(self.panel.deltas,[]);self.assertEqual(self.node.writes,0)

    def assign_gprime(self,role,node=1,**extra):
        return self.command({'action':'gprime-bind','role':role,'node':node,
            'target':['project','timeline','clip-a'],'nodeLabel':'GScopez Primary','nodeCount':1,**extra})

    def test_gprime_assignments_are_independent_and_never_modify_grade(self):
        self.assign_gprime('saturation')
        for role in ('exposure','contrast','balance'):
            with self.assertRaisesRegex(ValueError,'already assigned'):self.assign_gprime(role)
        result=self.command({'action':'inspect'})
        self.assertEqual(set(result['gprimeBindings']),{'saturation'})
        self.assertEqual(result['gprimeBindings']['saturation']['node'],1)
        for obsolete in ('sat-gamma','sat-gain'):
            with self.assertRaises(ValueError):self.assign_gprime(obsolete)
        self.assertEqual(self.node.writes,0)
        self.assertIsNone(self.command.__globals__['contrast_panel'])
        # Existing single-control audition binding remains independently armed.
        self.assertEqual(self.command({'action':'read'})['mode'],'primary')

    def test_gprime_configuration_can_assign_disabled_nodes_with_visible_state(self):
        self.node.GetNodeEnabled=lambda index:False
        result=self.assign_gprime('balance')
        self.assertFalse(result['gprimeBindings']['balance']['enabled'])
        self.assertEqual(self.node.writes,0)

    def test_gprime_rejects_stale_fetch_and_invalidates_clip_changes(self):
        for values in ({'target':['project','timeline','other']},{'nodeLabel':'Different'},{'nodeCount':2},{'node':True},{'role':'unknown'}):
            with self.assertRaises(ValueError):self.assign_gprime('contrast',**values) if 'role' not in values else self.assign_gprime(**values)
        self.assign_gprime('contrast')
        self.node.identity='other'
        self.assertEqual(self.command({'action':'inspect'})['gprimeBindings'],{})
        self.assertEqual(self.node.writes,0)


if __name__ == "__main__":
    unittest.main()
