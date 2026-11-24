"""Combined GPrime runtime. Only called by explicit viewer gestures."""
import math
import time
import uuid

def checked_numbers(value):
    return {key:[float(x) for x in value[key].split()] if key!='Saturation' else [float(value[key])]
            for key in ('Slope','Offset','Power','Saturation')}

def same_cdl(a,b):
    a,b=checked_numbers(a),checked_numbers(b)
    return all(len(a[key])==len(b[key]) and all(math.isfinite(x) and abs(x-y)<=max(2e-6,abs(y)*1e-7) for x,y in zip(a[key],b[key])) for key in a)

def context(info):return tuple(info[key] for key in ('projectId','timelineId','clipId'))

class GPrime:
    def __init__(self,panel):
        self.panel=panel;self.armed=None;self.session=None;self.positions={'gamma':0,'gain':0};self.history={key:[] for key in ('exposure','contrast','balance','gamma','gain')}
    def fingerprint(self,info,bindings):
        return (context(info),tuple((key,value['node'],value['label'],value['enabled']) for key,value in sorted(bindings.items())))
    def command(self,action,request,clip,info,bindings):
        nodes=[value['node'] for value in bindings.values()]
        if len(nodes)!=len(set(nodes)):
            self.armed=self.session=None
            raise ValueError('Conflicting GPrime assignments: each control requires its own node. Rebind the conflicting controls in Settings.')
        if action=='gprime-ready':
            if self.armed!=self.fingerprint(info,bindings):
                self.history={key:[] for key in self.history}
                self.session=None
            self.armed=self.fingerprint(info,bindings)
            panel_ready=self.panel().status()['ready'] if any(role in bindings for role in ('contrast','saturation')) else True
            return {'ready':True,'panelReady':panel_ready,'bindings':bindings,'positions':dict(self.positions),
                    'cdl':{key:clip.GetCDL(value['node']) for key,value in bindings.items() if key in ('exposure','balance')},'clip':info['clip']}
        if action=='gprime-disarm':
            self.session=self.armed=None
            return {'ready':False}
        if self.armed!=self.fingerprint(info,bindings):
            self.session=self.armed=None
            raise ValueError('GPrime assignments or current clip changed. Fetch nodes and connect again.')
        role=request.get('role')
        if role not in bindings or not bindings[role]['enabled']:
            raise ValueError('Bind and enable this GPrime node in Settings first.')
        node=bindings[role]['node']
        if action=='gprime-begin':
            if self.session:raise ValueError('Finish the current GPrime gesture first.')
            native=None;cdl=None;connection=None
            if role in ('exposure','balance'):
                cdl=clip.GetCDL(node)
                if not cdl:raise ValueError('Node readback is unavailable.')
                values=checked_numbers(cdl)
                if any(not math.isfinite(x) for group in values.values() for x in group):raise ValueError('Node readback is not finite.')
            else:
                panel=self.panel()
                if role=='contrast':
                    panel.select_bound_node(node);native=panel.primary_readback()
                else:native=panel.select_saturation_node(node)
                connection=panel.status()['connection']
            token=uuid.uuid4().hex
            self.session={'role':role,'node':node,'gesture':token,'before':cdl,'last':cdl,'position':0,'connection':connection,'nativeBefore':native,'nativeLast':native,'startPositions':dict(self.positions)}
            return {'gesture':token,'role':role,'cdl':cdl,'native':native,'positions':dict(self.positions)}
        if action=='gprime-reset':
            if self.session:raise ValueError('Finish the current drag before reset.')
            key=request.get('control',role)
            if (role=='saturation' and key not in ('gamma','gain')) or (role!='saturation' and key!=role):raise ValueError('Invalid reset control.')
            if role in ('exposure','balance'):
                before=clip.GetCDL(node)
                values=checked_numbers(before)
                if any(not math.isfinite(x) for group in values.values() for x in group):raise ValueError('Node readback is not finite.')
                value=dict(before,NodeIndex=node,Slope='1 1 1')
                if not same_cdl(before,value):
                    if not clip.SetCDL(value):raise ValueError('Resolve rejected reset.')
                    actual=clip.GetCDL(node)
                    if not same_cdl(actual,value):raise ValueError('Reset readback mismatch.')
                    self.history[key].append({'before':before,'after':actual})
                else:actual=before
                return {'role':role,'cdl':actual,'reset':key}
            panel=self.panel()
            if role=='contrast':panel.select_bound_node(node);native=panel.primary_readback()
            else:native=panel.select_saturation_node(node)
            before=native[key];target=0.0 if key=='gamma' else 1.0
            if not math.isfinite(before):raise ValueError('Native readback is not finite.')
            total=0;slope=None;deadline=time.monotonic()+12
            if self.history[key]:
                entry=self.history[key][-1]
                if entry.get('delta'):slope=(entry['after']-entry['before'])/entry['delta']
            connection=panel.status()['connection'];pivot=native.get('pivot');other='gain' if key=='gamma' else 'gamma';other_before=native.get(other)
            try:
                for attempt in range(128):
                    tolerance=max(2e-6,abs(slope or 0)*.51)
                    error=target-native[key]
                    if abs(error)<=tolerance:break
                    if time.monotonic()>deadline:raise ValueError('Reset timed out; use this control’s Undo to restore its previous value.')
                    if panel.status()['connection']!=connection:raise ValueError('Panel connection changed during reset.')
                    cap=800 if role=='contrast' else 100
                    step=max(-cap,min(cap,round(error/slope))) if slope and math.isfinite(slope) and slope>0 else (10 if error>0 else -10)
                    if not step:break
                    previous=native[key]
                    if role=='contrast':panel.change(step);native=panel.primary_readback()
                    else:native=panel.saturation_change({name:step if name==key else 0 for name in ('gamma','gain')})
                    total+=step
                    if role=='contrast' and abs(native['pivot']-pivot)>2e-6:raise ValueError('Pivot changed during reset; reset stopped.')
                    if role=='saturation' and abs(native[other]-other_before)>2e-6:raise ValueError('The other saturation control changed; reset stopped.')
                    measured=(native[key]-previous)/step
                    if not math.isfinite(measured) or measured<=1e-12:raise ValueError('Reset made no measurable native progress; reset stopped.')
                    slope=measured
                if abs(native[key]-target)>max(2e-6,abs(slope or 0)*.51):raise ValueError('Reset did not reach the default value; use Undo to restore.')
                return {'role':role,'native':native,'positions':dict(self.positions,**({key:self.positions[key]+total} if role=='saturation' else {})),'reset':key}
            finally:
                if role=='saturation':self.positions[key]+=total
                if total and abs(native[key]-before)>1e-12:self.history[key].append({'before':before,'after':native[key],'delta':total,'reset':True})
        if action=='gprime-undo':
            if self.session:raise ValueError('Finish the current drag before undo.')
            key=request.get('control',role)
            if key not in self.history or (role=='saturation' and key not in ('gamma','gain')) or (role!='saturation' and key!=role):raise ValueError('Invalid undo control.')
            if not self.history[key]:raise ValueError('No GPrime changes to undo for this control.')
            entry=self.history[key][-1]
            try:
                if role in ('exposure','balance'):
                    if not same_cdl(clip.GetCDL(node),entry['after']):raise ValueError('Node changed outside GPrime; undo stopped.')
                    value=dict(entry['before'],NodeIndex=node)
                    if not clip.SetCDL(value):raise ValueError('Resolve rejected undo.')
                    actual=clip.GetCDL(node)
                    if not same_cdl(actual,value):raise ValueError('Undo readback mismatch.')
                    result={'role':role,'cdl':actual}
                else:
                    panel=self.panel()
                    if role=='saturation':native=panel.select_saturation_node(node)
                    else:panel.select_bound_node(node);native=panel.primary_readback()
                    if abs(native[key]-entry['after'])>2e-5:raise ValueError('Native value changed outside GPrime; undo stopped.')
                    target=entry['before']
                    slope=(entry['after']-target)/entry['delta'] if entry['delta'] else 0
                    if not math.isfinite(slope) or abs(slope)<1e-12:raise ValueError('Undo has no measurable native movement.')
                    total=0
                    deadline=time.monotonic()+12
                    for attempt in range(128 if entry.get('reset') else 8):
                        if time.monotonic()>deadline:raise ValueError('Undo timed out; controls remain connected.')
                        error=target-native[key]
                        # Native encoder positions are quantised; nearest reachable step is sufficient.
                        tolerance=max(2e-6,abs(slope)*.51)
                        if abs(error)<=tolerance:break
                        step=max(-800 if role=='contrast' else -100,min(800 if role=='contrast' else 100,round(error/slope)))
                        if not step:break
                        previous=native[key]
                        if role=='contrast':panel.change(step);native=panel.primary_readback()
                        else:native=panel.saturation_change({name:step if name==key else 0 for name in ('gamma','gain')})
                        total+=step
                        measured=(native[key]-previous)/step
                        if abs(measured)<1e-12:raise ValueError('Undo made no native progress; controls stopped.')
                        if measured*slope<=0:raise ValueError('Undo feedback moved unexpectedly; controls stopped.')
                        slope=measured
                    if abs(native[key]-target)>max(2e-6,abs(slope)*.51):
                        raise ValueError(f'Undo {key} did not converge: target {target:.9f}, readback {native[key]:.9f}; controls stopped.')
                    if role=='saturation':self.positions[key]+=total
                    result={'role':role,'native':native,'positions':dict(self.positions)}
                self.history[key].pop()
                if role not in ('exposure','balance') and self.history[key]:self.history[key][-1]['after']=native[key]
                return result
            except Exception:
                self.session=None
                raise
        session=self.session
        if not session or request.get('gesture')!=session['gesture'] or role!=session['role']:
            raise ValueError('GPrime gesture expired. Start a new drag.')
        if action=='gprime-end':
            if role in ('exposure','balance'):
                if not same_cdl(session['before'],session['last']):self.history[role].append({'before':session['before'],'after':session['last']})
            else:
                for key in (('contrast',) if role=='contrast' else ('gamma','gain')):
                    delta=session['position'] if key=='contrast' else self.positions[key]-session['startPositions'][key]
                    if delta:self.history[key].append({'before':session['nativeBefore'][key],'after':session['nativeLast'][key],'delta':delta})
            self.session=None
            return {'role':role,'positions':dict(self.positions)}
        if action!='gprime-set':raise ValueError('Unsupported GPrime action.')
        values=request.get('values',{})
        try:
            if role in ('exposure','balance'):
                if not same_cdl(clip.GetCDL(node),session['last']):raise ValueError('The node changed outside GPrime. Reconnect before grading.')
                original=checked_numbers(session['before'])
                def valid(keys,limit):
                    return set(values)==set(keys) and all(type(v) in (int,float) and math.isfinite(v) and abs(v)<=limit for v in values.values())
                if role=='exposure':
                    if not valid(['exposure'],6):raise ValueError('Exposure movement must be within ±6 stops per drag.')
                    slopes=[value*2**values['exposure'] for value in original['Slope']]
                else:
                    if not valid(['x','y'],.5):raise ValueError('Balance movement exceeds the audition range.')
                    red=1.5748*values['y'];blue=1.8556*values['x'];green=-(.2126*red+.0722*blue)/.7152
                    slopes=[value+offset for value,offset in zip(original['Slope'],(red,green,blue))]
                if any(not math.isfinite(value) for value in slopes):raise ValueError('Invalid native gain.')
                value={key:session['before'][key] for key in ('Slope','Offset','Power','Saturation')}
                value['Slope']=' '.join(map(str,slopes));value['NodeIndex']=node
                if not clip.SetCDL(value):raise ValueError('Resolve rejected the correction.')
                actual=clip.GetCDL(node)
                if not same_cdl(actual,value):raise ValueError('Resolve readback did not match. Controls stopped.')
                session['last']=actual
                return {'role':role,'cdl':actual}
            panel=self.panel()
            if panel.status()['connection']!=session['connection'] or not panel.status()['ready']:
                raise ValueError('Panel connection changed. Reconnect GPrime.')
            if role=='contrast':
                position=values.get('position')
                if set(values)!={'position'} or type(position) is not int or abs(position)>10000000:raise ValueError('Invalid Contrast movement.')
                delta=position-session['position']
                if abs(delta)>800:raise ValueError('Contrast movement too fast.')
                if delta:panel.change(delta)
                session['position']=position
                session['nativeLast']=panel.primary_readback()
                return {'role':role,'native':session['nativeLast']}
            if set(values)!={'gamma','gain'} or any(type(v) is not int or abs(v)>10000000 for v in values.values()):raise ValueError('Invalid Saturation movement.')
            delta={key:values[key]-self.positions[key] for key in self.positions}
            native=panel.saturation_change(delta)
            session['nativeLast']=native
            self.positions=dict(values)
            return {'role':role,'native':native,'positions':dict(self.positions)}
        except Exception:
            self.session=self.armed=None
            raise
