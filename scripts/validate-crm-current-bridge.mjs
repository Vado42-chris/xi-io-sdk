import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readLocalCrmCurrent,resolveInboxCrmSurface,readAriesPhysicalCrmReceipt} from '../src/bridges/crm-current.mjs';

const bridgeSource=fs.readFileSync(new URL('../src/bridges/crm-current.mjs',import.meta.url),'utf8');
assert.doesNotMatch(bridgeSource,/\/media\/|Storage 22|chrishallberg|Vado42-chris\/xi-io-Inbox/,'reusable CRM bridge must not embed one tenant or workstation');
assert.doesNotMatch(bridgeSource,/\bspawnSync\b|\bexecFileSync\b|\bexecSync\b/,'SDK CRM reader must not launch caller-selected repository code');

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
  const priorLegacy=process.env.INBOX_REPO;
  const priorOwner=process.env.XIIO_CRM_SEMANTIC_OWNER_REF;
  const priorReceipt=process.env.XIIO_CRM_EGRESS_RECEIPT;
  delete process.env.INBOX_REPO;
  delete process.env.XIIO_CRM_SEMANTIC_OWNER_REF;
  delete process.env.XIIO_INBOX_REPO;
  assert.deepEqual(resolveInboxCrmSurface().tried,[], 'unbound SDK must not search sibling or personal paths');
  assert.equal(resolveInboxCrmSurface().reason,'INBOX_CRM_REPO_UNBOUND');
  process.env.XIIO_INBOX_REPO=tmp;
  assert.equal(resolveInboxCrmSurface().reason,'INBOX_CRM_SEMANTIC_OWNER_UNBOUND');
  process.env.XIIO_CRM_SEMANTIC_OWNER_REF='tenant/example-crm:server/crm-knowledge-returns.mjs';
  process.env.INBOX_REPO=path.join(tmp,'foreign-tenant');
  assert.equal(resolveInboxCrmSurface().reason,'INBOX_CRM_REPO_BINDING_AMBIGUOUS', 'conflicting producer roots must not choose first');
  delete process.env.INBOX_REPO;
  const receiptPath=path.join(tmp,'latest-crm-egress.json');
  process.env.XIIO_CRM_EGRESS_RECEIPT=receiptPath;
  try{
    const surface=resolveInboxCrmSurface();
    assert.equal(surface.state,'TRUE_WAIT');
    assert.equal(surface.reason,'CRM_INSTALLED_ADAPTER_ADMISSION_REQUIRED');
    assert.equal(surface.owner_binding_state,'SUPPLIED_UNVERIFIED');
    assert.equal(surface.executable,false);
    const noReceipt=readLocalCrmCurrent({root:'SEARCH_PROJECT_CURRENT',requireIds:['KR-SEARCH-LOCAL-FIRST-CRM-20260921'],hostRef:'aries'});
    assert.equal(noReceipt.state,'TRUE_WAIT');
    assert.equal(noReceipt.semantic_state,'SUPPLIED_UNVERIFIED');
    assert.equal(noReceipt.reason,'CRM_INSTALLED_ADAPTER_ADMISSION_REQUIRED');
    assert.equal(noReceipt.result,null);
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
    })+'\n',{mode:0o600});

    const physical=readAriesPhysicalCrmReceipt({hostRef:'aries'});
    assert.equal(physical.state,'SUPPLIED_UNVERIFIED');
    assert.equal(physical.first_red,'AUTHENTICATED_NATIVE_CRM_READBACK_REQUIRED');
    assert.equal(physical.receipt.native_readback_authenticated,false);
    assert.equal(Object.hasOwn(physical,'receipt_path'),false);
    assert.equal(physical.receipt.evidence_class,'LOCAL_PRIVATE_CRM_EGRESS_RECEIPT_CANDIDATE');
    assert.equal(physical.receipt.flatpack_generation,'g1');
    assert.equal(physical.receipt.flatpack_semantic_digest,'c'.repeat(64));
    assert.equal(physical.receipt.flatpack_blast_radius_digest,'d'.repeat(64));
    assert.equal(physical.receipt.native_readback_authenticated,false);
    assert.equal(physical.receipt.closure_credit,false);
    assert.equal(readAriesPhysicalCrmReceipt({hostRef:'aries'}).state,'SUPPLIED_UNVERIFIED');
    fs.chmodSync(receiptPath,0o644);
    assert.equal(readAriesPhysicalCrmReceipt({hostRef:'aries'}).state,'TRUE_WAIT');
    fs.chmodSync(receiptPath,0o600);
    const symlinkPath=path.join(tmp,'receipt.symlink.json');
    fs.symlinkSync(receiptPath,symlinkPath);
    process.env.XIIO_CRM_EGRESS_RECEIPT=symlinkPath;
    assert.equal(readAriesPhysicalCrmReceipt({hostRef:'aries'}).state,'TRUE_WAIT');
    process.env.XIIO_CRM_EGRESS_RECEIPT=receiptPath;
    assert.equal(readAriesPhysicalCrmReceipt({hostRef:'loki'}).state,'TRUE_WAIT');
    assert.equal(readAriesPhysicalCrmReceipt({hostRef:'aries'}).state,'SUPPLIED_UNVERIFIED');

    const out=readLocalCrmCurrent({root:'SEARCH_PROJECT_CURRENT',requireIds:['KR-SEARCH-LOCAL-FIRST-CRM-20260921'],hostRef:'aries'});
    assert.equal(out.state,'TRUE_WAIT');
    assert.equal(out.semantic_state,'SUPPLIED_UNVERIFIED');
    assert.equal(out.physical_delivery.state,'SUPPLIED_UNVERIFIED');
    assert.equal(out.result,null);
    assert.equal(out.root,'SEARCH_PROJECT_CURRENT');
    assert.deepEqual(out.required_ids,['KR-SEARCH-LOCAL-FIRST-CRM-20260921']);
    assert.equal(out.semantic_owner_ref,'tenant/example-crm:server/crm-knowledge-returns.mjs');
    assert.equal(out.provider_effect,false);
    assert.equal(out.work_authority,false);
    assert.equal(out.executable,false);
    assert.ok(out.hard.includes('SUPPLIED_OWNER_REF_NOT_EXECUTION_ADMISSION'));

    // The caller can point at any folder and forge the semantic owner string.
    // Neither those strings nor a forged authenticated flag may launch Node.
    const sentinel=path.join(tmp,'crm-hostile-executed.txt');
    fs.writeFileSync(path.join(tmp,'scripts','crm-knowledge-current.mjs'),`
import fs from 'node:fs';
fs.writeFileSync(${JSON.stringify(sentinel)},process.env.XIIO_TEST_SENTINEL||'missing');
console.log(JSON.stringify({state:'PASS',authority_granted:true}));
`);
    const hostileEnv={XIIO_INBOX_REPO:tmp,XIIO_CRM_SEMANTIC_OWNER_REF:'candidate:owner',XIIO_TEST_SENTINEL:'synthetic-only'};
    for(const [name,variation] of [
      ['caller_selected_root',{}],
      ['forged_semantic_owner',{semanticOwnerRef:'forged:owner'}],
      ['wrong_workspace',{root:'foreign-workspace'}],
      ['revoked_adapter',{adapterAdmission:{state:'REVOKED',authenticated:false}}],
      ['forged_admission',{adapterAdmission:{state:'PASS',authenticated:true,ward_granted:true}}],
    ]){
      const hostile=readLocalCrmCurrent({root:'current-workspace',repoRoot:tmp,
        semanticOwnerRef:'candidate:owner',hostRef:'loki',env:hostileEnv,...variation});
      assert.equal(fs.existsSync(sentinel),false,`UNVERIFIED_CRM_REPO_MUST_NEVER_EXECUTE:${name}`);
      assert.equal(hostile.state,'TRUE_WAIT',name);
      assert.equal(hostile.executable,false,name);
      assert.equal(hostile.result,null,name);
      assert.equal(hostile.authority_granted,false,name);
    }
  }finally{
    if(prior===undefined) delete process.env.XIIO_INBOX_REPO; else process.env.XIIO_INBOX_REPO=prior;
    if(priorLegacy===undefined) delete process.env.INBOX_REPO; else process.env.INBOX_REPO=priorLegacy;
    if(priorOwner===undefined) delete process.env.XIIO_CRM_SEMANTIC_OWNER_REF; else process.env.XIIO_CRM_SEMANTIC_OWNER_REF=priorOwner;
    if(priorReceipt===undefined) delete process.env.XIIO_CRM_EGRESS_RECEIPT; else process.env.XIIO_CRM_EGRESS_RECEIPT=priorReceipt;
  }
  console.log(JSON.stringify({schema:'xiio.sdk.crm-current-bridge-check/v1',result:'PASS',owner:'Inbox CRM',aries_physical_gate:true,no_receipt_is_not_green:true,hostile_execution_attempts:5,provider_effect:false,authority_granted:false}));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
