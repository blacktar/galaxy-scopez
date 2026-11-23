// One native worker per viewer session; never replay a command after failure.
export function createGradingQueue(limit=12){
 let tail=Promise.resolve(),pending=0;
 return function enqueue(send){
  if(pending>=limit)return Promise.reject(Error('Finish the current GPrime operation first.'));
  pending++;
  const result=tail.then(send);
  tail=result.catch(()=>{}).finally(()=>{pending--;});
  return result;
 };
}
export const enqueueGradingRequest=createGradingQueue();
export function missingGPrimeRoles(bindings){
 return ['exposure','contrast','balance','saturation'].filter(role=>!bindings[role]?.enabled);
}
