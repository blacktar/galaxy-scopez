#!/usr/bin/env python3
"""User-operated numeric panel selection audition. No encoder/navigation scans."""
import importlib.util
import json
from pathlib import Path
import struct
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('selection_bridge', ROOT/'scripts/contrast-panel-bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
wire = bridge.wire
OUTPUT = ROOT/'docs/reverse-scopes/blackmagic-research/direct-node-selection-test.json'
# Static getPanel/getControl/KeyPressToApp translation of numeric keys.
DIGITS = dict(zip('1234567890', (0x296,0x297,0x298,0x286,0x287,0x288,0x276,0x277,0x278,0x2a7)))
# Advanced primary menu physical0x249 (SAME / SELECT NODE / LAST ADJ):
# packed0x14be -> Shift Up0x340 -> wire0x0240; panel3/control0xbe ->0x52be.
SELECT_NODE = (0x0240,0x52be)
PROTOCOL = {
    wire.packet(0x400,0,struct.pack('<II',0,1)),
    wire.packet(0x400,0,struct.pack('<II',1,1)),
    wire.packet(0x400,0x3000,b'\x02\x00'+struct.pack('<IHIHBB',0x424d444c,4,1,0,3,255)),
    wire.packet(0x0a,0x3000,bytes(8)),
}

def selection_packets(number):
    if type(number) is not int or not 1 <= number <= 99:
        raise ValueError('Choose a node number from 1 to 99.')
    return [wire.packet(3,target,b'\x01\x00') for target in
            [DIGITS[digit] for digit in str(number)] + list(SELECT_NODE)]

class SelectionOnly(bridge.ContrastPanelBridge):
    def __init__(self):
        self.expected_keys=[]
        super().__init__()
    def _log(self, event, **details):
        self.output=OUTPUT.with_name('direct-node-selection-transport.json')
        return super()._log(event,**details)
    def _send(self, data, kind):
        if data not in PROTOCOL:
            if not self.expected_keys or data!=self.expected_keys[0]:
                raise ValueError('Selection-only guard rejected an unexpected packet.')
            self.expected_keys.pop(0)
        return super()._send(data,kind)
    def change(self, delta):
        raise ValueError('Contrast adjustments are unavailable in this test.')
    def navigate(self, direction):
        raise ValueError('Traversal is unavailable in this test.')
    def select_number(self, number):
        packets=selection_packets(number)
        with self.lock:
            if not self.status()['ready']:
                raise ValueError('Wait for Resolve panel connection; type status to check.')
            self.expected_keys=list(packets)
            try:
                for packet in packets:
                    self._send(packet,'user-numeric-selection-test')
                    time.sleep(.04)
            finally:
                self.expected_keys=[]
        time.sleep(.15)
        return self.refresh_pivot()

def inspect_clip():
    sys.path.insert(0,'/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules')
    import DaVinciResolveScript as dvr
    resolve=dvr.scriptapp('Resolve')
    project=resolve.GetProjectManager().GetCurrentProject() if resolve else None
    timeline=project.GetCurrentTimeline() if project else None
    clip=timeline.GetCurrentVideoItem() if timeline else None
    if not clip:raise ValueError('Open a timeline clip in Resolve.')
    graph=clip.GetNodeGraph()
    count=graph.GetNumNodes()
    if not 1<=count<=99:raise ValueError('This audition supports 1–99 clip nodes.')
    return dict(project=project.GetName(),projectId=project.GetUniqueId(),
                timelineId=timeline.GetUniqueId(),clipId=clip.GetUniqueId(),clip=clip.GetName(),
                nodes=[dict(index=i,label=graph.GetNodeLabel(i),enabled=graph.GetNodeEnabled(i))
                       for i in range(1,count+1)])

def context(info):return tuple(info[key] for key in ('projectId','timelineId','clipId'))

def main():
    panel=None
    results=[];last=None;armed=None
    print('Direct node selection test. No Contrast encoder events or search scans.\n'
          'Keep the Color page clip-level graph active. Printer Lights must be OFF,\n'
          'because numeric panel keys can adjust printer points in that mode.\n'
          'Commands: nodes | status | arm | select NUMBER | saw API_INDEX | quit\n'
          'Select requests use the API index as a candidate panel number; equivalence is NOT assumed.')
    try:
        panel=SelectionOnly()
        info=inspect_clip()
        def save():
            OUTPUT.parent.mkdir(parents=True,exist_ok=True)
            temporary=OUTPUT.with_suffix('.tmp')
            temporary.write_text(json.dumps(dict(context=info,results=results[-32:],
                conclusion='User observations only; no automatic selected-node ID established.'),indent=2)+'\n')
            temporary.replace(OUTPUT)
        def show_nodes():
            print('Project:',info['project'],' Clip:',info['clip'])
            for node in info['nodes']:
                print(f"API {node['index']:2}: {node['label'] or '(unnamed)'}"+(' (disabled)' if not node['enabled'] else ''))
        show_nodes()
        while True:
            try:
                parts=input('node-test> ').strip().split()
                if not parts:continue
                cmd=parts[0].lower()
                if cmd in ('quit','exit'):break
                if cmd=='status':print(json.dumps(panel.status(),indent=2));continue
                if cmd=='nodes':
                    info=inspect_clip();armed=None;last=None;show_nodes();continue
                if cmd=='arm':
                    answer=input('Clip-level graph active, Printer Lights OFF, and no pending numeric entry? Type YES: ')
                    if answer!='YES':print('Not armed.');continue
                    info=inspect_clip();armed=(context(info),panel.status()['connection']);last=None
                    print('Armed for selection-only requests.');continue
                if cmd=='select' and len(parts)==2:
                    fresh=inspect_clip()
                    if not armed or armed!=(context(fresh),panel.status()['connection']) or fresh['nodes']!=info['nodes']:
                        armed=None;raise ValueError('Clip, nodes or connection changed. Run nodes, then arm again.')
                    number=int(parts[1]);selection_packets(number)
                    if number>len(info['nodes']):raise ValueError('Number exceeds the current clip node count.')
                    last=None
                    before=panel.refresh_pivot()
                    after=panel.select_number(number)
                    expected=info['nodes'][number-1]
                    last=dict(time=time.time(),requestedPanelNumber=number,candidateApiNode=expected,
                              pivotBefore=before,pivotAfter=after,observedApiIndex=None)
                    results.append(last);save()
                    print(f"Requested panel number {number}; candidate API label: {expected['label']!r}; Pivot {before} -> {after}.")
                    print('Look at the highlighted node in Resolve. Enter saw INDEX from the printed API list; do not adjust grade controls.')
                    continue
                if cmd=='saw' and len(parts)==2:
                    if last is None:raise ValueError('No successful selection request to record.')
                    index=int(parts[1])
                    if not 1<=index<=len(info['nodes']):raise ValueError('Choose an API index from nodes.')
                    last['observedApiIndex']=index
                    last['observedApiNode']=info['nodes'][index-1]
                    last['userReportedIndexMatch']=index==last['requestedPanelNumber'];save()
                    print('Recorded your observation:',last['observedApiNode'],'Match:',last['userReportedIndexMatch'])
                    continue
                print('Commands: nodes | status | arm | select NUMBER | saw API_INDEX | quit')
            except (ValueError,OSError,EOFError) as error:
                armed=None;last=None
                if isinstance(error,EOFError):break
                print('Stopped request:',error,' Re-arm before another selection.')
    except KeyboardInterrupt:pass
    finally:
        if panel:panel.close()
        print('Test closed. Results:',OUTPUT)

if __name__=='__main__':main()
