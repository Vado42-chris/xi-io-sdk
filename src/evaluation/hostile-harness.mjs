import { createHash } from 'node:crypto';

export class HostileHarnessError extends Error {
  constructor(code, detail='') {
    super(detail ? `${code}: ${detail}` : code);
    this.name='HostileHarnessError';
    this.code=code;
  }
}

const clone=v=>JSON.parse(JSON.stringify(v));
const stable=v=>JSON.stringify(v, Object.keys(v||{}).sort());

function deepStable(value){
  if(Array.isArray(value)) return '['+value.map(deepStable).join(',')+']';
  if(value && typeof value==='object'){
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+deepStable(value[k])).join(',')+'}';
  }
  return JSON.stringify(value);
}
const digest=v=>createHash('sha256').update(deepStable(v)).digest('hex');

function normalizeErrors(value){
  if(Array.isArray(value)) return value.map(String);
  if(value==null) return [];
  if(value===true) return [];
  if(value===false) return ['VALIDATOR_FALSE'];
  if(typeof value==='string') return value ? [value] : [];
  if(typeof value==='object' && Array.isArray(value.errors)) return value.errors.map(String);
  throw new HostileHarnessError('VALIDATOR_RESULT_INVALID', typeof value);
}

export function runHostileHarness({
  fixture,
  validate,
  families,
  min_unique_mutations_per_family=10,
  require_expected_invariant=true
}={}){
  if(!fixture || typeof fixture!=='object') throw new HostileHarnessError('FIXTURE_REQUIRED');
  if(typeof validate!=='function') throw new HostileHarnessError('VALIDATOR_REQUIRED');
  if(!Array.isArray(families)||families.length===0) throw new HostileHarnessError('FAMILIES_REQUIRED');

  const canonicalErrors=normalizeErrors(validate(clone(fixture)));
  if(canonicalErrors.length) throw new HostileHarnessError('CANONICAL_FIXTURE_INVALID', canonicalErrors.join('|'));

  const baseDigest=digest(fixture);
  const seenFamilyIds=new Set();
  const familyResults=[];
  let total=0, changed=0, rejected=0, falseGreen=0, noop=0, wrongInvariant=0, diversityFail=0;

  for(const family of families){
    const id=String(family?.id||'').trim();
    const count=Number(family?.count||0);
    if(!id) throw new HostileHarnessError('FAMILY_ID_REQUIRED');
    if(seenFamilyIds.has(id)) throw new HostileHarnessError('FAMILY_ID_DUPLICATE',id);
    seenFamilyIds.add(id);
    if(!Number.isInteger(count)||count<1) throw new HostileHarnessError('FAMILY_COUNT_INVALID',id);
    if(typeof family.mutate!=='function') throw new HostileHarnessError('FAMILY_MUTATOR_REQUIRED',id);

    const fingerprints=new Set();
    const cases=[];
    let fChanged=0,fRejected=0,fFalse=0,fNoop=0,fWrong=0;

    for(let i=0;i<count;i++){
      total++;
      const before=clone(fixture);
      let mutated=clone(fixture);
      const out=family.mutate(mutated,i);
      if(out && typeof out==='object') mutated=out;
      const afterDigest=digest(mutated);
      const didChange=afterDigest!==baseDigest;
      if(didChange){ changed++; fChanged++; fingerprints.add(afterDigest); }
      else { noop++; fNoop++; }

      const errors=normalizeErrors(validate(mutated));
      const rejectedHere=errors.length>0;
      let expected=true;
      if(require_expected_invariant){
        if(typeof family.expect==='function') expected=Boolean(family.expect(errors,mutated,i,before));
        else if(Array.isArray(family.expected_codes)&&family.expected_codes.length){
          expected=family.expected_codes.some(code=>errors.includes(code));
        } else {
          throw new HostileHarnessError('EXPECTED_INVARIANT_REQUIRED',id);
        }
      }

      const acceptedAsRejected=didChange && rejectedHere && expected;
      if(acceptedAsRejected){ rejected++; fRejected++; }
      else {
        falseGreen++; fFalse++;
        if(rejectedHere && !expected){ wrongInvariant++; fWrong++; }
      }
      cases.push({
        case_id:`${id}#${String(i+1).padStart(3,'0')}`,
        changed:didChange,
        rejected:rejectedHere,
        expected_invariant:expected,
        errors
      });
    }

    const minUnique=Math.min(count, Math.max(1, Number(family.min_unique_mutations ?? min_unique_mutations_per_family)));
    const unique=fingerprints.size;
    const diversityPass=unique>=minUnique;
    if(!diversityPass) diversityFail++;

    familyResults.push({
      id,
      denominator:count,
      changed:fChanged,
      rejected:fRejected,
      false_green:fFalse,
      no_op:fNoop,
      wrong_invariant:fWrong,
      unique_mutations:unique,
      min_unique_required:minUnique,
      diversity_pass:diversityPass,
      strict_pass:fChanged===count && fRejected===count && fFalse===0 && fNoop===0 && fWrong===0 && diversityPass,
      cases
    });
  }

  return Object.freeze({
    schema:'xiio.sdk.hostile-harness/result/v1',
    denominator:total,
    changed,
    rejected,
    false_green:falseGreen,
    no_op_mutations:noop,
    wrong_invariant:wrongInvariant,
    diversity_failures:diversityFail,
    family_count:familyResults.length,
    families:Object.freeze(familyResults),
    strict_pass:changed===total && rejected===total && falseGreen===0 && noop===0 && wrongInvariant===0 && diversityFail===0,
    hard:Object.freeze([
      'COUNTED_LOOP!=HOSTILE_SIM',
      'MUTATION_MUST_CHANGE_FIXTURE',
      'REJECTION_MUST_MATCH_EXPECTED_INVARIANT',
      'NO_OP_MUTATION=FAIL',
      'FALSE_GREEN=FAIL',
      'WRONG_INVARIANT_REJECTION=FAIL',
      'REPEATED_IDENTICAL_MUTATION!=DENOMINATOR',
      'CANONICAL_FIXTURE_MUST_PASS'
    ])
  });
}

