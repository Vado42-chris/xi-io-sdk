import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readLocalCrmCurrent,resolveInboxCrmSurface} from '../src/bridges/crm-current.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-sdk-crm-'));
try{
  fs.mkdirSync(path.join(tmp,'server'),{recursive:true});
  fs.mkdirSync(path.join(tmp,'scripts'),{recursive:true});
  fs.writeFileSync(path.join(tmp,'package.json'),'{}\n');
  fs.writeFileSync(path.join(tmp,'server','crm-knowledge-returns.mjs'),'export const owner=true;\n');
  fs.writeFileSync(path.join(tmp,'scripts','crm-knowledge-current.mjs'),`
const a=process.argv.slice(2);const ri=a.indexOf('--root');const qi=a.indexOf('--require');
console.log(JSON.stringify({schema:'xiio.crm.knowledge-current-read/v1',ok:true,state:'CURRENT_KNOWLEDGE_PRESENT',root_id:ri>=0?a[ri+1]:null,required_ids:qi>=0?a[qi+1].split(','):[],required_ids_present:true,provider_effect:false}));
`);
  const prior=process.env.XIIO_INBOX_REPO;
  process.env.XIIO_INBOX_REPO=tmp;
  try{
    const surface=resolveInboxCrmSurface();
    assert.equal(surface.state,'PASS');
    const out=readLocalCrmCurrent({root:'SEARCH_PROJECT_CURRENT',requireIds:['KR-SEARCH-LOCAL-FIRST-CRM-20260921']});
    assert.equal(out.state,'PASS');
    assert.equal(out.result.root_id,'SEARCH_PROJECT_CURRENT');
    assert.deepEqual(out.result.required_ids,['KR-SEARCH-LOCAL-FIRST-CRM-20260921']);
    assert.equal(out.semantic_owner_ref,'Vado42-chris/xi-io-Inbox:server/crm-knowledge-returns.mjs');
    assert.equal(out.provider_effect,false);
    assert.equal(out.work_authority,false);
    assert.ok(out.hard.includes('CRM_CURRENT_BEFORE_PROVIDER_ARCHAEOLOGY'));
  }finally{
    if(prior===undefined) delete process.env.XIIO_INBOX_REPO; else process.env.XIIO_INBOX_REPO=prior;
  }
  console.log(JSON.stringify({schema:'xiio.sdk.crm-current-bridge-check/v1',result:'PASS',owner:'Inbox CRM',provider_effect:false,authority_granted:false}));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
