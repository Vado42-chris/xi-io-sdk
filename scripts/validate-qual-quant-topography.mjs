import assert from 'node:assert/strict';
import {compileQualQuantTopography,QUAL_QUANT_MATRIX_REQUIRED_CELLS as REQ,qualQuantTopographyCatalog} from '../src/data/qual-quant-topography.mjs';

const pass=id=>({state:'PASS',evidence_refs:['fixture:'+id]});
function good(){
 return {
  identity:{root_uuid:'5267f93e-2af8-57c8-975d-21fcbf77683e',work_ref:'work:search:g1',generation:'g1'},
  cells:Object.fromEntries(REQ.map(id=>[id,pass(id)])),
  golden:{
   qualitative_data:{wording:'exact source wording',stance:'supporting',path:'golden'},
   quantitative_data:{count:10,confidence:0.9}
  },
  subterranean:{
   qualitative_data:{wording:'exact source wording',stance:'adverse-check',path:'subterranean'},
   quantitative_data:{count:7,confidence:0.6}
  },
  quant_units:{count:'items',confidence:'ratio'}
 };
}
const cat=qualQuantTopographyCatalog();
assert.equal(cat.denominator,14);
assert.equal(cat.required_cells.length,14);
assert.deepEqual(cat.polarities,['SOLAR_GOLDEN','LUNAR_SUBTERRANEAN']);

const clean=compileQualQuantTopography(good());
assert.equal(clean.quorum.complete,true);
assert.equal(clean.quorum.pass_like,14);
assert.equal(clean.derivation.state,'DERIVATION_CANDIDATE');
assert.equal(clean.derivation.authority_granted,false);
assert(clean.derivation.qualitative_diff.some(x=>x.key==='wording'&&x.state==='SAME'));
assert(clean.derivation.qualitative_diff.some(x=>x.key==='stance'&&x.state==='DIFFERENT'));
assert(clean.derivation.quantitative_diff.some(x=>x.key==='count'&&x.delta===3));

const stateMutations=['WAIT','FAIL','UNKNOWN'];
let hostileRejected=0;
for(let i=0;i<420;i++){
 const x=good();
 const id=REQ[i%REQ.length];
 const state=stateMutations[Math.floor(i/REQ.length)%stateMutations.length];
 x.cells[id]={state,evidence_refs:state==='FAIL'?['fixture:fail:'+id]:[],wake:state==='WAIT'||state==='UNKNOWN'?'wake:'+id:null};
 const out=compileQualQuantTopography(x);
 assert.equal(out.quorum.complete,false,`hostile ${i}`);
 assert.equal(out.derivation.state,'BLOCKED_QUORUM');
 hostileRejected++;
}
assert.equal(hostileRejected,420);

{
 const x=good();
 x.cells.AXIS_TRIANGULATION_X={state:'PASS',evidence_refs:[]};
 const out=compileQualQuantTopography(x);
 assert.equal(out.quorum.complete,false);
 assert(out.cells.find(c=>c.id==='AXIS_TRIANGULATION_X').blockers.includes('POSITIVE_WITHOUT_EVIDENCE'));
}
{
 const x=good();
 x.golden.quantitative_data.count='ten';
 const out=compileQualQuantTopography(x);
 assert.equal(out.derivation.quantitative_diff.find(r=>r.key==='count').state,'INCOMPARABLE_WITH_REASON');
}
{
 const x=good();
 x.subterranean.qualitative_data.wording='changed legal qualifier';
 const out=compileQualQuantTopography(x);
 assert.equal(out.derivation.qualitative_diff.find(r=>r.key==='wording').state,'DIFFERENT');
}

console.log(JSON.stringify({
 mode:'QUAL_QUANT_TOPOGRAPHY_MATRIX',
 clean_quorum:'14/14',
 hostile_denominator:420,
 hostile_rejected:hostileRejected,
 false_green:0,
 authority_granted:false,
 provider_effect:false,
 result:'PASS'
}));
