# Browser regression check for snapshot opacity. Requires a running local viewer,
# Playwright Chromium and Pillow. Uses an isolated test page/count planes only;
# never sends Resolve commands or replaces the live input feed.
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
script='''async(module)=>{
 const {bindSnapshots}=await import(module);
 let readbacks=0,changes=0;const original=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(...args){readbacks++;return original.apply(this,args);};
 const canvases=Array.from({length:4},(_,i)=>{const section=document.createElement('section');section.hidden=i!==3;section.innerHTML='<div class="scopehead"><span>Test '+i+'</span></div><canvas width="640" height="480"></canvas>';document.querySelector('#plots').append(section);return section.querySelector('canvas');});
 const make=(shift)=>{const vector=new Uint32Array(256*256);for(let y=60;y<180;y++)for(let x=50+shift;x<140+shift;x++)vector[y*256+x]=((x+y)%25+1)*20;return {config:{vectorSize:256,min:0,max:1,vectorZoom:1},measurement:{matrix:'bt709'},source:{signal:{model:'RGB',range:'full',primaries:'bt709',transfer:'bt709'}},vector,samples:100000};};
 let latest=make(0),style={gain:1,brightness:100,smooth:false};let ui;
 ui=bindSnapshots({canvases,getLatest:()=>latest,getView:()=>({scale:1}),getStyle:()=>style,getOptions:()=>({vectorColour:false,vectorMagnification:1}),onChange:()=>{changes++;if(ui)ui.paint(latest);}});
 await new Promise(r=>setTimeout(r,100));const group=canvases[3].closest('section').querySelector('.snapshot-buttons');
 for(let i=0;i<3;i++){latest=make(i*20);group.querySelector('.snapshot-capture').click();await new Promise(r=>setTimeout(r,5));}
 const opacity=document.querySelector('#snapopacity'),overlay=canvases[3].parentElement.querySelector('.snapshot-overlay');
 const before=readbacks,oldChanges=changes,t0=performance.now();for(let i=1;i<=20;i++){opacity.value=String(i*4);opacity.dispatchEvent(new Event('input'));}const elapsed=performance.now()-t0;
 const opacityReads=readbacks-before,opacityChanges=changes-oldChanges;
 const pixels=[];for(const value of [0,25,65,100]){opacity.value=String(value);opacity.dispatchEvent(new Event('input'));const cached=overlay.toDataURL();style={...style,testRevision:value};ui.paint(latest);pixels.push({value,cached,fresh:overlay.toDataURL()});}
 const count=readbacks;style={...style,brightness:150};ui.paint(latest);const styleReads=readbacks-count;
 const count2=readbacks;canvases[3].width=480;ui.paint(latest);const resizeReads=readbacks-count2;
 const count3=readbacks;group.querySelector('.snapshot-number').click();ui.paint(latest);const toggleReads=readbacks-count3;
 const count4=readbacks;latest=make(35);group.querySelector('.snapshot-capture').click();ui.paint(latest);const replaceReads=readbacks-count4;
 group.querySelector('button:last-child').click();ui.paint(latest);
 return {elapsed,opacityReads,fullRedrawRequests:opacityChanges,styleReads,resizeReads,toggleReads,replaceReads,pixels};
}'''
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);results={}
 page=b.new_page(viewport={'width':1000,'height':800})
 page.route('**/snapshot-opacity-check',lambda r:r.fulfill(content_type='text/html',body='<input id="snapopacity" value="25"><span id="snapopacityvalue"></span><span id="snapshotmessage"></span><span id="snapshotusage"></span><label id="snapopacitylabel"></label><button id="clearsnapshots">Clear</button><div id="plots"></div>'))
 page.goto('http://127.0.0.1:8765/snapshot-opacity-check',wait_until='domcontentloaded');result=page.evaluate(script,'/snapshot-ui.mjs');b.close()
from PIL import Image,ImageChops
import io,base64
for pair in result.pop('pixels'):
 a=Image.open(io.BytesIO(base64.b64decode(pair['cached'].split(',')[1])));b=Image.open(io.BytesIO(base64.b64decode(pair['fresh'].split(',')[1])));assert ImageChops.difference(a,b).getbbox() is None, pair['value']
assert result['opacityReads']==0 and result['fullRedrawRequests']==0,result
assert result['styleReads']==3 and result['resizeReads']==3,result
assert result['toggleReads']==0 and result['replaceReads']==1,result
print(json.dumps(result,indent=2));print('PASS: cached opacity equals fresh rendering at0/25/65/100%; geometry/style/replacement invalidation passes.')
