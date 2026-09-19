export const X_INTERSECTION_INPUT_SCHEMA = 'xiio.sdk.x-intersection-ux-input/v1';
export const X_INTERSECTION_SCHEMA = 'xiio.sdk.x-intersection-ux/v1';

const STATES = new Set(['AFFECTED','NO_EFFECT','N_A','UNKNOWN']);
const bit = (v,n) => { if (v !== 0 && v !== 1) throw new TypeError(`${n} must be 0|1`); return v; };
const text = (v,n) => {
  if (typeof v !== 'string' || v.trim() !== v || v.length === 0 || v.length > 512) throw new TypeError(`${n} required`);
  return v;
};
const refs = (v,n) => {
  if (!Array.isArray(v)) throw new TypeError(`${n} must be an array`);
  return [...new Set(v.map((x)=>text(x,n)))].sort();
};

function project(row) {
  const state = text(row.state,'project.state');
  if (!STATES.has(state)) throw new TypeError('project.state invalid');
  const project_ref = text(row.project_ref,'project.project_ref');
  const project_generation = text(row.project_generation,'project.project_generation');
  const sdk_ack_ref = row.sdk_ack_ref == null ? null : text(row.sdk_ack_ref,'project.sdk_ack_ref');
  const result_ref = row.result_ref == null ? null : text(row.result_ref,'project.result_ref');
  const return_ref = row.return_ref == null ? null : text(row.return_ref,'project.return_ref');
  const apply_return_ref = row.apply_return_ref == null ? null : text(row.apply_return_ref,'project.apply_return_ref');
  const evidence_refs = refs(row.evidence_refs ?? [],'project.evidence_refs');
  const help_offered_bit = bit(row.help_offered_bit,'project.help_offered_bit');
  const help_disposition_ref = row.help_disposition_ref == null ? null : text(row.help_disposition_ref,'project.help_disposition_ref');

  const blockers = [];
  if (state === 'AFFECTED' && !sdk_ack_ref) blockers.push('AFFECTED_WITHOUT_SDK_ACK');
  if (state !== 'UNKNOWN' && evidence_refs.length === 0) blockers.push('DISPOSITION_WITHOUT_EVIDENCE');
  if (help_offered_bit === 1 && !help_disposition_ref) blockers.push('HELP_OFFER_WITHOUT_DISPOSITION');
  if (state === 'AFFECTED' && (!result_ref || !return_ref || !apply_return_ref)) blockers.push('AFFECTED_RETURN_CHAIN_INCOMPLETE');

  return Object.freeze({
    project_ref, project_generation, state, sdk_ack_ref, evidence_refs,
    help_offered_bit, help_disposition_ref, result_ref, return_ref, apply_return_ref,
    blockers:Object.freeze(blockers)
  });
}

