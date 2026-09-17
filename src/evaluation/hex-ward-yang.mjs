import { compileGraduationPreflight, GRADUATION_PROFILES } from '../preflight/graduation.mjs';

export const HEX_WARD_YANG_SCHEMA = 'xiio.sdk.hex-ward-yang/v1';

const HOSTILES = Object.freeze([
  ['HEX-WARD-E0-STALE-ADAPTER','E0','FAIL','STALE_ADAPTER_GENERATION','wake:refresh-adapter-generation'],
  ['HEX-WARD-E1-SCOPE-MISMATCH','E1','FAIL','SUBJECT_OR_EFFECT_SCOPE_MISMATCH','wake:resolve-exact-subject-scope'],
  ['HEX-WARD-E2-STALE-GUARD','E2','FAIL','WARD_POLICY_OR_GUARD_STALE','wake:ward-current-policy-readback'],
  ['HEX-WARD-E3-UNKNOWN-AFFECTED','E3','WAIT','AFFECTED_NO_EFFECT_DISPOSITION_UNKNOWN','wake:compile-current-affected-set'],
  ['HEX-WARD-E4-DISCLOSURE-UNION','E4','FAIL','LEAST_DISCLOSURE_OR_PRIVACY_BOUNDARY_BROKEN','wake:ward-disclosure-recompute'],
  ['HEX-WARD-E5-NO-ADMISSION','E5','WAIT','CONSEQUENTIAL_EFFECT_ADMISSION_MISSING','wake:switchboard-admission'],
  ['HEX-WARD-E6-PRIOR-EFFECT-UNKNOWN','E6','WAIT','PRIOR_EFFECT_OR_IDEMPOTENCY_STATE_UNKNOWN','wake:reconcile-prior-effect'],
  ['HEX-WARD-E7-EARLY-ATTEMPT','E7','FAIL','ATTEMPT_OBSERVED_BEFORE_CURRENT_GUARD_OR_ADMISSION','wake:reset-and-readmit'],
  ['HEX-WARD-E8-RESULT-NO-READBACK','E8','WAIT','PROVIDER_RESULT_WITHOUT_NATIVE_READBACK','wake:native-readback'],
  ['HEX-WARD-E9-STRANDED-RESULT','E9','FAIL','RESULT_WITHOUT_RETURN_APPLY_RETURN_REAP','wake:return-apply-reap'],
]);

function baseCells() {
  return Object.fromEntries(GRADUATION_PROFILES.WARD_E0_E9.map(([id]) => [id, {
    state: 'PASS',
    reason: 'HEX_CLEAN_CONTROL',
    evidence_refs: [`fixture:hex-ward:${id}:clean`],
    blockers: [],
  }]));
}

export function compileHexWardYang({ subject_ref = 'fixture:hex-ward-yang', source_generation = 'fixture:g1' } = {}) {
  const cleanInput = { profile: 'WARD_E0_E9', subject_ref, source_generation, cells: baseCells() };
  const clean = compileGraduationPreflight(cleanInput);
  const hostiles = HOSTILES.map(([case_id, cell, state, reason, wake]) => {
    const input = structuredClone(cleanInput);
    input.cells[cell] = {
      state,
      reason,
      evidence_refs: [`fixture:${case_id}:evidence`],
      blockers: [wake],
    };
    // Deliberately leave every later cell green. The preflight must still stop at this red.
    const result = compileGraduationPreflight(input);
    return {
      case_id,
      injected_cell: cell,
      injected_state: state,
      first_red: result.first_red,
      graduated_through: result.graduated_through,
      later_green_preserved: result.cells.filter((row) => row.id > cell).some((row) => row.state === 'PASS'),
      blocked: result.release_eligible === false && result.first_red?.cell === cell,
      authority_granted: result.authority_granted,
      provider_effect: result.provider_effect,
    };
  });

  const noEffectInput = structuredClone(cleanInput);
  noEffectInput.cells.E5 = {
    state: 'N_A_WITH_REASON',
    reason: 'NO_CONSEQUENTIAL_EFFECT_IN_FIXTURE',
    evidence_refs: ['fixture:no-effect:read-only'],
    blockers: [],
  };
  const noEffect = compileGraduationPreflight(noEffectInput);

  return {
    schema: HEX_WARD_YANG_SCHEMA,
    profile: 'WARD_E0_E9',
    subject_ref,
    source_generation,
    clean_control: { release_eligible: clean.release_eligible, first_red: clean.first_red },
    no_effect_control: { release_eligible: noEffect.release_eligible, e5_state: noEffect.cells.find((row) => row.id === 'E5')?.state },
    hostile_denominator: hostiles.length,
    hostile_blocked: hostiles.filter((row) => row.blocked).length,
    hostiles,
    provider_effects: 0,
    authority_granted: false,
    hard: [
      'HEX_CAN_BREAK!=HEX_CAN_AUTHORIZE',
      'LATER_GREEN!=EARLIER_RED_CLEARED',
      'WARD_PASS!=SWITCHBOARD_AUTHORITY',
      'PROVIDER_RESULT!=NATIVE_READBACK',
      'UNKNOWN_PRIOR_EFFECT!=SAFE_RETRY',
      'NO_EFFECT_REQUIRES_REASON_AND_EVIDENCE',
      'SIM_PASS!=RUNTIME_PASS',
    ],
  };
}
