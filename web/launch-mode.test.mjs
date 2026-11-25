import test from 'node:test';import assert from 'node:assert/strict';import {isHomeScreenLaunch,bindHeaderZoomGuard,bindScopeAutoListen,bindScopeChromeGuard} from './public/launch-mode.mjs';
const media=mode=>query=>({matches:query===`(display-mode: ${mode})`});
test('Home Screen launch detection supports Apple standalone flag and display-mode fallbacks',()=>{
 assert.equal(isHomeScreenLaunch({navigator:{standalone:true},matchMedia:media('browser')}),true);
 assert.equal(isHomeScreenLaunch({navigator:{},matchMedia:media('standalone')}),true);
 assert.equal(isHomeScreenLaunch({navigator:{},matchMedia:media('fullscreen'),fullscreenElement:null}),true);
 assert.equal(isHomeScreenLaunch({navigator:{},matchMedia:media('fullscreen'),fullscreenElement:{}}),false);
 assert.equal(isHomeScreenLaunch({navigator:{},matchMedia:media('browser')}),false);
});

test('standalone header cancels pinch and double-click zoom without cancelling ordinary taps or popup gestures',()=>{
 const handlers={};bindHeaderZoomGuard({addEventListener:(type,handler)=>handlers[type]=handler});
 const event=(count,popup=false)=>({touches:Array(count),cancelable:true,target:{closest:()=>popup?{}:null},preventDefault(){this.prevented=true;}});
 for(const type of ['touchstart','touchmove']){const tap=event(1);handlers[type](tap);assert.equal(tap.prevented,undefined);const pinch=event(2);handlers[type](pinch);assert.equal(pinch.prevented,true);}
 for(const type of ['gesturestart','gesturechange','gestureend','dblclick']){const zoom=event(2);handlers[type](zoom);assert.equal(zoom.prevented,true);const popup=event(2,true);handlers[type](popup);assert.equal(popup.prevented,undefined);}
 assert.equal(handlers.click,undefined);
});

test('Home Screen starts once on any plot gesture, and header activation sees updated settings',()=>{const handlers={},root={addEventListener:(t,h)=>handlers[t]=h};let active=false,starts=0,mode='rgb',used;bindScopeAutoListen({root,enabled:true,isActive:()=>active,start:()=>{starts++;active=true;used=mode;}});const plot={target:{closest:selector=>selector==='.scopeplot'?{}:null}};handlers.pointerdown(plot);handlers.wheel(plot);handlers.click(plot);assert.equal(starts,1);active=false;mode='ycbcr';handlers.click({target:{closest:selector=>selector.includes('.parade-mode-buttons')?{}:null}});assert.equal(starts,2);assert.equal(used,'ycbcr');});
test('browser mode and unrelated interface clicks do not start scopes',()=>{let bound=0,starts=0;bindScopeAutoListen({root:{addEventListener(){bound++;}},enabled:false,isActive:()=>false,start:()=>starts++});assert.equal(bound,0);const h={};bindScopeAutoListen({root:{addEventListener:(t,f)=>h[t]=f},enabled:true,isActive:()=>false,start:()=>starts++});h.click({target:{closest:()=>null}});h.keydown({key:'a',target:{closest:()=>({})}});assert.equal(starts,0);});

test('scope headers block native zoom while scope content rejects selection, dragging and context menus',()=>{
 const heads=[{},{}],handlers={};const root={querySelectorAll:()=>heads.map(h=>({addEventListener:(type,fn)=>h[type]=fn})),addEventListener:(type,fn)=>handlers[type]=fn};bindScopeChromeGuard(root);
 for(const h of heads){for(const type of ['gesturestart','gesturechange','gestureend','dblclick']){const e={target:{closest:()=>null},cancelable:true,preventDefault(){this.prevented=true;}};h[type](e);assert.equal(e.prevented,true);}assert.equal(h.click,undefined);assert.equal(h.change,undefined);}
 for(const type of ['selectstart','dragstart','contextmenu']){let prevented=false;handlers[type]({cancelable:true,preventDefault(){prevented=true;}});assert.equal(prevented,true);}
 assert.equal(handlers.pointerdown,undefined);assert.equal(handlers.pointermove,undefined);
});
