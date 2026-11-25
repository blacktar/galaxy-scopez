import test from 'node:test';import assert from 'node:assert/strict';
import {waveformBackdrop,mountWaveformBackdrop,waveformLimits} from './public/gprime-waveform.mjs';
import {analysisScopes} from './public/layout.mjs';
test('waveform backdrop keeps spatial columns and maps highlights to top, shadows to bottom',()=>{
 const wave=new Uint32Array(16);wave[0]=100;wave[15]=100;const before=wave.slice();
 const r=waveformBackdrop({config:{waveWidth:4,levels:4},wave},4,4);
 assert.ok(r.pixels[(3*4)*4+3]>0);assert.ok(r.pixels[3*4+3]>0);assert.equal(r.pixels[3],0);assert.deepEqual(wave,before);
 const empty=waveformBackdrop({config:{waveWidth:4,levels:4},wave:new Uint32Array(16)},4,4);assert.ok(empty.pixels.every(v=>v===0));
});
test('waveform backdrop raster stays bounded and only requests analysis when enabled',()=>{
 assert.deepEqual(analysisScopes([18]),[3]);assert.deepEqual(analysisScopes([18],{gprimeWaveform:true}),[0,3]);assert.deepEqual(analysisScopes([0,18],{gprimeWaveform:true,gprimeDoubleD:true}),[0,7]);
 const r=waveformBackdrop({config:{waveWidth:512,levels:1024},wave:new Uint32Array(512*1024)});assert.equal(r.width,384);assert.equal(r.height,192);
});

test('live backdrop redraws new frames when the decoder reuses the waveform array',()=>{
 const originalDocument=globalThis.document,originalImageData=globalThis.ImageData,draws=[];
 const canvas={setAttribute(){},getContext(){return {clearRect(){},putImageData(image){draws.push(image.data.slice());}};}};
 globalThis.document={createElement:tag=>tag==='canvas'?canvas:{style:{},setAttribute(){},append(){}}};globalThis.ImageData=class{constructor(data){this.data=data;}};
 try{
  const backdrop=mountWaveformBackdrop({prepend(){}}),wave=new Uint32Array(16),config={waveWidth:4,levels:4,activeScopes:[0]};
  backdrop.show(true);wave[0]=100;const first={config,wave};backdrop.paint(first);backdrop.paint(first);assert.equal(draws.length,1);
  wave.fill(0);wave[15]=100;backdrop.paint({config,wave});assert.equal(draws.length,2);assert.notDeepEqual(draws[0],draws[1]);
  backdrop.show(false);backdrop.paint({config,wave});assert.equal(draws.length,2);
 }finally{globalThis.document=originalDocument;globalThis.ImageData=originalImageData;}
});

test('signal limit lines track zero and one within the waveform measurement range',()=>{
 assert.deepEqual(waveformLimits({min:0,max:1}),[{value:1,top:0},{value:0,top:100}]);
 const expanded=waveformLimits({min:-1,max:2});assert.ok(Math.abs(expanded[0].top-100/3)<1e-10);assert.ok(Math.abs(expanded[1].top-200/3)<1e-10);
 assert.deepEqual(waveformLimits({min:.1,max:.9}),[]);
});

test('GPrime backdrop uses original source-column footprints at every Q level without slicing',()=>{
 for(const sourceColumns of [15,1919,1920])for(const gridColumns of [512,1024,1536,2048]){
  const wave=new Uint32Array(gridColumns*4);for(let x=0;x<gridColumns;x++)wave[gridColumns+x]=(Math.ceil((x+1)*sourceColumns/gridColumns)-Math.ceil(x*sourceColumns/gridColumns))*8;
  const before=wave.slice(),data={config:{waveWidth:gridColumns,levels:4},source:{region:{width:sourceColumns}},wave},r=waveformBackdrop(data,384,4);
  const alpha=Array.from({length:r.width},(_,x)=>r.pixels[(2*r.width+x)*4+3]);assert.ok(alpha[0]>0);assert.ok(alpha.every(v=>v===alpha[0]),JSON.stringify({sourceColumns,gridColumns,min:Math.min(...alpha),max:Math.max(...alpha)}));assert.deepEqual(wave,before);
 }
});

test('GPrime overlay alpha agrees with the corrected regular waveform footprint renderer',async()=>{
 const {analyzeFrame}=await import('./scopes.mjs'),{renderSoftware}=await import('./public/software-renderer.mjs');
 for(const [sourceColumns,q]of [[15,1],[1919,4]]){
  const values=Float32Array.from({length:sourceColumns*2*3},(_,i)=>(Math.sin(i*.13)+1)/2),data=analyzeFrame({width:sourceColumns,height:2,data:values,signal:{model:'RGB',range:'full',matrix:'bt709',codeBits:10}},{activeScopes:[0],vectorDisplayScale:q});
  const actual=waveformBackdrop(data,127,32),expected=renderSoftware(data,0,127,32,{gain:1,brightness:100,smooth:false},{waveColourMode:'mono',background:0,transparentBackground:true});
  let maxError=0;for(let i=3;i<expected.length;i+=4)maxError=Math.max(maxError,Math.abs(expected[i]-actual.pixels[i]));assert.ok(maxError<=1,'maximum alpha difference '+maxError);
 }
});
