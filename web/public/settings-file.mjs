import {hueHistogramConfig,HUE_DEFAULTS} from './hue-settings.mjs';
import {parkingSettings} from './parking-analysis.mjs';
import {isolationConfig} from './colour-analysis.mjs';
// Portable, explicitly versioned preferences. Never import arbitrary storage keys.
export const SETTINGS_IDS=['huePreset','hueWeight','hueSatMin','hueSatMax','hueLumaMin','hueLumaMax','x0','x1','y0','y1','snapopacity','isolation','isolationcolour','hueCenter','hueWidth','satMin','satMax','lumaMin','lumaMax','cuberesolution','layoutmode','layoutshare','twinfit','vectorzoom','vectordetail','lowcut','highcut','vectorcolour','wavecolour','skinline','twinorientation','twincolour','twinneutral','smooth','gain','brightness','targets','quality','precision','axisunit','levelmin','levelmax','debug'];
export function validateSettings(value){
 if(value?.format!=='ghetto-scopez-settings'||value.version!==1||!value.controls||typeof value.controls!=='object'||!Array.isArray(value.layout)||value.layout.length!==4)throw Error('Not a supported Ghetto Scopez settings file.');
 if(!value.layout.every(v=>Number.isInteger(v)&&v>=-1&&v<=16)||new Set(value.layout.filter(v=>v>=0)).size!==value.layout.filter(v=>v>=0).length||value.layout.includes(9)&&value.layout.some(v=>v>=4&&v<=6))throw Error('Invalid scope layout.');
 value={...value,controls:{huePreset:'all',...Object.fromEntries(Object.entries(HUE_DEFAULTS).map(([k,v])=>[k,String(v)])),x0:'',x1:'',y0:'',y1:'',vectordetail:'1',snapopacity:'25',isolation:'off',isolationcolour:'#ca7844',hueCenter:'25',hueWidth:'20',satMin:'.1',satMax:'1',lumaMin:'0',lumaMax:'1',...value.controls}};const controls={};if(value.controls.wavecolour===undefined)value={...value,controls:{...value.controls,wavecolour:'mono'}};if(value.controls.cuberesolution===undefined)value={...value,controls:{...value.controls,cuberesolution:'32'}};for(const id of SETTINGS_IDS){if(!(id in value.controls))throw Error('Missing setting: '+id);const v=value.controls[id];if(!['string','boolean'].includes(typeof v)||typeof v==='string'&&v.length>100)throw Error('Invalid setting: '+id);controls[id]=v;}
 for(const key of ['x0','x1','y0','y1'])if(controls[key]!==''&&(!Number.isInteger(Number(controls[key]))||Number(controls[key])<0))throw Error('Invalid region: '+key);for(const [a,b]of [['x0','x1'],['y0','y1']])if(controls[a]!==''&&controls[b]!==''&&Number(controls[a])>=Number(controls[b]))throw Error('Invalid region boundaries');hueHistogramConfig(controls);if(!['all','neutral','shadows','highlights','custom'].includes(controls.huePreset))throw Error('Invalid hue preset');controls.twinfit='contain';isolationConfig(controls);return {format:value.format,version:1,controls,parking:parkingSettings(value.parking??{}),layout:[...value.layout]};
}
export function bindSettingsFiles({beforeApply=()=>true,getLayout,setLayout,getParking=()=>parkingSettings(),setParking=()=>{},document:doc=document,storage}){
 if(!storage)try{storage=localStorage;}catch{}
 const el=id=>doc.getElementById(id),key='ghettoScopezSettingsV1';let name='Default',applying=false;
 const defaults=Object.fromEntries(SETTINGS_IDS.map(id=>{const e=el(id);return[id,e.type==='checkbox'?e.defaultChecked:e.tagName==='SELECT'?[...e.options].find(o=>o.defaultSelected)?.value??e.options[0].value:e.defaultValue];}));
 function snapshot(){return {format:'ghetto-scopez-settings',version:1,parking:getParking(),controls:Object.fromEntries(SETTINGS_IDS.map(id=>[id,el(id).type==='checkbox'?el(id).checked:el(id).value])),layout:getLayout()};}
 function persist(){if(applying)return;el('settingsfilename').textContent=name;try{storage.setItem(key,JSON.stringify({name,settings:snapshot()}));el('settingsmessage').textContent='Changes remembered on this device automatically.';}catch{el('settingsmessage').textContent='Browser storage unavailable. Save a file to keep these settings.';}}
 function apply(raw,label){const data=validateSettings(raw);if(!beforeApply(data))return; // Validate every control before changing anything.
 for(const [id,v]of Object.entries(data.controls)){const e=el(id);if(['x0','x1','y0','y1'].includes(id)&&v==='')continue;if(e.type==='checkbox'){if(typeof v!=='boolean')throw Error('Invalid '+id);}else if(typeof v!=='string'||e.tagName==='SELECT'&&![...e.options].some(o=>o.value===v)||['range','number'].includes(e.type)&&(!Number.isFinite(Number(v))||v.trim()==='')||['range','number'].includes(e.type)&&((e.min!==''&&Number(v)<Number(e.min))||(e.max!==''&&Number(v)>Number(e.max))))throw Error('Invalid '+id);}
 if(Number(data.controls.lowcut)>=Number(data.controls.highcut)||Number(data.controls.levelmin)>=Number(data.controls.levelmax))throw Error('Invalid measurement boundaries.');
 applying=true;try{for(const [id,v]of Object.entries(data.controls)){const e=el(id);if(e.type==='checkbox')e.checked=v;else e.value=v;}for(const id of SETTINGS_IDS){const e=el(id);e.dispatchEvent(new Event(e.type==='range'?'input':'change',{bubbles:true}));}setLayout(data.layout);setParking(data.parking);name=label;}finally{applying=false;}persist();}
 el('loadsettings').onclick=()=>el('settingsfile').click();el('settingsfile').onchange=async()=>{const file=el('settingsfile').files[0];if(!file)return;try{if(file.size>65536)throw Error('Settings file is too large.');apply(JSON.parse(await file.text()),file.name);}catch(error){el('settingsmessage').textContent='Could not load: '+error.message;}finally{el('settingsfile').value='';}};
 el('savesettings').onclick=async()=>{
 const filename=name==='Default'?'Ghetto-Scopez.json':name.replace(/[\\/:*?"<>|]/g,'-').replace(/\.json$/i,'')+'.json',text=JSON.stringify(snapshot(),null,2)+'\n';
 try{
 if(typeof window.showSaveFilePicker==='function'){
 const handle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'Ghetto Scopez settings',accept:{'application/json':['.json']}}]});
 const writable=await handle.createWritable();await writable.write(text);await writable.close();name=handle.name;persist();el('settingsmessage').textContent='Settings saved. Changes remembered on this device automatically.';
 }else{
 const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=doc.createElement('a');a.href=url;a.download=filename;doc.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 el('settingsmessage').textContent='Settings sent to browser downloads. Changes remain remembered on this device.';
 }
 }catch(error){if(error.name!=='AbortError')el('settingsmessage').textContent='Could not save: '+error.message;}
 };
 el('defaultsettings').onclick=()=>apply({format:'ghetto-scopez-settings',version:1,controls:defaults,layout:[4,5,6,7]},'Default');
 for(const type of ['input','change','click'])doc.addEventListener(type,event=>{if(event.target.closest('#panel,#fullscreencontrols')&&!event.target.closest('#settingsfiles'))queueMicrotask(persist);});
 try{const saved=JSON.parse(storage.getItem(key));if(saved)apply(saved.settings,typeof saved.name==='string'?saved.name.slice(0,200):'Default');else persist();}catch{el('settingsmessage').textContent='Saved preferences could not be restored. Load a settings file or reset to defaults.';} 
 return {persist};
}
