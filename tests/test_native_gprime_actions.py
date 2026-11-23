"""Menu actions tested without launching or sending events to Resolve."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import copy
import unittest

spec=importlib.util.spec_from_file_location('actions',Path(__file__).parents[1]/'scripts/gprime-actions.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ActionsTest(unittest.TestCase):
    def setUp(self):
        self.info={'projectId':'p','timelineId':'t','clipId':'a','clip':'Example','nodes':[{'index':i,'label':name,'enabled':True} for i,name in enumerate(['EXP','CONT','BAL','SAT'],1)]}
        self.bindings={role:{'node':i,'label':name,'target':['p','t','a'],'count':4} for i,(role,name) in enumerate(zip(['exposure','contrast','balance','saturation'],['EXP','CONT','BAL','SAT']),1)}
        self.runtime=SimpleNamespace(session=None,armed=True,history={'gain':[1]},positions={'gamma':10,'gain':20})
        self.calls=[];self.selected=[SimpleNamespace(GetUniqueId=lambda:'a')]
        self.timeline=SimpleNamespace(GetSelectedClips=lambda:self.selected)
        self.project=SimpleNamespace(GetCurrentTimeline=lambda:self.timeline)
        self.resolve=SimpleNamespace(GetCurrentPage=lambda:'color',GetProjectManager=lambda:SimpleNamespace(GetCurrentProject=lambda:self.project))
        self.actions=module.GPrimeActions(self.press,lambda _:None)
    def press(self,action):
        self.calls.append(action)
        if action in ('previous','next'):self.info['clipId']='b'
        if action.startswith('apply-'):
            self.info['nodes']=[{'index':i,'label':name,'enabled':True} for i,name in enumerate(['SAT','BAL','CONT','EXP'],1)]
    def current(self):return None,None,copy.deepcopy(self.info)
    def run_action(self,action,expected=None):
        return self.actions.execute(action,expected or ['p','t','a'],self.current,self.resolve,self.bindings,self.runtime)
    def test_native_navigation_once_recovers_unique_labels(self):
        result=self.run_action('next')
        self.assertEqual(self.calls,['next']);self.assertEqual(result['clipId'],'b');self.assertEqual(result['missing'],[])
        self.assertTrue(all(value['target']==['p','t','b'] for value in self.bindings.values()))
        self.assertIsNone(self.runtime.armed);self.assertEqual(self.runtime.history['gain'],[])
    def test_return_from_unassigned_clip_recovers_original_bindings(self):
        original=copy.deepcopy(self.info)
        def navigate(action):
            self.calls.append(action)
            if action=='previous':
                self.info['clipId']='b';self.info['nodes']=[{'index':1,'label':'','enabled':True}]
            else:self.info=copy.deepcopy(original)
        self.actions.press=navigate
        result=self.run_action('previous')
        self.assertEqual(len(result['missing']),4);self.assertEqual(self.bindings,{})
        result=self.run_action('next',['p','t','b'])
        self.assertEqual(result['missing'],[]);self.assertEqual(len(self.bindings),4)

    def test_apply_prior_recovers_reordered_nodes(self):
        result=self.run_action('apply-two')
        self.assertEqual(self.calls,['apply-two']);self.assertEqual(result['missing'],[])
        self.assertEqual(self.bindings['saturation']['node'],1);self.assertEqual(self.bindings['exposure']['node'],4)
    def test_stale_context_busy_and_multiple_selection_never_send(self):
        with self.assertRaisesRegex(ValueError,'clip changed'):self.run_action('apply-one',['p','t','different'])
        self.runtime.session={'gesture':'active'}
        with self.assertRaisesRegex(ValueError,'Finish'):self.run_action('next')
        self.runtime.session=None;self.selected.append(SimpleNamespace(GetUniqueId=lambda:'b'))
        with self.assertRaisesRegex(ValueError,'only the current'):self.run_action('apply-one')
        self.assertEqual(self.calls,[])
    def test_menu_error_is_not_retried_and_does_not_clear_bindings(self):
        def fail(action):self.calls.append(action);raise ValueError('Accessibility denied')
        self.actions.press=fail
        with self.assertRaisesRegex(ValueError,'Accessibility'):self.run_action('next')
        self.assertEqual(self.calls,['next']);self.assertEqual(len(self.bindings),4)
    def test_ambiguous_or_missing_labels_are_not_guessed(self):
        self.info['nodes'][1]['label']='EXP'
        result=self.run_action('next')
        self.assertIn('exposure',result['missing']);self.assertIn('contrast',result['missing'])
        self.assertNotIn('exposure',self.bindings)
    def test_undo_sends_edit_undo_once_and_recovers_bindings(self):
        result=self.run_action('undo')
        self.assertEqual(self.calls,['undo'])
        self.assertEqual(module.MENUS['undo'],['Edit','Undo'])
        self.assertEqual(result['missing'],[])
        self.assertEqual(self.runtime.history['gain'],[])

    def test_fullscreen_does_not_touch_bindings_or_grade_history(self):
        self.run_action('fullscreen')
        self.assertEqual(self.calls,['fullscreen']);self.assertTrue(self.runtime.armed);self.assertEqual(self.runtime.history['gain'],[1])
    def test_non_color_page_blocks_actions(self):
        self.resolve.GetCurrentPage=lambda:'edit'
        with self.assertRaisesRegex(ValueError,'Color page'):self.run_action('previous')
        self.assertEqual(self.calls,[])
    def test_only_native_app_transport_is_used(self):
        source=Path(module.__file__).read_text()
        self.assertNotIn('osascript',source);self.assertNotIn('System Events',source)
        self.assertIs(self.actions.press.__self__,self)
        self.assertIn('Cinema Viewer',module.MENUS['fullscreen'])

if __name__=='__main__':unittest.main()
