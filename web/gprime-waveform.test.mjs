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
