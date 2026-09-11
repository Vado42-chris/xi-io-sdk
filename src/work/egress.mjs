const ACTIVE_WORK_STATES = new Set(['CURRENT', 'RUNNABLE', 'WAIT']);
const TERMINAL_WORK_STATES = new Set(['COMPLETED', 'SUPERSEDED', 'CANCELLED']);
const PROJECTION_STATES = new Set(['REQUESTED', 'POSTED', 'ACK', 'READ_BACK', 'BLOCKED_TOOL_OR_PROVIDER', 'DEGRADED', 'UNKNOWN']);
const PROJECTION_KINDS = new Set(['TASK', 'TIMER', 'CALENDAR', 'MESSAGE']);
const WAKE_REQUIRED_STATES = new Set(['BLOCKED_TOOL_OR_PROVIDER', 'DEGRADED', 'UNKNOWN']);

function text(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function normalizeProjection(row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`PROJECTION_OBJECT_REQUIRED:${index}`);
  const projectionRef = text(row.projection_ref, `PROJECTION_REF_REQUIRED:${index}`);
  const providerFamily = text(row.provider_family, `PROVIDER_FAMILY_REQUIRED:${index}`);
  const kind = text(row.kind, `PROJECTION_KIND_REQUIRED:${index}`).toUpperCase();
  const status = text(row.status, `PROJECTION_STATUS_REQUIRED:${index}`).toUpperCase();
  if (!PROJECTION_KINDS.has(kind)) throw new Error(`PROJECTION_KIND_INVALID:${projectionRef}`);
  if (!PROJECTION_STATES.has(status)) throw new Error(`PROJECTION_STATUS_INVALID:${projectionRef}`);
  if (status === 'READ_BACK' && (typeof row.provider_readback_ref !== 'string' || !row.provider_readback_ref.trim())) {
    throw new Error(`PROVIDER_READBACK_REF_REQUIRED:${projectionRef}`);
  }
  if (WAKE_REQUIRED_STATES.has(status) && (typeof row.wake !== 'string' || !row.wake.trim())) {
    throw new Error(`PROJECTION_WAKE_REQUIRED:${projectionRef}`);
  }
  return {
    projection_ref: projectionRef,
    provider_family: providerFamily,
    kind,
    status,
    provider_readback_ref: typeof row.provider_readback_ref === 'string' && row.provider_readback_ref.trim() ? row.provider_readback_ref.trim() : null,
    wake: typeof row.wake === 'string' && row.wake.trim() ? row.wake.trim() : null,
  };
}

export function compileWorkEgressProjection(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INPUT_OBJECT_REQUIRED');

  const rootRef = text(input.root_ref, 'ROOT_REF_REQUIRED');
  const projectRef = text(input.project_ref, 'PROJECT_REF_REQUIRED');
  const workRef = text(input.work_ref, 'CANONICAL_WORK_REF_REQUIRED');
  const crmCardRef = text(input.crm_card_ref, 'CRM_CARD_REF_REQUIRED');
  const punchcardRef = text(input.punchcard_ref, 'PUNCHCARD_REF_REQUIRED');
  const punchcardGeneration = text(input.punchcard_generation, 'PUNCHCARD_GENERATION_REQUIRED');
  const cadenceWakeRef = text(input.cadence_wake_ref, 'CADENCE_WAKE_REF_REQUIRED');
  const hotFolderRef = text(input.hot_folder_ref, 'HOT_FOLDER_REF_REQUIRED');
  const returnTargetRef = text(input.return_target_ref, 'RETURN_TARGET_REF_REQUIRED');
  const workState = text(input.work_state, 'WORK_STATE_REQUIRED').toUpperCase();
  if (!Number.isInteger(input.work_revision) || input.work_revision < 1) throw new Error('WORK_REVISION_REQUIRED');
  if (!ACTIVE_WORK_STATES.has(workState) && !TERMINAL_WORK_STATES.has(workState)) throw new Error('WORK_STATE_INVALID');

  const projections = Array.isArray(input.projections)
    ? input.projections.map((row, index) => normalizeProjection(row, index))
    : [];

  const terminal = TERMINAL_WORK_STATES.has(workState);
  const blocked = projections.filter((row) => ['BLOCKED_TOOL_OR_PROVIDER', 'DEGRADED'].includes(row.status));
  const unknown = projections.filter((row) => row.status === 'UNKNOWN');
  const readBack = projections.filter((row) => row.status === 'READ_BACK');
  const pending = projections.filter((row) => ['REQUESTED', 'POSTED', 'ACK'].includes(row.status));

  let disposition = 'CONTINUE_INTERNAL_FRONTIER';
  let projectionEligible = !terminal;
  let reason = 'CANONICAL_WORK_BOUND';

  if (terminal) {
    disposition = 'NO_OP_TERMINAL_WORK';
    projectionEligible = false;
    reason = 'CURRENT_WORK_IS_TERMINAL';
  } else if (unknown.length) {
    disposition = 'WAIT_PROVIDER_CURRENTNESS';
    reason = 'PROVIDER_PROJECTION_UNKNOWN';
  } else if (blocked.length) {
    disposition = 'DEGRADED_EGRESS_CONTINUE_INTERNAL';
    reason = 'PROVIDER_PROJECTION_BLOCKED_BUT_WORK_PRESERVED';
  } else if (pending.length) {
    disposition = 'WAIT_PROVIDER_READBACK_CONTINUE_INTERNAL';
    reason = 'PROVIDER_PROJECTION_NOT_READ_BACK';
  } else if (projections.length && readBack.length === projections.length) {
    disposition = 'EGRESS_READBACK_CURRENT';
    reason = 'ALL_SUPPLIED_PROJECTIONS_READ_BACK';
  }

  return {
    schema: 'xiio.sdk.work-egress-projection/v1',
    root_ref: rootRef,
    project_ref: projectRef,
    work_ref: workRef,
    work_revision: input.work_revision,
    work_state: workState,
    work_terminal: terminal,
    crm_card_ref: crmCardRef,
    punchcard_ref: punchcardRef,
    punchcard_generation: punchcardGeneration,
    cadence_wake_ref: cadenceWakeRef,
    hot_folder_ref: hotFolderRef,
    return_target_ref: returnTargetRef,
    canonical_work_bound: true,
    canonical_work_preserved: true,
    projection_eligible: projectionEligible,
    disposition,
    reason,
    projections,
    blocked_projection_refs: blocked.map((row) => row.projection_ref),
    unknown_projection_refs: unknown.map((row) => row.projection_ref),
    provider_effect_authority: false,
    work_authority: false,
    root_stop: false,
    next: terminal ? 'REBASE_CURRENT_WORK_FRONTIER' : 'CONTINUE_ELIGIBLE_INTERNAL_WORK_AND_RECONCILE_PROVIDER_PROJECTIONS',
    hard: [
      'THIRD_PARTY_TIMER != WORKITEM',
      'TIMER_CREATED != WORK_CAPTURED',
      'PROVIDER_ID != CANONICAL_WORK_ID',
      'PROVIDER_FAILURE != WORK_FAILURE',
      'ONE_EGRESS_BLOCK != ROOT_STOP',
      'WORK_TERMINAL != ROOT_TERMINAL',
      'REMINDER != RETURN',
      'OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT = BUG',
    ],
  };
}
