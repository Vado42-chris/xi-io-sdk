import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

function text(v){return String(v??'').trim();}
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
export function readLocalCrmCurrent({root=null,limit=null,requireIds=[],cwd=process.cwd()}={}){
  const found=resolveInboxCrmSurface({cwd});
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
  return Object.freeze({
    schema:'xiio.sdk.crm-current-bridge/v1',
    state:result.status===0?'PASS':'TRUE_WAIT',
    inbox_repo:found.repo,
    semantic_owner_ref:found.semantic_owner_ref,
    read_surface:'scripts/crm-knowledge-current.mjs',
    root:text(root)||null,
    required_ids:ids,
    result:payload,
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
      'RESULT!=RETURN!=APPLY_RETURN'
    ])
  });
}
