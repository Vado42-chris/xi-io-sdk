import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

function text(v){return String(v??'').trim();}
function readJsonMaybe(file){
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}
}
function readAriesPhysicalCrmReceipt({hostRef=null}={}){
  const host=text(hostRef||process.env.XIIO_MACHINE_REF||os.hostname().split('.')[0]).toLowerCase();
  const receiptPath=text(process.env.XIIO_CRM_EGRESS_RECEIPT)
    || path.join(process.env.XDG_STATE_HOME||path.join(os.homedir(),'.local','state'),'xi-io','dogfood-babysit','latest-crm-egress.json');
  const receipt=readJsonMaybe(receiptPath);
  if(host!=='aries'){
    return Object.freeze({
      state:'TRUE_WAIT',
      first_red:'PHYSICAL_CRM_TRUTH_REQUIRES_ARIES_HOST',
      host_ref:host||null,
      receipt_path:receiptPath,
      receipt:null,
    });
  }
  if(!receipt){
    return Object.freeze({
      state:'TRUE_WAIT',
      first_red:'ARIES_LOCAL_PACKET_RECEIPT_MISSING',
      host_ref:host,
      receipt_path:receiptPath,
      receipt:null,
    });
  }
  const schemaOk=receipt.schema==='xiio.dogfood-crm-egress-receipt/v2';
  const deliveryOk=receipt.delivery_mode==='LOCAL_CONTROL_LOOP';
  const readbackOk=receipt.readback==='PASS_EXACT_FLATPACK_LOCAL_CRM_DURABLE';
  const messageOk=Boolean(text(receipt.crm_message_id));
  const physicalDigestOk=/^sha256:[a-f0-9]{64}$/i.test(text(receipt.physical_receipt_digest));
  const consumptionDigestOk=/^sha256:[a-f0-9]{64}$/i.test(text(receipt.consumption_digest));
  const sourceGenerationOk=Boolean(text(receipt.source_generation));
  const flatpackPacketOk=Boolean(text(receipt.flatpack_packet_id));
  const flatpackGenerationOk=Boolean(text(receipt.flatpack_generation));
  const flatpackSemanticOk=/^[a-f0-9]{64}$/i.test(text(receipt.flatpack_semantic_digest));
  const flatpackBlastOk=/^[a-f0-9]{64}$/i.test(text(receipt.flatpack_blast_radius_digest));
  const pass=schemaOk&&deliveryOk&&readbackOk&&messageOk&&physicalDigestOk&&consumptionDigestOk&&sourceGenerationOk&&flatpackPacketOk&&flatpackGenerationOk&&flatpackSemanticOk&&flatpackBlastOk;
  return Object.freeze({
    state:pass?'PASS':'FAIL',
    first_red:pass?null:
      !schemaOk?'CRM_EGRESS_RECEIPT_SCHEMA_INVALID':
      !deliveryOk?'CRM_DELIVERY_MODE_INVALID':
      !readbackOk?'CRM_LOCAL_READBACK_INVALID':
      !messageOk?'CRM_MESSAGE_ID_MISSING':
      !physicalDigestOk?'CRM_PHYSICAL_RECEIPT_DIGEST_INVALID':
      !consumptionDigestOk?'CRM_CONSUMPTION_DIGEST_INVALID':
      !sourceGenerationOk?'CRM_SOURCE_GENERATION_MISSING':
      !flatpackPacketOk?'CRM_FLATPACK_PACKET_ID_MISSING':
      !flatpackGenerationOk?'CRM_FLATPACK_GENERATION_MISSING':
      !flatpackSemanticOk?'CRM_FLATPACK_SEMANTIC_DIGEST_INVALID':
      'CRM_FLATPACK_BLAST_RADIUS_DIGEST_INVALID',
    host_ref:host,
    receipt_path:receiptPath,
    receipt:pass?Object.freeze({
      source_workflow_run_id:receipt.source_workflow_run_id??null,
      crm_message_id:receipt.crm_message_id,
      source_generation:receipt.source_generation,
      physical_receipt_digest:receipt.physical_receipt_digest,
      consumption_digest:receipt.consumption_digest,
      report_ref:receipt.report_ref??null,
      payload_ref:receipt.payload_ref??null,
      flatpack_packet_id:receipt.flatpack_packet_id,
      flatpack_generation:receipt.flatpack_generation,
      flatpack_semantic_digest:receipt.flatpack_semantic_digest,
      flatpack_blast_radius_digest:receipt.flatpack_blast_radius_digest,
      apply_return:receipt.apply_return??null,
      closure_credit:receipt.closure_credit===true,
      observed_at:receipt.observed_at??null,
    }):null,
  });
}
function candidates(cwd=process.cwd()){
  return [
    process.env.XIIO_INBOX_REPO,
    process.env.INBOX_REPO,
    path.resolve(cwd,'..','xi-io-Inbox'),
    path.resolve(cwd,'..','003_xi-io_Inbox'),
    path.resolve(cwd,'..','003_xi-io-Inbox'),
    '/media/chrishallberg/Storage 22/999_Work/003_Projects/xi-io-Inbox',
    '/media/chrishallberg/Storage 22/999_Work/003_Projects/003_xi-io-Inbox'
  ].filter(Boolean);
}
export function resolveInboxCrmSurface({cwd=process.cwd()}={}){
  const tried=candidates(cwd);
  for(const repo of tried){
    const script=path.join(repo,'scripts','crm-knowledge-current.mjs');
    const semantic=path.join(repo,'server','crm-knowledge-returns.mjs');
    if(fs.existsSync(path.join(repo,'package.json'))&&fs.existsSync(script)&&fs.existsSync(semantic)){
      return Object.freeze({state:'PASS',repo,script,semantic_owner_ref:'Vado42-chris/xi-io-Inbox:server/crm-knowledge-returns.mjs',tried});
    }
  }
  return Object.freeze({state:'TRUE_WAIT',reason:'INBOX_CRM_SURFACE_NOT_FOUND',tried});
}
export function readLocalCrmCurrent({root=null,limit=null,requireIds=[],cwd=process.cwd(),hostRef=null}={}){
  const found=resolveInboxCrmSurface({cwd});
  const physical_delivery=readAriesPhysicalCrmReceipt({hostRef});
  if(found.state!=='PASS'){
    return Object.freeze({
      schema:'xiio.sdk.crm-current-bridge/v1',
      state:'TRUE_WAIT',
      reason:found.reason,
      tried:found.tried,
      provider_effect:false,
      work_authority:false,
      authority_granted:false
    });
  }
  const args=[];
  if(text(root)) args.push('--root',text(root));
  if(Number.isInteger(limit)&&limit>0) args.push('--limit',String(limit));
  const ids=Array.isArray(requireIds)?requireIds.map(text).filter(Boolean):String(requireIds||'').split(',').map(text).filter(Boolean);
  if(ids.length) args.push('--require',ids.join(','));
  const result=spawnSync(process.execPath,[found.script,...args],{
    cwd:found.repo,encoding:'utf8',timeout:30_000,env:process.env
  });
  let payload=null;
  try{payload=JSON.parse((result.stdout||'').trim());}catch{}
  const semantic_state=result.status===0?'PASS':'TRUE_WAIT';
  const state=semantic_state!=='PASS'?'TRUE_WAIT':physical_delivery.state==='PASS'?'PASS':'PASS_WITH_WAITS';
  return Object.freeze({
    schema:'xiio.sdk.crm-current-bridge/v1',
    state,
    semantic_state,
    inbox_repo:found.repo,
    semantic_owner_ref:found.semantic_owner_ref,
    read_surface:'scripts/crm-knowledge-current.mjs',
    root:text(root)||null,
    required_ids:ids,
    result:payload,
    physical_delivery,
    stdout:payload?null:(result.stdout||'').trim(),
    stderr:(result.stderr||'').trim(),
    provider_effect:false,
    work_authority:false,
    authority_granted:false,
    hard:Object.freeze([
      'CLI_EXPOSES_OPERATION__CRM_OWNS_SEMANTICS',
      'CRM_CURRENT_BEFORE_PROVIDER_ARCHAEOLOGY',
      'CRM_READ!=WORK_AUTHORITY',
      'EMPTY_CURRENT!=PROVEN_NO_LESSONS',
      'RESULT!=RETURN!=APPLY_RETURN',
      'CRM_SOURCE_CURRENT != ARIES_PHYSICAL_PACKET_DELIVERY',
      'CRM_MESSAGE_ID != PACKET_TRUTH',
      'ARIES_PHYSICAL_TRUTH_REQUIRES_LOCAL_DURABLE_READBACK',
      'NO_LOCAL_RECEIPT != PASS',
      'APPLY_RETURN_PENDING != LOOP_CLOSED'
    ])
  });
}

export { readAriesPhysicalCrmReceipt };
