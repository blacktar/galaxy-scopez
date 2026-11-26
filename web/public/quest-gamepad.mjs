// Quest observes the existing GPrime controller session; it never sends grades
// or creates a second controller consumer. Scoring stays in OGGame's live feed.
export function questControllerState(state){
 const enabled=state?.config?.enabled===true,selected=enabled&&!!state.config.controller,connected=selected&&state.pad?.key===state.config.controller;
 return {enabled,connected,label:!enabled?'Set up GPrime gamepad':!selected?'Choose a controller':!connected?'Controller disconnected':state.status||'GPrime gamepad connected'};
}
export function createQuestController({isVisible,isListening,canListen=()=>true,startListening,showStatus=()=>{}}){
 let state=null,engaged=false,source='';
 return {update(value){const next=value?.config?.enabled?value.config.controller:'';if(next!==source||!questControllerState(value).connected)engaged=false;source=next;state=value;showStatus(questControllerState(state));},gradingResult(action){
  if(action==='gprime-end'){engaged=false;return false;}
  if(action==='gprime-set'&&engaged)return false;
  if(action==='gprime-set'&&questControllerState(state).connected&&isVisible())engaged=true;
  if(!['gprime-set','gprime-undo','gprime-reset'].includes(action)||!questControllerState(state).connected||!isVisible()||isListening()||!canListen())return false;
  startListening();return true;
 }};
}
export function mountQuestGamepad({card,openSettings,isVisible,isListening,canListen,startListening,armAudio=()=>{}}){
 const doc=card.ownerDocument,head=card.querySelector('.scopehead'),button=doc.createElement('button'),status=doc.createElement('span');
 button.type='button';button.className='quiet quest-gamepad-settings';button.textContent='Gamepad';button.setAttribute('aria-label','Gamepad settings for Scopez Quest');
 status.className='unit quest-gamepad-status';status.style.cssText='max-width:44ch;white-space:normal;overflow-wrap:anywhere';status.setAttribute('role','status');
 button.onclick=()=>{armAudio();openSettings();};head.append(button,status);
 return createQuestController({isVisible,isListening,canListen,startListening,showStatus(value){status.textContent=value.label;button.setAttribute('aria-label',value.enabled?'Gamepad settings for Scopez Quest':'Set up GPrime gamepad for Scopez Quest');}});
}
