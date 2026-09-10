import assert from 'node:assert/strict';
import { compileRejoinSeams } from '../src/seams/rejoin.mjs';

const observedAt = '2026-09-10T18:25:00-06:00';

function currentSeam(family, extra = {}) {
  return {
    seam_id: `${family.toLowerCase()}:primary`,
    family,
    required: true,
    state: 'CURRENT',
    target_ref: `${family.toLowerCase()}:target`,
    provider_family: family === 'ACK' ? 'XIIO' : 'GENERIC',
    capability_profile_ref: `${family.toLowerCase()}:capability:v1`,
    subject_generation: 'g2',
    current_generation: 'g2',
    evidence_ref: `${family.toLowerCase()}:evidence:g2`,
    readback_ref: `${family.toLowerCase()}:readback:g2`,
    observed_at: observedAt,
    ...extra,
  };
}

const pass = compileRejoinSeams({
  root_ref: 'root:test',
  agent_ref: 'agent:test',
  subject_generation: 'g2',
  current_generation: 'g2',
  seams: [currentSeam('ACK'), currentSeam('A2A'), currentSeam('MCP')],
});
assert.equal(pass.status, 'CURRENT_BOUNDED');
assert.equal(pass.current, true);
assert.equal(pass.required_denominator, 3);
assert.equal(pass.current_required, 3);
assert.equal(pass.refresh_required_count, 0);

const staleAck = compileRejoinSeams({
  root_ref: 'root:test',
  agent_ref: 'agent:test',
  subject_generation: 'g2',
  current_generation: 'g2',
  seams: [
    currentSeam('ACK', { subject_generation: 'g1' }),
    currentSeam('A2A'),
    currentSeam('MCP'),
  ],
});
assert.equal(staleAck.status, 'STALE');
assert.equal(staleAck.current, false);
assert.equal(staleAck.stale_required, 1);
assert.deepEqual(staleAck.refresh_obligations.map((row) => row.family), ['ACK']);
assert.equal(staleAck.seams.find((row) => row.family === 'A2A').state, 'CURRENT');
assert.equal(staleAck.seams.find((row) => row.family === 'MCP').state, 'CURRENT');

const missingReadback = compileRejoinSeams({
  root_ref: 'root:test',
  agent_ref: 'agent:test',
  subject_generation: 'g2',
  current_generation: 'g2',
  seams: [currentSeam('ACK'), currentSeam('A2A'), currentSeam('MCP', { readback_ref: null })],
});
assert.equal(missingReadback.status, 'UNKNOWN');
assert.equal(missingReadback.unknown_required, 1);
assert.ok(missingReadback.seams.find((row) => row.family === 'MCP').missing_bindings.includes('readback_ref'));

const providerConnectedOnly = compileRejoinSeams({
  root_ref: 'root:test',
  agent_ref: 'agent:test',
  subject_generation: 'g2',
  current_generation: 'g2',
  seams: [
    currentSeam('ACK'),
    currentSeam('A2A'),
    currentSeam('MCP', { state: 'UNKNOWN', provider_family: 'MCP_PROVIDER', endpoint_ref: 'endpoint:connected', evidence_ref: null, readback_ref: null }),
  ],
});
assert.equal(providerConnectedOnly.current, false);
assert.equal(providerConnectedOnly.status, 'UNKNOWN');

const nA = compileRejoinSeams({
  root_ref: 'root:test',
  agent_ref: 'agent:test',
  subject_generation: 'g2',
  current_generation: 'g2',
  seams: [
    currentSeam('ACK'),
    currentSeam('A2A'),
    {
      seam_id: 'mcp:not-applicable',
      family: 'MCP',
      required: false,
      applicability: 'N_A_WITH_EVIDENCE',
      state: 'N_A_WITH_EVIDENCE',
      evidence_ref: 'evidence:profile-no-mcp',
    },
  ],
});
assert.equal(nA.status, 'CURRENT_BOUNDED');
assert.equal(nA.missing_families.length, 0);

const nAWithoutEvidence = compileRejoinSeams({
  root_ref: 'root:test',
  agent_ref: 'agent:test',
  subject_generation: 'g2',
  current_generation: 'g2',
  seams: [
    currentSeam('ACK'),
    currentSeam('A2A'),
    { seam_id: 'mcp:not-applicable', family: 'MCP', required: false, state: 'N_A_WITH_EVIDENCE' },
  ],
});
assert.equal(nAWithoutEvidence.status, 'UNKNOWN');

const missingFamily = compileRejoinSeams({
  root_ref: 'root:test',
  agent_ref: 'agent:test',
  subject_generation: 'g2',
  current_generation: 'g2',
  seams: [currentSeam('ACK'), currentSeam('A2A')],
});
assert.deepEqual(missingFamily.missing_families, ['MCP']);
assert.equal(missingFamily.current, false);

const rootStale = compileRejoinSeams({
  root_ref: 'root:test',
  agent_ref: 'agent:test',
  subject_generation: 'g1',
  current_generation: 'g2',
  seams: [currentSeam('ACK'), currentSeam('A2A'), currentSeam('MCP')],
});
assert.equal(rootStale.status, 'REBASE_REQUIRED');
assert.equal(rootStale.current, false);

assert.throws(() => compileRejoinSeams({
  root_ref: 'root:test', agent_ref: 'agent:test', subject_generation: 'g2', current_generation: 'g2', seams: [],
}), /SEAM_DENOMINATOR_REQUIRED/);

assert.throws(() => compileRejoinSeams({
  root_ref: 'root:test', agent_ref: 'agent:test', subject_generation: 'g2', current_generation: 'g2', seams: [currentSeam('ACK'), currentSeam('ACK')],
}), /DUPLICATE_SEAM_ID/);

console.log('REJOIN_SEAMS_PASS current=3/3 stale_only_affected=1 missing_readback_fail_closed=1 provider_connected_only_fail_closed=1 evidence_na=1 missing_family_fail_closed=1 root_rebase=1');
