"""Offline combined GPrime tests; no Resolve connections."""
import copy
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('gprime',Path(__file__).resolve().parents[1]/'scripts/gprime-grading.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Clip:
    def __init__(self):
        self.nodes={i:{'Slope':'1 1 1','Offset':'0 0 0','Power':'1 1 1','Saturation':1.0} for i in range(1,5)};self.writes=[]
    def GetCDL(self,index):return copy.deepcopy(self.nodes[index])
    def SetCDL(self,value):
        self.writes.append(copy.deepcopy(value));self.nodes[value['NodeIndex']]={key:value[key] for key in ('Slope','Offset','Power','Saturation')};return True
class Panel:
    def __init__(self):self.selected=[];self.changes=[];self.pairs=[];self.connection=1;self.reject=False
    def status(self):return {'ready':True,'connection':self.connection}
    def select_bound_node(self,index):
        self.selected.append(index)
        if self.reject:raise ValueError('Pivot mismatch')
    def select_saturation_node(self,index):self.selected.append(index);return self.primary_readback()
    def primary_readback(self):return {'gamma':.1,'gain':1.1,'contrast':1.15,'pivot':.336}
    def change(self,delta):self.changes.append(delta)
    def saturation_change(self,delta):
        if max(map(abs,delta.values()))>100:raise ValueError('too fast')
        self.pairs.append(dict(delta));return self.primary_readback()
class GPrimeTest(unittest.TestCase):
    def setUp(self):
        self.clip=Clip();self.panel=Panel();self.gp=module.GPrime(lambda:self.panel)
        self.info={'projectId':'p','timelineId':'t','clipId':'c','clip':'Example'}
        self.bindings={role:{'node':i,'label':role,'enabled':True} for i,role in enumerate(('exposure','contrast','balance','saturation'),1)}
        self.call('gprime-ready')
    def call(self,action,**data):return self.gp.command(action,data,self.clip,self.info,self.bindings)
    def begin(self,role):return self.call('gprime-begin',role=role)['gesture']
    def end(self,role,token):return self.call('gprime-end',role=role,gesture=token)
    def test_second_display_ready_does_not_cancel_existing_drag(self):
        token=self.begin('exposure')
        self.call('gprime-ready')
        self.call('gprime-set',role='exposure',gesture=token,values={'exposure':1})
        self.end('exposure',token)
        self.assertEqual(list(map(float,self.clip.nodes[1]['Slope'].split())),[2,2,2])

    def test_undo_repeated_exposure_drags_and_outside_change_guard(self):
        for stops in [1,1]:
            token=self.begin('exposure');self.call('gprime-set',role='exposure',gesture=token,values={'exposure':stops});self.end('exposure',token)
        self.call('gprime-undo',role='exposure')
        self.assertEqual(list(map(float,self.clip.nodes[1]['Slope'].split())),[2,2,2])
        self.call('gprime-undo',role='exposure')
        self.assertEqual(list(map(float,self.clip.nodes[1]['Slope'].split())),[1,1,1])
        with self.assertRaisesRegex(ValueError,'No GPrime'):self.call('gprime-undo',role='exposure')
        token=self.begin('balance');self.call('gprime-set',role='balance',gesture=token,values={'x':.1,'y':0});self.end('balance',token)
        self.clip.nodes[3]['Slope']='2 2 2'
        with self.assertRaisesRegex(ValueError,'outside'):self.call('gprime-undo',role='balance')
    def test_separate_native_saturation_undo_preserves_other_control(self):
        state={'gamma':1.0,'gain':1.0,'contrast':1.0,'pivot':.336}
        self.panel.primary_readback=lambda:dict(state)
        def change(delta):
            self.panel.pairs.append(dict(delta))
            for key in delta:state[key]+=delta[key]*.001
            return dict(state)
        self.panel.saturation_change=change
        token=self.begin('saturation');self.call('gprime-set',role='saturation',gesture=token,values={'gamma':40,'gain':60});self.end('saturation',token)
        self.call('gprime-undo',role='saturation',control='gamma')
        self.assertAlmostEqual(state['gamma'],1);self.assertAlmostEqual(state['gain'],1.06)
        self.call('gprime-undo',role='saturation',control='gain')
        self.assertAlmostEqual(state['gain'],1)
    def test_existing_duplicate_assignments_block_all_grading(self):
        self.bindings['balance']['node']=self.bindings['contrast']['node']
        with self.assertRaisesRegex(ValueError,'Conflicting'):self.call('gprime-ready')
        self.assertIsNone(self.gp.armed)
        self.assertEqual(self.clip.writes,[]);self.assertEqual(self.panel.selected,[])
    def test_empty_undo_keeps_controls_armed(self):
        with self.assertRaisesRegex(ValueError,'No GPrime'):self.call('gprime-undo',role='contrast')
        self.assertIsNotNone(self.gp.armed)
        self.begin('exposure')
    def test_quantised_native_undo_uses_feedback_correction(self):
        state={'gamma':0,'gain':1,'contrast':1,'pivot':.336}
        self.panel.primary_readback=lambda:dict(state)
        def change(delta):state['contrast']+=delta*(.001 if delta>0 else .0009)
        self.panel.change=change
        token=self.begin('contrast');self.call('gprime-set',role='contrast',gesture=token,values={'position':60});self.end('contrast',token)
        self.call('gprime-undo',role='contrast')
        self.assertAlmostEqual(state['contrast'],1,delta=.00051)
    def test_contrast_undo_direct_target_and_pivot_gate(self):
        state={'gamma':0,'gain':1,'contrast':1,'pivot':.336}
        self.panel.primary_readback=lambda:dict(state)
        self.panel.change=lambda delta:state.update(contrast=state['contrast']+delta*.001)
        token=self.begin('contrast');self.call('gprime-set',role='contrast',gesture=token,values={'position':60});self.end('contrast',token)
        self.call('gprime-undo',role='contrast')
        self.assertAlmostEqual(state['contrast'],1);self.assertEqual(self.panel.selected,[2,2])
    def test_exposure_uses_assigned_node_preserves_other_corrections_and_adopts_next_baseline(self):
        self.clip.nodes[1]={'Slope':'2 1 0.5','Offset':'.1 .2 .3','Power':'.9 1 1.1','Saturation':.8}
        token=self.begin('exposure');self.call('gprime-set',role='exposure',gesture=token,values={'exposure':1})
        self.assertEqual(self.clip.nodes[1]['Slope'],'4.0 2.0 1.0');self.assertEqual(self.clip.nodes[1]['Offset'],'.1 .2 .3')
        self.assertEqual(self.clip.nodes[1]['Power'],'.9 1 1.1');self.assertEqual(self.clip.nodes[1]['Saturation'],.8)
        self.assertEqual(self.clip.writes[-1]['NodeIndex'],1);self.end('exposure',token)
        token=self.begin('exposure');self.call('gprime-set',role='exposure',gesture=token,values={'exposure':-1})
        self.assertEqual(self.clip.nodes[1]['Slope'],'2.0 1.0 0.5')
    def test_balance_moves_assigned_gain_from_existing_baseline(self):
        self.clip.nodes[3]['Slope']='1.1 1.2 1.3'
        token=self.begin('balance');self.call('gprime-set',role='balance',gesture=token,values={'x':.1,'y':.2})
        r,g,b=map(float,self.clip.nodes[3]['Slope'].split())
        self.assertAlmostEqual(r,1.1+1.5748*.2);self.assertAlmostEqual(b,1.3+1.8556*.1)
        self.assertAlmostEqual(.2126*(r-1.1)+.7152*(g-1.2)+.0722*(b-1.3),0)
        self.assertEqual(self.clip.writes[-1]['NodeIndex'],3)
    def test_contrast_direct_target_then_relative_adjustments(self):
        token=self.begin('contrast');self.assertEqual(self.panel.selected,[2])
        result=self.call('gprime-set',role='contrast',gesture=token,values={'position':60})
        self.assertEqual(self.panel.changes,[60]);self.assertEqual(result['native']['contrast'],1.15);self.assertEqual(self.clip.writes,[])
    def test_contrast_wrong_pivot_never_creates_gesture_or_sends_adjustment(self):
        self.panel.reject=True
        with self.assertRaisesRegex(ValueError,'Pivot'):self.begin('contrast')
        self.assertIsNone(self.gp.session);self.assertEqual(self.panel.changes,[])
    def test_saturation_pair_keeps_shared_positions_across_gestures(self):
        token=self.begin('saturation')
        for values in ({'gamma':40,'gain':0},{'gamma':40,'gain':60}):self.call('gprime-set',role='saturation',gesture=token,values=values)
        self.end('saturation',token);token=self.begin('saturation')
        self.call('gprime-set',role='saturation',gesture=token,values={'gamma':10,'gain':60})
        self.assertEqual(self.panel.selected,[4,4]);self.assertEqual(self.panel.pairs,[{'gamma':40,'gain':0},{'gamma':0,'gain':60},{'gamma':-30,'gain':0}]);self.assertEqual(self.clip.writes,[])
    def test_other_controls_cannot_take_over_active_gesture(self):
        self.begin('exposure')
        with self.assertRaisesRegex(ValueError,'Finish'):self.begin('contrast')
        self.assertEqual(self.panel.selected,[])
    def test_clip_change_and_outside_grade_change_disarm(self):
        token=self.begin('exposure');self.clip.nodes[1]['Slope']='2 2 2'
        with self.assertRaisesRegex(ValueError,'outside'):self.call('gprime-set',role='exposure',gesture=token,values={'exposure':1})
        self.assertEqual(self.clip.writes,[]);self.assertIsNone(self.gp.armed)
        self.call('gprime-ready');self.info['clipId']='other'
        with self.assertRaisesRegex(ValueError,'clip changed'):self.begin('contrast')
    def test_binding_changes_disabled_nodes_and_bad_numbers_rejected(self):
        self.bindings['balance']['enabled']=False;self.call('gprime-ready')
        with self.assertRaises(ValueError):self.begin('balance')
        token=self.begin('exposure')
        with self.assertRaises(ValueError):self.call('gprime-set',role='exposure',gesture=token,values={'exposure':float('nan')})
        self.assertEqual(self.clip.writes,[])
