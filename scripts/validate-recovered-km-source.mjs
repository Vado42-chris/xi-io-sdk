import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  compileKmCycle,compileKmSeams,compileKmCrossing,compileKmLineage,
  compileKmSeamIdentity,compileKmStack,compileKmObserver,KERNEL_MATHS_CUSTODY,
} from '../src/ibal/kernel-maths-guard.mjs';
import * as recovered from '../research/recovered/base44-kernel-maths-km1-km21.mjs';

const source=readFileSync(new URL('../research/recovered/base44-kernel-maths-km1-km21.mjs',import.meta.url));
const gitBlob=createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex');
const sourceSha256=createHash('sha256').update(source).digest('hex');
assert.equal(gitBlob,'8a02e5575699eea24910c99a1e46de162de462a4');
assert.equal(KERNEL_MATHS_CUSTODY.github_recovered_blob_sha1,gitBlob);
assert.equal(KERNEL_MATHS_CUSTODY.source_verified_as_original_sdk_commit,false);
assert.equal(KERNEL_MATHS_CUSTODY.independent_python_oracle_recovered,false);

let valid=0, hostile=0;
function yes(x,msg){assert.equal(x,true,msg);valid++}
function no(x,msg){assert.equal(x,false,msg);hostile++}
function refuse(x,msg){assert.equal(x.status,'REFUSED',msg);assert.equal(x.authority_granted,false);assert.equal(x.provider_effect,false);hostile++}
function compute(x){assert.equal(x.status,'COMPUTED');assert.equal(x.authority_granted,false);assert.equal(x.provider_effect,false);yes(x.verified===false,'no structure implies authority')}

assert.deepEqual(recovered.CYCLE,[1,2,3,4,5,6,7,8,9,0]);
assert.equal(recovered.CELLS.length,10);
assert.equal(recovered.SEAMS_X2.length,9);
assert.equal(recovered.centroidX2(),11);
assert.deepEqual(recovered.stepCycle([9,9]),[0,0,1]);
for(const [input,exact] of [[[1],'2'],[[9],'10'],[[9,9],'100'],[[0,1],'11'],[[1,1],'12']]){
  const result=compileKmCycle(input);compute(result);
  assert.equal(result.result.exact_decimal,exact);valid++;
}
for(const invalid of [[],[10],[-1],[1.5],[null],['9'],new Array(65).fill(1),null,{},[true],[9,NaN]]){
  refuse(compileKmCycle(invalid),'KM1 invalid digit refusal');
}
for(let n=1;n<=8;n++){
  for(const dimension of [2,3]){
    const r=compileKmSeams(n,dimension);compute(r);
    const v=BigInt(n);
    const p=dimension===2?2n*v*(v-1n):3n*v*v*(v-1n);
    const o=dimension===2?4n*v:6n*v*v;
    assert.equal(r.result.paired,p.toString());
    assert.equal(r.result.open,o.toString());
    assert.equal(r.result.balanced,n===3);
    if(n<=4)assert.deepEqual(recovered.enumerateSeams(n,dimension),[Number(p),Number(o)]);
    valid++;
  }
}
for(const n of [0,-1,1.5,NaN,Infinity,'3',1000001,Number.MAX_SAFE_INTEGER]){
  refuse(compileKmSeams(n,2),'KM4 bound refusal');
}
for(const dims of [0,1,4,null,'2']){
  refuse(compileKmSeams(3,dims),'KM6 dimension refusal');
}
const evidence={cube:'work.X',gen:41,digest:'a'.repeat(64),boundary:true};
const structural=compileKmCrossing(evidence,{...evidence});
compute(structural);
yes(structural.result.matched===true);
yes(structural.result.predicate==='CROSSING_EVENT');
no(structural.authenticated_event);
no(structural.independent_readback_verified);
for(const bad of [
 {...evidence,gen:9007199254740992},
 {...evidence,gen:-1},
 {...evidence,gen:1.5},
 {...evidence,gen:'41'},
 {...evidence,digest:'fake'},
 {...evidence,digest:'A'.repeat(64)},
 {...evidence,boundary:1},
 {...evidence,cube:'a|b'},
 {...evidence,cube:''},
 {...evidence,token:'sensitive'},
 {cube:'work.X',gen:41,digest:'b'.repeat(64)},
]){
 const r=compileKmCrossing(evidence,bad);
 if(bad.digest==='b'.repeat(64)){compute(r);yes(r.result.predicate==='NO_EFFECT_EVIDENCE');}
 else refuse(r,'KM13 malformed or unsafe refusal');
}
for(const t of [1,0.5,-1,'0','1',null]){
  refuse(compileKmCrossing(evidence,evidence,{tolerance:t}),'KM13 tolerance fixed zero');
}
const stale=compileKmCrossing(evidence,{...evidence,gen:40});
compute(stale);
yes(stale.result.predicate==='NO_EFFECT_MISFIRE');
const waiting=compileKmCrossing(evidence,null);compute(waiting);yes(waiting.result.predicate==='NO_EFFECT_WAITING');
const unbounded=compileKmSeams(1000000,3);compute(unbounded);yes(unbounded.result.paired==='2999997000000000000');
const lineage=compileKmLineage('template-X',{x:'A',y:'B'},10);compute(lineage);
const reordered=compileKmLineage('template-X',{y:'B',x:'A'},10);compute(reordered);
yes(lineage.result.lineage_ref===reordered.result.lineage_ref);
yes(lineage.result.instance_ref===reordered.result.instance_ref);
const newGen=compileKmLineage('template-X',{x:'A',y:'B'},11);compute(newGen);
no(lineage.result.instance_ref===newGen.result.instance_ref);
for(const bad of [['t|bad',{x:'A'},1],['good',{x:'A'},9007199254740992],['good',{x:'A|BAD'},1],['good',{x:1},1]]){
  refuse(compileKmLineage(...bad),'KM10 identity input refusal');
}
const a={cell:'A',gen:1},b={cell:'B',gen:2};
const seam=compileKmSeamIdentity(a,b);compute(seam);
yes(seam.result.digest===compileKmSeamIdentity(b,a).result.digest);
refuse(compileKmSeamIdentity({cell:'A@2',gen:1},b));
const children=[{id:'left',gen:1,scale:1,state:'PASS',evidence:'receipt-left'},
                {id:'right',gen:1,scale:1,state:'PASS',evidence:'receipt-right'}];
