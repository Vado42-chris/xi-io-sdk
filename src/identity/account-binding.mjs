/* ── WHICH OF YOUR ACCOUNTS OWNS THIS · xiio.sdk.account-binding/v1 ──────────
 *
 * One person often has several accounts with the same provider: the owner of
 * this estate signs in to GitHub as one account in the browser while his work
 * lives under another. Every plugin that creates something owned — a team, a
 * channel, a repo link, a workspace — has to answer "owned by WHICH account",
 * and until now none of them could: a team kit carried no owner at all, so the
 * answer was whatever account the browser happened to be signed in to.
 *
 * This module is the one answer, shared by every plugin (Zed, Studio, Base44
 * connectors). Three steps, each refusing what it cannot prove:
 *
 *   observeAccount   an account exists only when a provider said so (an OAuth
 *                    or provider-API readback). A typed login, an email
 *                    address or a pasted token is not an account.
 *   chooseAccount    the person picks one of the accounts that were observed.
 *                    Nothing is picked for them, and an account that was not
 *                    observed cannot be picked.
 *   bindOwner        the owned thing records the provider's STABLE subject id
 *                    (github:12345), never the login (which can be renamed)
 *                    and never the email (which is not an identity).
 *
 * Nothing here signs anyone in, stores a credential or grants authority. It
 * only refuses to let an owner be guessed. Tokens never enter these records:
 * an input that carries one is refused and the token is not echoed back.
 */

export const ACCOUNT_BINDING_SCHEMA = 'xiio.sdk.account-binding/v1';

const OBSERVED_VIA = Object.freeze(['oauth_readback', 'provider_api_readback']);
const SECRET_KEYS = /^(access_?token|refresh_?token|id_?token|token|password|secret|client_?secret|api_?key|authorization)$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function refuse(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function text(value, code, max = 256) {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > max) refuse(code);
  return value;
}

function noSecrets(input) {
  for (const key of Object.keys(input || {})) if (SECRET_KEYS.test(key)) refuse('SECRET_FIELD_REFUSED');
}

/** An account the provider itself reported. */
export function observeAccount(input = {}) {
  noSecrets(input);
  const provider = text(input.provider, 'PROVIDER_REQUIRED', 64).toLowerCase();
  if (!OBSERVED_VIA.includes(input.observed_via)) refuse('ACCOUNT_NOT_OBSERVED');
  const subject = input.subject_id;
  if (!(Number.isInteger(subject) && subject > 0) && !(typeof subject === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(subject))) {
    refuse('SUBJECT_ID_REQUIRED');
  }
  const login = text(input.login, 'LOGIN_REQUIRED', 128);
  if (EMAIL.test(login)) refuse('EMAIL_IS_NOT_AN_ACCOUNT');
  const observedAt = text(input.observed_at, 'OBSERVED_AT_REQUIRED', 64);
  if (Number.isNaN(Date.parse(observedAt))) refuse('OBSERVED_AT_REQUIRED');
  return Object.freeze({
    schema: ACCOUNT_BINDING_SCHEMA,
    kind: 'OBSERVED_ACCOUNT',
    provider,
    subject_id: String(subject),
    principal_ref: `${provider}:${subject}`,
    login,
    observed_via: input.observed_via,
    observed_at: observedAt,
    authority_granted: false,
  });
}

/** The person's own pick among observed accounts. `chosen` is a principal_ref or a login. */
export function chooseAccount(observed = [], chosen, { chosen_by } = {}) {
  if (!Array.isArray(observed) || observed.length === 0) refuse('NO_OBSERVED_ACCOUNTS');
  for (const account of observed) {
    if (account?.kind !== 'OBSERVED_ACCOUNT' || account?.schema !== ACCOUNT_BINDING_SCHEMA) refuse('ACCOUNT_NOT_OBSERVED');
  }
  text(chosen_by, 'CHOICE_ACTOR_REQUIRED', 128);
  if (chosen_by === 'default' || chosen_by === 'browser_session') refuse('CHOICE_MUST_BE_THE_PERSONS');
  const pick = text(chosen, 'CHOICE_REQUIRED', 256);
  const matches = observed.filter((a) => a.principal_ref === pick || a.login.toLowerCase() === pick.toLowerCase());
  if (matches.length === 0) refuse('CHOSEN_ACCOUNT_NOT_OBSERVED');
  const unique = new Set(matches.map((a) => a.principal_ref));
  if (unique.size > 1) refuse('CHOICE_AMBIGUOUS');
  return Object.freeze({
    schema: ACCOUNT_BINDING_SCHEMA,
    kind: 'CHOSEN_ACCOUNT',
    account: matches[0],
    chosen_by,
    alternatives: Object.freeze(observed.filter((a) => a.principal_ref !== matches[0].principal_ref).map((a) => a.login)),
    authority_granted: false,
  });
}

/** Stamp an owned thing (a team kit, a channel, a workspace) with its owner. */
export function bindOwner(subject = {}, choice) {
  noSecrets(subject);
  if (choice?.kind !== 'CHOSEN_ACCOUNT' || choice?.schema !== ACCOUNT_BINDING_SCHEMA) refuse('OWNER_NOT_CHOSEN');
  if (subject.owner_principal_ref && subject.owner_principal_ref !== choice.account.principal_ref) refuse('OWNER_ALREADY_BOUND');
  return Object.freeze({
    ...subject,
    owner_principal_ref: choice.account.principal_ref,
    owner_display: `${choice.account.provider}:${choice.account.login}`,
    owner_observed_at: choice.account.observed_at,
    authority_granted: false,
    hard: Object.freeze([
      'BROWSER_SESSION != CHOSEN_ACCOUNT',
      'EMAIL != PRINCIPAL',
      'LOGIN != PRINCIPAL',
      'TYPED_LOGIN != OBSERVED_ACCOUNT',
      'OWNER_BOUND != AUTHORITY_GRANTED',
    ]),
  });
}
