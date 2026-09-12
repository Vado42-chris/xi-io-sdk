#!/usr/bin/env node
import assert from 'node:assert/strict';
import { evaluateMissionResult } from '../src/evaluation/mission-conservation.mjs';

const ingress = {
  mission_root_ref: 'ARIES_NOTEBOOK_BINS_BRIDGE',
  generation: 'g1',
  allowed_scope: ['aries-api','ollama-bins','cloudflare-aries'],
  allowed_effects: [],
  required_evidence: ['host:aries','endpoint:8081'],
};

const observed = (extra = {}) => ({
  current_generation_ref: 'provider:g1',
  scope_readback_ref: 'scope:1',
  verified_evidence_refs: ['host:aries','endpoint:8081'],
  ...extra,
});

// H13: OpenAPI schema cannot invent a route/method not independently read back.
{
  const out = evaluateMissionResult({
    ingress,
    payload: {
      mission_root_ref: ingress.mission_root_ref,
      generation: 'g1',
      mutated_scope: ['aries-api'],
      claimed_artifacts: ['aries-api-schema.json'],
      claimed_endpoints: ['GET /preflight'],
      claimed_interfaces: ['openapi:GET:/preflight'],
    },
    observations: observed({
      verified_artifact_refs: ['aries-api-schema.json'],
      verified_endpoint_refs: [],
      verified_interface_refs: [],
    }),
  });
  assert.ok(['FAIL_UNVERIFIED_ENDPOINT','FAIL_UNVERIFIED_INTERFACE'].includes(out.result));
}

// H14: a synthetic 5D matrix cannot self-promote RUNNING/LIVE without native execution/readback.
{
  const out = evaluateMissionResult({
    ingress,
    payload: {
      mission_root_ref: ingress.mission_root_ref,
      generation: 'g1',
      mutated_scope: [],
      live: true,
      claimed_rules: ['5D:truth,source,runtime,fleet,return'],
    },
    observations: observed({
      verified_rule_refs: ['5D:truth,source,runtime,fleet,return'],
      execution_receipt_ref: 'synthetic:5d:pass',
      execution_result: 'PASS',
    }),
  });
  assert.equal(out.result, 'FAIL_FALSE_LIVE');
}

// H15: documentation text does not automatically configure a Git commit template.
{
  const out = evaluateMissionResult({
    ingress,
    payload: {
      mission_root_ref: ingress.mission_root_ref,
      generation: 'g1',
      mutated_scope: ['aries-api'],
      claimed_artifacts: ['README.md'],
      claimed_interfaces: ['git:commit.template:Y-axis-receipt'],
      requested_effects: ['git-config:commit.template'],
    },
    observations: observed({
      verified_artifact_refs: ['README.md'],
      verified_interface_refs: [],
    }),
  });
  assert.equal(out.result, 'FAIL_UNVERIFIED_INTERFACE');
}

// H16: even a verified hook interface cannot mutate .git/hooks without explicit effect authority.
{
  const effectIngress = { ...ingress, allowed_effects: ['write:.git/hooks/pre-commit'] };
  const out = evaluateMissionResult({
    ingress: effectIngress,
    payload: {
      mission_root_ref: effectIngress.mission_root_ref,
      generation: 'g1',
      mutated_scope: ['aries-api'],
      claimed_interfaces: ['http:POST:/hooks/stubscanner-precommit'],
      requested_effects: ['write:.git/hooks/pre-commit'],
    },
    observations: observed({
      verified_interface_refs: ['http:POST:/hooks/stubscanner-precommit'],
    }),
  });
  assert.equal(out.result, 'FAIL_EFFECT_AUTHORITY');
}

// H17: a comment containing the token "pass" is not an AST Pass statement fixture.
{
  const out = evaluateMissionResult({
    ingress,
    payload: {
      mission_root_ref: ingress.mission_root_ref,
      generation: 'g1',
      mutated_scope: [],
      test_fixture: {
        expected_ast_rule: 'PASS_STATEMENT_PLACEHOLDER',
        source: '#!/usr/bin/env python\n# dummy placeholder stub: pass\n',
      },
    },
    observations: observed(),
  });
  assert.equal(out.result, 'FAIL_SEMANTIC_EVIDENCE_CONTRADICTION');
  assert.match(out.steps.at(-1).evidence.join(' '), /TEST_FIXTURE_DOES_NOT_EXERCISE_PASS_STATEMENT_RULE/);
}

// H18: adding a return annotation does not fix a function whose body is still `pass`.
{
  const out = evaluateMissionResult({
    ingress,
    payload: {
      mission_root_ref: ingress.mission_root_ref,
      generation: 'g1',
      mutated_scope: [],
      test_fixture: {
        remediation_expected: 'NO_STUBS',
        remediation_source: 'def func() -> None:\n    pass\n',
      },
    },
    observations: observed(),
  });
  assert.equal(out.result, 'FAIL_SEMANTIC_EVIDENCE_CONTRADICTION');
  assert.match(out.steps.at(-1).evidence.join(' '), /REMEDIATION_STILL_CONTAINS_PASS_STATEMENT_STUB/);
}

// H19: a claimed new Y-axis rule cannot become policy without source-backed rule readback.
{
  const out = evaluateMissionResult({
    ingress,
    payload: {
      mission_root_ref: ingress.mission_root_ref,
      generation: 'g1',
      mutated_scope: [],
      claimed_rules: ['Y_AXIS:MISSING_RETURN_TYPE_ANNOTATION'],
    },
    observations: observed({ verified_rule_refs: [] }),
  });
  assert.equal(out.result, 'FAIL_UNVERIFIED_RULE');
}

console.log(JSON.stringify({
  schema: 'xiio.sdk.mission-evaluation-dogfood-hostile-receipt/v1',
  result: 'PASS',
  hostiles: 7,
  false_greens_accepted: 0,
  provider_effects: 0,
}, null, 2));
