export const VERSIONED_CONSENT_SCHEMA = 'xiio.versioned-document-consent/v1';

const text = (value) => String(value ?? '').trim();

export function compileVersionedConsentGate({
  documentKind = 'document',
  canonicalRef,
  canonicalGeneration,
  previousSignedGeneration = null,
  signerRef = null,
  diffRef = null,
  canonicalAvailable = true,
} = {}) {
  const ref = text(canonicalRef);
  const generation = text(canonicalGeneration);
  const prior = text(previousSignedGeneration);
  if (!ref) throw new Error('CANONICAL_REF_REQUIRED');
  if (!generation) throw new Error('CANONICAL_GENERATION_REQUIRED');

  const firstSigning = !prior;
  const changed = !firstSigning && prior !== generation;
  const status = canonicalAvailable !== true
    ? 'BLOCKED_CANONICAL_UNAVAILABLE'
    : changed
      ? 'CHANGE_REVIEW_REQUIRED'
      : 'READY_TO_REVIEW_AND_SIGN';

  return Object.freeze({
    schema: VERSIONED_CONSENT_SCHEMA,
    document_kind: documentKind,
    canonical_ref: ref,
    canonical_generation: generation,
    signer_ref: signerRef,
    previous_signed_generation: prior || null,
    first_signing: firstSigning,
    changed_since_previous_signing: changed,
    diff_ref: changed ? diffRef : null,
    status,
    signing_allowed: canonicalAvailable === true && !changed,
    display_requirements: changed
      ? ['SHOW_CURRENT_CANONICAL_VERSION','SHOW_CHANGE_NOTICE','SHOW_DIFF_OR_CHANGE_SUMMARY_BEFORE_SIGNING']
      : ['SHOW_CURRENT_CANONICAL_VERSION'],
    next: canonicalAvailable !== true
      ? 'RECOVER_CANONICAL_SOURCE'
      : changed
        ? 'PRESENT_CHANGES_AND_REQUIRE_NEW_CONSENT'
        : 'PRESENT_FOR_REVIEW_AND_EXPLICIT_CONSENT',
    hard: [
      'PROJECTED_COPY != CANONICAL_SOURCE',
      'DISPLAYED_ONCE != CONSENT_TO_CHANGED_VERSION',
      'SOURCE_GENERATION_CHANGE => REVIEW_REQUIRED',
      'PREVIOUS_SIGNATURE != CONSENT_TO_NEW_GENERATION',
      'CHANGE_NOTICE_REQUIRED_BEFORE_RE_SIGNING',
      'SDK_GATE != LEGAL_VALIDITY_OPINION',
    ],
  });
}

export function compileLeaseConsentGate(input = {}) {
  return compileVersionedConsentGate({ ...input, documentKind: 'lease' });
}
