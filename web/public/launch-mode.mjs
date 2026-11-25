export function isHomeScreenLaunch({navigator:nav=globalThis.navigator,matchMedia=globalThis.matchMedia,fullscreenElement=globalThis.document?.fullscreenElement}={}){
 return nav?.standalone===true||!!matchMedia?.('(display-mode: standalone)').matches||(!fullscreenElement&&!!matchMedia?.('(display-mode: fullscreen)').matches);
}
// Keep normal taps/clicks; cancel zoom gestures only on the standalone header row.
export function bindHeaderZoomGuard(header){
 const row=event=>!event.target.closest?.('#fullscreencontrols');
 const cancel=event=>{if(row(event)&&event.cancelable)event.preventDefault();};
 for(const type of ['touchstart','touchmove'])header.addEventListener(type,event=>{if(event.touches?.length>1)cancel(event);},{passive:false,capture:true});
 for(const type of ['gesturestart','gesturechange','gestureend','dblclick'])header.addEventListener(type,cancel,{passive:false,capture:true});
}

// Start on plot gestures immediately; header clicks run after their own handlers
// so the first request uses the newly selected mode and colour settings.
export function bindScopeAutoListen({root,enabled,isActive,start}){
 if(!enabled)return;
 const activate=()=>{if(!isActive())start();};
 const plot=event=>event.target.closest?.('.scopeplot');
 root.addEventListener('pointerdown',event=>{if(plot(event))activate();},{capture:true,passive:true});
 root.addEventListener('wheel',event=>{if(plot(event))activate();},{capture:true,passive:true});
 root.addEventListener('keydown',event=>{if(plot(event)&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','-',' ','Enter'].includes(event.key))activate();},{capture:true});
 root.addEventListener('click',event=>{if(plot(event)||event.target.closest?.('.wave-mode-buttons,.wave-channel-buttons,.wave-color-toggle,.parade-mode-buttons,.parade-color-toggle,.twin-orientation-toggle,.scope-type,.snapshot-buttons'))activate();});
 root.addEventListener('change',event=>{if(event.target.matches?.('.scope-type'))activate();});
}

// Scope chrome uses normal click/change controls, but never native page zoom.
// Bind in each viewer document so embedded scope instances are protected too.
export function bindScopeChromeGuard(root){
 for(const head of root.querySelectorAll('.scopehead'))bindHeaderZoomGuard(head);
 const cancel=event=>{if(event.cancelable)event.preventDefault();};
 for(const type of ['selectstart','dragstart','contextmenu'])root.addEventListener(type,cancel,{capture:true});
}
