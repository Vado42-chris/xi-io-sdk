export const WORKER_EXECUTION_COORDINATE_FIELDS=Object.freeze(['project_id','work_id','assignment_ref','attempt_id','agent_id','source_generation','return_ref','operation_ref']);
export const WORKER_RECEIVER_COORDINATE_FIELDS=Object.freeze(['matter_ref','agent_principal_ref','conversation_ref']);
export const WORKER_RUNTIME_COORDINATE_FIELDS=Object.freeze(['host_generation_ref','runtime_project_id','runtime_agent_id','runtime_generation']);
const required=(v,k)=>{const s=String(v??'').trim();if(!s)throw Object.assign(new Error('WORKER_COORDINATE_'+k.toUpperCase()+'_REQUIRED'),{code:'WORKER_COORDINATE_REQUIRED'});return s};
export function projectWorkerCoordinates(value={}, {execution=false,receiver=false,runtime=false}={}){
 const fields=[...(execution?WORKER_EXECUTION_COORDINATE_FIELDS:[]),...(receiver?WORKER_RECEIVER_COORDINATE_FIELDS:[]),...(runtime?WORKER_RUNTIME_COORDINATE_FIELDS:[])];
 return Object.freeze(Object.fromEntries(fields.map(k=>[k,required(value[k],k)])));
}
export function assertWorkerCoordinatesEqual(expected={},actual={},options={}){
 const e=projectWorkerCoordinates(expected,options),a=projectWorkerCoordinates(actual,options);
 for(const key of Object.keys(e))if(a[key]!==e[key])throw Object.assign(new Error('WORKER_COORDINATE_MISMATCH:'+key),{code:'WORKER_COORDINATE_MISMATCH',field:key});
 return a;
}
