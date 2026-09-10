import assert from 'node:assert/strict';
import { compileContinuationDirective } from '../src/cadence/self-drive.mjs';

const observedAt = '2026-09-10T18:25:00-06:00';

function seam(family, extra = {}) {
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

function base() {
  return {
    root_ref: 'root:rejoin-canary',
    worker_ref: 'agent:rejoin-canary',
    subject_generation: 'g2',
    current_generation: 'g2',
    phase_event: 'PRE_ENTRY',
    pass_state: 'PASS',
    four_scale: { MICRO: '100', MESO: '100', MACRO: '100', META: '100' },
    backlog: [], returns: [], residue: [], occurrences: [],
    worker_inbox: { ref: 'inbox:agent:rejoin-canary', current: true, actionable_count: 0 },
    async_continuation_required: true,
    owner_heartbeat_count: 0,
    rejoin_seams: [seam('ACK'), seam('A2A'), seam('MCP')],
  };
}

const staleAck = base();
staleAck.rejoin_seams[0] = seam('ACK', { subject_generation: 'g1' });
let result = compileContinuationDirective(staleAck);
assert.equal(result.stop_class, 'CONTINUE');
assert.equal(result.yield_allowed, false);
assert.equal(result.next_packet.action, 'REFRESH_REJOIN_SEAMS');
assert.equal(result.rejoin_seams.stale_required, 1);
assert.deepEqual(result.next_packet.seam_refresh_obligations.map((row) => row.family), ['ACK']);

const blockedMcpWithSibling = base();
blockedMcpWithSibling.backlog = [{ id: 'work:sibling', state: 'RUNNABLE', priority: 1 }];
blockedMcpWithSibling.rejoin_seams[2] = seam('MCP', {
  state: 'UNKNOWN', evidence_ref: null, readback_ref: null,
  resolution_class: 'TRUE_WAIT', wake_when: 'provider://mcp/registration-readback',
});
result = compileContinuationDirective(blockedMcpWithSibling);
assert.equal(result.stop_class, 'CONTINUE');
assert.equal(result.next_packet.action, 'EXECUTE_WORK');
assert.equal(result.next_packet.work_ref, 'work:sibling');
assert.equal(result.rejoin_seams.true_wait_refresh_count, 1);

const onlyProviderWait = base();
onlyProviderWait.rejoin_seams[2] = seam('MCP', {
  state: 'UNKNOWN', evidence_ref: null, readback_ref: null,
  resolution_class: 'TRUE_WAIT', wake_when: 'provider://mcp/registration-readback',
});
result = compileContinuationDirective(onlyProviderWait);
assert.equal(result.stop_class, 'TRUE_WAIT');
assert.equal(result.yield_allowed, true);
assert.equal(result.waits[0].family, 'MCP');
assert.equal(result.waits[0].wake_when, 'provider://mcp/registration-readback');

const missingMcp = base();
missingMcp.rejoin_seams = [seam('ACK'), seam('A2A')];
result = compileContinuationDirective(missingMcp);
assert.equal(result.stop_class, 'CONTINUE');
assert.equal(result.next_packet.action, 'RESOLVE_REJOIN_SEAM_DENOMINATOR');
assert.deepEqual(result.next_packet.missing_seam_families, ['MCP']);

const ownerOnlyA2a = base();
ownerOnlyA2a.rejoin_seams[1] = seam('A2A', {
  state: 'UNKNOWN', evidence_ref: null, readback_ref: null,
  resolution_class: 'OWNER_ONLY', wake_when: 'owner://approve/a2a-connection',
});
result = compileContinuationDirective(ownerOnlyA2a);
assert.equal(result.stop_class, 'OWNER_ONLY');
assert.equal(result.yield_allowed, true);
assert.equal(result.waits[0].family, 'A2A');

const heartbeatBug = base();
heartbeatBug.owner_heartbeat_count = 1;
heartbeatBug.rejoin_seams[0] = seam('ACK', { subject_generation: 'g1' });
result = compileContinuationDirective(heartbeatBug);
assert.equal(result.stop_class, 'CONTINUE');
assert.equal(result.owner_heartbeat_bug, true);
assert.equal(result.status, 'FAIL_CURRENT');
assert.equal(result.bug, 'OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT');

const allCurrent = base();
result = compileContinuationDirective(allCurrent);
assert.equal(result.rejoin_seams.status, 'CURRENT_BOUNDED');
assert.equal(result.stop_class, 'TERMINAL');
assert.equal(result.yield_allowed, true);

console.log('SELF_DRIVE_REJOIN_SEAMS_PASS stale_ack_auto_refresh=1 provider_wait_sibling_continues=1 exact_true_wait=1 missing_family_machine_resolve=1 owner_only=1 heartbeat_bug=1 all_current_terminal=1 effects=0');
