import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveWorkspaceArtifactIntent } from '../src/intent/workspace-artifact.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/intent/workspace-artifact-known-answer.v1.json', import.meta.url), 'utf8'));
assert.equal(fixture.schema, 'xiio.workspace-artifact-intent-known-answer/v1');
for (const row of fixture.cases) {
  const result = resolveWorkspaceArtifactIntent(row.input);
  for (const [key, value] of Object.entries(row.expect)) {
    assert.deepEqual(result[key], value, `${row.id}.${key}`);
  }
  assert.equal(result.raw_preserved, true, `${row.id}.raw_preserved`);
  assert.equal(result.authority_granted, false, `${row.id}.authority`);
}
const write = resolveWorkspaceArtifactIntent('Write Example contents. to burnmap.txt in the workspace root.');
assert.equal(write.requested_operation,'WRITE_TEXT');
assert.equal(write.write_verification_contract.applies_when,true);
assert.equal(write.write_verification_contract.tool_ack_alone_is_pass,false);
assert.equal(write.write_verification_contract.echoed_content_alone_is_pass,false);
assert.equal(write.write_verification_contract.byte_count_alone_is_pass,false);
for (const rule of [
  'WRITE_REQUEST!=WRITE_VERIFIED',
  'WRITE_TOOL_ACK!=DESTINATION_READBACK',
  'ECHOED_CONTENT!=PERSISTED_CONTENT',
  'BYTE_COUNT_MATCH!=SEMANTIC_EFFECT',
]) assert.ok(write.hard.includes(rule),rule);

const zip = resolveWorkspaceArtifactIntent('read the contents of "console.zip" inside the "consoles" folder');
assert.ok(zip.hard.includes('TEXT_READ_TOOL!=ARCHIVE_INSPECTOR'));
console.log(`WORKSPACE_ARTIFACT_INTENT_PASS cases=${fixture.cases.length} reprompt_first_case=${zip.owner_reprompt_needed}`);
