export const VERSIONED_CONSENT_SCHEMA = 'xiio.versioned-document-consent/v1';

const text = (value, key, {optional = false} = {}) => {
  if (optional && (value === null || value === undefined)) return '';
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${key}_REQUIRED`);
  return value.trim();
};

export function compileVersionedConsentGate({
  documentKind = 'document',
  canonicalRef,
  canonicalGeneration,
  previousSignedGeneration = null,
  signerRef = null,
  diffRef = null,
  canonicalAvailable = false,
} = {}) {
  const ref = text(canonicalRef, 'CANONICAL_REF');
  const generation = text(canonicalGeneration, 'CANONICAL_GENERATION');
  const prior = text(previousSignedGeneration, 'PREVIOUS_SIGNED_GENERATION', {optional: true});
  const signer = text(signerRef, 'SIGNER_REF', {optional: true});
  const diff = text(diffRef, 'DIFF_REF', {optional: true});
  const kind = text(documentKind, 'DOCUMENT_KIND');
  const available = canonicalAvailable === true;

  const firstSigning = !prior;
  const changed = !firstSigning && prior !== generation;
  const status = !available
    ? 'BLOCKED_CANONICAL_UNAVAILABLE'
    : changed
      ? 'CHANGE_REVIEW_REQUIRED'
      : !signer
        ? 'SIGNER_SELECTION_REQUIRED'
        : 'READY_TO_REVIEW_AND_SIGN';

  return Object.freeze({
    schema: VERSIONED_CONSENT_SCHEMA,
    document_kind: kind,
    canonical_ref: ref,
    canonical_generation: generation,
    signer_ref: signer || null,
    previous_signed_generation: prior || null,
    first_signing: firstSigning,
    changed_since_previous_signing: changed,
    diff_ref: changed ? diff || null : null,
    status,
    // UI eligibility only. This pure compiler never admits legal signing effects.
    signing_allowed: available && !changed && Boolean(signer),
    signing_effect_authorized: false,
    authority_granted: false,
    provider_effect: false,
    verification_state: 'SUPPLIED_UNVERIFIED',
    display_requirements: changed
      ? ['SHOW_CURRENT_CANONICAL_VERSION','SHOW_SIGNER_IDENTITY','SHOW_CHANGE_NOTICE','SHOW_DIFF_OR_CHANGE_SUMMARY_BEFORE_SIGNING']
      : ['SHOW_CURRENT_CANONICAL_VERSION','SHOW_SIGNER_IDENTITY'],
    next: !available
      ? 'RECOVER_CANONICAL_SOURCE'
      : changed
        ? 'PRESENT_CHANGES_AND_REQUIRE_NEW_CONSENT'
        : !signer
          ? 'SELECT_SIGNER'
          : 'PRESENT_FOR_REVIEW_AND_EXPLICIT_CONSENT',
    hard: [
      'PROJECTED_COPY != CANONICAL_SOURCE',
      'DISPLAYED_ONCE != CONSENT_TO_CHANGED_VERSION',
      'SOURCE_GENERATION_CHANGE => REVIEW_REQUIRED',
      'PREVIOUS_SIGNATURE != CONSENT_TO_NEW_GENERATION',
      'CHANGE_NOTICE_REQUIRED_BEFORE_RE_SIGNING',
      'MISSING_SIGNER_REF != SIGNING_UI_ELIGIBLE',
      'CALLER_SUPPLIED_CANONICAL_AVAILABILITY != PROVIDER_VERIFICATION',
      'SDK_SIGNING_ALLOWED != LEGAL_EFFECT_AUTHORIZED',
      'SDK_GATE != LEGAL_VALIDITY_OPINION',
    ],
  });
}

export function compileLeaseConsentGate(input = {}) {
  return compileVersionedConsentGate({ ...input, documentKind: 'lease' });
}

