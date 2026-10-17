// Provider-neutral, lossless-envelope metadata contract. Payload remains in BINS/Ward.
import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(x).digest('hex');
const nonempty=x=>typeof x==='string'&&x.length>0;
export const LEVELS=Object.freeze(Array.from({length:10},(_,i)=>i+1));
export const FIVE_W=Object.freeze(['who','what','where','when','why']);
export function normalizeConversationOccurrence(source){
 if(!source||!nonempty(source.provider)||!nonempty(source.conversation_id)||!nonempty(source.message_id)||!nonempty(source.raw_sha256)||!/^[a-f0-9]{64}$/.test(source.raw_sha256))throw Error('SOURCE_IDENTITY_INCOMPLETE');
 if(!nonempty(source.raw_ref)||!nonempty(source.observed_at)||!Number.isFinite(Date.parse(source.observed_at)))throw Error('PROVENANCE_INCOMPLETE');
 return Object.freeze({schema:'xiio.sdk.conversation-occurrence/v1',provider:source.provider,conversation_id:source.conversation_id,message_id:source.message_id,branch_id:source.branch_id??null,parent_message_id:source.parent_message_id??null,raw_ref:source.raw_ref,raw_sha256:source.raw_sha256,observed_at:new Date(source.observed_at).toISOString(),source_generation:source.source_generation??null,extensions_ref:source.extensions_ref??null,authority:'NONE',provider_effect:false});
}
export function cubeSpinToken({level,step,perspectives,fixture_sha256,predicate_sha256}){
 if(!LEVELS.includes(level)||!Number.isSafeInteger(step)||step<0||!perspectives||FIVE_W.some(k=>!nonempty(perspectives[k]))||!/^([a-f0-9]{64})$/.test(fixture_sha256)||!/^([a-f0-9]{64})$/.test(predicate_sha256))throw Error('INVALID_CUBE_SPIN_TOKEN');
 const identity={schema:'xiio.sdk.cube-spin-token/v1',level,step,denominator:5,perspectives:Object.fromEntries(FIVE_W.map(k=>[k,perspectives[k]])),fixture_sha256,predicate_sha256};
 return Object.freeze({...identity,token_sha256:digest(JSON.stringify(identity)),next_even_how:'UNQUALIFIED_PENDING_55_RETURN',effect_authority:false});
}
