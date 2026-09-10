import assert from 'node:assert/strict';
import { compileRejoinSeams, STANDARD_REJOIN_FAMILIES } from '../src/seams/rejoin.mjs';

const observedAt = '2026-09-10T18:25:00-06:00';
const transportFamilies = new Set(['A2A', 'MCP', 'CRM_MAIL', 'CLOUDFLARE']);
const peerFamilies = new Set(['A2A', 'MCP']);

function currentSeam(family, extra = {}) {
  const row = {
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
  };
  if (transportFamilies.has(family)) row.endpoint_ref = `${family.toLowerCase()}:endpoint:g2`;
  if (peerFamilies.has(family)) Object.assign(row, {
    principal_ref: `${family.toLowerCase()}:principal:g2`,
    assignment_ref: `${family.toLowerCase()}:assignment:g2`,
    assignment_receipt_ref: `${family.toLowerCase()}:assignment-receipt:g2`,
    authority_receipt_ref: `${family.toLowerCase()}:authority-receipt:g2`,
  });
  if (family === 'CRM_MAIL') Object.assign(row, {
    principal_ref: 'principal:crm-mail:g2',
    mailbox_address: 'agent@r1-lane.xi-io.com',
    authority_receipt_ref: 'crm-mail:authority-receipt:g2',
  });
  if (family === 'RETURN_CHAIN') Object.assign(row, {
    result_ref: 'result:g2', return_ref: 'return:g2', apply_return_ref: 'apply-return:g2',
  });
  if (family === 'DETONATOR') Object.assign(row, {
    detonator_ref: 'detonator:g2', trip_debt_ref: 'trip-debt:g2',
  });
  return { ...row, ...extra };
}

function allCurrent() {
  return STANDARD_REJOIN_FAMILIES.map((family) => currentSeam(family));
}

function compile(seams, rootExtra = {}) {
  return compileRejoinSeams({
    root_ref: 'root:test', agent_ref: 'agent:test', subject_generation: 'g2', current_generation: 'g2', seams, ...rootExtra,
  });
}

let result = compile(allCurrent());
assert.equal(result.status, 'CURRENT_BOUNDED');
assert.equal(result.current, true);
assert.equal(result.standard_family_denominator, 17);
assert.equal(result.denominator, 17);
assert.equal(result.current_required, 17);
assert.equal(result.refresh_required_count, 0);

const staleAck = allCurrent();
staleAck[0] = currentSeam('ACK', { subject_generation: 'g1' });
result = compile(staleAck);
assert.equal(result.status, 'STALE');
assert.equal(result.stale_required, 1);
assert.deepEqual(result.refresh_obligations.map((row) => row.family), ['ACK']);

const providerWait = allCurrent();
const mcpIndex = STANDARD_REJOIN_FAMILIES.indexOf('MCP');
providerWait[mcpIndex] = currentSeam('MCP', {
  state: 'UNKNOWN', evidence_ref: null, readback_ref: null,
  resolution_class: 'TRUE_WAIT', wake_when: 'provider://mcp/registration-readback',
});
result = compile(providerWait);
assert.equal(result.status, 'UNKNOWN');
assert.equal(result.true_wait_refresh_count, 1);
assert.equal(result.machine_resolvable_refresh_count, 0);

const malformedWait = allCurrent();
malformedWait[mcpIndex] = currentSeam('MCP', {
  state: 'UNKNOWN', evidence_ref: null, readback_ref: null,
  resolution_class: 'TRUE_WAIT', wake_when: null,
});
result = compile(malformedWait);
assert.equal(result.machine_resolvable_refresh_count, 1);
assert.ok(result.seams.find((row) => row.family === 'MCP').invalidators.includes('TRUE_WAIT_WITHOUT_WAKE'));

const peerIdentityMissing = allCurrent();
peerIdentityMissing[mcpIndex] = currentSeam('MCP', {
  principal_ref: null,
  assignment_ref: null,
  assignment_receipt_ref: null,
  authority_receipt_ref: null,
});
result = compile(peerIdentityMissing);
assert.equal(result.status, 'UNKNOWN');
assert.equal(result.seams[mcpIndex].current, false);
assert.deepEqual(
  result.seams[mcpIndex].missing_bindings.filter((field) => field.includes('ref')),
  ['principal_ref', 'assignment_ref', 'assignment_receipt_ref', 'authority_receipt_ref'],
);

const crmConfiguredOnly = allCurrent();
const crmIndex = STANDARD_REJOIN_FAMILIES.indexOf('CRM_MAIL');
crmConfiguredOnly[crmIndex] = currentSeam('CRM_MAIL', { readback_ref: null });
result = compile(crmConfiguredOnly);
assert.equal(result.status, 'UNKNOWN');
assert.ok(result.seams[crmIndex].missing_bindings.includes('readback_ref'));
assert.equal(result.seams[crmIndex].current, false);

