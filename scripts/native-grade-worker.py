#!/usr/bin/env python3
"""Persistent, limited CDL adapter. Receives commands only through the GS host."""
import json
import math
import sys
import time
import uuid
import importlib.util
from pathlib import Path
sys.path.insert(0, "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules")
import DaVinciResolveScript as dvr

binding = None
baseline = None
last = None
contrast_panel = None
gprime_bindings = {}

def panel_bridge():
    global contrast_panel
    if contrast_panel is None:
        spec = importlib.util.spec_from_file_location('contrast_panel', Path(__file__).with_name('contrast-panel-bridge.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        contrast_panel = module.ContrastPanelBridge()
    return contrast_panel

_gprime_spec=importlib.util.spec_from_file_location('gprime_runtime',Path(__file__).with_name('gprime-grading.py'))
_gprime_module=importlib.util.module_from_spec(_gprime_spec)
_gprime_spec.loader.exec_module(_gprime_module)
gprime_runtime=_gprime_module.GPrime(panel_bridge)
_actions_spec=importlib.util.spec_from_file_location('gprime_actions',Path(__file__).with_name('gprime-actions.py'))
_actions_module=importlib.util.module_from_spec(_actions_spec);_actions_spec.loader.exec_module(_actions_module)
gprime_actions=_actions_module.GPrimeActions()

def contrast_result():
    return {"bound":True, "mode":"contrast", "node":binding["node"], "label":binding["label"],
            "relativeUnits":binding.get("relativeUnits",0),
            "targetConfirmed":binding.get("targetConfirmed",False),
            "panel":panel_bridge().status()}

def current():
    resolve = dvr.scriptapp("Resolve")
    if not resolve:
        raise ValueError("Resolve scripting is unavailable. Open Resolve with scripting set to Local.")
    project = resolve.GetProjectManager().GetCurrentProject()
    timeline = project.GetCurrentTimeline() if project else None
    clip = timeline.GetCurrentVideoItem() if timeline else None
    if not clip:
        raise ValueError("Select a timeline clip at the playhead.")
    graph = clip.GetNodeGraph()
    nodes = [{"index": i, "label": graph.GetNodeLabel(i), "enabled": graph.GetNodeEnabled(i)}
             for i in range(1, graph.GetNumNodes()+1)]
    info = {"version": resolve.GetVersionString(), "project": project.GetName(),
            "projectId": project.GetUniqueId(), "timelineId": timeline.GetUniqueId(),
            "clipId": clip.GetUniqueId(), "clip": clip.GetName(), "nodes": nodes}
    return clip, graph, info

def numbers(value):
    return {k: [float(x) for x in value[k].split()] if k != "Saturation" else [float(value[k])]
            for k in ("Slope", "Offset", "Power", "Saturation")}

def same(a, b):
    aa, bb = numbers(a), numbers(b)
    return all(len(aa[k]) == len(bb[k]) and all(abs(x-y) < max(2e-6,abs(y)*1e-7) for x,y in zip(aa[k],bb[k])) for k in aa)

GPRIME_ROLES=('exposure','contrast','balance','saturation')
def current_gprime_bindings(info):
    """Assignments only; never select a node or alter its grade."""
    target=[info[key] for key in ('projectId','timelineId','clipId')]
    for role,assigned in list(gprime_bindings.items()):
        index=assigned['node']
        actual=next((node for node in info['nodes'] if node['index']==index),None)
        if assigned['target']!=target or assigned['count']!=len(info['nodes']) or not actual or actual['label']!=assigned['label']:
            del gprime_bindings[role]
    return {role:{'node':assigned['node'],'label':assigned['label'],
                  'enabled':info['nodes'][assigned['node']-1]['enabled']}
            for role,assigned in gprime_bindings.items()}


def command(request):
    global binding, baseline, last
    action = request.get("action")
    if action == "release":
        binding = baseline = last = None
        return {"bound": False}
    clip, graph, info = current()
    if action == "inspect":
        return info | {'gprimeBindings':current_gprime_bindings(info)}
    if action == 'gprime-action':
        current_gprime_bindings(info)
        resolve=dvr.scriptapp('Resolve')
        if str(request.get('operation','')).startswith('scrub-'):
            return gprime_actions.scrub_command(request['operation'],request.get('target'),current,resolve,gprime_runtime,request)
        return gprime_actions.execute(request.get('operation'),request.get('target'),current,resolve,gprime_bindings,gprime_runtime)
    if action == 'gprime-bind':
        role=request.get('role');index=request.get('node')
        target=[info[key] for key in ('projectId','timelineId','clipId')]
        if request.get('target')!=target:
            raise ValueError('The current clip changed. Fetch nodes again.')
        if role not in GPRIME_ROLES or type(index) is not int or not 1<=index<=len(info['nodes']):
            raise ValueError('Choose a GPrime control and a node from the fetched clip.')
        if role in ('contrast','saturation') and index>99:
            raise ValueError('Native panel controls support node indexes 1–99 in this audition.')
        current_gprime_bindings(info)
        for other,assigned in gprime_bindings.items():
            if other!=role and assigned['node']==index:
                raise ValueError(f'Node {index} is already assigned to {other.title()}. Choose a different node for {role.title()}.')
        actual=info['nodes'][index-1]
        if request.get('nodeLabel')!=actual['label'] or request.get('nodeCount')!=len(info['nodes']):
            raise ValueError('The node tree changed. Fetch nodes again before binding.')
        gprime_bindings[role]={'target':target,'node':index,'label':actual['label'],'count':len(info['nodes'])}
        gprime_actions.remember(info,gprime_bindings)
        return {'role':role,'gprimeBindings':current_gprime_bindings(info)}

    if action in ('gprime-ready','gprime-disarm','gprime-begin','gprime-set','gprime-end','gprime-undo'):
        return gprime_runtime.command(action,request,clip,info,current_gprime_bindings(info))

    if action == "bind":
        if binding:
            raise ValueError("Release the existing binding first.")
        if [info[k] for k in ("projectId","timelineId","clipId")] != request.get("target"):
            raise ValueError("The selected clip changed. Inspect again.")
        node = request.get("node")
        if not isinstance(node, int) or isinstance(node,bool) or node < 1 or node > len(info["nodes"]):
            raise ValueError("Choose a valid node.")
        label = graph.GetNodeLabel(node)
        mode=request.get("mode","primary")
        if mode not in ("primary","exposure","balance","contrast","hsv-saturation"):
            raise ValueError("Choose Primary, Exposure, Balance, Contrast or HSV Saturation as the control role.")
        if mode in ("exposure","balance") and request.get("linearConfirmed") is not True:
            raise ValueError("Confirm this node processes DWG/Linear before binding exposure.")
        if not graph.GetNodeEnabled(node):
            raise ValueError("Enable the intended node in Resolve.")
        if mode == "hsv-saturation":
            if request.get('hsvConfirmed') is not True or request.get('printerLightsOff') is not True:
                raise ValueError('Confirm HSV colour space, only channel 2/S enabled, Primaries wheels active, and Printer Lights OFF.')
            panel=panel_bridge()
            binding={'target':[info[k] for k in ('projectId','timelineId','clipId')],
                     'node':node,'label':label,'count':len(info['nodes']),'mode':mode,
                     'panelConnection':panel.status()['connection'], 'positions':{'gamma':0,'gain':0}}
            baseline=last=None
            return {'bound':True,'mode':mode,'node':node,'label':label,'positions':binding['positions']}
        if mode == "contrast":
            panel_bridge()
            binding = {"target": [info[k] for k in ("projectId","timelineId","clipId")],
                       "node":node, "label":label, "count":len(info["nodes"]), "mode":mode,
                       "relativeUnits":0, "targetConfirmed":False}
            baseline = last = None
            return contrast_result()
        value = clip.GetCDL(node)
        if not value:
            raise ValueError("CDL readback unavailable.")
        neutral = {"Slope":"1 1 1","Offset":"0 0 0","Power":"1 1 1","Saturation":1.0}
        if not same(value,neutral) or graph.GetToolsInNode(node):
            raise ValueError("Use a fresh node at defaults, without other corrections or effects.")
        binding = {"target": [info[k] for k in ("projectId","timelineId","clipId")],
                   "node": node, "label":label, "count":len(info["nodes"]), "mode":mode}
        baseline = dict(value)
        last = dict(value)
        return {"bound":True, "mode":mode, "info":info, "cdl":value}
    if not binding:
        raise ValueError("Inspect and bind the test node first.")
    node = binding["node"]
    if ([info[k] for k in ("projectId","timelineId","clipId")] != binding["target"]
            or len(info["nodes"]) != binding["count"] or graph.GetNodeLabel(node) != binding["label"]
            or not graph.GetNodeEnabled(node)):
        binding = None
        raise ValueError("Binding changed. Controls disarmed; inspect and bind again.")
    if binding['mode']=='hsv-saturation':
        panel=panel_bridge()
        if action=='hsv-begin':
            binding.pop('gesture',None)
            native=panel.select_saturation_node(node)
            binding['panelConnection']=panel.status()['connection']
            binding['gesture']=uuid.uuid4().hex
            return {'bound':True,'mode':binding['mode'],'gesture':binding['gesture'],
                    'positions':dict(binding['positions']),'native':native}
        if action=='read':
            # Explicit user readback selects the assigned node; no encoder event.
            binding.pop('gesture',None)
            native=panel.select_saturation_node(node)
            return {'bound':True,'mode':binding['mode'],'positions':dict(binding['positions']),'native':native}
        if action not in ('set','hsv-end'):
            raise ValueError('HSV audition uses native relative wheels; restore in Resolve manually for now.')
        if not binding.get('gesture') or request.get('gesture')!=binding['gesture']:
            raise ValueError('HSV gesture expired. Start a new drag.')
        if panel.status()['connection']!=binding['panelConnection'] or not panel.status()['ready']:
            binding.pop('gesture',None)
            raise ValueError('Panel connection changed. Start a new HSV gesture.')
        if action=='hsv-end':
            binding.pop('gesture',None)
            return {'bound':True,'mode':binding['mode'],'positions':dict(binding['positions'])}
        values=request.get('values',{})
        if set(values)!={'gamma','gain'} or any(type(value) is not int or abs(value)>10000000 for value in values.values()):
            raise ValueError('Invalid HSV ribbon positions.')
        delta={key:values[key]-binding['positions'][key] for key in ('gamma','gain')}
        if any(abs(value)>100 for value in delta.values()):
            raise ValueError('Drag HSV ribbons more slowly; update exceeds 100 units.')
        try:
            native=panel.saturation_change(delta)
        except Exception:
            binding.pop('gesture',None)
            raise
        binding['positions']=dict(values)
        return {'bound':True,'mode':binding['mode'],'positions':dict(values),'native':native}
    if binding["mode"] == "contrast":
        panel = panel_bridge()
        if action == "read":
            return contrast_result()
        if action == "contrast-nav":
            binding["targetConfirmed"] = False
            binding.pop("gesture",None)
            binding.pop("selectionRequested",None)
            panel.navigate(request.get("direction"))
            return contrast_result() | {"message":"Navigation diagnostic only: report which node is highlighted. No Contrast adjustment sent."}
        if action == "contrast-select":
            binding["targetConfirmed"] = False
            binding.pop("gesture",None)
            verified=panel.verify_pivot()
            binding["selectionRequested"] = panel.status()["connection"]
            return contrast_result() | {"message":"Live Pivot 0.336 confirmed. Confirm you manually selected the intended Contrast node and it is the only node using that Pivot.","verification":verified}
        connection = panel.status()["connection"]
        if action == "contrast-confirm":
            if request.get("clipNodeConfirmed") is not True or binding.get("selectionRequested") != connection or not panel.status()["ready"]:
                raise ValueError("Select the assigned node and confirm it is highlighted in Resolve's clip-level graph first.")
            if request.get("uniquePivotConfirmed") is not True:
                raise ValueError("Confirm the selected Contrast node is the only node using Pivot 0.336.")
            if request.get("printerLightsOff") is not True:
                raise ValueError("Confirm Printer Lights is off before using numeric node selection.")
            panel.verify_pivot()
            binding["targetConfirmed"] = True
            binding["panelConnection"] = connection
            return contrast_result()
        if not binding.get("targetConfirmed") or binding.get("panelConnection") != connection or not panel.status()["ready"]:
            binding["targetConfirmed"] = False
            binding.pop("gesture",None)
            raise ValueError("Select and confirm the assigned Contrast node again.")
        if action == "contrast-begin":
            binding.pop("gesture",None)
            panel.select_bound_node(binding["node"])
            binding["gesture"] = uuid.uuid4().hex
            return contrast_result() | {"gesture":binding["gesture"]}
        if action in ("set", "contrast-end"):
            if not binding.get("gesture") or request.get("gesture") != binding["gesture"]:
                raise ValueError("Contrast gesture expired. Start a new drag.")
            if action == "contrast-end":
                binding.pop("gesture",None)
                return contrast_result()
            values = request.get("values",{})
            position = values.get("position")
            if set(values) != {"position"} or type(position) is not int or abs(position)>10000000:
                raise ValueError("Invalid Contrast ribbon movement.")
            delta = position - binding["relativeUnits"]
            if delta:
                panel.change(delta)
                binding["relativeUnits"] = position
            return contrast_result()
        raise ValueError("Contrast uses relative panel events. Use Resolve Undo manually; absolute readback/restore is unavailable.")
    readback = clip.GetCDL(node)
    if not same(readback,last):
        binding = None
        raise ValueError("The grade changed outside the audition. Controls disarmed.")
    if action == "read":
        return {"bound":True,"mode":binding["mode"],"cdl":readback}
    if action == "restore":
        value = dict(baseline)
    elif action == "set":
        values = request.get("values",{})
        if binding["mode"]=="exposure":
            stops=values.get("exposure")
            if set(values)!={"exposure"} or isinstance(stops,bool) or not isinstance(stops,(int,float)) or not math.isfinite(stops) or not -6<=stops<=6:
                raise ValueError("Exposure must be between -6 and +6 stops.")
            gain=2.0**stops
            value={"Slope":" ".join([str(gain)]*3),"Offset":"0 0 0","Power":"1 1 1","Saturation":1.0}
        elif binding["mode"]=="balance":
            if set(values)!={"x","y"} or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>.5 for v in values.values()):
                raise ValueError("Balance X/Y must be between -0.5 and +0.5.")
            x,y=values["x"],values["y"]
            red=1+1.5748*y
            blue=1+1.8556*x
            green=1-(.2126*(red-1)+.0722*(blue-1))/.7152
            value={"Slope":f"{red} {green} {blue}","Offset":"0 0 0","Power":"1 1 1","Saturation":1.0}
        else:
            value=primary_value(values)
    else:
        raise ValueError("Unsupported audition action.")
    value["NodeIndex"] = node
    start = time.perf_counter()
    if not clip.SetCDL(value):
        binding = None
        raise ValueError("Resolve rejected the correction; controls disarmed.")
    last = clip.GetCDL(node)
    if not same(last,value):
        binding = None
        raise ValueError("Readback did not match the requested correction; controls disarmed.")
    return {"bound":True,"mode":binding["mode"], "cdl":last, "setAndReadMs":(time.perf_counter()-start)*1000}

def primary_value(values):
        bounds = {"slope":(.8,1.2), "offset":(-.05,.05), "power":(.8,1.2),
                  "saturation":(.5,1.5), "red":(.8,1.2)}
        if set(values) != set(bounds):
            raise ValueError("Send the full audition control state.")
        for key,(lo,hi) in bounds.items():
            v=values[key]
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not lo<=v<=hi:
                raise ValueError("Invalid control value: "+key)
        value = {"Slope": f'{values["slope"]*values["red"]} {values["slope"]} {values["slope"]}',
                 "Offset": " ".join([str(values["offset"])]*3),
                 "Power": " ".join([str(values["power"])]*3),
                 "Saturation": values["saturation"]}
        return value

for line in sys.stdin:
    try:
        request = json.loads(line)
        response = {"ok":True, "result":command(request)}
    except Exception as error:
        response = {"ok":False, "error":str(error)}
    print(json.dumps(response),flush=True)
