import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const graph=JSON.parse(fs.readFileSync(new URL('../fixtures/toolchest/e0-punchcard-graph.json',import.meta.url),'utf8'));
test('E0 Toolchest is one parent with addressable SDK punch-card descendants',()=>{
  assert.equal(graph.schema,'xiio.sdk.toolchest-punchcard-graph/v1');
  assert.equal(graph.toolchest_ref,'xiio:article/toolchest');
  assert.equal(graph.generation,'E0-G1');
  assert.equal(graph.groups.length,3);
  assert.deepEqual(graph.groups.map(x=>x.label),['ROOT','BASE','HOME']);
  const ids=[...graph.groups.flatMap(x=>x.children),...graph.auxiliary];
  assert.equal(ids.length,35);
  assert.equal(new Set(ids).size,35);
  assert.ok(graph.punchcard_contract.required_cells.includes('RETURN'));
  assert.ok(graph.punchcard_contract.hard.includes('CHILD_ADDRESSABLE!=CHILD_TOOLCHEST'));
  assert.equal(graph.effect_authority,0);
});