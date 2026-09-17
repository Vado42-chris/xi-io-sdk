#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  TOOL_VERB_REQUIREMENTS,
  evaluateToolVerbFidelity,
  evaluateAgentResponseRealization,
} from '../src/evaluation/tool-verb-fidelity.mjs';

const R = (requestedVerb, toolName, toolCapabilities, targetSurface = 'UNKNOWN') =>
  evaluateToolVerbFidelity({ requestedVerb, toolName, toolCapabilities, targetSurface });

const cases = [
  ['run local_scan cannot use read tool', R('run', 'read_workspace_text_file', ['read']), false, 'BLOCKED_TOOL_VERB_MISMATCH'],
  ['Rule D false-positive check cannot be source read only', R('test', 'read_workspace_text_file', ['read']), false, 'BLOCKED_TOOL_VERB_MISMATCH'],
  ['generate validator cannot use read tool', R('generate', 'read_workspace_text_file', ['read']), false, 'BLOCKED_TOOL_VERB_MISMATCH'],
  ['ledger append cannot use replace/write semantics', R('append', 'write_workspace_text_file', ['write']), false, 'BLOCKED_TOOL_VERB_MISMATCH'],
  ['Aries physical audit cannot be source read', R('physical_audit', 'read_workspace_text_file', ['read'], 'sandbox'), false, 'BLOCKED_PHYSICAL_SURFACE_MISMATCH'],
  ['read with read capability is admissible', R('read', 'read_workspace_text_file', ['read']), true, 'TOOL_VERB_MATCH'],
  ['search with glob capability is admissible', R('search', 'workspace_glob', ['glob']), true, 'TOOL_VERB_MATCH'],
  ['generate with create capability is admissible', R('generate', 'create_workspace_text_file', ['create']), true, 'TOOL_VERB_MATCH'],
  ['append requires append semantics', R('append', 'append_workspace_jsonl', ['append']), true, 'TOOL_VERB_MATCH'],
  ['physical audit needs execute plus native identity and readback', R('physical_audit', 'aries_host_runner', ['execute','native_host_identity','result_readback'], 'physical_host'), true, 'TOOL_VERB_MATCH'],
];

for (const [name, out, pass, result] of cases) {
  assert.equal(out.pass, pass, name);
  assert.equal(out.result, result, name);
  if (!pass) assert.equal(out.attempt, 0, `${name}: unsupported action must not start`);
}

assert.equal(Object.isFrozen(TOOL_VERB_REQUIREMENTS), true, 'requirements map must be frozen');
assert.equal(Object.isFrozen(TOOL_VERB_REQUIREMENTS.EXECUTE), true, 'verb groups must be frozen');
assert.equal(Object.isFrozen(TOOL_VERB_REQUIREMENTS.EXECUTE[0]), true, 'inner capability groups must be frozen');
assert.throws(
  () => TOOL_VERB_REQUIREMENTS.EXECUTE[0].push('read'),
  TypeError,
  'consumer must not be able to mutate RUN semantics',
);
assert.equal(R('run', 'read_workspace_text_file', ['read']).pass, false, 'mutation attempt must not weaken gate');

const availableToolNames = ['read_workspace_text_file', 'edit_workspace_text_file', 'run_workspace_command'];
const realization = (responseText, observedToolCalls = []) => evaluateAgentResponseRealization({
  responseText,
  observedToolCalls,
  availableToolNames,
  workspacePathMode: 'RELATIVE_ONLY',
});

const validNamePrintedInsteadOfCalled = realization(
  '{"name":"read_workspace_text_file","parameters":{"path":"reports.txt"}}',
);
assert.equal(validNamePrintedInsteadOfCalled.pass, false);
assert.equal(validNamePrintedInsteadOfCalled.result, 'BLOCKED_PSEUDO_TOOL_RESPONSE');
assert(validNamePrintedInsteadOfCalled.blockers.includes('PSEUDO_TOOL_JSON_IN_ASSISTANT_TEXT'));
assert.equal(validNamePrintedInsteadOfCalled.attempt, 0);

const absolutePath = realization(
  '{"name":"read_workspace_text_file","parameters":{"path":"/LUNAR/reports.txt"}}',
);
assert.equal(absolutePath.pass, false);
assert(absolutePath.blockers.includes('WORKSPACE_PATH_NOT_RELATIVE:/LUNAR/reports.txt'));

const inventedCrm = realization(
  '{"name":"update_crm_status","parameters":{"status":"pending"}}',
);
assert.equal(inventedCrm.pass, false);
assert(inventedCrm.blockers.includes('INVENTED_TOOL_INTERFACE:update_crm_status'));

const staleWriteAlias = realization(
  '{"name":"write_workspace_text_file","parameters":{"path":"LUNAR/fix_reports.txt","content":"x"}}',
);
assert.equal(staleWriteAlias.pass, false);
assert(staleWriteAlias.blockers.includes('INVENTED_TOOL_INTERFACE:write_workspace_text_file'));

const cleanNoTool = realization('BLOCKED=CRM_RUNTIME_UNAVAILABLE; NEXT=WAIT_RUNTIME');
assert.equal(cleanNoTool.pass, true);
assert.equal(cleanNoTool.pseudo_tool_call_count, 0);

const cleanAfterNativeCall = realization('READBACK=PASS', ['read_workspace_text_file']);
assert.equal(cleanAfterNativeCall.pass, true);
assert.equal(cleanAfterNativeCall.native_tool_call_count, 1);
assert.deepEqual(cleanAfterNativeCall.native_tool_calls, ['read_workspace_text_file']);

console.log(JSON.stringify({
  schema: 'xiio.sdk.tool-verb-fidelity-10s/v2',
  result: 'PASS',
  verb_cases: cases.length,
  realization_cases: 6,
  immutability_assertions: 5,
  false_greens: 0,
  hard: [
    'READ != RUN',
    'READ != GENERATE',
    'WRITE != APPEND',
    'SOURCE_INSPECTION != PHYSICAL_AUDIT',
    'EXPORTED_POLICY != CALLER_MUTABLE_POLICY',
    'PRINTED_TOOL_JSON != TOOL_EXECUTION',
    'INVENTED_TOOL_NAME != TOOL_CAPABILITY',
    'ABSOLUTE_PATH != WORKSPACE_RELATIVE_PATH',
  ],
}, null, 2));
