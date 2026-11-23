import test from 'node:test';import assert from 'node:assert/strict';import {dockMayHide,controlDockPosition} from './public/control-dock.mjs';
test('dock hides when idle in either viewing mode and stays available for grading interaction and keyboard focus',()=>{const idle={fullscreen:true,settings:false,dragging:false,hovering:false,keyboardFocus:false};assert.equal(dockMayHide(idle),true);for(const key of ['settings','dragging','hovering','keyboardFocus'])assert.equal(dockMayHide({...idle,[key]:true}),false,key);assert.equal(dockMayHide({...idle,fullscreen:false}),true);});

test('popup joins tab bottom and stays within viewport in both modes',()=>{
 const handle={left:200,right:270,bottom:44},parent={left:10,top:5};
 assert.deepEqual(controlDockPosition({handle,parent,dockWidth:400,viewportWidth:1000,fullscreen:false}),{top:38,left:225});
 assert.deepEqual(controlDockPosition({handle,parent,dockWidth:400,viewportWidth:1000,fullscreen:true}),{top:43,left:235});
 assert.equal(controlDockPosition({handle:{left:10,right:80,bottom:44},parent,dockWidth:800,viewportWidth:1000,fullscreen:true}).left,414);
});
