import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_INTERACTION_CONTRACT_GENERATION,
  AGENT_INTERACTION_MODE_IDS,
  agentInteractionModeDefinition,
  compileAgentInteractionProfile,
} from '../src/interaction/agent-modes.mjs';

const G = AGENT_INTERACTION_CONTRACT_GENERATION;
const allCapabilities = [
  'CONVERSATION',
  'PLAN_PERSISTENCE',
  'DIAGNOSTICS',
  'QUALIFIED_TOOLS',
  'WORK_ASSIGNMENT',
  'EFFECT_AUTHORIZATION',
  'RESULT_READBACK',
  'WORKER_ADMISSION',
  'WORKER_DISPATCH',
  'RESULT_COLLECTION',
];
const AUTH_CLASSES = ['EFFECT_AUTHORIZATION', 'WORKER_ADMISSION', 'WORKER_DISPATCH', 'WORK_ASSIGNMENT'];

const prov = (issuer, ref = `${issuer}:ref`) => ({ issuer, ref, contract_generation: G });
const fullProviders = (classes = allCapabilities) => Object.fromEntries(
  classes.map((c) => [c, { installed: true, qualified: true, provenance: prov('switchboard', `switchboard:${c}`) }]),
);
const fullGrant = (grants = AUTH_CLASSES) => ({ provenance: prov('ward', 'ward:grant'), grants });
const admissions = [{ worker_ref: 'worker:1', provenance: prov('switchboard', 'switchboard:worker:1') }];

const profile = (overrides = {}) => ({
  product_ref: 'product:ibal',
  contract_generation: G,
  supported_modes: ['ask', 'plan', 'debug', 'agent', 'multitask'],
  capability_classes: allCapabilities,
  selected_mode: 'ask',
  permission_mode: 'read_only',
  authorization_ref: 'ward:binding:test',
  delivery_gate: 'dev',
  providers: fullProviders(),
  authorization_grant: fullGrant(),
  worker_admissions: admissions,
  ...overrides,
});
const modeOf = (out, id) => out.modes.find((m) => m.id === id);

test('canonical interaction vocabulary is exactly Ask Plan Debug Agent Multitask', () => {
  assert.deepEqual(AGENT_INTERACTION_MODE_IDS, ['ask', 'plan', 'debug', 'agent', 'multitask']);
  assert.equal(agentInteractionModeDefinition('Ask').label, 'Ask');
  assert.equal(agentInteractionModeDefinition('Multitask').label, 'Multitask');
});

test('full verified evidence makes all five modes available while read_only still refuses effects', () => {
  const out = compileAgentInteractionProfile(profile({ selected_mode: 'agent' }));
  assert.equal(out.selected_mode_state, 'AVAILABLE');
  assert.deepEqual(out.modes.map((m) => m.state), ['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE']);
  assert.deepEqual(out.effects, { allowed: false, reason: 'PERMISSION_READ_ONLY' });
  assert.equal(out.effect_authority, false);
  assert.equal(out.provider_effect, false);
  assert.equal(out.axes.authorization.grant, 'VERIFIED');
  assert.equal(out.axes.delivery.verified, false);
});

test('changing Ask to Agent never widens the permission or delivery axes', () => {
  const ask = compileAgentInteractionProfile(profile({ selected_mode: 'ask' }));
  const agent = compileAgentInteractionProfile(profile({ selected_mode: 'agent' }));
  assert.equal(ask.axes.authorization.permission_mode, agent.axes.authorization.permission_mode);
  assert.equal(ask.axes.delivery.gate, agent.axes.delivery.gate);
  assert.equal(agent.effect_authority, false);
});

test('Debug availability does not grant shell or provider effects', () => {
  const out = compileAgentInteractionProfile(profile({
    supported_modes: ['debug'],
    capability_classes: ['CONVERSATION', 'DIAGNOSTICS'],
    providers: fullProviders(['CONVERSATION', 'DIAGNOSTICS']),
    authorization_grant: undefined,
    worker_admissions: undefined,
    selected_mode: 'debug',
    authorization_ref: null,
    delivery_gate: 'test',
  }));
  assert.equal(out.selected_mode_state, 'AVAILABLE');
  assert.equal(out.axes.authorization.state, 'UNBOUND');
  assert.equal(out.effect_authority, false);
  assert.equal(out.provider_effect, false);
  assert(out.hard.includes('DEBUG != SHELL_EFFECT_AUTHORITY'));
});