export function compileXIntersectionUx(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input must be object');
  if (input.schema !== X_INTERSECTION_INPUT_SCHEMA) throw new TypeError('input schema mismatch');

  const root_ref = text(input.root_ref,'root_ref');
  const source_generation = text(input.source_generation,'source_generation');
  const intersection_ref = text(input.intersection_ref,'intersection_ref');
  const deadline_ref = text(input.deadline_ref,'deadline_ref');
  const priority_order = refs(input.priority_order,'priority_order');
  if (priority_order.length === 0) throw new TypeError('priority_order required');

  const golden = input.golden ?? {};
  const sub = input.sub ?? {};
  const timeline = input.timeline ?? {};
  const flatplane = input.flatplane ?? {};
  const rotation = input.rotation ?? {};

  const golden_bound = bit(golden.bound_bit,'golden.bound_bit');
  const sub_bound = bit(sub.bound_bit,'sub.bound_bit');
  const timeline_bound = bit(timeline.bound_bit,'timeline.bound_bit');
  const priority_bound = bit(timeline.priority_bound_bit,'timeline.priority_bound_bit');
  const deadline_coordinate_bound = bit(timeline.deadline_coordinate_bound_bit,'timeline.deadline_coordinate_bound_bit');

  const floor_bound = bit(flatplane.floor_bound_bit,'flatplane.floor_bound_bit');
  const mid_bound = bit(flatplane.mid_bound_bit,'flatplane.mid_bound_bit');
  const top_bound = bit(flatplane.top_bound_bit,'flatplane.top_bound_bit');
  const top_derived_symmetrically = bit(flatplane.top_derived_symmetrically_bit,'flatplane.top_derived_symmetrically_bit');

  const sectors_total = rotation.sectors_total;
  const sectors_accounted = rotation.sectors_accounted;
  const duplicate_sectors = rotation.duplicate_sectors;
  if (![sectors_total,sectors_accounted,duplicate_sectors].every(Number.isInteger)) throw new TypeError('rotation sector counts must be integers');
  if (sectors_total <= 0 || sectors_accounted < 0 || duplicate_sectors < 0) throw new TypeError('rotation sector counts invalid');

  if (!Array.isArray(input.projects) || input.projects.length === 0) throw new TypeError('projects required');
  const projects = input.projects.map(project).sort((a,b)=>a.project_ref.localeCompare(b.project_ref));
  const uniqueProjects = new Set(projects.map((x)=>x.project_ref));
  if (uniqueProjects.size !== projects.length) throw new TypeError('duplicate project_ref');

  const blockers = [];
  if (!(golden_bound && sub_bound)) blockers.push('GOLDEN_SUB_NOT_BOTH_BOUND');
  if (!(timeline_bound && priority_bound && deadline_coordinate_bound)) blockers.push('TIMELINE_PRIORITY_DEADLINE_NOT_BOUND');
  if (!(floor_bound && mid_bound && top_bound)) blockers.push('FLATPLANE_PLANE_MISSING');
  if (top_bound && !top_derived_symmetrically) blockers.push('TOP_NOT_DERIVED_SYMMETRICALLY');
  if (sectors_accounted !== sectors_total) blockers.push('ROTATION_DENOMINATOR_INCOMPLETE');
  if (duplicate_sectors !== 0) blockers.push('ROTATION_DUPLICATE_SECTORS');
  if (projects.some((p)=>p.blockers.length)) blockers.push('PROJECT_INTERSECTION_DISPOSITION_INCOMPLETE');
  if (projects.some((p)=>p.state === 'UNKNOWN')) blockers.push('PROJECT_INTERSECTION_UNKNOWN');

  const flatplane_10s_complete = floor_bound === 1 && mid_bound === 1 && top_bound === 1 && top_derived_symmetrically === 1;
  const rotation_100s_accounting = sectors_accounted === sectors_total && duplicate_sectors === 0;
  const intersection_complete =
    golden_bound === 1 && sub_bound === 1 &&
    timeline_bound === 1 && priority_bound === 1 && deadline_coordinate_bound === 1 &&
    flatplane_10s_complete && rotation_100s_accounting &&
    projects.every((p)=>p.blockers.length === 0 && p.state !== 'UNKNOWN');

  return Object.freeze({
    schema:X_INTERSECTION_SCHEMA,
    root_ref, source_generation, intersection_ref, deadline_ref, priority_order:Object.freeze(priority_order),
    golden_bound:golden_bound===1, sub_bound:sub_bound===1,
    timeline_priority_spine_bound:timeline_bound===1 && priority_bound===1,
    deadline_coordinate_bound:deadline_coordinate_bound===1,
    flatplane_10s_complete,
    rotation_100s_accounting,
    sectors_total, sectors_accounted, duplicate_sectors,
    studio_registry_denominator:projects.length,
    project_dispositions:Object.freeze(projects),
    blockers:Object.freeze(blockers),
    intersection_complete,
    patch_candidate:intersection_complete,
    revision_current:false,
    authority_granted:false,
    provider_effect:false,
    hard:Object.freeze([
      'TRINITY_WITHOUT_TIMELINE_PRIORITY_SPINE != COMPLETE_TRINITY',
      'FLATPLANE_10S != ROTATED_100S',
      'ROTATION_COVERAGE_100 != CLOSURE_100',
      '100S_COMPLETE != PATCH_ACCEPTED',
      'PATCH != REVISION',
      'REGISTERED_PROJECT_OMITTED != COMPLETE_INTERSECTION',
      'AVAILABLE_TEAMMATE_HELP_IGNORED != FAN_IN',
      'NO_REPLY != NO_EFFECT',
      'UNKNOWN != N_A',
      'PROJECT_COUNT != WORKER_COUNT',
      'ONE_CHILD_RED != ROOT_RESTART',
      'FRACTAL_ERROR != RESTART'
    ])
  });
}
