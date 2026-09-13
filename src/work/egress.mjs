const ACTIVE = new Set(['CURRENT','RUNNABLE','WAIT']);
const TERMINAL = new Set(['COMPLETED','SUPERSEDED','CANCELLED']);
const STATES = new Set(['REQUESTED','POSTED','ACK','READ_BACK','BLOCKED_TOOL_OR_PROVIDER','DEGRADED','UNKNOWN']);
const WAKE = new Set(['BLOCKED_TOOL_OR_PROVIDER','DEGRADED','UNKNOWN']);
const KIND = /^[A-Z][A-Z0-9_]{0,63}$/;

function req(v, code) {
  if (typeof v !== 'string' || !v.trim()) throw new Error(code);
  return v.trim();
}

function projection(row, i) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`PROJECTION_OBJECT_REQUIRED:${i}`);
  const ref = req(row.projection_ref, `PROJECTION_REF_REQUIRED:${i}`);
  const kind = req(row.kind, `PROJECTION_KIND_REQUIRED:${ref}`).toUpperCase();
  const status = req(row.status, `PROJECTION_STATUS_REQUIRED:${ref}`).toUpperCase();
  if (!KIND.test(kind)) throw new Error(`PROJECTION_KIND_INVALID:${ref}`);
  if (!STATES.has(status)) throw new Error(`PROJECTION_STATUS_INVALID:${ref}`);
  if (status === 'READ_BACK' && !String(row.provider_readback_ref || '').trim()) throw new Error(`PROVIDER_READBACK_REF_REQUIRED:${ref}`);
  if (WAKE.has(status) && !String(row.wake || '').trim()) throw new Error(`PROJECTION_WAKE_REQUIRED:${ref}`);
  if (row.registry_size_observed != null && (!Number.isSafeInteger(row.registry_size_observed) || row.registry_size_observed < 0)) throw new Error(`REGISTRY_SIZE_INVALID:${ref}`);
  return {
    projection_ref: ref,
    plugin_ref: req(row.plugin_ref, `PLUGIN_REF_REQUIRED:${ref}`),
    manifest_ref: req(row.manifest_ref, `MANIFEST_REF_REQUIRED:${ref}`),
    manifest_generation: req(row.manifest_generation, `MANIFEST_GENERATION_REQUIRED:${ref}`),
    capability_ref: req(row.capability_ref, `CAPABILITY_REF_REQUIRED:${ref}`),
    capability_generation: req(row.capability_generation, `CAPABILITY_GENERATION_REQUIRED:${ref}`),
    provider_family: req(row.provider_family, `PROVIDER_FAMILY_REQUIRED:${ref}`),
    adapter_ref: req(row.adapter_ref, `ADAPTER_REF_REQUIRED:${ref}`),
    adapter_generation: req(row.adapter_generation, `ADAPTER_GENERATION_REQUIRED:${ref}`),
    registry_ref: req(row.registry_ref, `REGISTRY_REF_REQUIRED:${ref}`),
    registry_generation: req(row.registry_generation, `REGISTRY_GENERATION_REQUIRED:${ref}`),
    registry_size_observed: row.registry_size_observed ?? null,
    surface_ref: req(row.surface_ref, `SURFACE_REF_REQUIRED:${ref}`),
    kind,
    status,
    provider_readback_ref: String(row.provider_readback_ref || '').trim() || null,
    wake: String(row.wake || '').trim() || null,
  };
}

export function compileWorkEgressProjection(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INPUT_OBJECT_REQUIRED');
  const workState = req(input.work_state, 'WORK_STATE_REQUIRED').toUpperCase();
  if (!ACTIVE.has(workState) && !TERMINAL.has(workState)) throw new Error('WORK_STATE_INVALID');
  if (!Number.isInteger(input.work_revision) || input.work_revision < 1) throw new Error('WORK_REVISION_REQUIRED');
  const rows = Array.isArray(input.projections) ? input.projections.map(projection) : [];
  if (new Set(rows.map(x => x.projection_ref)).size !== rows.length) throw new Error('PROJECTION_REF_DUPLICATE');
  const terminal = TERMINAL.has(workState);
  const unknown = rows.filter(x => x.status === 'UNKNOWN');
  const blocked = rows.filter(x => ['BLOCKED_TOOL_OR_PROVIDER','DEGRADED'].includes(x.status));
  const pending = rows.filter(x => ['REQUESTED','POSTED','ACK'].includes(x.status));
  const read = rows.filter(x => x.status === 'READ_BACK');
  let disposition = 'CONTINUE_INTERNAL_FRONTIER';
  if (terminal) disposition = 'NO_OP_TERMINAL_WORK';
  else if (unknown.length) disposition = 'WAIT_PROVIDER_CURRENTNESS';
  else if (blocked.length) disposition = 'DEGRADED_EGRESS_CONTINUE_INTERNAL';
  else if (pending.length) disposition = 'WAIT_PROVIDER_READBACK_CONTINUE_INTERNAL';
  else if (rows.length && read.length === rows.length) disposition = 'EGRESS_READBACK_CURRENT';
  return {
    schema: 'xiio.sdk.work-egress-projection/v2',
    root_ref: req(input.root_ref, 'ROOT_REF_REQUIRED'),
    project_ref: req(input.project_ref, 'PROJECT_REF_REQUIRED'),
    work_ref: req(input.work_ref, 'CANONICAL_WORK_REF_REQUIRED'),
    work_revision: input.work_revision,
    work_state: workState,
    work_terminal: terminal,
    crm_card_ref: req(input.crm_card_ref, 'CRM_CARD_REF_REQUIRED'),
    punchcard_ref: req(input.punchcard_ref, 'PUNCHCARD_REF_REQUIRED'),
    punchcard_generation: req(input.punchcard_generation, 'PUNCHCARD_GENERATION_REQUIRED'),
    cadence_wake_ref: req(input.cadence_wake_ref, 'CADENCE_WAKE_REF_REQUIRED'),
    hot_folder_ref: req(input.hot_folder_ref, 'HOT_FOLDER_REF_REQUIRED'),
    return_target_ref: req(input.return_target_ref, 'RETURN_TARGET_REF_REQUIRED'),
    projections: rows,
    disposition,
    canonical_work_preserved: true,
    projection_eligible: !terminal,
    root_stop: false,
    provider_effect_authority: false,
    registry_authority: false,
    hard: [
      'WORDPRESS != SPECIAL_EGRESS_PLANE',
      'PLUGIN_IDENTITY != TARGET_NATIVE_IDENTITY',
      'PLUGIN_MANIFEST_REF != PLUGIN_MANIFEST_CURRENT',
      'CAPABILITY_REF != CAPABILITY_CURRENT',
      'TARGET_REGISTRY_REF != TARGET_REGISTRY_CURRENT',
      'REGISTRY_SIZE != AUTHORITY',
      'PROVIDER_OBJECT_ID != CANONICAL_WORK_ID',
      'PROVIDER_FAILURE != WORK_FAILURE',
      'ONE_EGRESS_BLOCK != ROOT_STOP',
      'WORK_TERMINAL != ROOT_TERMINAL',
      'READ_BACK != OWNER_ACCEPTANCE'
    ],
  };
}