test('Agent is unavailable when its execution-owner capabilities are not declared', () => {
  const out = compileAgentInteractionProfile(profile({
    supported_modes: ['agent'],
    capability_classes: ['CONVERSATION', 'QUALIFIED_TOOLS'],
    providers: fullProviders(['CONVERSATION', 'QUALIFIED_TOOLS']),
    selected_mode: 'agent',
  }));
  const agent = modeOf(out, 'agent');
  assert.equal(agent.state, 'UNAVAILABLE');
  assert.equal(agent.reason, 'PROVIDER_MISSING');
  assert.deepEqual(agent.missing_capabilities, ['WORK_ASSIGNMENT', 'EFFECT_AUTHORIZATION', 'RESULT_READBACK']);
  assert.equal(out.authority_granted, false);
});

test('product capability profile may expose only an applicable subset', () => {
  const out = compileAgentInteractionProfile(profile({
    supported_modes: ['ask', 'debug'],
    capability_classes: ['CONVERSATION', 'DIAGNOSTICS'],
    providers: fullProviders(['CONVERSATION', 'DIAGNOSTICS']),
    selected_mode: 'ask',
  }));
  assert.deepEqual(
    Object.fromEntries(out.modes.map((m) => [m.id, m.state])),
    { ask: 'AVAILABLE', plan: 'UNSUPPORTED', debug: 'AVAILABLE', agent: 'UNSUPPORTED', multitask: 'UNSUPPORTED' },
  );
});

test('delivery gate is preserved as a separate supplied-unverified axis', () => {
  const out = compileAgentInteractionProfile(profile({ delivery_gate: 'live' }));
  assert.equal(out.axes.delivery.gate, 'LIVE');
  assert.equal(out.axes.delivery.verified, false);
  assert.throws(() => compileAgentInteractionProfile(profile({ delivery_gate: 'agent' })), /DELIVERY_GATE_INVALID/);
});

test('case-normalized duplicate modes and capabilities are refused', () => {
  assert.throws(() => compileAgentInteractionProfile(profile({ supported_modes: ['Ask', 'ask'] })), /SUPPORTED_MODES_INVALID/);
  assert.throws(() => compileAgentInteractionProfile(profile({ capability_classes: ['diagnostics', 'DIAGNOSTICS'] })), /CAPABILITY_CLASSES_INVALID/);
});

test('getter-backed top-level fields and sparse arrays cannot execute during projection', () => {
  let effects = 0;
  const hostile = profile();
  Object.defineProperty(hostile, 'supported_modes', {
    enumerable: true,
    get() { effects += 1; return ['ask']; },
  });
  assert.throws(() => compileAgentInteractionProfile(hostile), /SUPPORTED_MODES_REQUIRED/);
  assert.equal(effects, 0);

  const sparse = ['ask', , 'debug'];
  assert.throws(() => compileAgentInteractionProfile(profile({ supported_modes: sparse })), /SUPPORTED_MODES_INVALID/);
  assert.equal(effects, 0);
});

test('getter-backed array entries cannot execute during projection', () => {
  let effects = 0;
  const capabilities = ['CONVERSATION', 'DIAGNOSTICS'];
  Object.defineProperty(capabilities, '1', {
    enumerable: true,
    get() { effects += 1; return 'DIAGNOSTICS'; },
  });
  assert.throws(
    () => compileAgentInteractionProfile(profile({ supported_modes: ['debug'], capability_classes: capabilities })),
    /CAPABILITY_CLASSES_INVALID/,
  );
  assert.equal(effects, 0);
});

test('prototype-chain names are never accepted as interaction modes', () => {
  for (const hostile of ['constructor', '__proto__']) {
    assert.throws(() => compileAgentInteractionProfile(profile({ supported_modes: [hostile] })), /AGENT_INTERACTION_MODE_UNKNOWN/);
    assert.throws(() => compileAgentInteractionProfile(profile({ selected_mode: hostile })), /AGENT_INTERACTION_MODE_UNKNOWN/);
    assert.throws(() => agentInteractionModeDefinition(hostile), /AGENT_INTERACTION_MODE_UNKNOWN/);
  }
});

// ---- Hostile regressions (PR #331 gap closure) ----

test('regression: unknown or older contract generation is refused, never accepted', () => {
  for (const contract_generation of ['sdk:test:g1', 'xiio.sdk.agent-interaction-mode-contract/v2', '']) {
    assert.throws(
      () => compileAgentInteractionProfile(profile({ contract_generation })),
      /CONTRACT_GENERATION/,
      `generation ${contract_generation}`,
    );
  }
});

