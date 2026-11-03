export const BLACK_PRODUCT_WINDOW_SESSION_SCHEMA='xiio.studio.black-product-window-session/v1';
export const BLACK_PRODUCT_WINDOW_STATES=Object.freeze([
  'CLEAN','DIRTY','WRITING','WRITTEN_UNVERIFIED','VERIFIED','CONFLICT',
  'RECOVERY_REQUIRED','FAILED_NO_EFFECT','OUTCOME_UNKNOWN'
]);
const HOSTS=new Set(['studio_virtual','native','standalone']);
const STATES=new Set(BLACK_PRODUCT_WINDOW_STATES);
const clone=v=>JSON.parse(JSON.stringify(v));
const nonempty=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim()};
const maybe=v=>v==null?null:String(v);
const same=(a,b)=>a===b;

function normalizeAuthority(input={}){
  return Object.freeze({
    principal_ref:nonempty(input.principal_ref,'principal_ref'),
    device_ref:input.device_ref?nonempty(input.device_ref,'device_ref'):null,
    capability_refs:Object.freeze(Array.isArray(input.capability_refs)?[...input.capability_refs.map(String)]:[]),
    approval_ref:input.approval_ref?nonempty(input.approval_ref,'approval_ref'):null,
    lease_ref:input.lease_ref?nonempty(input.lease_ref,'lease_ref'):null,
    effect_ceiling:nonempty(input.effect_ceiling||'NO_EFFECT','effect_ceiling')
  });
}

export function createBlackProductWindowSession(input={}){
  const host=nonempty(input.host_kind,'host_kind');
  if(!HOSTS.has(host))throw new TypeError('HOST_KIND_INVALID');
  const resource=input.resource||{};
  const opened=nonempty(resource.opened_version_ref,'opened_version_ref');
  const current=nonempty(resource.current_version_ref||opened,'current_version_ref');
  return Object.freeze({
    schema:BLACK_PRODUCT_WINDOW_SESSION_SCHEMA,
    session_ref:nonempty(input.session_ref,'session_ref'),
    window_ref:nonempty(input.window_ref,'window_ref'),
    host_kind:host,
    product_id:nonempty(input.product_id,'product_id'),
    resource:{
      resource_ref:nonempty(resource.resource_ref,'resource_ref'),
      opened_version_ref:opened,
      current_version_ref:current,
      content_digest:maybe(resource.content_digest),
      profile_id:nonempty(resource.profile_id,'profile_id'),
      source_lineage:Array.isArray(resource.source_lineage)?clone(resource.source_lineage):[]
    },
    context:{
      workspace_ref:nonempty(input.context?.workspace_ref,'workspace_ref'),
      project_ref:maybe(input.context?.project_ref),
      domain_context_ref:maybe(input.context?.domain_context_ref)
    },
    authority:normalizeAuthority(input.authority),
    state:'CLEAN',
    pending:null,
    last_verified:{version_ref:current,content_digest:maybe(resource.content_digest)},
    last_error:null,
    subscription_state:maybe(input.subscription_state)
  });
}

function next(session,patch){
  if(session?.schema!==BLACK_PRODUCT_WINDOW_SESSION_SCHEMA)throw new TypeError('SESSION_INVALID');
  const out={...clone(session),...clone(patch)};
  if(!STATES.has(out.state))throw new TypeError('STATE_INVALID');
  return Object.freeze(out);
}

export function projectBlackProductWindowHost(session,{host_kind,window_ref}){
  const host=nonempty(host_kind,'host_kind');
  if(!HOSTS.has(host))throw new TypeError('HOST_KIND_INVALID');
  return next(session,{host_kind:host,window_ref:nonempty(window_ref,'window_ref')});
}

export function markBlackProductWindowDirty(session,{working_version_ref=null,working_digest=null}={}){
  if(['WRITING','WRITTEN_UNVERIFIED','OUTCOME_UNKNOWN'].includes(session.state))throw new Error('RECONCILE_BEFORE_EDIT');
  return next(session,{state:'DIRTY',pending:{kind:'edit',base_version_ref:session.resource.current_version_ref,working_version_ref:maybe(working_version_ref),working_digest:maybe(working_digest)},last_error:null});
}

export function beginBlackProductWindowWrite(session,{operation_ref,attempt_ref,expected_version_ref}){
  if(!['DIRTY','FAILED_NO_EFFECT'].includes(session.state))throw new Error('WRITE_NOT_ELIGIBLE');
  const expected=nonempty(expected_version_ref,'expected_version_ref');
  if(!same(expected,session.resource.current_version_ref))return next(session,{state:'CONFLICT',last_error:'STALE_EXPECTED_VERSION'});
  return next(session,{state:'WRITING',pending:{...(session.pending||{}),kind:'write',operation_ref:nonempty(operation_ref,'operation_ref'),attempt_ref:nonempty(attempt_ref,'attempt_ref'),expected_version_ref:expected},last_error:null});
}

