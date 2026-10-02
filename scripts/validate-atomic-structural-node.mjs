import assert from 'node:assert/strict';
import { PrimitiveGraph, applyPrimitiveOperation, NODE_KINDS, OPERATIONS } from '../src/primitives/atomic-structural-node.mjs';

const base=PrimitiveGraph({
  artifact_id:'artifact:studio-canary',
  generation:'g1',
  nodes:[
    {node_id:'visual:hero',domain:'visual',kind:'rectangle',document_order:0,semantic_depth:0,geometry:{x:0,y:0,z:0,width:1200,height:640}},
    {node_id:'document:title',domain:'document',kind:'heading',document_order:1,semantic_depth:1,geometry:{x:80,y:80,z:1},properties:{text:'Universal primitive canary'}},
    {node_id:'code:renderer',domain:'code',kind:'component',document_order:2,semantic_depth:2,ast_ref:'ast:component:renderer'},
    {node_id:'studio:offering',domain:'studio',kind:'offering',document_order:3,semantic_depth:0,properties:{route:'/offerings/canary'}}
  ]
});

assert.equal(Object.keys(NODE_KINDS).length,4);
assert.equal(OPERATIONS.length,13);
assert.equal(base.nodes.length,4);

const human=applyPrimitiveOperation(base,{operation_id:'op:human-move',operation:'MOVE',actor_kind:'HUMAN',actor_ref:'owner',node_id:'visual:hero',payload:{x:24,y:32}});
const ai=applyPrimitiveOperation(base,{operation_id:'op:ai-move',operation:'MOVE',actor_kind:'AI',actor_ref:'ibal',node_id:'visual:hero',payload:{x:24,y:32}});
assert.deepEqual(human.graph.nodes,ai.graph.nodes,'human and AI must mutate the same primitive path');
assert.equal(human.graph.nodes[0].semantic_depth,0,'XY movement must not mutate semantic Z');
assert.equal(human.graph.nodes[0].document_order,0,'XY movement must not mutate document order');

const depth=applyPrimitiveOperation(human.graph,{operation_id:'op:depth',operation:'TRANSFORM',actor_kind:'HUMAN',actor_ref:'owner',node_id:'visual:hero',payload:{semantic_depth:3,geometry:{z:3,width:1280}}});
assert.equal(depth.graph.nodes[0].semantic_depth,3);
assert.equal(depth.graph.nodes[0].document_order,0,'semantic Z must remain independent of document order');

const publish=applyPrimitiveOperation(depth.graph,{operation_id:'op:publish',operation:'PUBLISH',actor_kind:'AI',actor_ref:'ibal',node_id:'studio:offering',payload:{projection_id:'projection:microsite:canary',target:'microsite'}});
assert.equal(publish.result.effect_authority,0);
assert.equal(publish.graph.projection_candidates.length,1);
assert.equal(publish.receipt.effect_authority,0);

assert.throws(()=>applyPrimitiveOperation(base,{operation_id:'op:bad-kind',operation:'CREATE',actor_kind:'AI',actor_ref:'ibal',payload:{node_id:'bad',domain:'code',kind:'rectangle'}}),/kind_INVALID/);
assert.throws(()=>applyPrimitiveOperation(base,{operation_id:'op:undo',operation:'UNDO',actor_kind:'HUMAN',actor_ref:'owner',node_id:'visual:hero'}),/UNDO_REQUIRES_RECEIPT_STORE/);

for(let i=0;i<100;i++){
  const actor_kind=i%2===0?'HUMAN':'AI';
  const result=applyPrimitiveOperation(base,{operation_id:`hostile:${i}`,operation:'MOVE',actor_kind,actor_ref:actor_kind==='HUMAN'?'owner':'ibal',node_id:'visual:hero',payload:{x:i,y:99-i}});
  assert.equal(result.graph.nodes[0].semantic_depth,0);
  assert.equal(result.graph.nodes[0].document_order,0);
  assert.equal(result.receipt.effect_authority,0);
}

console.log(JSON.stringify({
  schema:'xiio.sdk.atomic-structural-node-validation/v1',
  pass:true,
  hostiles:100,
  domains:Object.keys(NODE_KINDS),
  operations:OPERATIONS,
  human_ai_same_path:true,
  document_order_separate_from_semantic_depth:true,
  publish_effect_authority:0
},null,2));
