#!/usr/bin/env node
import assert from 'node:assert/strict';
import { evaluateMissionResult } from '../src/evaluation/mission-conservation.mjs';

const baseIngress = {
  mission_root_ref: 'ARIES_NOTEBOOK_BINS_BRIDGE',
  generation: 'g1',
  allowed_scope: ['aries-api','ollama-bins','cloudflare-aries'],
  required_evidence: ['host:aries','endpoint:8081'],
};

// H1: coherent result from the wrong semantic root must halt before local correctness.
{
  const out = evaluateMissionResult({
    ingress: baseIngress,
    payload: { mission_root_ref: 'punchcard-plan-bridge', generation: 'g1', live: true },
    observations: {},
  });
  assert.equal(out.result, 'FAIL_ROOT_DIVERGENCE');
  assert.equal(out.steps.length, 1);
  assert.equal(out.steps[0].name, 'ROOT_CONSERVATION');
}

// H2: right root does not self-certify generation/currentness.
{
  const out = evaluateMissionResult({
    ingress: baseIngress,
    payload: { mission_root_ref: baseIngress.mission_root_ref, generation: 'g1' },
    observations: {},
  });
  assert.equal(out.result, 'FAIL_GENERATION_CURRENTNESS');
}

// H3: claimed deployed artifact without independent readback must fail.
{
  const out = evaluateMissionResult({
    ingress: baseIngress,
    payload: {
      mission_root_ref: baseIngress.mission_root_ref,
      generation: 'g1', mutated_scope: ['aries-api'], claimed_artifacts: ['aries-api-schema.json'],
    },
    observations: {
      current_generation_ref: 'provider:g1', scope_readback_ref: 'scope:1',
      verified_evidence_refs: ['host:aries','endpoint:8081'], verified_artifact_refs: [], verified_endpoint_refs: [],
    },
  });
  assert.equal(out.result, 'FAIL_UNVERIFIED_ARTIFACT');
}

// H4: claimed endpoint without native readback must fail.
{
  const out = evaluateMissionResult({
    ingress: baseIngress,
    payload: {
      mission_root_ref: baseIngress.mission_root_ref,
      generation: 'g1', mutated_scope: ['aries-api'], claimed_endpoints: ['https://aries-api.xi-io.com/v1/infer'],
    },
    observations: {
      current_generation_ref: 'provider:g1', scope_readback_ref: 'scope:1',
      verified_evidence_refs: ['host:aries','endpoint:8081'], verified_artifact_refs: [], verified_endpoint_refs: [],
    },
  });
  assert.equal(out.result, 'FAIL_UNVERIFIED_ENDPOINT');
}

// H5: client code cannot be used as server endpoint evidence.
{
  const out = evaluateMissionResult({
    ingress: baseIngress,
    payload: {
      mission_root_ref: baseIngress.mission_root_ref,
      generation: 'g1', mutated_scope: ['aries-api'],
      claimed_artifacts: ['inference_client.py'], claimed_endpoints: ['https://aries-api.xi-io.com/v1/infer'],
    },
    observations: {
      current_generation_ref: 'provider:g1', scope_readback_ref: 'scope:1',
      verified_evidence_refs: ['host:aries','endpoint:8081'], verified_artifact_refs: ['inference_client.py'], verified_endpoint_refs: [],
    },
  });
  assert.equal(out.result, 'FAIL_UNVERIFIED_ENDPOINT');
}

// H6: worker-authored LIVE with no native live readback must fail after execution proof.
{
  const out = evaluateMissionResult({
    ingress: baseIngress,
    payload: { mission_root_ref: baseIngress.mission_root_ref, generation: 'g1', mutated_scope: ['aries-api'], live: true },
    observations: {
      current_generation_ref: 'provider:g1', scope_readback_ref: 'scope:1', verified_evidence_refs: ['host:aries','endpoint:8081'],
      execution_receipt_ref: 'exec:1', execution_result: 'PASS',
    },
  });
  assert.equal(out.result, 'FAIL_FALSE_LIVE');
}

