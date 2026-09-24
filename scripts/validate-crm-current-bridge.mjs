import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readLocalCrmCurrent,resolveInboxCrmSurface,readAriesPhysicalCrmReceipt} from '../src/bridges/crm-current.mjs';

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
  const priorReceipt=process.env.XIIO_CRM_EGRESS_RECEIPT;
  process.env.XIIO_INBOX_REPO=tmp;
  const receiptPath=path.join(tmp,'latest-crm-egress.json');
  process.env.XIIO_CRM_EGRESS_RECEIPT=receiptPath;
  try{
    const surface=resolveInboxCrmSurface();
    assert.equal(surface.state,'PASS');
    const noReceipt=readLocalCrmCurrent({root:'SEARCH_PROJECT_CURRENT',requireIds:['KR-SEARCH-LOCAL-FIRST-CRM-20260921'],hostRef:'aries'});
    assert.equal(noReceipt.state,'PASS_WITH_WAITS');
    assert.equal(noReceipt.semantic_state,'PASS');
    assert.equal(noReceipt.physical_delivery.state,'TRUE_WAIT');
    assert.equal(noReceipt.physical_delivery.first_red,'ARIES_LOCAL_PACKET_RECEIPT_MISSING');

    fs.writeFileSync(receiptPath,JSON.stringify({
      schema:'xiio.dogfood-crm-egress-receipt/v2',
      observed_at:'2026-09-24T11:00:00Z',
      source_workflow_run_id:'12345',
      physical_receipt_digest:'sha256:'+'a'.repeat(64),
      dogfood_result_ref:'dogfood:12345',
      consumption_id:'consume:12345',
      consumption_digest:'sha256:'+'b'.repeat(64),
      crm_message_id:'crm:msg:12345',
      report_ref:'report:12345',
      payload_ref:'payload:12345',
      source_generation:'g1',
      flatpack_packet_id:'flatpack:test',
      flatpack_generation:'g1',
      flatpack_semantic_digest:'c'.repeat(64),
      flatpack_blast_radius_digest:'d'.repeat(64),
      provider_effect:false,
      delivery_mode:'LOCAL_CONTROL_LOOP',
      readback:'PASS_EXACT_FLATPACK_LOCAL_CRM_DURABLE',
      closure_credit:false,
      apply_return:'PENDING'
    })+'\n');

    const physical=readAriesPhysicalCrmReceipt({hostRef:'aries'});
    assert.equal(physical.state,'PASS');
    assert.equal(physical.receipt.flatpack_packet_id,'flatpack:test');
    assert.equal(physical.receipt.flatpack_generation,'g1');
    assert.equal(physical.receipt.flatpack_semantic_digest,'c'.repeat(64));
    assert.equal(physical.receipt.flatpack_blast_radius_digest,'d'.repeat(64));
    assert.equal(physical.receipt.apply_return,'PENDING');
    assert.equal(physical.receipt.closure_credit,false);

    const out=readLocalCrmCurrent({root:'SEARCH_PROJECT_CURRENT',requireIds:['KR-SEARCH-LOCAL-FIRST-CRM-20260921'],hostRef:'aries'});
    assert.equal(out.state,'PASS');
    assert.equal(out.semantic_state,'PASS');
    assert.equal(out.physical_delivery.state,'PASS');
    assert.equal(out.result.root_id,'SEARCH_PROJECT_CURRENT');
    assert.deepEqual(out.result.required_ids,['KR-SEARCH-LOCAL-FIRST-CRM-20260921']);
    assert.equal(out.semantic_owner_ref,'Vado42-chris/xi-io-Inbox:server/crm-knowledge-returns.mjs');
    assert.equal(out.provider_effect,false);
    assert.equal(out.work_authority,false);
    assert.ok(out.hard.includes('CRM_CURRENT_BEFORE_PROVIDER_ARCHAEOLOGY'));
  }finally{
    if(prior===undefined) delete process.env.XIIO_INBOX_REPO; else process.env.XIIO_INBOX_REPO=prior;
    if(priorReceipt===undefined) delete process.env.XIIO_CRM_EGRESS_RECEIPT; else process.env.XIIO_CRM_EGRESS_RECEIPT=priorReceipt;
  }
  console.log(JSON.stringify({schema:'xiio.sdk.crm-current-bridge-check/v1',result:'PASS',owner:'Inbox CRM',aries_physical_gate:true,no_receipt_is_not_green:true,provider_effect:false,authority_granted:false}));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
