import test from 'node:test';import assert from 'node:assert/strict';import {isHomeScreenLaunch,bindHeaderZoomGuard} from './public/launch-mode.mjs';
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