test('regression: missing, unqualified and unauthorized are three distinct reasons', () => {
  const missing = compileAgentInteractionProfile(profile({ providers: {}, selected_mode: 'ask' }));
  assert.equal(modeOf(missing, 'ask').state, 'UNAVAILABLE');
  assert.equal(modeOf(missing, 'ask').reason, 'PROVIDER_MISSING');

  const unqualified = compileAgentInteractionProfile(profile({
    providers: { ...fullProviders(), CONVERSATION: { installed: true, qualified: false, provenance: prov('switchboard', 'switchboard:CONVERSATION') } },
    selected_mode: 'ask',
  }));
  assert.equal(modeOf(unqualified, 'ask').state, 'UNAVAILABLE');
  assert.equal(modeOf(unqualified, 'ask').reason, 'PROVIDER_UNQUALIFIED');

  const unauthorized = compileAgentInteractionProfile(profile({ authorization_grant: fullGrant([]), selected_mode: 'agent', permission_mode: 'ask_each' }));
  assert.equal(modeOf(unauthorized, 'agent').state, 'BLOCKED');
  assert.equal(modeOf(unauthorized, 'agent').reason, 'AUTHORIZATION_REQUIRED');

  for (const out of [missing, unqualified, unauthorized]) {
    assert.equal(out.effect_authority, false);
    assert.equal(out.authority_granted, false);
  }
});

test('regression: caller booleans and wrong-issuer provenance never qualify a capability', () => {
  // qualified:true with no provenance is still unqualified
  const noProvenance = compileAgentInteractionProfile(profile({
    providers: { ...fullProviders(), CONVERSATION: { installed: true, qualified: true } },
    selected_mode: 'ask',
  }));
  assert.equal(modeOf(noProvenance, 'ask').reason, 'PROVIDER_UNQUALIFIED');

  // a Ward-issued record cannot stand in for a Switchboard provider qualification
  const wrongIssuer = compileAgentInteractionProfile(profile({
    providers: { ...fullProviders(), CONVERSATION: { installed: true, qualified: true, provenance: prov('ward', 'ward:x') } },
    selected_mode: 'ask',
  }));
  assert.equal(modeOf(wrongIssuer, 'ask').reason, 'PROVIDER_UNQUALIFIED');

  // provider evidence from another contract generation is refused
  const staleGeneration = compileAgentInteractionProfile(profile({
    providers: { ...fullProviders(), CONVERSATION: { installed: true, qualified: true, provenance: { issuer: 'switchboard', ref: 'x', contract_generation: 'xiio.sdk.agent-interaction-mode-contract/v0' } } },
    selected_mode: 'ask',
  }));
  assert.equal(modeOf(staleGeneration, 'ask').reason, 'PROVIDER_UNQUALIFIED');

  // a grant issued by Switchboard does not authorize effects; the grant axis reports UNVERIFIED
  const wrongGrant = compileAgentInteractionProfile(profile({
    authorization_grant: { provenance: prov('switchboard', 'switchboard:grant'), grants: AUTH_CLASSES },
    selected_mode: 'agent',
    permission_mode: 'ask_each',
  }));
  assert.equal(modeOf(wrongGrant, 'agent').reason, 'AUTHORIZATION_REQUIRED');
  assert.equal(wrongGrant.axes.authorization.grant, 'UNVERIFIED');
  assert.equal(wrongGrant.effects.allowed, false);
});

test('regression: Agent selected under read_only keeps its selection and refuses effects', () => {
  const out = compileAgentInteractionProfile(profile({ selected_mode: 'agent', permission_mode: 'read_only' }));
  assert.equal(out.selected_mode, 'agent');
  assert.equal(out.selected_mode_state, 'AVAILABLE');
  assert.deepEqual(out.effects, { allowed: false, reason: 'PERMISSION_READ_ONLY' });
  assert.equal(out.effect_authority, false);
});

test('regression: Agent under ask_each with verified grant is the only path to effects', () => {
  const out = compileAgentInteractionProfile(profile({ selected_mode: 'agent', permission_mode: 'ask_each' }));
  assert.deepEqual(out.effects, { allowed: true, reason: 'OK' });
  assert.equal(out.effect_authority, true);
});

