#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  compileSharedFlatplaneTopology,
  SHARED_FLATPLANE_TOPOLOGY_SCHEMA,
} from '../src/documents/shared-flatplane-topology.mjs';

const base={
  artifact_ref:'artifact_identity:web/12345678',
  shared_flatplane:{
    plane_ref:'flatplane:home/5s',
    scale:'5s',
    parametric_domain:{domain_ref:'domain:uv/main',axes:['u','v']},
  },
  primitives:[
    {primitive_ref:'prim:a',semantic_type:'rectangle',coordinates:{u:0,v:0},relationships:[],operations:['MOVE','TRANSFORM'],version:1},
    {primitive_ref:'prim:b',semantic_type:'paragraph',coordinates:{u:1,v:0},relationships:[],operations:['SELECT','TRANSFORM'],version:1},
  ],
  local_control_patches:[
    {patch_ref:'patch:left',plane_ref:'flatplane:home/5s',primitive_refs:['prim:a'],local_domain:{u:[0,0.5],v:[0,1]}},
    {patch_ref:'patch:right',plane_ref:'flatplane:home/5s',primitive_refs:['prim:b'],local_domain:{u:[0.5,1],v:[0,1]}},
  ],
  seam_equivalence:[
    {seam_ref:'seam:mid',left_patch_ref:'patch:left',right_patch_ref:'patch:right',continuity_ref:'continuity:mid'},
  ],
  continuity_constraints:[
    {continuity_ref:'continuity:mid',seam_refs:['seam:mid'],class:'C0',tolerance:0},
  ],
  extrusions:[
    {extrusion_ref:'extrude:a',plane_ref:'flatplane:home/5s',primitive_ref:'prim:a',local_cube_ref:'cube:a',local_z:1,orientation:'normal',direction:'positive'},
    {extrusion_ref:'extrude:b',plane_ref:'flatplane:home/5s',primitive_ref:'prim:b',local_cube_ref:'cube:b',local_z:2,orientation:'normal',direction:'positive'},
  ],
  projection_recipes:[
    {projection_ref:'projection:studio',target:'studio',primitive_refs:['prim:a','prim:b'],effect_authority:0},
    {projection_ref:'projection:publisher',target:'publisher',primitive_refs:['prim:a','prim:b'],effect_authority:0},
  ],
  lineage:{generation:1,source_ref:'test:source'},
  authority:{visibility:'private',owner_ref:'owner:test'},
  receipts:['receipt:test:1'],
};

const good=compileSharedFlatplaneTopology(base);
assert.equal(good.schema,SHARED_FLATPLANE_TOPOLOGY_SCHEMA);
assert.equal(good.shared_flatplane.scale,'5s');
assert.equal(good.shared_flatplane.plane_ref,'flatplane:home/5s');
assert.deepEqual(good.primitives.map(x=>x.primitive_ref),['prim:a','prim:b']);
assert.equal(good.extrusions.every(x=>x.plane_ref===good.shared_flatplane.plane_ref),true);
assert.equal(good.local_control_patches.every(x=>x.plane_ref===good.shared_flatplane.plane_ref),true);
assert.equal(good.effect_authority,0);
assert.ok(good.hard.includes('FILE_OWNS_SHARED_PLANE'));

assert.throws(
  ()=>compileSharedFlatplaneTopology({
    ...base,
    local_control_patches:[
      {...base.local_control_patches[0],shared_flatplane:{plane_ref:'private:bad'}},
      base.local_control_patches[1],
    ],
  }),
  /PATCH_MINTS_PRIVATE_PLANE/
);

assert.throws(
  ()=>compileSharedFlatplaneTopology({
    ...base,
    extrusions:[
      {...base.extrusions[0],plane_ref:'flatplane:private'},
      base.extrusions[1],
    ],
  }),
  /EXTRUSION_PLANE_REF_MUST_EQUAL_SHARED_PLANE/
);

assert.throws(
  ()=>compileSharedFlatplaneTopology({
    ...base,
    primitives:[base.primitives[0],{...base.primitives[1],primitive_ref:'prim:a'}],
  }),
  /primitive_ref_DUPLICATE/
);

assert.throws(
  ()=>compileSharedFlatplaneTopology({
    ...base,
    extrusions:[{...base.extrusions[0],primitive_ref:'prim:missing'}],
  }),
  /EXTRUSION_REFERENCES_UNKNOWN_PRIMITIVE/
);

assert.throws(
  ()=>compileSharedFlatplaneTopology({
    ...base,
    seam_equivalence:[{...base.seam_equivalence[0],continuity_ref:'continuity:missing'}],
  }),
  /SEAM_CONTINUITY_REF_UNKNOWN/
);

console.log(JSON.stringify({
  schema:'xiio.sdk.shared-flatplane-topology-check/v1',
  result:'PASS',
  controls:1,
  hostiles:5,
  shared_scale:'5s',
  primitives:good.counts.primitives,
  patches:good.counts.patches,
  extrusions:good.counts.extrusions,
  effect_authority:0,
  first_red:null,
},null,2));
