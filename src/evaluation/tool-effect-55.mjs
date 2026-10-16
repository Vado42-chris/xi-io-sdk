import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const required=['work_uuid','actor_ref','assignment_ref','tool_id','tool_digest','source_generation','target_ref','operation','pre_sha256','ward_admission_ref','execution_id','exit_code','post_sha256','independent_readback_ref','inbox_result_ref','apply_return_ref'];
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function qualifyToolEffect55(receipt={}){
 const missing=required.filter(k=>receipt[k]===undefined||receipt[k]===null||receipt[k]==='');
 if(missing.length)return {qualified:false,code:'MISSING_EFFECT_EVIDENCE',missing};
 if(!digest(receipt.tool_digest)||!digest(receipt.pre_sha256)||!digest(receipt.post_sha256))return {qualified:false,code:'DIGEST_INVALID'};
 if(receipt.exit_code!==0)return {qualified:false,code:'COMMAND_FAILED'};
 if(receipt.independent_readback_verified!==true)return {qualified:false,code:'READBACK_UNVERIFIED'};
 if(receipt.ward_admission_verified!==true)return {qualified:false,code:'WARD_UNVERIFIED'};
 if(receipt.apply_return_verified!==true)return {qualified:false,code:'RETURN_UNVERIFIED'};
 return {qualified:false,structure_valid:true,code:'RECEIPT_STRUCTURE_QUALIFIED',receipt_digest:hash(receipt),note:'Structural receipt only. No independent Ward, readback or Apply Return attestation was validated.'};
}