test('regression: Multitask without an admitted worker refuses dispatch', () => {
  const none = compileAgentInteractionProfile(profile({ selected_mode: 'multitask', permission_mode: 'ask_each', worker_admissions: [] }));
  assert.equal(none.selected_mode_state, 'BLOCKED');
  assert.equal(none.selected_mode_reason, 'WORKER_NOT_ADMITTED');
  assert.equal(none.dispatch.allowed, false);
  assert.equal(none.dispatch.reason, 'WORKER_NOT_ADMITTED');
  assert.equal(none.worker_identity_granted, false);

  // an admission not issued by Switchboard does not count
  const wrongIssuer = compileAgentInteractionProfile(profile({
    selected_mode: 'multitask',
    permission_mode: 'ask_each',
    worker_admissions: [{ worker_ref: 'worker:1', provenance: prov('ward', 'ward:worker') }],
  }));
  assert.equal(wrongIssuer.dispatch.allowed, false);

  const admitted = compileAgentInteractionProfile(profile({ selected_mode: 'multitask', permission_mode: 'ask_each' }));
  assert.equal(admitted.dispatch.allowed, true);
  assert.equal(admitted.worker_identity_granted, false);
  assert.equal(admitted.worker_assignment_granted, false);
});

test('regression: a restored Multitask never restores authority from saved state', () => {
  const restored = compileAgentInteractionProfile(profile({
    selected_mode: undefined,
    restored_selection: {
      mode: 'multitask',
      authority: { authorization_grant: fullGrant(), worker_admissions: admissions },
    },
    providers: {},
    authorization_grant: undefined,
    worker_admissions: undefined,
    permission_mode: 'ask_each',
  }));
  assert.equal(restored.selected_mode, 'multitask');
  assert.equal(restored.selected_mode_state, 'UNAVAILABLE');
  assert.equal(restored.selected_mode_reason, 'PROVIDER_MISSING');
  assert.deepEqual(restored.restored, { mode: 'multitask', saved_authority_ignored: true });
  assert.equal(restored.effects.allowed, false);
  assert.equal(restored.dispatch.allowed, false);
  assert.equal(restored.authority_granted, false);
});

test('regression: a restored selection with current evidence still needs current admission', () => {
  const out = compileAgentInteractionProfile(profile({
    selected_mode: undefined,
    restored_selection: { mode: 'multitask' },
    worker_admissions: [],
    permission_mode: 'ask_each',
  }));
  assert.equal(out.selected_mode_state, 'BLOCKED');
  assert.equal(out.selected_mode_reason, 'WORKER_NOT_ADMITTED');
});

test('regression: a restored mode that conflicts with the current selection is refused', () => {
  assert.throws(
    () => compileAgentInteractionProfile(profile({ selected_mode: 'ask', restored_selection: { mode: 'multitask' } })),
    /RESTORE_MISMATCH/,
  );
});

test('regression: an authorized action without a verified RETURN is not complete', () => {
  const base = profile({ selected_mode: 'agent', permission_mode: 'ask_each', action: { ref: 'action:1' } });

  const awaiting = compileAgentInteractionProfile(base);
  assert.equal(awaiting.execution.state, 'AUTHORIZED_AWAITING_RETURN');
  assert.equal(awaiting.execution.complete, false);

  const wrongRef = compileAgentInteractionProfile({
    ...base,
    returns: [{ action_ref: 'action:2', provenance: prov('switchboard', 'switchboard:return:2') }],
  });
  assert.equal(wrongRef.execution.complete, false);

  const wrongIssuer = compileAgentInteractionProfile({
    ...base,
    returns: [{ action_ref: 'action:1', provenance: prov('ward', 'ward:return') }],
  });
  assert.equal(wrongIssuer.execution.complete, false);

  const verified = compileAgentInteractionProfile({
    ...base,
    returns: [{ action_ref: 'action:1', provenance: prov('switchboard', 'switchboard:return:1') }],
  });
  assert.equal(verified.execution.state, 'RETURN_VERIFIED');
  assert.equal(verified.execution.complete, true);

  const refused = compileAgentInteractionProfile(profile({ selected_mode: 'agent', permission_mode: 'read_only', action: { ref: 'action:1' } }));
  assert.equal(refused.execution.state, 'REFUSED');
  assert.equal(refused.execution.complete, false);
});

test('regression: getter-backed provider evidence refuses without executing', () => {
  let effects = 0;
  const providers = fullProviders();
  Object.defineProperty(providers, 'CONVERSATION', {
    enumerable: true,
    get() { effects += 1; return { installed: true, qualified: true }; },
  });
  assert.throws(() => compileAgentInteractionProfile(profile({ providers })), /PROVIDERS_INVALID/);
  assert.equal(effects, 0);
});
