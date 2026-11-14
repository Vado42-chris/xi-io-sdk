import assert from 'node:assert/strict';
import {compileUniversalRadialRelationshipLayout} from '../src/flatpack/universal-primitive.mjs';

const layout=compileUniversalRadialRelationshipLayout({
  center_ref:'product:studio',
  relationships:[
    {product_id:'bins',label:'Governed resources'},
    {product_id:'switchboard',label:'Operational truth'},
    {product_id:'ibal',label:'AI orchestration'}
  ]
});
assert.equal(layout.schema,'xiio.sdk.radial-relationship-layout/v1');
assert.equal(layout.relationship_count,3);
assert.equal(layout.nodes.length,3);
assert.equal(new Set(layout.nodes.map(x=>x.target_ref)).size,3);
assert.equal(layout.nodes[0].identity,'relationship:product:studio:bins');
assert.equal(layout.nodes.every(x=>x.x>=0&&x.x<=1&&x.y>=0&&x.y<=1),true);
assert.equal(layout.effect_ceiling,0);

assert.throws(()=>compileUniversalRadialRelationshipLayout({center_ref:'x',relationships:[{target_ref:'a'},{target_ref:'a'}]}),/RADIAL_TARGET_REF_DUPLICATE/);
assert.throws(()=>compileUniversalRadialRelationshipLayout({relationships:[]}),/RADIAL_CENTER_REF_REQUIRED/);

console.log(JSON.stringify({schema:'xiio.sdk.radial-relationship-layout-check/v1',state:'PASS',nodes:layout.nodes,effect_authority:0}));
