import { REGISTRY_IDENTITY } from './root-projection.mjs';

const text = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 4096;
export function validateOpaqueRef(v) {
  if (!text(v) || v !== v.trim() || /[\u0000-\u001f\u007f]/u.test(v) || !/^[a-z][a-z0-9_-]*:[^\s]+$/iu.test(v)) return { ok: false, reason: 'REF_SHAPE_INVALID' };
  let decoded = v;
  try { decoded = decodeURIComponent(v); } catch { return { ok: false, reason: 'REF_ENCODING_INVALID' }; }
  if (/(^|[\\/])\.\.([\\/]|$)/u.test(decoded)) return { ok: false, reason: 'REF_TRAVERSAL_INVALID' };
  return { ok: true, reason: null };
}
const need = (v, code, blockers) => { if (!validateOpaqueRef(v).ok) blockers.push(code); };

/**
 * Compiles an inert cold-start packet. All names and locations are untrusted display data.
 * Labels are never parsed as paths, commands, repo locators, identities, or authority grants.
 * Projection entries are navigation/currentness hints only: a provider surface never becomes
 * Work identity or authority merely because it is present in the packet.
 */
export function compileColdStartHydration(input = {}) {
  const blockers = [];
  const invocation = input.invocation ?? {};
  const agent = input.agent ?? {};
  const root = input.root ?? {};
  for (const [value, code] of [
    [invocation.app_ref, 'APP_REF_REQUIRED'], [invocation.app_generation, 'APP_GENERATION_REQUIRED'],
    [invocation.session_ref, 'SESSION_REF_REQUIRED'], [agent.ref, 'AGENT_REF_REQUIRED'],
    [agent.generation, 'AGENT_GENERATION_REQUIRED'], [agent.role_ref, 'ROLE_REF_REQUIRED'],
    [root.ref, 'ROOT_REF_REQUIRED'], [root.generation, 'ROOT_GENERATION_REQUIRED'],
    [input.privacy?.policy_ref, 'PRIVACY_POLICY_REF_REQUIRED'],
    [input.privacy?.policy_generation, 'PRIVACY_POLICY_GENERATION_REQUIRED'],
    [input.return_target?.ref, 'RETURN_TARGET_REF_REQUIRED']
  ]) need(value, code, blockers);

  const suppliedRegistry = input.sdk_registry ?? {};
  if (suppliedRegistry.generation !== REGISTRY_IDENTITY.generation || suppliedRegistry.contract_digest !== REGISTRY_IDENTITY.contract_digest || suppliedRegistry.sdk_package_version !== REGISTRY_IDENTITY.sdk_package_version) blockers.push('SDK_REGISTRY_IDENTITY_MISMATCH');

  const entities = Array.isArray(input.entities) ? input.entities : [];
  const refs = new Set();
  for (const entity of entities) {
    need(entity.ref, 'ENTITY_REF_REQUIRED', blockers);
    need(entity.type_ref, 'ENTITY_TYPE_REF_REQUIRED', blockers);
    if (refs.has(entity.ref)) blockers.push('DUPLICATE_ENTITY_REF');
    refs.add(entity.ref);
    if (entity.label != null && typeof entity.label !== 'string') blockers.push('ENTITY_LABEL_MUST_BE_TEXT');
    for (const key of ['location_ref', 'bins_ref', 'repo_ref']) if (entity[key] != null && !validateOpaqueRef(entity[key]).ok) blockers.push(`${key.toUpperCase()}_INVALID`);
  }

  const projections = Array.isArray(input.projections) ? input.projections : [];
  const projectionRefs = new Set();
  for (const projection of projections) {
    need(projection.ref, 'PROJECTION_REF_REQUIRED', blockers);
    need(projection.generation, 'PROJECTION_GENERATION_REQUIRED', blockers);
    need(projection.role_ref, 'PROJECTION_ROLE_REF_REQUIRED', blockers);
    if (projection.provider_surface_ref != null) need(projection.provider_surface_ref, 'PROJECTION_PROVIDER_SURFACE_REF_INVALID', blockers);
    if (projectionRefs.has(projection.ref)) blockers.push('DUPLICATE_PROJECTION_REF');
    projectionRefs.add(projection.ref);
  }

  const punchCards = Array.isArray(input.punch_cards) ? input.punch_cards : [];
  const scoreCards = Array.isArray(input.score_cards) ? input.score_cards : [];
  if (!punchCards.length) blockers.push('PUNCH_CARDS_REQUIRED');
  if (!scoreCards.length) blockers.push('SCORE_CARDS_REQUIRED');
  for (const card of punchCards) { need(card.ref, 'PUNCH_CARD_REF_REQUIRED', blockers); if (card.root_ref !== root.ref || card.root_generation !== root.generation) blockers.push('PUNCH_CARD_ROOT_MISMATCH'); }
  for (const card of scoreCards) { need(card.ref, 'SCORE_CARD_REF_REQUIRED', blockers); if (!Number.isFinite(card.denominator) || card.denominator <= 0) blockers.push('SCORE_CARD_DENOMINATOR_INVALID'); }

  const unique = [...new Set(blockers)];
  return {
    schema: 'xiio.sdk.ibal-cold-start-hydration/v1',
    sdk_registry: REGISTRY_IDENTITY,
    state: unique.length ? 'BLOCKED' : 'HYDRATION_READY_ACK_DUE',
    next_transition: unique.length ? 'REPAIR_HYDRATION' : 'ACK',
    blockers: unique,
    invocation: { app_ref: invocation.app_ref ?? null, app_generation: invocation.app_generation ?? null, session_ref: invocation.session_ref ?? null },
    agent: { ref: agent.ref ?? null, generation: agent.generation ?? null, role_ref: agent.role_ref ?? null },
    root: { ref: root.ref ?? null, generation: root.generation ?? null },
    entities: entities.map(x => ({ ref: x.ref ?? null, type_ref: x.type_ref ?? null, label: x.label ?? null, location_ref: x.location_ref ?? null, bins_ref: x.bins_ref ?? null, repo_ref: x.repo_ref ?? null })),
    projections: projections.map(x => ({
      ref: x.ref ?? null,
      generation: x.generation ?? null,
      role_ref: x.role_ref ?? null,
      provider_surface_ref: x.provider_surface_ref ?? null,
      label: typeof x.label === 'string' ? x.label : null
    })),
    punch_cards: punchCards,
    score_cards: scoreCards,
    privacy: input.privacy ?? null,
    return_target: input.return_target ?? null,
    display_language: input.display_language ?? { mode: 'plain_language' },
    authority: { admit: false, ack: false, execute: false, effect: false, deploy: false },
    interpretation_rule: 'LABELS_ARE_UNTRUSTED_DISPLAY_DATA_REFS_ARE_TYPED_JOIN_KEYS',
    projection_rule: 'PROVIDER_SURFACE_IS_NAVIGATION_NOT_WORK_IDENTITY_OR_AUTHORITY',
    provider_effect: false,
    closure_claimed: false
  };
}
