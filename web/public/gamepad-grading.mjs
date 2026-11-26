import {FUNCTIONS} from './gamepad-input.mjs';
export function curve(v,dead=.15){const n=Math.max(0,(Math.abs(v)-dead)/(1-dead));return Math.sign(v)*n*n;}
export function mappedValues(profile,s){
 const down=i=>s.buttons[i]?.pressed||s.buttons[i]?.value>.25;
 const eligible=b=>b&&(b.modifiers??[]).every(down);
 const source=b=>b.axes?'v'+b.axes.join(','):b.axis!==undefined?'a'+b.axis:'b'+b.button;
 const result={};for(const f of FUNCTIONS){const b=profile[f.id];if(!eligible(b))continue;if(Object.values(profile).some(c=>eligible(c)&&source(c)===source(b)&&(c.modifiers?.length??0)>(b.modifiers?.length??0)))continue;
  result[f.id]=b.axes?b.axes.map(i=>curve(s.axes[i]??0)):b.axis!==undefined?(b.direction?Math.max(0,curve((s.axes[b.axis]??0)*b.direction)):curve(s.axes[b.axis]??0)):f.kind==='analog'?Math.max(0,curve(s.buttons[b.button]?.value??0,.05)):down(b.button)?1:0;
 }return result;
}
// One gesture and one request at a time. No backlog of controller frames.
export class GamepadGradingSession{
 constructor(adapter,onError=()=>{}){this.adapter=adapter;this.onError=onError;this.current=null;this.desired=null;this.busy=false;this.failed=false;}
 update(role,values){if(this.failed)return;this.desired=role?{role,values}:null;void this.pump();}
 stop(){this.desired=null;void this.pump();}
 recover(){if(!this.busy&&!this.current)this.failed=false;}
 async pump(){if(this.busy)return;this.busy=true;try{
  if(this.current&&(!this.desired||this.current.role!==this.desired.role)){await this.adapter.end();this.current=null;}
  if(this.desired&&!this.current){const role=this.desired.role,result=await this.adapter.begin(role);this.current={role,result};}
  if(this.current&&this.desired?.role===this.current.role)await this.adapter.set(this.current.role,this.current.result.gesture,this.desired.values(this.current.result));
  if(this.current&&(!this.desired||this.current.role!==this.desired.role)){await this.adapter.end();this.current=null;}
 }catch(e){this.failed=true;this.desired=null;try{await this.adapter.end();}catch{}this.current=null;this.onError(e);}finally{this.busy=false;if(this.current&&!this.desired)void this.pump();}}
}
