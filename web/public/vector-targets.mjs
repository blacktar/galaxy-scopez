// Component-vectorscope tolerance: ±5° hue and ±5% target chroma amplitude.
// Convention documented by ScopeBox; not a universal colour classification.
export function targetTolerancePoints(target){
 const radius=Math.hypot(target.cb,target.cr),angle=Math.atan2(target.cr,target.cb),delta=5*Math.PI/180;
 return [[.95,-delta],[1.05,-delta],[1.05,delta],[.95,delta]].map(([scale,offset])=>[radius*scale*Math.cos(angle+offset),radius*scale*Math.sin(angle+offset)]);
}
