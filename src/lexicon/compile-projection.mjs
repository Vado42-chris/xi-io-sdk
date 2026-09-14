import registry from './projection-kinds.json' with { type: 'json' };
import { validateOpaqueRef } from '../ibal/cold-start-hydration.mjs';

const kinds = new Map(Object.entries(registry.families).flatMap(([family, values]) => values.map(kind => [kind, family])));
const validRef = value => validateOpaqueRef(value).ok;

/** Produces one inert, cross-language projection envelope. */
export function compileProjection(input = {}) {
  const blockers = [];
  const projection = input.projection ?? {};
  const root = input.root ?? {};
  const requireRef = (value, code) => { if (!validRef(value)) blockers.push(code); };
  requireRef(projection.ref, 'PROJECTION_REF_INVALID');
  requireRef(projection.generation, 'PROJECTION_GENERATION_INVALID');
  requireRef(root.ref, 'ROOT_REF_INVALID');
  requireRef(root.generation, 'ROOT_GENERATION_INVALID');
  requireRef(input.observer_ref, 'OBSERVER_REF_INVALID');
  requireRef(input.owner_ref, 'OWNER_REF_INVALID');
  requireRef(input.privacy?.policy_ref, 'PRIVACY_POLICY_REF_INVALID');
  requireRef(input.privacy?.policy_generation, 'PRIVACY_POLICY_GENERATION_INVALID');
  requireRef(input.return_target?.ref, 'RETURN_TARGET_REF_INVALID');
  if (!kinds.has(projection.kind)) blockers.push('PROJECTION_KIND_UNKNOWN');
  for (const [key, values] of [['subject_refs', input.subject_refs], ['source_refs', input.source_refs]]) {
    if (!Array.isArray(values) || values.length === 0) blockers.push(`${key.toUpperCase()}_REQUIRED`);
    else if (values.some(value => !validRef(value))) blockers.push(`${key.toUpperCase()}_INVALID`);
    else if (new Set(values).size !== values.length) blockers.push(`${key.toUpperCase()}_DUPLICATE`);
  }
  if (projection.label != null && typeof projection.label !== 'string') blockers.push('PROJECTION_LABEL_MUST_BE_TEXT');
  if (!['proposed', 'active', 'blocked', 'accepted', 'canonical', 'superseded', 'deprecated'].includes(input.lifecycle_state)) blockers.push('LIFECYCLE_STATE_INVALID');
  const unique = [...new Set(blockers)];
  return {
    schema: 'xiio.sdk.projection-envelope/v1',
    registry: { schema: registry.schema, generation: registry.generation },
    state: unique.length ? 'BLOCKED' : 'PROJECTION_COMPILED_NO_EFFECT',
    blockers: unique,
    projection: { ref: projection.ref ?? null, generation: projection.generation ?? null, kind: projection.kind ?? null, family: kinds.get(projection.kind) ?? null, label: projection.label ?? null },
    root: { ref: root.ref ?? null, generation: root.generation ?? null },
    subject_refs: input.subject_refs ?? [], source_refs: input.source_refs ?? [],
    observer_ref: input.observer_ref ?? null, owner_ref: input.owner_ref ?? null,
    privacy: input.privacy ?? null, lifecycle_state: input.lifecycle_state ?? null,
    return_target: input.return_target ?? null,
    authority: { admit: false, ack: false, execute: false, effect: false, publish: false, deploy: false },
    provider_effect: false, closure_claimed: false
  };
}

export function projectionKindRegistry() { return structuredClone(registry); }