export function assertHostileHarness(result){
  if(!result?.strict_pass){
    throw new HostileHarnessError(
      'HOSTILE_HARNESS_FAIL',
      JSON.stringify({
        denominator:result?.denominator,
        changed:result?.changed,
        rejected:result?.rejected,
        false_green:result?.false_green,
        no_op_mutations:result?.no_op_mutations,
        wrong_invariant:result?.wrong_invariant,
        diversity_failures:result?.diversity_failures
      })
    );
  }
  return result;
}


/**
 * One hostile-harness denominator, reused across independent product/tenant
 * coordinates. Product and tenant names are fixture data, never capability,
 * authority or proof that code has run on an installed host.
 *
 * A single product cannot certify the universal kit. Two different subjects
 * are necessary, and a caller cannot substitute the same underlying fixture
 * while changing only the report label.
 */
export function runWhiteLabelHostileHarness({
  subjects, compileFixture, validate, families,
  min_unique_mutations_per_family=10,
}={}) {
  if (!Array.isArray(subjects) || subjects.length < 2)
    throw new HostileHarnessError('WHITE_LABEL_SUBJECT_DENOMINATOR_REQUIRED');
  if (typeof compileFixture !== 'function' || typeof validate !== 'function')
    throw new HostileHarnessError('WHITE_LABEL_ADAPTERS_REQUIRED');
  if (!Array.isArray(families) && typeof families !== 'function')
    throw new HostileHarnessError('WHITE_LABEL_FAMILIES_REQUIRED');

  const seenProducts=new Set(), seenTenants=new Set(), seenFixtures=new Set();
  const results=[];
  for (const raw of subjects) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new HostileHarnessError('WHITE_LABEL_SUBJECT_INVALID');
    const refs={};
    for (const key of ['product_ref','tenant_ref','resource_ref']) {
      const property=Object.getOwnPropertyDescriptor(raw,key);
      if (!property || !Object.hasOwn(property,'value') ||
          typeof property.value !== 'string' ||
          !/^[a-z][a-z0-9._:-]{2,127}$/i.test(property.value) ||
          ['__proto__','constructor','prototype'].includes(property.value))
        throw new HostileHarnessError('WHITE_LABEL_SUBJECT_INVALID',key);
      refs[key]=property.value;
    }
    if (seenProducts.has(refs.product_ref) || seenTenants.has(refs.tenant_ref))
      throw new HostileHarnessError('WHITE_LABEL_SUBJECT_REUSED');
    seenProducts.add(refs.product_ref); seenTenants.add(refs.tenant_ref);
    const fixture=compileFixture(Object.freeze({...refs}));
    if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture) ||
        Object.keys(refs).some(key=>fixture[key] !== refs[key]))
      throw new HostileHarnessError('WHITE_LABEL_FIXTURE_IDENTITY_MISMATCH');
    const identity=digest(fixture);
    if (seenFixtures.has(identity))
      throw new HostileHarnessError('WHITE_LABEL_FIXTURE_REUSED');
    seenFixtures.add(identity);
    const suite=typeof families === 'function'
      ? families(Object.freeze({...refs})) : families;
    const proof=runHostileHarness({
      fixture, validate:v=>validate(v,Object.freeze({...refs})),
      families:suite, min_unique_mutations_per_family,
    });
    results.push({subject:Object.freeze({...refs}), ...proof});
  }
  const denominator=results.reduce((sum,r)=>sum+r.denominator,0);
  return Object.freeze({
    schema:'xiio.sdk.white-label-hostile-matrix/v1',
    subject_count:results.length,
    denominator,
    rejected:results.reduce((sum,r)=>sum+r.rejected,0),
    false_green:results.reduce((sum,r)=>sum+r.false_green,0),
    no_op_mutations:results.reduce((sum,r)=>sum+r.no_op_mutations,0),
    wrong_invariant:results.reduce((sum,r)=>sum+r.wrong_invariant,0),
    diversity_failures:results.reduce((sum,r)=>sum+r.diversity_failures,0),
    strict_pass:results.every(r=>r.strict_pass),
    fixture_only:true, installed_host_verified:false, authority_granted:false,
    results:Object.freeze(results),
    hard:Object.freeze([
      'PRODUCT_LABEL!=RUNTIME_AUTHORITY',
      'SYNTHETIC_DENOMINATOR!=INSTALLED_QUALIFICATION',
      'MUTATION_REJECTION!=HOST_EFFECT',
      'ONE_BRAND_PASS!=UNIVERSAL_PASS',
    ]),
  });
}
export function assertWhiteLabelHostileHarness(result) {
  if (!result || result.strict_pass !== true ||
      result.subject_count < 2 || result.denominator < result.subject_count)
    throw new HostileHarnessError('WHITE_LABEL_HARNESS_FAIL');
  return result;
}
