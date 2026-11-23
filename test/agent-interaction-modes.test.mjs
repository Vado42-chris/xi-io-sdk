import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_INTERACTION_MODE_IDS,
  agentInteractionModeDefinition,
  compileAgentInteractionProfile,
} from '../src/interaction/agent-modes.mjs';

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

const profile = (overrides = {}) => ({
  product_ref: 'product:ibal',
  contract_generation: 'sdk:test:g1',
  supported_modes: ['ask', 'plan', 'debug', 'agent', 'multitask'],
  capability_classes: allCapabilities,
  selected_mode: 'ask',
  permission_mode: 'read_only',
  authorization_ref: 'ward:binding:test',
  delivery_gate: 'dev',
  ...overrides,
});

test('canonical interaction vocabulary is exactly Ask Plan Debug Agent Multitask', () => {
  assert.deepEqual(AGENT_INTERACTION_MODE_IDS, ['ask', 'plan', 'debug', 'agent', 'multitask']);
  assert.equal(agentInteractionModeDefinition('Ask').label, 'Ask');
  assert.equal(agentInteractionModeDefinition('Plan').label, 'Plan');
  assert.equal(agentInteractionModeDefinition('Debug').label, 'Debug');
  assert.equal(agentInteractionModeDefinition('Agent').label, 'Agent');
  assert.equal(agentInteractionModeDefinition('Multitask').label, 'Multitask');
});

test('all supported capabilities can make all five modes available without granting authority', () => {
  const out = compileAgentInteractionProfile(profile({ selected_mode: 'agent' }));
  assert.equal(out.selected_mode, 'agent');
  assert.equal(out.selected_mode_state, 'AVAILABLE');
  assert.deepEqual(out.modes.map((mode) => mode.state), ['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE']);
  assert.equal(out.axes.authorization.permission_mode, 'read_only');
  assert.equal(out.axes.authorization.state, 'SUPPLIED_UNVERIFIED');
  assert.equal(out.axes.delivery.gate, 'DEV');
  assert.equal(out.axes.delivery.state, 'SUPPLIED_UNVERIFIED');
  assert.equal(out.effect_authority, false);
  assert.equal(out.authority_granted, false);
  assert.equal(out.provider_effect, false);
});

test('changing Ask to Agent never widens the permission or delivery axes', () => {
  const ask = compileAgentInteractionProfile(profile({ selected_mode: 'ask' }));
  const agent = compileAgentInteractionProfile(profile({ selected_mode: 'agent' }));
  assert.equal(ask.axes.authorization.permission_mode, agent.axes.authorization.permission_mode);
  assert.equal(ask.axes.authorization.authorization_ref, agent.axes.authorization.authorization_ref);
  assert.equal(ask.axes.delivery.gate, agent.axes.delivery.gate);
  assert.equal(agent.effect_authority, false);
  assert.equal(agent.authority_granted, false);
});

test('Debug availability does not grant shell or provider effects', () => {
  const out = compileAgentInteractionProfile(profile({
    supported_modes: ['debug'],
    capability_classes: ['CONVERSATION', 'DIAGNOSTICS'],
    selected_mode: 'debug',
    permission_mode: 'read_only',
    authorization_ref: null,
    delivery_gate: 'test',
  }));
  assert.equal(out.selected_mode_state, 'AVAILABLE');
  assert.equal(out.axes.authorization.state, 'UNBOUND');
  assert.equal(out.effect_authority, false);
  assert.equal(out.provider_effect, false);
  assert(out.hard.includes('DEBUG != SHELL_EFFECT_AUTHORITY'));
});

test('Agent remains blocked when its execution-owner capabilities are missing', () => {
  const out = compileAgentInteractionProfile(profile({
    supported_modes: ['agent'],
    capability_classes: ['CONVERSATION', 'QUALIFIED_TOOLS'],
    selected_mode: 'agent',
  }));
  const agent = out.modes.find((mode) => mode.id === 'agent');
  assert.equal(agent.state, 'BLOCKED');
  assert.deepEqual(agent.missing_capabilities, ['WORK_ASSIGNMENT', 'EFFECT_AUTHORIZATION', 'RESULT_READBACK']);
  assert.equal(out.authority_granted, false);
});

test('Multitask never fabricates worker identity or assignment', () => {
  const out = compileAgentInteractionProfile(profile({
    supported_modes: ['multitask'],
    capability_classes: ['CONVERSATION', 'WORKER_ADMISSION', 'WORKER_DISPATCH', 'WORK_ASSIGNMENT', 'RESULT_COLLECTION'],
    selected_mode: 'multitask',
  }));
  assert.equal(out.selected_mode_state, 'AVAILABLE');
  assert.equal(out.worker_identity_granted, false);
  assert.equal(out.worker_assignment_granted, false);
  assert(out.hard.includes('MULTITASK_SELECTED != WORKER_IDENTITY'));
});

test('product capability profile may expose only an applicable subset', () => {
  const out = compileAgentInteractionProfile(profile({
    supported_modes: ['ask', 'debug'],
    capability_classes: ['CONVERSATION', 'DIAGNOSTICS'],
    selected_mode: 'ask',
  }));
  assert.deepEqual(
    Object.fromEntries(out.modes.map((mode) => [mode.id, mode.state])),
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
  assert.throws(
    () => compileAgentInteractionProfile(profile({ supported_modes: ['Ask', 'ask'] })),
    /SUPPORTED_MODES_INVALID/,
  );
  assert.throws(
    () => compileAgentInteractionProfile(profile({ capability_classes: ['diagnostics', 'DIAGNOSTICS'] })),
    /CAPABILITY_CLASSES_INVALID/,
  );
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
  assert.throws(
    () => compileAgentInteractionProfile(profile({ supported_modes: sparse })),
    /SUPPORTED_MODES_INVALID/,
  );
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
    assert.throws(
      () => compileAgentInteractionProfile(profile({ supported_modes: [hostile] })),
      /AGENT_INTERACTION_MODE_UNKNOWN/,
    );
    assert.throws(
      () => compileAgentInteractionProfile(profile({ selected_mode: hostile })),
      /AGENT_INTERACTION_MODE_UNKNOWN/,
    );
    assert.throws(
      () => agentInteractionModeDefinition(hostile),
      /AGENT_INTERACTION_MODE_UNKNOWN/,
    );
  }
});
