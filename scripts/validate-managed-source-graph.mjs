import assert from 'node:assert/strict';
import {resolveManagedSourceGraph,compileRotflOrderOfOperations,ROTFL_ORDER_STEPS} from '../src/preflight/order-of-operations.mjs';

const nodes=[
  {id:'original',kind:'original',repo:'portfolio/source',generation:'g1'},
  {id:'plan',kind:'plan',repo:'portfolio/plan',generation:'g1',parents:['original']},
  {id:'work',kind:'work',repo:'portfolio/consumer',generation:'g2',parents:['plan'],agent_id:'registered-agent',assigned_pr_ref:'portfolio/consumer#15'},
];
const source_graph={selected_ref:'work',nodes};
const valid=resolveManagedSourceGraph(source_graph);
assert.equal(valid.ok,true);
assert.deepEqual(valid.original_refs,['original']);
assert.deepEqual(valid.assignment_refs,['registered-agent|portfolio/consumer#15']);
assert.equal(valid.authority_granted,false);
for(const change of [
  g=>g.nodes[0].generation='',
  g=>g.nodes[1].parents=['missing'],
  g=>g.nodes[0].parents=['work'],
  g=>g.nodes[2].agent_id='',
  g=>g.nodes[2].parents=[],
  g=>g.nodes.push({...g.nodes[0]}),
]) {
  const hostile=structuredClone(source_graph);change(hostile);
  assert.equal(resolveManagedSourceGraph(hostile).ok,false);
}
const managed_current={provider_current_ref:'provider:g1',studio_handoff_ref:'studio:g1',studio_session_ingress_ref:'ingress:g1',current_selector_ref:'selector:g1',waterfall_ref:'waterfall:g1',registered_backlog_ref:'backlog:g1',waterfall_generation:'g1',registered_backlog_generation:'g1',owner_restatement_count:0};
const completed=ROTFL_ORDER_STEPS.slice(0,3).map(x=>x.id);
const evidence_refs=Object.fromEntries(completed.map(x=>[x,['evidence:'+x]]));
const preflight_refs=Object.fromEntries(completed.map(x=>[x,['preflight:'+x]]));
const args={source_generation:'g1',managed_current,completed_step_ids:completed,evidence_refs,preflight_refs,source_graph};
assert.equal(compileRotflOrderOfOperations(args).source_resolution.ok,true);
assert.throws(()=>compileRotflOrderOfOperations({...args,source_graph:{selected_ref:'work',nodes:nodes.slice(1)}}),/ROTFL_OOR_SOURCE_ANCESTRY_UNRESOLVED/);
console.log('XIIO_SDK_MANAGED_SOURCE_GRAPH PASS deep_origin_and_assignment fail_closed_hostiles=6 effect=0');