export function recordBlackProductWindowWriteOutcome(session,{operation_ref,attempt_ref,outcome,new_version_ref=null,content_digest=null,error=null}){
  if(session.state!=='WRITING')throw new Error('WRITE_NOT_IN_PROGRESS');
  if(session.pending?.operation_ref!==operation_ref||session.pending?.attempt_ref!==attempt_ref)throw new Error('WRITE_CORRELATION_MISMATCH');
  const pending={...session.pending,written_version_ref:maybe(new_version_ref),written_digest:maybe(content_digest)};
  if(outcome==='verified'){
    nonempty(new_version_ref,'new_version_ref');
    return next(session,{state:'WRITTEN_UNVERIFIED',pending,last_error:'HOST_VERIFIED_AWAITING_INDEPENDENT_READBACK'});
  }
  if(outcome==='written_unverified')return next(session,{state:'WRITTEN_UNVERIFIED',pending,last_error:maybe(error)});
  if(outcome==='failed_no_effect')return next(session,{state:'FAILED_NO_EFFECT',pending:{...pending,kind:'edit'},last_error:maybe(error)||'WRITE_FAILED_NO_EFFECT'});
  if(outcome==='outcome_unknown')return next(session,{state:'OUTCOME_UNKNOWN',pending,last_error:maybe(error)||'WRITE_OUTCOME_UNKNOWN'});
  throw new TypeError('WRITE_OUTCOME_INVALID');
}

export function reconcileBlackProductWindowReadback(session,{resource_ref,version_ref,content_digest}){
  if(!same(nonempty(resource_ref,'resource_ref'),session.resource.resource_ref))throw new Error('READBACK_RESOURCE_MISMATCH');
  const version=nonempty(version_ref,'version_ref');
  const digest=maybe(content_digest);
  if(session.state==='WRITTEN_UNVERIFIED'){
    const writtenVersion=session.pending?.written_version_ref;
    const writtenDigest=session.pending?.written_digest;
    const hasWrittenDigest=typeof writtenDigest==='string'&&writtenDigest.trim().length>0;
    const hasReadbackDigest=typeof digest==='string'&&digest.trim().length>0;
    if(writtenVersion&&version===writtenVersion&&hasWrittenDigest&&hasReadbackDigest&&writtenDigest===digest){
      return next(session,{state:'VERIFIED',resource:{...session.resource,current_version_ref:version,content_digest:digest},pending:null,last_verified:{version_ref:version,content_digest:digest},last_error:null});
    }
    if(writtenVersion&&version===writtenVersion&&(!hasWrittenDigest||!hasReadbackDigest)){
      return next(session,{state:'RECOVERY_REQUIRED',last_error:'INDEPENDENT_READBACK_DIGEST_REQUIRED'});
    }
    if(version===session.resource.current_version_ref)return next(session,{state:'RECOVERY_REQUIRED',last_error:'WRITE_NOT_VISIBLE_ON_READBACK'});
    return next(session,{state:'CONFLICT',last_error:'READBACK_VERSION_CONFLICT'});
  }
  if(session.state==='OUTCOME_UNKNOWN'){
    const baselineDigest=session.resource.content_digest;
    const hasBaselineDigest=typeof baselineDigest==='string'&&baselineDigest.trim().length>0;
    const hasReadbackDigest=typeof digest==='string'&&digest.trim().length>0;
    if(version===session.resource.current_version_ref&&hasBaselineDigest&&hasReadbackDigest&&baselineDigest===digest){
      return next(session,{state:'FAILED_NO_EFFECT',pending:{...(session.pending||{}),kind:'edit'},last_error:'UNKNOWN_EFFECT_RECONCILED_AS_NO_CHANGE'});
    }
    return next(session,{state:'RECOVERY_REQUIRED',last_error:'UNKNOWN_EFFECT_REQUIRES_CONTENT_RECONCILIATION'});
  }
  if(version!==session.resource.current_version_ref)return next(session,{state:'CONFLICT',last_error:'EXTERNAL_VERSION_CHANGED'});
  return session;
}

export function canRetryBlackProductWindowWrite(session){
  return ['DIRTY','FAILED_NO_EFFECT'].includes(session.state);
}

export function blackProductWindowStatus(session){
  return Object.freeze({
    schema:'xiio.studio.black-product-window-status/v1',
    resource_ref:session.resource.resource_ref,
    version_ref:session.resource.current_version_ref,
    host_kind:session.host_kind,
    state:session.state,
    can_retry_write:canRetryBlackProductWindowWrite(session),
    effect_ceiling:session.authority.effect_ceiling,
    capability_refs:[...session.authority.capability_refs],
    subscription_state:session.subscription_state
  });
}
