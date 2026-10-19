/* ── SIGN IN ONCE, THEN NOTHING ASKS AGAIN · xiio.sdk.launch-session/v1 ──────
 *
 * The owner's rule, 2026-10-12: "I don't want it to ask me for my password and
 * settings every time I try launching a sub product." And: the HEX launcher
 * opens the stable Desktop with an OAuth login and a linked Zed session to edit
 * it; this is the payload shipped to Linux users.
 *
 * So there is exactly ONE place that may ask a person to sign in: the launcher.
 * Everything launched from it (Desktop, Inbox, a Studio wrapper, the Zed
 * editing session) is handed a ticket cut from that one session. A sub-product
 * that finds itself without a ticket does not prompt; it sends the person back
 * to the launcher, which asks once for everything.
 *
 * A session holds no secret. The credential stays where the OS or Ward keeps
 * it, and the session carries only `credential_ref` (credentials by
 * reference). Tickets carry the session's id and the product they are for, so
 * a ticket for Inbox cannot open Ward, and every product launched from one
 * sign-in can be traced back to it.
 *
 * Pure functions with an injected clock; nothing here talks to a provider. */

import { ACCOUNT_BINDING_SCHEMA } from './account-binding.mjs';

export const LAUNCH_SESSION_SCHEMA = 'xiio.sdk.launch-session/v1';
export const PROMPT_SURFACE = 'hex-launcher';
const MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const TICKET_MS = 12 * 60 * 60 * 1000;

function refuse(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
const SECRET_KEYS = /^(access_?token|refresh_?token|id_?token|token|password|secret|client_?secret|api_?key|authorization|cookie)$/i;
function noSecrets(input) {
  for (const key of Object.keys(input || {})) if (SECRET_KEYS.test(key)) refuse('SECRET_FIELD_REFUSED');
}
const ms = (iso, code) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) refuse(code);
  return t;
};

/** Open the one session, at the launcher, after the person chose their account. */
export function openSession(choice, { session_id, credential_ref, opened_at, expires_at, surface = PROMPT_SURFACE, ...rest } = {}) {
  noSecrets(rest);
  if (surface !== PROMPT_SURFACE) refuse('ONLY_THE_LAUNCHER_SIGNS_IN');
  if (choice?.kind !== 'CHOSEN_ACCOUNT' || choice?.schema !== ACCOUNT_BINDING_SCHEMA) refuse('ACCOUNT_NOT_CHOSEN');
  if (typeof session_id !== 'string' || !/^[A-Za-z0-9:_-]{8,128}$/.test(session_id)) refuse('SESSION_ID_REQUIRED');
  if (typeof credential_ref !== 'string' || !/^(ward|keyring):[A-Za-z0-9:/_.-]{1,256}$/.test(credential_ref)) refuse('CREDENTIAL_BY_REFERENCE_REQUIRED');
  const opened = ms(opened_at, 'OPENED_AT_REQUIRED');
  const expires = ms(expires_at, 'EXPIRES_AT_REQUIRED');
  if (expires <= opened) refuse('EXPIRES_BEFORE_OPENED');
  if (expires - opened > MAX_SESSION_MS) refuse('SESSION_TOO_LONG');
  return Object.freeze({
    schema: LAUNCH_SESSION_SCHEMA,
    kind: 'LAUNCH_SESSION',
    session_id,
    principal_ref: choice.account.principal_ref,
    account_display: `${choice.account.provider}:${choice.account.login}`,
    credential_ref,
    opened_at,
    expires_at,
    authority_granted: false,
  });
}

/** Does the person have to be asked? Only at the launcher, and only when there is no live session. */
export function mustPrompt(session, { surface, now }) {
  const live = session?.kind === 'LAUNCH_SESSION' && ms(now, 'NOW_REQUIRED') < Date.parse(session.expires_at);
  if (live) return Object.freeze({ prompt: false, reason: 'SESSION_LIVE' });
  if (surface === PROMPT_SURFACE) return Object.freeze({ prompt: true, reason: session ? 'SESSION_EXPIRED' : 'NO_SESSION' });
  /* A sub-product never asks. It goes back to the launcher, which asks once. */
  return Object.freeze({ prompt: false, reason: 'RETURN_TO_LAUNCHER', return_to: PROMPT_SURFACE });
}

/** Cut a ticket for one product from the live session. No prompt, ever. */
export function launchTicket(session, { product, now, link_ref = null } = {}) {
  if (session?.kind !== 'LAUNCH_SESSION' || session?.schema !== LAUNCH_SESSION_SCHEMA) refuse('NO_SESSION');
  if (typeof product !== 'string' || !/^[a-z0-9_:-]{2,64}$/.test(product)) refuse('PRODUCT_REQUIRED');
  const t = ms(now, 'NOW_REQUIRED');
  const end = Date.parse(session.expires_at);
  if (t >= end) refuse('SESSION_EXPIRED_RETURN_TO_LAUNCHER');
  return Object.freeze({
    schema: LAUNCH_SESSION_SCHEMA,
    kind: 'LAUNCH_TICKET',
    session_id: session.session_id,
    principal_ref: session.principal_ref,
    product,
    audience: product,
    link_ref,
    issued_at: new Date(t).toISOString(),
    expires_at: new Date(Math.min(end, t + TICKET_MS)).toISOString(),
    prompts_person: false,
    authority_granted: false,
  });
}

