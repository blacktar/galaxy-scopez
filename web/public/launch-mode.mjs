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