const crmIdentityMissing = allCurrent();
crmIdentityMissing[crmIndex] = currentSeam('CRM_MAIL', {
  principal_ref: null,
  mailbox_address: null,
  authority_receipt_ref: null,
});
result = compile(crmIdentityMissing);
assert.equal(result.status, 'UNKNOWN');
assert.equal(result.seams[crmIndex].current, false);
assert.ok(result.seams[crmIndex].missing_bindings.includes('principal_ref'));
assert.ok(result.seams[crmIndex].missing_bindings.includes('mailbox_address'));
assert.ok(result.seams[crmIndex].missing_bindings.includes('authority_receipt_ref'));

const cloudflareHostnameOnly = allCurrent();
const cfIndex = STANDARD_REJOIN_FAMILIES.indexOf('CLOUDFLARE');
cloudflareHostnameOnly[cfIndex] = currentSeam('CLOUDFLARE', { readback_ref: null });
result = compile(cloudflareHostnameOnly);
assert.equal(result.status, 'UNKNOWN');
assert.ok(result.seams[cfIndex].missing_bindings.includes('readback_ref'));

const missingTransportEndpoint = allCurrent();
missingTransportEndpoint[mcpIndex] = currentSeam('MCP', { endpoint_ref: null });
result = compile(missingTransportEndpoint);
assert.equal(result.status, 'UNKNOWN');
assert.ok(result.seams[mcpIndex].missing_bindings.includes('endpoint_ref'));

const returnWithoutApply = allCurrent();
const returnIndex = STANDARD_REJOIN_FAMILIES.indexOf('RETURN_CHAIN');
returnWithoutApply[returnIndex] = currentSeam('RETURN_CHAIN', { apply_return_ref: null });
result = compile(returnWithoutApply);
assert.equal(result.status, 'UNKNOWN');
assert.ok(result.seams[returnIndex].missing_bindings.includes('apply_return_ref'));

const detonatorWithoutTripDebt = allCurrent();
const detIndex = STANDARD_REJOIN_FAMILIES.indexOf('DETONATOR');
detonatorWithoutTripDebt[detIndex] = currentSeam('DETONATOR', { trip_debt_ref: null });
result = compile(detonatorWithoutTripDebt);
assert.equal(result.status, 'UNKNOWN');
assert.ok(result.seams[detIndex].missing_bindings.includes('trip_debt_ref'));

const providerConnectedOnly = allCurrent();
providerConnectedOnly[mcpIndex] = currentSeam('MCP', {
  state: 'UNKNOWN', provider_family: 'MCP_PROVIDER', endpoint_ref: 'endpoint:connected', evidence_ref: null, readback_ref: null,
});
result = compile(providerConnectedOnly);
assert.equal(result.current, false);
assert.equal(result.status, 'UNKNOWN');

const nA = allCurrent().filter((row) => row.family !== 'MCP');
nA.push({ seam_id: 'mcp:not-applicable', family: 'MCP', required: false, applicability: 'N_A_WITH_EVIDENCE', state: 'N_A_WITH_EVIDENCE', evidence_ref: 'evidence:profile-no-mcp' });
result = compile(nA);
assert.equal(result.status, 'CURRENT_BOUNDED');
assert.equal(result.missing_families.length, 0);

const nAWithoutEvidence = [...nA.filter((row) => row.family !== 'MCP'), { seam_id: 'mcp:not-applicable', family: 'MCP', required: false, state: 'N_A_WITH_EVIDENCE' }];
result = compile(nAWithoutEvidence);
assert.equal(result.status, 'UNKNOWN');

const missingFamily = allCurrent().filter((row) => row.family !== 'MCP');
result = compile(missingFamily);
assert.deepEqual(result.missing_families, ['MCP']);
assert.equal(result.current, false);

result = compile(allCurrent(), { subject_generation: 'g1' });
assert.equal(result.status, 'REBASE_REQUIRED');
assert.equal(result.current, false);

assert.throws(() => compileRejoinSeams({ root_ref: 'root:test', agent_ref: 'agent:test', subject_generation: 'g2', current_generation: 'g2', seams: [] }), /SEAM_DENOMINATOR_REQUIRED/);
const duplicate = allCurrent(); duplicate.push(currentSeam('ACK'));
assert.throws(() => compile(duplicate), /DUPLICATE_SEAM_ID/);

console.log('REJOIN_SEAMS_PASS current=17/17 peer_identity_access_required=1 stale_only_affected=1 provider_wait=1 malformed_wait_fail_closed=1 crm_mail_identity_access_required=1 crm_mail_config_only_fail_closed=1 cloudflare_hostname_only_fail_closed=1 transport_endpoint_required=1 return_apply_required=1 detonator_trip_debt_required=1 evidence_na=1 missing_family_fail_closed=1 root_rebase=1');