/** Validate a ticket from trusted launcher transport. This is not signature/authentication verification. */
export function acceptTicket(ticket, { product, now }) {
  const current = ms(now, 'NOW_REQUIRED');
  const issued = typeof ticket?.issued_at === 'string' ? Date.parse(ticket.issued_at) : NaN;
  const expires = typeof ticket?.expires_at === 'string' ? Date.parse(ticket.expires_at) : NaN;
  if (ticket?.kind !== 'LAUNCH_TICKET' || ticket.schema !== LAUNCH_SESSION_SCHEMA
      || typeof ticket.session_id !== 'string' || !/^[A-Za-z0-9:_-]{8,128}$/.test(ticket.session_id)
      || typeof ticket.principal_ref !== 'string' || !ticket.principal_ref.trim()
      || typeof ticket.product !== 'string' || !/^[a-z0-9_:-]{2,64}$/.test(ticket.product)
      || ticket.product !== ticket.audience
      || !Number.isFinite(issued) || !Number.isFinite(expires)
      || expires <= issued || expires - issued > TICKET_MS
      || current < issued || current >= expires) {
    return Object.freeze({ ok: false, reason: 'RETURN_TO_LAUNCHER' });
  }
  if (ticket.audience !== product) return Object.freeze({ ok: false, reason: 'TICKET_FOR_ANOTHER_PRODUCT' });
  return Object.freeze({ ok: true, principal_ref: ticket.principal_ref, session_id: ticket.session_id });
}

/**
 * The launch the owner described: one sign-in at the launcher, then the stable
 * Desktop and a linked external Ibal surface, both cut from that sign-in.
 * Zed is the default. Other editor adapters are an explicit user selection;
 * this plan neither discovers the current IDE nor executes an editor command.
 */
export function planDesktopLaunch(session, { now, desktop_url, zed_profile_dir, zed_workspace, external_surface, conversation_ref = null }) {
  if (typeof desktop_url !== 'string' || !/^https:\/\//.test(desktop_url)) refuse('DESKTOP_URL_HTTPS_REQUIRED');
  if (external_surface !== undefined && (!external_surface || typeof external_surface !== 'object' || Array.isArray(external_surface))) refuse('EXTERNAL_SURFACE_REQUIRED');
  const selected = external_surface ?? { product: 'zed-editor', profile_dir: zed_profile_dir, workspace: zed_workspace };
  noSecrets(selected);
  const { product, profile_dir, workspace } = selected;
  if (typeof product !== 'string' || !/^[a-z0-9_:-]{2,64}$/.test(product) || product === 'desktop') refuse('EXTERNAL_SURFACE_PRODUCT_REQUIRED');
  if (typeof profile_dir !== 'string' || !profile_dir.startsWith('/') || profile_dir.includes('\0')) refuse(product === 'zed-editor' ? 'ZED_PROFILE_DIR_REQUIRED' : 'EXTERNAL_PROFILE_DIR_REQUIRED');
  if (typeof workspace !== 'string' || !workspace.startsWith('/') || workspace.includes('\0')) refuse(product === 'zed-editor' ? 'ZED_WORKSPACE_REQUIRED' : 'EXTERNAL_WORKSPACE_REQUIRED');
  if (conversation_ref !== null && (typeof conversation_ref !== 'string' || !conversation_ref.trim() || conversation_ref.trim() !== conversation_ref || conversation_ref.length > 512)) refuse('CONVERSATION_REF_INVALID');
  const link = `link:${session.session_id}:desktop+${product === 'zed-editor' ? 'zed' : product}`;
  const desktop = launchTicket(session, { product: 'desktop', now, link_ref: link });
  const external = launchTicket(session, { product, now, link_ref: link });
  return Object.freeze({
    schema: LAUNCH_SESSION_SCHEMA,
    kind: 'DESKTOP_LAUNCH_PLAN',
    link_ref: link,
    external_surface: product,
    conversation_ref,
    steps: Object.freeze([
      Object.freeze({ step: 'open_desktop', url: desktop_url, conversation_ref, ticket: desktop }),
      Object.freeze({ step: product === 'zed-editor' ? 'open_zed' : 'open_external_surface', product, profile_dir, workspace, conversation_ref, ticket: external }),
    ]),
    prompts_after_sign_in: 0,
    authority_granted: false,
  });
}
