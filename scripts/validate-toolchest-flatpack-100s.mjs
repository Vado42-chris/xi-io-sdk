import assert from 'node:assert/strict';
import {compileToolchestFlatpack,toolchestPunchcards} from '../src/flatpack/toolchest.mjs';

const base=(n=4)=>({
 product_ref:'product:studio',user_ref:'user:owner',generation:'E0-G1',
 variables:{brand:'xi-io',density:'compact'},
 groups:[
  {label:'ROOT',items:Array.from({length:n},(_,i)=>({label:'Root '+i,description:'R'+i,capability_ref:'cap:r'+i}))},
  {label:'BASE',items:[{label:'Automation'},{label:'Marketplace'}]},
  {label:'HOME',items:[{label:'Studio'},{label:'Produce'}]}
 ]
});
const ok=compileToolchestFlatpack(base());
assert.equal(ok.metadata.article_ref,'xiio:article/toolchest:product-studio');
assert.equal(ok.metadata.product_ref,'product:studio');
assert.equal(ok.metadata.user_ref,'user:owner');
assert.equal(ok.metadata.groups.length,3);
assert.equal(new Set(ok.primitives.map(x=>x.identity)).size,ok.primitives.length);
assert.ok(toolchestPunchcards(ok).every(x=>Object.values(x.cells).every(v=>v===1)));

const products=['studio','inbox','ward','publisher','hex','benchmark','sam-law','articles','desktop','mobile'];
const users=['owner','designer','developer','reviewer','client','admin','guest','agent','team','tenant'];
const receipts=[];
for(let i=0;i<100;i++){
 const product=products[i%products.length],user=users[Math.floor(i/10)];
 const input=base((i%7)+1);
 input.product_ref='product:'+product; input.user_ref='user:'+user; input.generation='G'+(i+1);
 input.variables={brand:'brand-'+(i%5),density:i%2?'compact':'comfortable',locale:i%3?'en-CA':'fr-CA'};
 input.responsive_rules={narrow:i%2?'single-column':'drawer',wide:i%3?'rail+content':'two-column'};
 const out=compileToolchestFlatpack(input);
 const cards=toolchestPunchcards(out);
 assert.equal(out.metadata.product_ref,input.product_ref);
 assert.equal(out.metadata.user_ref,input.user_ref);
 assert.deepEqual(out.metadata.variables,input.variables);
 assert.deepEqual(out.metadata.responsive_rules,input.responsive_rules);
 assert.equal(out.artifact.artifact_ref,`xiio:article/toolchest:product-${product}`);
 assert.equal(new Set(out.primitives.map(x=>x.identity)).size,out.primitives.length);
 assert.ok(cards.length===out.primitives.length&&cards.every(c=>c.parent_article_ref===out.metadata.article_ref));
 assert.ok(cards.every(c=>Object.values(c.cells).every(v=>v===1)));
 receipts.push({case:i+1,product,user,primitive_count:out.primitives.length,state:'PASS'});
}
assert.equal(receipts.length,100);

assert.throws(()=>compileToolchestFlatpack({...base(),product_ref:''}),/PRODUCT_REF_REQUIRED/);
assert.throws(()=>compileToolchestFlatpack({...base(),user_ref:''}),/USER_REF_REQUIRED/);
assert.throws(()=>compileToolchestFlatpack({...base(),groups:[]}),/GROUPS_REQUIRED/);
assert.throws(()=>compileToolchestFlatpack({...base(),groups:[{label:'X',ref:'same',items:[]},{label:'Y',ref:'same',items:[]}]}),/DUPLICATE_GROUP_REF/);
assert.throws(()=>compileToolchestFlatpack({...base(),groups:[{label:'X',items:[{label:'A',ref:'same'},{label:'B',ref:'same'}]}]}),/DUPLICATE_DESCENDANT_REF/);

console.log(JSON.stringify({
 schema:'xiio.sdk.toolchest-flatpack-100s/v1',state:'PASS',cases:100,
 variable_axes:['user_ref','product_ref','generation','brand','density','locale','responsive_rules','groups','items','capability_ref'],
 reusable_flatpack:true,punchcards_all_binary:true,silent_remainder:0,effect_authority:0
}));
