"""User-clicked Resolve menu actions; never run autonomously or retry a command."""
import json
import os
import socket
import stat
from pathlib import Path
import time

MENUS={
    'undo':['Edit','Undo'],
    'previous':['Playback','Previous','Clip'],
    'next':['Playback','Next','Clip'],
    'apply-one':['Color','Apply Grade From One Clip Prior'],
    'apply-two':['Color','Apply Grade From Two Clips Prior'],
    'fullscreen':['Workspace','Viewer Mode','Cinema Viewer'],
}

def native_request(action,directory=None):
    if action not in MENUS and action!='status':raise ValueError('Unknown GPrime button.')
    directory=Path(directory or f'/tmp/galaxy-scopez-control-{os.getuid()}')
    endpoint=directory/'endpoint.json'
    try:
        for path in (directory,endpoint):
            info=path.lstat()
            if info.st_uid!=os.getuid() or info.st_mode & 0o077 or stat.S_ISLNK(info.st_mode):
                raise ValueError('Galaxy Scopez native control endpoint must be private and owned by this user.')
        if endpoint.stat().st_size>4096:raise ValueError('Invalid native control endpoint.')
        description=json.loads(endpoint.read_text())
        address=Path(description['socket'])
        if description.get('schema')!=1 or description.get('bundleID')!='com.vidarandersen.ghettoscopez' or address.parent!=directory or not stat.S_ISSOCK(address.lstat().st_mode):
            raise ValueError('Invalid native Galaxy Scopez command endpoint.')
        request=json.dumps({'action':action,'token':description['token']}).encode()+b'\n'
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as connection:
            connection.settimeout(3.8);connection.connect(str(address));connection.sendall(request)
            body=b''
            while b'\n' not in body:
                part=connection.recv(1024)
                if not part:raise ValueError('Galaxy Scopez native control connection closed; no command was retried.')
                body+=part
                if len(body)>4096:raise ValueError('Oversized native control response.')
        response=json.loads(body)
        if not response.get('ok'):raise ValueError(response.get('error','Native Resolve command failed.'))
        return response.get('result',response)
    except FileNotFoundError:
        raise ValueError('Open the updated Galaxy Scopez app to enable its native Resolve controls.')
    except (socket.timeout,ConnectionError):
        raise ValueError('Native Resolve command timed out or disconnected. Check Resolve before tapping again; the command was not retried.')

def press_native(action):return native_request(action)

def target(info):return tuple(info[key] for key in ('projectId','timelineId','clipId'))

def recover(info,template):
    """Only unique exact labels previously assigned by the user; never fuzzy names."""
    found={};used=set()
    for role,old in template.items():
        label=old['label']
        matches=[node for node in info['nodes'] if label and node['label']==label]
        if len(matches)!=1:continue
        node=matches[0]
        if node['index'] in used:continue
        found[role]={'target':list(target(info)),'node':node['index'],'label':label,'count':len(info['nodes'])}
        used.add(node['index'])
    return found

