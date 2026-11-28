import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {
  runWhiteLabelHostileHarness, assertWhiteLabelHostileHarness,
  HostileHarnessError,
} from '../src/evaluation/hostile-harness.mjs';

const subjects=[
  {product_ref:'product:alpha',tenant_ref:'tenant:alpha',resource_ref:'resource:alpha'},
  {product_ref:'product:beta',tenant_ref:'tenant:beta',resource_ref:'resource:beta'},
];
const compileFixture=s=>({
  ...s,
  grant_tenant_ref:s.tenant_ref,
  readback_generation:'generation:current',
  expected_generation:'generation:current',
  ward_admitted:true,
  readback_independent:true,
  uncertain_write:false,
  automatic_retry:false,
  execution_mode:'synthetic',
  installed_host_verified:false,
});
const validate=(v,s)=>{
  const errors=[];
  if(v.product_ref!==s.product_ref || v.tenant_ref!==s.tenant_ref ||
     v.resource_ref!==s.resource_ref || v.grant_tenant_ref!==s.tenant_ref)
    errors.push('TENANT_OR_PRODUCT_DRIFT');
  if(v.readback_generation!==v.expected_generation || v.readback_independent!==true)
    errors.push('READBACK_UNVERIFIED');
  if(v.ward_admitted!==true) errors.push('WARD_ADMISSION_MISSING');
  if(v.uncertain_write && v.automatic_retry) errors.push('UNCERTAIN_WRITE_RETRY');
  if(v.execution_mode==='synthetic' && v.installed_host_verified===true)
    errors.push('FIXTURE_HOST_PROMOTION');
  return errors;
};
const families=[
 {id:'TENANT',count:10,expected_codes:['TENANT_OR_PRODUCT_DRIFT'],
  mutate:(v,i)=>{v.grant_tenant_ref='tenant:foreign-'+i;}},
 {id:'READBACK',count:10,expected_codes:['READBACK_UNVERIFIED'],
  mutate:(v,i)=>{v.readback_generation='generation:stale-'+i;}},
 {id:'WARD',count:10,expected_codes:['WARD_ADMISSION_MISSING'],
  mutate:(v,i)=>{v.ward_admitted='unverified-'+i;}},
 {id:'RETRY',count:10,expected_codes:['UNCERTAIN_WRITE_RETRY'],
  mutate:(v,i)=>{v.uncertain_write=true;v.automatic_retry=true;v.retry_nonce=i;}},
 {id:'HOST',count:10,expected_codes:['FIXTURE_HOST_PROMOTION'],
  mutate:(v,i)=>{v.installed_host_verified=true;v.attempt_nonce=i;}},
];

test('same universal hostile families execute for two distinct products and tenants',()=>{
 const result=runWhiteLabelHostileHarness({subjects,compileFixture,validate,families});
 assert.equal(assertWhiteLabelHostileHarness(result).strict_pass,true);
 assert.equal(result.subject_count,2);
 assert.equal(result.denominator,100);
 assert.equal(result.rejected,100);
 assert.equal(result.false_green,0);
 assert.equal(result.no_op_mutations,0);
 assert.equal(result.diversity_failures,0);
 assert.equal(result.installed_host_verified,false);
 assert.equal(result.authority_granted,false);
 assert.deepEqual(result.results.map(r=>r.subject.product_ref),['product:alpha','product:beta']);
});

test('single product, repeated brand and repeated tenant cannot claim universal coverage',()=>{
 const call=subjects=>runWhiteLabelHostileHarness({subjects,compileFixture,validate,families});
 assert.throws(()=>call(subjects.slice(0,1)),/WHITE_LABEL_SUBJECT_DENOMINATOR_REQUIRED/);
 assert.throws(()=>call([subjects[0],{...subjects[1],product_ref:subjects[0].product_ref}]),/WHITE_LABEL_SUBJECT_REUSED/);
 assert.throws(()=>call([subjects[0],{...subjects[1],tenant_ref:subjects[0].tenant_ref}]),/WHITE_LABEL_SUBJECT_REUSED/);
});

test('fixture substitution, unsupported identity and accessor must refuse before any evaluator runs',()=>{
 let evaluated=0;
 const refusing=subjects=>runWhiteLabelHostileHarness({
  subjects,compileFixture:s=>{evaluated++;return {...compileFixture(s),tenant_ref:'tenant:substituted'};},
  validate,families,
 });
 assert.throws(()=>refusing(subjects),/WHITE_LABEL_FIXTURE_IDENTITY_MISMATCH/);
 assert.equal(evaluated,1);
 const hostile={...subjects[0]};
 Object.defineProperty(hostile,'product_ref',{enumerable:true,get(){throw Error('GETTER_EXECUTED');}});
 assert.throws(()=>runWhiteLabelHostileHarness({subjects:[hostile,subjects[1]],compileFixture,validate,families}),
   /WHITE_LABEL_SUBJECT_INVALID/);
});

test('a validator that ignores an altered grant is a failure, never a passing empty denominator',()=>{
 const result=runWhiteLabelHostileHarness({subjects,compileFixture,validate:()=>[],families});
 assert.equal(result.strict_pass,false);
 assert.equal(result.false_green,100);
 assert.throws(()=>assertWhiteLabelHostileHarness(result),e=>e instanceof HostileHarnessError && e.code==='WHITE_LABEL_HARNESS_FAIL');
});

test('a repeated identical hostile mutation cannot inflate the matrix denominator',()=>{
 const result=runWhiteLabelHostileHarness({
  subjects,compileFixture,validate,
  families:[{id:'REPEATED',count:10,expected_codes:['WARD_ADMISSION_MISSING'],
    mutate:v=>{v.ward_admitted=false;}}],
 });
 assert.equal(result.strict_pass,false);
 assert.equal(result.diversity_failures,2);
});

test('an unrelated rejection cannot count toward the expected invariant',()=>{
 const result=runWhiteLabelHostileHarness({
  subjects,compileFixture,validate:(v)=>v.ward_admitted===true?[]:['SOME_OTHER_REJECTION'],
  families:[{id:'WARD',count:10,expected_codes:['WARD_ADMISSION_MISSING'],
    mutate:(v,i)=>{v.ward_admitted='refused-'+i;}}],
 });
 assert.equal(result.wrong_invariant,20);
 assert.equal(result.strict_pass,false);
});

test('cold-start front door binds existing inventory and primary executable check',()=>{
 const agents=readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');
 const inventory=readFileSync(new URL('../docs/quality/universal-regression-kit-adoption.md',import.meta.url),'utf8');
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.match(agents,/## Universal regression kit, one-hop intake/);
 assert.match(agents,/docs\/quality\/universal-regression-kit-adoption\.md/);
 assert.match(agents,/npm run check:hostile-harness/);
 assert.match(inventory,/Shared SDK owner:/);
 assert.equal(pkg.scripts['check:hostile-harness'],
  'node scripts/validate-hostile-harness.mjs && node --test test/white-label-hostile-harness.test.mjs');
 assert.equal(pkg.scripts.check.startsWith('npm run check:hostile-harness && '),true);
});