const root=compileKmStack(children);compute(root);
yes(root.result.reported_pass);
no(root.result.verified_pass);
yes(root.result.verification_state==='SUPPLIED_UNVERIFIED');
for(const bad of [[],[children[0],children[0]],[{...children[0],gen:9007199254740992}],children.map(x=>({...x,evidence:''})),null]){
  refuse(compileKmStack(bad),'KM16 refusal for unsafe children');
}
const observer=compileKmObserver(9,[2,-2]);compute(observer);
yes(observer.result.relative_position===9);
yes(observer.result.doubled_position===8);
yes(observer.result.closed_loop);
const shifted=compileKmObserver(9,[1]);compute(shifted);
yes(shifted.result.relative_position===0);
no(shifted.result.closed_loop);
for(const bad of [[-1,[1]],[10,[1]],[1,['2']],[1,[Infinity]],[1,new Array(129).fill(1)]]){
  refuse(compileKmObserver(...bad),'KM18 observer refusal');
}
let enumeratorComparisons=0;
for(let n=1;n<=7;n++)for(const d of [2,3]){
  const predicted=compileKmSeams(n,d).result;
  const counted=recovered.enumerateSeams(n,d);
  assert.deepEqual([BigInt(predicted.paired),BigInt(predicted.open)],counted.map(BigInt));
  enumeratorComparisons++;
}
// Recovered raw function remains unqualified by itself: it accepts an unsafe generation.
// The guard MUST refuse that exact adversary before any crossing predicate runs.
const unsafe={...evidence,gen:9007199254740992};
assert.equal(recovered.isWellFormed(unsafe),true,'document inherited raw unsafe Number predicate');
refuse(compileKmCrossing(unsafe,unsafe),'guard prevents inherited unsafe source caller');
console.log(JSON.stringify({
  status:'PASS',scope:'RECOVERED_KM_SOURCE_AND_FAIL_CLOSED_STRUCTURAL_GUARD_ONLY',
  independent_python_oracle_recovered:false,original_sdk_commit_authenticated:false,
  source_blob_sha1:gitBlob,source_sha256:sourceSha256,reported_october12_sha256_prefix:'dc73eeb9',
  oct12_prefix_matches:sourceSha256.startsWith('dc73eeb9'),
  positive_checks:valid,adversarial_checks:hostile,
  independent_enumerator_comparisons:enumeratorComparisons,
  authority_granted:0,provider_effects:0,installed_hex_km_consumer_readback:false,
}));