class GPrimeActions:
    def __init__(self,press=press_native,sleep=time.sleep):
        self.press=press;self.sleep=sleep;self.saved={};self.template={};self.template_context=None;self.scrub=None

    def remember(self,info,bindings):
        if self.template_context!=target(info)[:2]:self.template={};self.template_context=target(info)[:2]
        snapshot={role:dict(value) for role,value in bindings.items()}
        self.saved[target(info)]=snapshot
        if snapshot:self.template={role:dict(value) for role,value in snapshot.items()}
        # Session cache bounded; changing projects never reuses another project's template.
        while len(self.saved)>128:del self.saved[next(iter(self.saved))]

    def scrub_command(self,action,expected,current,resolve,runtime,request):
        import math,uuid
        clip,_,info=current()
        key=target(info)
        if list(key)!=expected or resolve.GetCurrentPage()!='color':
            self.scrub=None;raise ValueError('The current clip changed. Hold to scrub again on the Color page.')
        if runtime.session:raise ValueError('Finish the current GPrime drag first.')
        timeline=resolve.GetProjectManager().GetCurrentProject().GetCurrentTimeline()
        if action=='scrub-info':return scrub_info(clip,timeline)
        if action=='scrub-begin':
            data=scrub_info(clip,timeline)
            self.scrub={'token':uuid.uuid4().hex,'target':key,'expires':time.monotonic()+30,**data}
            return {**data,'gesture':self.scrub['token']}
        state=self.scrub
        if not state or state['token']!=request.get('gesture') or state['target']!=key or time.monotonic()>state['expires']:
            self.scrub=None;raise ValueError('Scrubbing is locked. Hold for one second to unlock it again.')
        if action=='scrub-end':self.scrub=None;return {'locked':True}
        if action!='scrub-set':raise ValueError('Unknown scrub command.')
        value=request.get('frame')
        if type(value) not in (int,float) or not math.isfinite(value):raise ValueError('Invalid scrub position.')
        data=scrub_info(clip,timeline)
        if (data['start'],data['end'],data['rate'],data['drop'])!=(state['start'],state['end'],state['rate'],state['drop']):
            self.scrub=None;raise ValueError('The clip timing changed. Hold to scrub again.')
        frame=max(data['start'],min(data['end'],round(value)))
        tc=frame_timecode(frame,data['rate'],data['drop'])
        if not timeline.SetCurrentTimecode(tc):self.scrub=None;raise ValueError('Resolve could not move the playhead.')
        state['expires']=time.monotonic()+30
        return {'frame':frame,'timecode':timeline.GetCurrentTimecode(),'start':data['start'],'end':data['end']}

    def execute(self,action,expected,current,resolve,bindings,runtime):
        if action not in MENUS:raise ValueError('Unknown GPrime button.')
        clip,graph,before=current()
        if list(target(before))!=expected:raise ValueError('The current clip changed. Tap again after it settles.')
        if runtime.session:raise ValueError('Finish the current GPrime drag first.')
        if resolve.GetCurrentPage()!='color':raise ValueError('Open the Color page in Resolve first.')
        timeline=resolve.GetProjectManager().GetCurrentProject().GetCurrentTimeline()
        if action.startswith('apply-'):
            selected=timeline.GetSelectedClips()
            if len(selected)!=1 or selected[0].GetUniqueId()!=before['clipId']:
                raise ValueError('Select only the current clip in Resolve before applying a prior grade.')
        self.remember(before,bindings)
        transport=self.press(action)  # One user action, once; no key guessing, navigation or grade command retries.
        if action=='fullscreen':return {'operation':action,'transport':'native-ax','nativeAction':transport,**before}
        after=before
        for _ in range(8):
            self.sleep(.08)
            _,_,after=current()
            if target(after)[:2]!=target(before)[:2]:raise ValueError('Project or timeline changed during the command. Fetch nodes again.')
            if action in ('previous','next') and target(after)!=target(before):break
            if action.startswith('apply-'):break
        if action in ('previous','next') and target(after)==target(before):
            raise ValueError('Resolve did not move to another clip. The clip may be at the end of the current list.')
        if action.startswith('apply-') and target(after)!=target(before):
            raise ValueError('The selected clip changed during Apply Prior. Check the grade in Resolve; the command was not retried.')
        source=self.saved.get(target(after),{}) if action in ('previous','next') else {}
        if not source and target(after)[:2]==target(before)[:2]:source=self.template
        restored=recover(after,source)
        bindings.clear();bindings.update(restored)
        runtime.armed=runtime.session=None
        runtime.history={key:[] for key in runtime.history}
        runtime.positions={'gamma':0,'gain':0}
        return {'operation':action,'transport':'native-ax','nativeAction':transport,**after,'recovered':list(restored),'missing':[role for role in ('exposure','contrast','balance','saturation') if role not in restored]}

# Resolve timecode uses nominal frame labels even for fractional frame rates.
def timecode_frame(text,rate):
    import re
    match=re.fullmatch(r'(\d{2}):(\d{2}):(\d{2})([:;])(\d{2,3})',text)
    if not match:raise ValueError('Resolve returned an unsupported timecode.')
    h,m,s,separator,f=match.groups();h,m,s,f=map(int,(h,m,s,f));nominal=round(rate)
    if m>=60 or s>=60 or f>=nominal:raise ValueError('Invalid Resolve timecode.')
    drop=round(nominal*.0666666667) if separator==';' else 0
    if drop and nominal not in (30,60,120):raise ValueError('Unsupported drop-frame rate.')
    if drop and m%10 and s==0 and f<drop:raise ValueError('Invalid dropped frame label.')
    return ((h*60+m)*60+s)*nominal+f-drop*((h*60+m)-(h*60+m)//10)

def frame_timecode(frame,rate,drop=False):
    n=round(rate);frame=int(frame)
    if frame<0:raise ValueError('Negative timeline positions are not supported.')
    if drop:
        if n not in (30,60,120):raise ValueError('Unsupported drop-frame rate.')
        d=round(n*.0666666667);ten=n*600-d*9;minute=n*60-d
        blocks,remainder=divmod(frame,ten)
        frame+=d*9*blocks+d*max(0,(remainder-d)//minute)
    seconds,f=divmod(frame,n);minutes,s=divmod(seconds,60);h,m=divmod(minutes,60)
    if h>=24:raise ValueError('Timeline timecode exceeds 24 hours.')
    return f'{h:02}:{m:02}:{s:02}{";" if drop else ":"}{f:02}'

def scrub_info(clip,timeline):
    rate=float(str(timeline.GetSetting('timelineFrameRate')).split()[0])
    if not 1<=rate<=120:raise ValueError('Unsupported timeline frame rate.')
    start=int(clip.GetStart());end=int(clip.GetEnd())-1
    if end<start:raise ValueError('The current clip has no scrubbable frames.')
    tc=timeline.GetCurrentTimecode();position=timecode_frame(tc,rate)
    return {'start':start,'end':end,'frame':max(start,min(end,position)),'timecode':tc,'rate':rate,'drop':';' in tc}
