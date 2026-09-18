#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileLegalBinaryPackage } from '../src/legal/binary-package.mjs';

const fact=(id,overrides={})=>({
  fact_id:id,
  question:`Is ${id} true?`,
  answer:'YES',
  required_bit:1,
  material_bit:1,
  owner_ref:`owner:${id}`,
  work_ref:'work:legal',
  source_refs:[`source:${id}`],
  source_generation:'source:g1',
  issue_refs:['issue:family-law'],
  consumer_refs:['consumer:package'],
  effect_class:'NONE',
  currentness:'CURRENT',
  priority_rank:100,
  ...overrides
});

const item=(id,required_fact_ids,overrides={})=>({
  item_id:id,
  path_ref:`package/${id}.pdf`,
  role:'COURT_ARTIFACT',
  required_bit:1,
  present_bit:1,
  current_bit:1,
  source_bound_bit:1,
  consumer_bound_bit:1,
  owner_gate_bit:0,
  executed_bit:0,
  required_fact_ids,
  evidence_refs:[`evidence:${id}`],
  ...overrides
});

const base=()=>({
  schema:'xiio.sdk.legal-binary-package-input/v1',
  root_ref:'case:DIV-SA-00005-2026',
  root_generation:'case:g1',
  user_ref:'user:respondent',
  product_ref:'sam_law',
  studio_root_ref:'studio:root',
  ack_ref:'ack:sam-law',
  ack_generation:'ack:g1',
  ack_current_bit:1,
  sdk_ref:'sdk:@xi-io/sdk',
  sdk_generation:'0c4ec54ab740a4eb441e9bd737c3607f06bcbe61',
  sdk_current_bit:1,
  running_consumption_bit:1,
  work_ref:'work:legal',
  scale:'META',
  five_d:{WHERE:'case:DIV-SA-00005-2026',WHAT:'legal-package-acceptance',HOW_WHO:'headless-sdk+ibal',WHEN:'generation:g1',WHY:'court-deadline-owner-outcome'},
  impact_assessment_ref:'impact:legal-package:g1',
  package_owner_ref:'owner:sam-law-package',
  facts:[fact('identity'),fact('affidavit')],
  package_items:[item('written-argument',['identity']),item('affidavit',['affidavit'])],
});

let checks=0;
const out=compileLegalBinaryPackage(base());
assert.equal(out.schema,'xiio.sdk.legal-binary-package/v1'); checks++;
assert.equal(out.scale,'META'); checks++;
assert.equal(out.five_d.WHAT,'legal-package-acceptance'); checks++;
assert.equal(out.fact_denominator,2); checks++;
assert.equal(out.dataforge_record_denominator,2); checks++;
assert.equal(out.ack_trinity.trinity_accounting_100,true); checks++;
assert.equal(out.package_rows.every(r=>r.state==='PASS'),true); checks++;
assert.equal(out.gate_pass,true); checks++;
assert.equal(out.silent_remainder,0); checks++;
assert.equal(new Set(out.dataforge_records.map(r=>r.dataforge_event_uuid)).size,2); checks++;
assert.equal(out.provider_effect,false); checks++;
assert.equal(out.legal_effect,false); checks++;

const unknown=base();
unknown.facts[1]=fact('affidavit',{answer:'ASK_MORE_DETAILS',source_refs:[],currentness:'UNKNOWN',effect_class:'OWNER',user_choice_bit:1,priority_rank:5});
const unknownOut=compileLegalBinaryPackage(unknown);
assert.equal(unknownOut.gate_pass,false); checks++;
assert.equal(unknownOut.first_red.wake_id,'FACT:affidavit'); checks++;
assert.equal(unknownOut.first_red.priority_rank,5); checks++;
assert.equal(unknownOut.first_red.kind,'SOURCE_OR_OWNER'); checks++;
assert.equal(unknownOut.owner_review_ready,true); checks++;
assert.equal(unknownOut.dataforge_records.find(r=>r.fact_id==='affidavit').known_bit,0); checks++;