// H7: correct execution without RETURN is still a flatplane.
{
  const out = evaluateMissionResult({
    ingress: baseIngress,
    payload: { mission_root_ref: baseIngress.mission_root_ref, generation: 'g1', mutated_scope: ['aries-api'] },
    observations: {
      current_generation_ref: 'provider:g1', scope_readback_ref: 'scope:1', verified_evidence_refs: ['host:aries','endpoint:8081'],
      execution_receipt_ref: 'exec:1', execution_result: 'PASS',
    },
  });
  assert.equal(out.result, 'FAIL_RETURN_MISSING');
}

// H8: full nonterminal success requires next frontier after APPLY_RETURN + REAP.
{
  const out = evaluateMissionResult({
    ingress: baseIngress,
    payload: { mission_root_ref: baseIngress.mission_root_ref, generation: 'g1', mutated_scope: ['aries-api'] },
    observations: {
      current_generation_ref: 'provider:g1', scope_readback_ref: 'scope:1', verified_evidence_refs: ['host:aries','endpoint:8081'],
      execution_receipt_ref: 'exec:1', execution_result: 'PASS', return_ref: 'return:1', apply_return_ref: 'apply:1',
      apply_return_readback_ref: 'readback:1', reap_ref: 'reap:1', next_ref: 'hvt:next', root_closed: false,
    },
  });
  assert.equal(out.state, 'PASS');
  assert.equal(out.result, 'MISSION_CONTINUES');
  assert.equal(out.next, 'hvt:next');
  assert.equal(out.steps.length, 8);
}

// H9: full terminal success requires explicit root_closed after REAP.
{
  const out = evaluateMissionResult({
    ingress: baseIngress,
    payload: { mission_root_ref: baseIngress.mission_root_ref, generation: 'g1', mutated_scope: [] },
    observations: {
      current_generation_ref: 'provider:g1', scope_readback_ref: 'scope:1', verified_evidence_refs: ['host:aries','endpoint:8081'],
      execution_receipt_ref: 'exec:1', execution_result: 'PASS', return_ref: 'return:1', apply_return_ref: 'apply:1',
      apply_return_readback_ref: 'readback:1', reap_ref: 'reap:1', root_closed: true,
    },
  });
  assert.equal(out.state, 'PASS');
  assert.equal(out.result, 'MISSION_CLOSED');
  assert.equal(out.terminal, true);
}

// H10: minted-looking receipt id without native ledger readback must fail.
{
  const out = evaluateMissionResult({
    ingress: baseIngress,
    payload: {
      mission_root_ref: baseIngress.mission_root_ref,
      generation: 'g1', mutated_scope: ['aries-api'], receipt_id: 'RCP-aries-20260912-8f92a1c4',
    },
    observations: {
      current_generation_ref: 'provider:g1', scope_readback_ref: 'scope:1',
      verified_evidence_refs: ['host:aries','endpoint:8081'],
    },
  });
  assert.equal(out.result, 'FAIL_SEMANTIC_EVIDENCE_CONTRADICTION');
  assert.match(out.steps.at(-1).evidence.join(' '), /RECEIPT_ID_WITHOUT_LEDGER_READBACK/);
}

// H11: Y-axis ZERO_STUBS cannot attest output that literally contains a pass placeholder.
{
  const out = evaluateMissionResult({
    ingress: baseIngress,
    payload: {
      mission_root_ref: baseIngress.mission_root_ref,
      generation: 'g1', mutated_scope: ['aries-api'],
      receipt_id: 'RCP-aries-20260912-8f92a1c4',
      attestation: { Y_AXIS_WHAT: 'AST_VALIDATED_ZERO_STUBS' },
      output: 'def scan_ast_stubs(tree):\n    # generated\n    pass\n',
    },
    observations: {
      current_generation_ref: 'provider:g1', scope_readback_ref: 'scope:1',
      verified_evidence_refs: ['host:aries','endpoint:8081'], ledger_readback_ref: 'ledger:1',
    },
  });
  assert.equal(out.result, 'FAIL_SEMANTIC_EVIDENCE_CONTRADICTION');
  assert.match(out.steps.at(-1).evidence.join(' '), /Y_AXIS_ZERO_STUBS_CONTRADICTED_BY_PASS_STATEMENT/);
}

console.log(JSON.stringify({
  schema:'xiio.sdk.mission-evaluation-hostile-receipt/v1',
  result:'PASS',
  hostiles:11,
  false_greens_accepted:0,
  provider_effects:0,
}, null, 2));
