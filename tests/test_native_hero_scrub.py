import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
s=importlib.util.spec_from_file_location('actions',Path(__file__).parents[1]/'scripts/gprime-actions.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Timecodes(unittest.TestCase):
 def test_roundtrip_fractional_and_integer_rates(self):
  for rate in (23.976,24,25,29.97,30,50,59.94,60,120):
   for frame in (0,1,1000,86400,1234567):
    self.assertEqual(m.timecode_frame(m.frame_timecode(frame,rate),rate),frame)
 def test_drop_frame_boundaries(self):
  for frame,tc in [(1799,'00:00:59;29'),(1800,'00:01:00;02'),(17982,'00:10:00;00'),(107892,'01:00:00;00')]:
   self.assertEqual(m.frame_timecode(frame,29.97,True),tc);self.assertEqual(m.timecode_frame(tc,29.97),frame)
  for rate in (29.97,59.94,119.88):
   for frame in range(0,200000,137):self.assertEqual(m.timecode_frame(m.frame_timecode(frame,rate,True),rate),frame)
 def test_invalid_timecode(self):
  for tc in ('bad','00:61:00:00','00:01:00;00'):
   with self.assertRaises(ValueError):m.timecode_frame(tc,29.97)
class Scrub(unittest.TestCase):
 def setUp(self):
  self.calls=[];self.tc='01:00:01:00';self.key=['p','t','c'];self.runtime=SimpleNamespace(session=None)
  self.clip=SimpleNamespace(GetStart=lambda:86400,GetEnd=lambda:86640)
  self.timeline=SimpleNamespace(GetSetting=lambda _: '24',GetCurrentTimecode=lambda:self.tc,SetCurrentTimecode=self.seek)
  self.resolve=SimpleNamespace(GetCurrentPage=lambda:'color',GetProjectManager=lambda:SimpleNamespace(GetCurrentProject=lambda:SimpleNamespace(GetCurrentTimeline=lambda:self.timeline)))
  self.a=m.GPrimeActions();self.current=lambda:(self.clip,None,dict(zip(['projectId','timelineId','clipId'],self.key)))
 def seek(self,tc):self.calls.append(tc);self.tc=tc;return True
 def run_command(self,action,**request):return self.a.scrub_command(action,['p','t','c'],self.current,self.resolve,self.runtime,request)
 def test_info_and_begin_do_not_move(self):
  info=self.run_command('scrub-info');self.assertEqual(info['end'],86639)
  self.run_command('scrub-begin');self.assertEqual(self.calls,[])
 def test_clamp_end_exclusive_and_release_locks(self):
  token=self.run_command('scrub-begin')['gesture']
  r=self.run_command('scrub-set',gesture=token,frame=999999);self.assertEqual(r['frame'],86639)
  self.run_command('scrub-set',gesture=token,frame=0);self.assertEqual(self.tc,'01:00:00:00')
  self.run_command('scrub-end',gesture=token)
  with self.assertRaises(ValueError):self.run_command('scrub-set',gesture=token,frame=86420)
  self.assertEqual(len(self.calls),2)
 def test_clip_change_and_active_grade_never_seek(self):
  token=self.run_command('scrub-begin')['gesture'];self.key[2]='other'
  with self.assertRaises(ValueError):self.run_command('scrub-set',gesture=token,frame=86420)
  self.key[2]='c';self.runtime.session={'active':True}
  with self.assertRaises(ValueError):self.run_command('scrub-begin')
  self.assertEqual(self.calls,[])
 def test_timing_changes_expiration_and_nan_never_seek(self):
  token=self.run_command('scrub-begin')['gesture']
  with self.assertRaises(ValueError):self.run_command('scrub-set',gesture=token,frame=float('nan'))
  self.clip.GetEnd=lambda:86600
  with self.assertRaises(ValueError):self.run_command('scrub-set',gesture=token,frame=86420)
  token=self.run_command('scrub-begin')['gesture'];self.a.scrub['expires']=0
  with self.assertRaises(ValueError):self.run_command('scrub-set',gesture=token,frame=86420)
  self.assertEqual(self.calls,[])
if __name__=='__main__':unittest.main()