const priority=base();
priority.facts[0]=fact('z-last',{answer:'ASK_MORE_DETAILS',source_refs:[],currentness:'UNKNOWN',priority_rank:1});
priority.facts[1]=fact('a-first',{answer:'ASK_MORE_DETAILS',source_refs:[],currentness:'UNKNOWN',priority_rank:50});
priority.package_items=[item('one',['z-last']),item('two',['a-first'])];
const priorityOut=compileLegalBinaryPackage(priority);
assert.equal(priorityOut.first_red.wake_id,'FACT:z-last'); checks++;
assert.equal(priorityOut.first_red.priority_rank,1); checks++;

const noFact=base();
noFact.facts[1]=fact('affidavit',{answer:'NO'});
const noFactOut=compileLegalBinaryPackage(noFact);
assert.equal(noFactOut.gate_pass,false); checks++;
assert.equal(noFactOut.package_rows.find(r=>r.item_id==='affidavit').state,'FAIL'); checks++;

const missingItem=base();
missingItem.package_items[1]=item('affidavit',['affidavit'],{present_bit:0});
const missingItemOut=compileLegalBinaryPackage(missingItem);
assert.equal(missingItemOut.gate_pass,false); checks++;
assert.equal(missingItemOut.owner_review_ready,false); checks++;
assert(missingItemOut.hotfolder_wakes.some(w=>w.wake_id==='ITEM:affidavit')); checks++;

const badMeso=base(); badMeso.scale='MESO'; badMeso.parent_ref=null;
assert.throws(()=>compileLegalBinaryPackage(badMeso),/parent_ref required below META/); checks++;

const badFiveD=base(); delete badFiveD.five_d.WHY;
assert.throws(()=>compileLegalBinaryPackage(badFiveD),/five_d.WHY required/); checks++;

const staleSdk=base(); staleSdk.sdk_current_bit=0;
assert.throws(()=>compileLegalBinaryPackage(staleSdk),/fresh SDK required/); checks++;

const staleAck=base(); staleAck.ack_current_bit=0;
assert.throws(()=>compileLegalBinaryPackage(staleAck),/fresh ACK required/); checks++;

const notRunning=base(); notRunning.running_consumption_bit=0;
assert.throws(()=>compileLegalBinaryPackage(notRunning),/running ACK\/SDK consumption required/); checks++;

const knownWithoutSource=base();
knownWithoutSource.facts[0]=fact('identity',{source_refs:[]});
assert.throws(()=>compileLegalBinaryPackage(knownWithoutSource),/known fact requires source_refs/); checks++;

const duplicateFact=base();
duplicateFact.facts.push(fact('identity'));
assert.throws(()=>compileLegalBinaryPackage(duplicateFact),/duplicate fact_id/); checks++;

const unknownFactRef=base();
unknownFactRef.package_items[0].required_fact_ids=['missing'];
assert.throws(()=>compileLegalBinaryPackage(unknownFactRef),/unknown required fact/); checks++;

const deterministic=base();
const a=compileLegalBinaryPackage(deterministic);
const b=compileLegalBinaryPackage(structuredClone(deterministic));
assert.deepEqual(a.dataforge_records.map(r=>r.dataforge_event_uuid),b.dataforge_records.map(r=>r.dataforge_event_uuid)); checks++;

const forged=base();
forged.authority_granted=true;
forged.provider_effect=true;
const forgedOut=compileLegalBinaryPackage(forged);
assert.equal(forgedOut.provider_effect,false); checks++;
assert.equal(forgedOut.legal_effect,false); checks++;

console.log(JSON.stringify({
  schema:'xiio.sdk.legal-binary-package-validation/v1',
  result:'PASS',
  checks,
  hostiles:10,
  fact_denominator:out.fact_denominator,
  dataforge_records:out.dataforge_record_denominator,
  package_items:out.package_item_denominator,
  silent_remainder:out.silent_remainder,
  provider_effect:false,
  legal_effect:false
}));
