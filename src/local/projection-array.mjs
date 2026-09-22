import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PROJECTION_ARRAY_SCHEMA='xiio.sdk.local-projection-array/v1';
export const PROJECTION_INDEX_SCHEMA='xiio.sdk.studio-projection-index/v1';
export const PROJECTION_ARRAY_READBACK_SCHEMA='xiio.sdk.local-projection-array-readback/v1';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(v,k,max=2048)=>{if(typeof v!=='string'||!v.trim()||v.trim()!==v||v.length>max)throw new TypeError(k+'_INVALID');return v;};
const refs=v=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))]:[];
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const stable=v=>JSON.stringify(canonical(v));
const sha=v=>'sha256:'+crypto.createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex');
const atomicWrite=(p,body)=>{fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.tmp-'+process.pid;fs.writeFileSync(tmp,body,{encoding:'utf8',mode:0o600});fs.renameSync(tmp,p);};
const safeSeg=(v)=>String(v).replace(/[^A-Za-z0-9_.-]/g,'_');
const defaultStateRoot=()=>path.join(process.env.XDG_STATE_HOME||path.join(os.homedir(),'.local','state'),'xi-io','projection-array');

function deterministicUuid(namespace,...parts){
 const b=crypto.createHash('sha256').update(stable([namespace,...parts])).digest().subarray(0,16);
 b[6]=(b[6]&0x0f)|0x50;b[8]=(b[8]&0x3f)|0x80;
 const h=b.toString('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function identity(input){
 const root_uuid=text(input.root_uuid,'root_uuid');
 const work_uuid=text(input.work_uuid,'work_uuid');
 if(!UUID.test(root_uuid)||!UUID.test(work_uuid))throw new TypeError('ROOT_OR_WORK_UUID_INVALID');
 return {
  root_uuid,work_uuid,
  generation_ref:text(input.generation_ref,'generation_ref'),
  project_ref:text(input.project_ref,'project_ref'),
  current_selector_ref:text(input.current_selector_ref,'current_selector_ref'),
 };
}
function contentBasis(input,id){
 return {
  identity:id,
  privacy_class:text(input.privacy_class||'INTERNAL','privacy_class',128),
  brief:input.brief??null,
  payload:input.payload??null,
  source_refs:refs(input.source_refs),
  denominator_ref:typeof input.denominator_ref==='string'&&input.denominator_ref.trim()?input.denominator_ref.trim():null,
  first_red:input.first_red??null,
  next_machine_action:typeof input.next_machine_action==='string'?input.next_machine_action:null,
 };
}

export function compileProjectionArray(input={}){
 const id=identity(input);
 if(!input.payload||typeof input.payload!=='object'||Array.isArray(input.payload))throw new TypeError('PAYLOAD_OBJECT_REQUIRED');
 if(input.brief!=null && (typeof input.brief!=='object'||Array.isArray(input.brief)))throw new TypeError('BRIEF_OBJECT_REQUIRED');
 const basis=contentBasis(input,id);
 const content_digest=sha(basis);
 const projection_uuid=deterministicUuid('xiio:projection-array',id.root_uuid,id.work_uuid,id.generation_ref,content_digest);
 const envelope=Object.freeze({
  schema:PROJECTION_ARRAY_SCHEMA,
  projection_uuid,
  ...id,
  privacy_class:basis.privacy_class,
  content_digest,
  brief:basis.brief,
  payload:basis.payload,
  source_refs:basis.source_refs,
  denominator_ref:basis.denominator_ref,
  first_red:basis.first_red,
  next_machine_action:basis.next_machine_action,
  authority_granted:false,
  provider_effect:false,
  hard:[
   'LOCAL_REPLICA!=SOURCE_TRUTH',
   'STUDIO_INDEX!=PAYLOAD_REPLICA',
   'CONTENT_DIGEST_MISMATCH=FAIL',
   'ONE_VALID_LOCAL_REPLICA_MAY_REPAIR_THE_OTHER',
   'TWO_DIVERGENT_VALID_REPLICAS=SPLIT_BRAIN',
   'PRIVATE_PAYLOAD!=STUDIO_INDEX_PAYLOAD',
   'ARRAY_READY!=WORKER_QUALIFIED'
  ]
 });
 const index=Object.freeze({
  schema:PROJECTION_INDEX_SCHEMA,
  projection_uuid,
  root_uuid:id.root_uuid,
  work_uuid:id.work_uuid,
  generation_ref:id.generation_ref,
  project_ref:id.project_ref,
  current_selector_ref:id.current_selector_ref,
  privacy_class:basis.privacy_class,
  content_digest,
  denominator_ref:basis.denominator_ref,
  first_red:basis.first_red,
  next_machine_action:basis.next_machine_action,
  source_ref_count:basis.source_refs.length,
  payload_included:false,
  authority_granted:false,
  provider_effect:false,
 });
 return Object.freeze({envelope,index});
}

function verifyEnvelope(envelope){
 if(!envelope||envelope.schema!==PROJECTION_ARRAY_SCHEMA)return {ok:false,reason:'SCHEMA'};
 let compiled;
 try{compiled=compileProjectionArray(envelope);}catch{return {ok:false,reason:'RECOMPILE'};}
 if(compiled.envelope.content_digest!==envelope.content_digest)return {ok:false,reason:'DIGEST'};
 if(compiled.envelope.projection_uuid!==envelope.projection_uuid)return {ok:false,reason:'UUID'};
 return {ok:true,compiled};
}
function arrayPaths({state_root,root_uuid,work_uuid,generation_ref}){
 const base=path.join(state_root||defaultStateRoot(),safeSeg(root_uuid),safeSeg(work_uuid),safeSeg(generation_ref));
 return {
  base,
  replica_a:path.join(base,'replica-a','current.json'),
  replica_b:path.join(base,'replica-b','current.json'),
  local_index:path.join(base,'studio-index.current.json'),
  receipt:path.join(base,'array-receipt.current.json'),
 };
}
function readJson(p){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}}

export function writeProjectionArray(compiledOrInput,opts={}){
 const compiled=compiledOrInput?.envelope?compiledOrInput:compileProjectionArray(compiledOrInput);
 const env=compiled.envelope,idx=compiled.index;
 const paths=arrayPaths({state_root:opts.state_root,root_uuid:env.root_uuid,work_uuid:env.work_uuid,generation_ref:env.generation_ref});
 const body=stable(env)+'\n';
 atomicWrite(paths.replica_a,body);
 atomicWrite(paths.replica_b,body);
 atomicWrite(paths.local_index,stable(idx)+'\n');
 let studio_index_state='LOCAL_INDEX_ONLY';
 let studio_index_path=null;
 if(opts.studio_index_path){
  studio_index_path=path.resolve(opts.studio_index_path);
  atomicWrite(studio_index_path,stable(idx)+'\n');
  studio_index_state='METADATA_INDEX_WRITTEN';
 }
 const receipt={
  schema:'xiio.sdk.local-projection-array-write-receipt/v1',
  projection_uuid:env.projection_uuid,
  content_digest:env.content_digest,
  root_uuid:env.root_uuid,work_uuid:env.work_uuid,generation_ref:env.generation_ref,
  replica_count:2,
  replica_paths:[paths.replica_a,paths.replica_b],
  local_index_path:paths.local_index,
  studio_index_path,
  studio_index_state,
  payload_replica_count:2,
  studio_payload_replica:false,
  provider_effect:false,
  authority_granted:false,
 };
 atomicWrite(paths.receipt,stable(receipt)+'\n');
 return Object.freeze(receipt);
}

export function readProjectionArray(input={}){
 const root_uuid=text(input.root_uuid,'root_uuid'),work_uuid=text(input.work_uuid,'work_uuid'),generation_ref=text(input.generation_ref,'generation_ref');
 if(!UUID.test(root_uuid)||!UUID.test(work_uuid))throw new TypeError('ROOT_OR_WORK_UUID_INVALID');
 const paths=arrayPaths({state_root:input.state_root,root_uuid,work_uuid,generation_ref});
 const rawA=readJson(paths.replica_a),rawB=readJson(paths.replica_b);
 const a=verifyEnvelope(rawA),b=verifyEnvelope(rawB);
 let selected=null,healed=[];
 if(a.ok&&b.ok){
  if(rawA.content_digest!==rawB.content_digest||rawA.projection_uuid!==rawB.projection_uuid){
   return Object.freeze({schema:PROJECTION_ARRAY_READBACK_SCHEMA,state:'SPLIT_BRAIN',root_uuid,work_uuid,generation_ref,provider_effect:false,authority_granted:false});
  }
  selected=rawA;
 }else if(a.ok){
  selected=rawA;
  if(input.auto_heal!==false){atomicWrite(paths.replica_b,stable(rawA)+'\n');healed.push('replica-b');}
 }else if(b.ok){
  selected=rawB;
  if(input.auto_heal!==false){atomicWrite(paths.replica_a,stable(rawB)+'\n');healed.push('replica-a');}
 }else{
  return Object.freeze({schema:PROJECTION_ARRAY_READBACK_SCHEMA,state:'NO_VALID_LOCAL_REPLICA',root_uuid,work_uuid,generation_ref,replica_a_reason:a.reason,replica_b_reason:b.reason,provider_effect:false,authority_granted:false});
 }
 const localIndex=readJson(paths.local_index);
 const externalIndex=input.studio_index_path?readJson(path.resolve(input.studio_index_path)):null;
 const index=externalIndex||localIndex;
 const indexState=!index?'INDEX_MISSING'
  :index.schema!==PROJECTION_INDEX_SCHEMA?'INDEX_INVALID'
  :index.content_digest!==selected.content_digest||index.projection_uuid!==selected.projection_uuid?'INDEX_DRIFT'
  :'INDEX_MATCH';
 const requireIndex=input.require_studio_index===true;
 const ready=indexState==='INDEX_MATCH'||(!requireIndex&&indexState==='INDEX_MISSING');
 const view=input.view==='payload'?selected.payload:selected.brief??{
  project_ref:selected.project_ref,
  denominator_ref:selected.denominator_ref,
  first_red:selected.first_red,
  next_machine_action:selected.next_machine_action,
  source_ref_count:selected.source_refs.length,
 };
 return Object.freeze({
  schema:PROJECTION_ARRAY_READBACK_SCHEMA,
  state:ready?'READY':'WAIT_INDEX_RECONCILIATION',
  projection_uuid:selected.projection_uuid,
  content_digest:selected.content_digest,
  root_uuid,work_uuid,generation_ref,
  valid_local_replicas:2,
  healed,
  studio_index_state:indexState,
  require_studio_index:requireIndex,
  view:input.view==='payload'?'PAYLOAD':'BRIEF',
  projection:view,
  provider_effect:false,
  authority_granted:false,
  worker_qualified:false,
  hard:['ARRAY_READBACK!=ONBOARDING_PASS','INDEX_MATCH!=SOURCE_TRUTH','HEALED_REPLICA!=NEW_GENERATION']
 });
}

export function corruptProjectionReplicaForTest(input={}){
 const root_uuid=text(input.root_uuid,'root_uuid'),work_uuid=text(input.work_uuid,'work_uuid'),generation_ref=text(input.generation_ref,'generation_ref');
 const paths=arrayPaths({state_root:input.state_root,root_uuid,work_uuid,generation_ref});
 const target=input.replica==='b'?paths.replica_b:paths.replica_a;
 atomicWrite(target,'{"corrupt":true}\n');
 return {target,provider_effect:false};
}
