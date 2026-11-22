// Generic currentness check for a runtime snapshot read from an installed runtime.
// Product schema names are supplied by the caller; this module knows only the shape:
// health must be RUNNING with an installed generation, the snapshot must be CURRENT for the
// exact work and source generation, and the named runtime agent must hold a dispatchable
// assignment at that generation. It binds coordinates; it does not grant worker or effect
// authority.

export function bindRuntimeSnapshotCurrentness({
  health,
  body,
  work_ref,
  source_generation,
  runtime_agent_id,
  assignment_ref,
  health_schema,
  snapshot_schema,
} = {}) {
  const need = (v, name) => {
    const s = String(v ?? '').trim();
    if (!s) throw new Error(`RUNTIME_SNAPSHOT_${name}_REQUIRED`);
    return s;
  };
  const work = need(work_ref, 'WORK_REF');
  const generation = need(source_generation, 'SOURCE_GENERATION');
  const agent = need(runtime_agent_id, 'RUNTIME_AGENT_ID');
  const assignment = need(assignment_ref, 'ASSIGNMENT_REF');
  need(health_schema, 'HEALTH_SCHEMA');
  need(snapshot_schema, 'SNAPSHOT_SCHEMA');

  if (health?.schema !== health_schema || health.state !== 'RUNNING' || !health.installed_generation) {
    throw new Error('RUNTIME_HEALTH_UNVERIFIED');
  }
  const snapshot = body?.snapshot;
  if (
    body?.schema !== snapshot_schema ||
    body.state !== 'CURRENT' ||
    !snapshot ||
    body.work_id !== work ||
    snapshot.work_id !== work ||
    snapshot.source_generation !== generation
  ) {
    throw new Error('RUNTIME_SNAPSHOT_NOT_CURRENT');
  }
  const dispatchable =
    Array.isArray(snapshot.workers) &&
    snapshot.workers.some(
      (row) =>
        row?.agent_id === agent &&
        row.assignment?.assignment_ref === assignment &&
        row.assignment?.source_generation === generation &&
        row.canDispatch === true,
    );
  if (!dispatchable) throw new Error('RUNTIME_ASSIGNMENT_NOT_DISPATCHABLE');

  const project_id = String(snapshot.project_id || body.project_id || '').trim();
  if (!project_id) throw new Error('RUNTIME_SNAPSHOT_PROJECT_ID_REQUIRED');
  return Object.freeze({
    ...snapshot,
    state: 'CURRENT',
    project_id,
    work_id: work,
    source_generation: generation,
    runtime_generation: String(health.installed_generation),
  });
}
