import crypto from 'node:crypto';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;
const DIRECTIONS = Object.freeze(['UPSTREAM', 'CURRENT', 'SIBLING', 'DOWNSTREAM']);
const STATES = Object.freeze(['AFFECTED', 'NO_EFFECT', 'UNKNOWN']);
const CURRENTNESS = Object.freeze(['CURRENT', 'STALE', 'UNKNOWN']);
const PRIORITIES = Object.freeze(['P0', 'P1', 'P2', 'P3', 'P4']);
const ROLES = Object.freeze(['EXECUTE_RESOLVE', 'DISCOVER_HOSTILE', 'UX_QUAL_QUANT']);
const PHASES = Object.freeze(['DISCOVER', 'BIND', 'VERIFY']);
const CONCERNS = Object.freeze(['BASELINE_CURRENTNESS', 'CAPABILITY_API_RUNTIME', 'UX_BRAND_HUMAN']);
const WAVE = Object.freeze({ UPSTREAM: 0, CURRENT: 1, SIBLING: 2, DOWNSTREAM: 3 });
const PRIORITY_WEIGHT = Object.freeze({ P0: 5, P1: 4, P2: 3, P3: 2, P4: 1 });

function ref(value, name) {
  if (typeof value !== 'string' || !REF.test(value)) throw new TypeError(`${name} invalid`);
  return value;
}
function int(value, name, min = 0, max = 4) {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${name} invalid`);
  return value;
}
function bool(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} invalid`);
  return value;
}
function stableUuid(name) {
  const bytes = Buffer.from(crypto.createHash('sha256').update(name).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function cube() {
  return PHASES.flatMap(phase => CONCERNS.flatMap(concern => ROLES.map(role => ({
    slot_type_id: `${phase}:${concern}:${role}`,
    phase, concern, role,
  }))));
}

function nodePlan(root, node) {
  ref(node.ref, 'node.ref');
  if (!DIRECTIONS.includes(node.direction)) throw new TypeError('node.direction invalid');
  if (!STATES.includes(node.state)) throw new TypeError('node.state invalid');
  if (!CURRENTNESS.includes(node.currentness)) throw new TypeError('node.currentness invalid');
  if (!PRIORITIES.includes(node.priority)) throw new TypeError('node.priority invalid');
  for (const k of ['risk','user_impact','time_pressure','fanout','cognitive_load']) int(node[k], `node.${k}`);
  bool(node.human_facing, 'node.human_facing');
  bool(node.independent_review_required, 'node.independent_review_required');
  bool(node.ux_review_required, 'node.ux_review_required');
  bool(node.parallel_safe, 'node.parallel_safe');
  if (![true, false, null].includes(node.runnable)) throw new TypeError('node.runnable invalid');
  if (!Array.isArray(node.dependencies) || node.dependencies.some(x => typeof x !== 'string' || !REF.test(x))) throw new TypeError('node.dependencies invalid');

  const pressure = PRIORITY_WEIGHT[node.priority] + node.risk + node.user_impact + node.time_pressure + node.fanout + node.cognitive_load;
  const roles = [];
  const blockers = [];
  let operation = 'NO_EFFECT';
  if (node.state === 'NO_EFFECT') {
    operation = 'NO_EFFECT';
  } else if (node.currentness !== 'CURRENT') {
    operation = 'REBASE_READBACK';
    roles.push('EXECUTE_RESOLVE', 'DISCOVER_HOSTILE');
    blockers.push('CURRENTNESS_NOT_CURRENT');
    if (node.human_facing || node.ux_review_required || node.user_impact > 0 || node.cognitive_load > 0) roles.push('UX_QUAL_QUANT');
  } else if (node.state === 'UNKNOWN') {
    operation = 'CLASSIFY_AFFECTEDNESS';
    roles.push('DISCOVER_HOSTILE');
    blockers.push('AFFECTEDNESS_UNKNOWN');
    if (node.human_facing || node.ux_review_required) roles.push('UX_QUAL_QUANT');
  } else if (node.runnable === true) {
    operation = 'BURN_AFFECTED_CELL';
    roles.push('EXECUTE_RESOLVE');
    if (node.risk > 0 || node.independent_review_required) roles.push('DISCOVER_HOSTILE');
    if (node.human_facing || node.ux_review_required || node.user_impact > 0 || node.cognitive_load > 0) roles.push('UX_QUAL_QUANT');
  } else {
    operation = 'WAIT_DEPENDENCY';
    roles.push('DISCOVER_HOSTILE');
    blockers.push(node.runnable === false ? 'NOT_RUNNABLE' : 'RUNNABILITY_UNKNOWN');
    if (node.human_facing || node.ux_review_required) roles.push('UX_QUAL_QUANT');
  }
  const uniqueRoles = [...new Set(roles)];
  const seatCount = uniqueRoles.length;
  let minPrincipals = seatCount ? 1 : 0;
  if (node.independent_review_required && uniqueRoles.includes('DISCOVER_HOSTILE')) minPrincipals += 1;
  if (node.ux_review_required && uniqueRoles.includes('UX_QUAL_QUANT')) minPrincipals += 1;
  minPrincipals = Math.min(seatCount, minPrincipals);

  const concernFor = role => role === 'UX_QUAL_QUANT' ? 'UX_BRAND_HUMAN'
    : node.currentness !== 'CURRENT' ? 'BASELINE_CURRENTNESS' : 'CAPABILITY_API_RUNTIME';
  const phaseFor = role => operation === 'REBASE_READBACK' || operation === 'CLASSIFY_AFFECTEDNESS' ? 'DISCOVER'
    : role === 'EXECUTE_RESOLVE' ? 'BIND' : 'VERIFY';
  const detonations = uniqueRoles.map((role, index) => {
    const phase = phaseFor(role);
    const concern = concernFor(role);
    const name = [root.root_ref, root.generation, node.ref, operation, phase, concern, role, index].join('|');
    return {
      detonation_uuid: stableUuid(name),
      target_ref: node.ref,
      parent_root_ref: root.root_ref,
      direction: node.direction,
      wave: WAVE[node.direction],
      priority: node.priority,
      pressure,
      operation,
      phase,
      concern,
      role,
      slot_type_id: `${phase}:${concern}:${role}`,
      effect_ceiling: 'NO_EFFECT',
      attempt: 0,
      authority_granted: false,
    };
  });
  return {
    ref: node.ref,
    direction: node.direction,
    wave: WAVE[node.direction],
    state: node.state,
    currentness: node.currentness,
    priority: node.priority,
    pressure,
    operation,
    blockers,
    dependencies: [...node.dependencies],
    roles: uniqueRoles,
    requested_role_seats: seatCount,
    minimum_distinct_principals: minPrincipals,
    maximum_parallel_principals: node.parallel_safe ? seatCount : Math.min(1, seatCount),
    detonations,
  };
}

export function compileImpactFormation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input invalid');
  if (input.schema !== 'xiio.sdk.impact-formation/v1') throw new TypeError('schema invalid');
  const root = input.root || {};
  ref(root.root_ref, 'root.root_ref');
  ref(root.generation, 'root.generation');
  ref(root.golden_priority_ref, 'root.golden_priority_ref');
  ref(root.formation_profile_ref, 'root.formation_profile_ref');
  if (!Array.isArray(input.nodes) || input.nodes.length < 1 || input.nodes.length > 256) throw new TypeError('nodes invalid');
  const seen = new Set();
  for (const node of input.nodes) {
    if (seen.has(node.ref)) throw new TypeError('duplicate node ref');
    seen.add(node.ref);
  }
  const plans = input.nodes.map(node => nodePlan(root, node));
  const detonations = plans.flatMap(p => p.detonations).sort((a,b) =>
    a.wave - b.wave || b.pressure - a.pressure || a.target_ref.localeCompare(b.target_ref, 'en') || a.role.localeCompare(b.role, 'en'));
  const requestedSeats = plans.reduce((n,p) => n + p.requested_role_seats, 0);
  const minPrincipals = plans.reduce((n,p) => n + p.minimum_distinct_principals, 0);
  const capacity = input.capacity || {};
  const maxPrincipals = capacity.max_principals == null ? null : int(capacity.max_principals, 'capacity.max_principals', 1, 512);
  const immediate = maxPrincipals == null ? minPrincipals : Math.min(minPrincipals, maxPrincipals);
  const affected = plans.filter(p => p.state === 'AFFECTED').length;
  const unknown = plans.filter(p => p.state === 'UNKNOWN' || p.currentness === 'UNKNOWN').length;
  return Object.freeze(JSON.parse(JSON.stringify({
    schema: 'xiio.sdk.impact-formation-projection/v1',
    root: { ...root },
    semantic_cube: { phases: PHASES, concerns: CONCERNS, roles: ROLES, denominator: 27, slot_types: cube(), note: 'PLANNING_DENOMINATOR_NOT_ALWAYS_RUNNING_AGENT_COUNT' },
    node_denominator: plans.length,
    affected_nodes: affected,
    unknown_nodes: unknown,
    requested_role_seats: requestedSeats,
    minimum_distinct_principals: minPrincipals,
    recommended_immediate_principals: immediate,
    exact_materializable_principal_count: null,
    staffing_count_state: maxPrincipals == null ? 'ROLE_SEAT_AND_PRINCIPAL_FLOOR_ONLY' : 'CAPACITY_BOUNDED_CANDIDATE_ONLY',
    capacity_state: maxPrincipals == null ? 'UNBOUND' : immediate < minPrincipals ? 'CONSTRAINED' : 'SUFFICIENT',
    plans,
    detonations,
    detonation_denominator: detonations.length,
    effects: 0,
    authority_granted: false,
    hard: [
      'DETONATION_PACKET != DISPATCH',
      'ROLE_SEAT != WORKER',
      'PRINCIPAL_FLOOR != MATERIALIZED_WORKER_COUNT',
      'EXACT_AGENT_COUNT_REQUIRES_CURRENT_QUALIFIED_WORKER_POOL',
      'WORKER_COUNT != EFFECT_AUTHORITY',
      'PRESSURE_SCORE != COMPLETION_100',
      '3X3X3_SEMANTIC_CUBE != 27_ALWAYS_RUNNING_AGENTS',
      'UPSTREAM_AFFECTED != WHOLE_PORTFOLIO_STOP',
      'UNKNOWN != NO_EFFECT',
    ],
  })));
}
