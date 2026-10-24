/* ── OWNER GRANT FOR ONE BOUNDED OPERATION · xiio.sdk.owner-grant/v1 ──────────
 *
 * Owner rule, 2026-10-24: ask once, showing the exact project, the permitted
 * operations, the duration and how to revoke; keep publishing, credentials,
 * service administration and unrelated files outside the grant; the acting
 * worker must never create, alter or impersonate its own authority.
 *
 * Built on the existing sign-in path (account-binding -> launch-session): the
 * grant is a launch ticket for product `local-agent`, bound to one project
 * directory, carrying a closed set of operations. A yes is consent only: it
 * never marks O0-O11 complete. The checks that apply to this operation run on
 * every effect (see `checkGrant`); the rest are recorded as not applicable.
 *
 * Storage lives outside every project and is never mounted into the isolated
 * executor, so a command run for the model cannot see or write it. Pure
 * functions take an injected clock; the store functions touch only `dir`. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { observeAccount, chooseAccount } from '../identity/account-binding.mjs';
import { openSession, launchTicket, acceptTicket } from '../identity/launch-session.mjs';

export const OWNER_GRANT_SCHEMA = 'xiio.sdk.owner-grant/v1';
export const GRANT_PRODUCT = 'local-agent';
/** The only operations a grant can carry. Anything elevated is outside it by construction. */
export const GRANTABLE_OPERATIONS = Object.freeze(['edit', 'test']);
export const ELEVATED_OPERATIONS = Object.freeze(['publish', 'credentials', 'service_admin', 'network', 'recover']);
const MAX_GRANT_MS = 12 * 60 * 60 * 1000; // a launch ticket's own ceiling

function refuse(code) { const e = new TypeError(code); e.code = code; throw e; }

export function defaultGrantDir(env = process.env) {
  const root = env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return env.XIIO_GRANT_DIR || path.join(root, 'xi-io', 'grants');
}

/** Compose a grant from an observed account the person chose. Pure. */
export function composeGrant({ observed, chosen, project, operations, hours, now, source_generation, grant_id }) {
  const choice = chooseAccount([observeAccount(observed)], chosen, { chosen_by: 'owner_tty' });
  const projectDir = path.resolve(String(project || ''));
  if (!project || projectDir === path.parse(projectDir).root || projectDir === path.resolve(os.homedir())) refuse('GRANT_PROJECT_TOO_BROAD');
  const ops = [...new Set(operations || [])];
  if (ops.length === 0) refuse('GRANT_OPERATIONS_REQUIRED');
  for (const op of ops) if (!GRANTABLE_OPERATIONS.includes(op)) refuse('GRANT_OPERATION_NOT_GRANTABLE:' + op);
  const ms = Math.round(Number(hours) * 3600 * 1000);
  if (!(ms > 0) || ms > MAX_GRANT_MS) refuse('GRANT_DURATION_OUT_OF_RANGE');
  if (typeof source_generation !== 'string' || !source_generation) refuse('GRANT_SOURCE_GENERATION_REQUIRED');
  const t = Date.parse(now);
  const id = grant_id || `grant-${crypto.randomUUID()}`;
  const session = openSession(choice, {
    session_id: id, credential_ref: `keyring:${choice.account.provider}`,
    opened_at: new Date(t).toISOString(), expires_at: new Date(t + ms).toISOString(),
  });
  const ticket = launchTicket(session, { product: GRANT_PRODUCT, now, link_ref: `project:${projectDir}` });
  return Object.freeze({
    schema: OWNER_GRANT_SCHEMA, kind: 'OWNER_GRANT', grant_id: id,
    principal_ref: session.principal_ref, account_display: session.account_display,
    project: projectDir, operations: Object.freeze(ops), excluded: ELEVATED_OPERATIONS,
    source_generation, issued_at: ticket.issued_at, expires_at: ticket.expires_at,
    ticket, granted_via: 'owner_tty', authority_granted: false,
  });
}

/** What the person is shown before they answer. */
export function describeGrant(g) {
  return [
    `Project:     ${g.project}`,
    `Allowed:     ${g.operations.join(', ')} (inside this project only)`,
    `Not allowed: ${g.excluded.join(', ')}, and files outside the project`,
    `Account:     ${g.account_display}`,
    `Expires:     ${g.expires_at}`,
    `Revoke:      xi grant revoke ${g.grant_id}   (or: xi grant revoke --all)`,
  ].join('\n');
}

/**
 * The checks that apply to one bounded effect, run before EVERY effect.
 * O0: source generation current; O1: the operation is a known tool operation;
 * O8: the operation is inside the grant ceiling and not elevated. The other
 * steps have no contract dependency for a local project edit/test and are
 * recorded as such, never as PASS.
 */
export function checkGrant(grant, { operation, workspace, now, source_generation, revoked = false }) {
  const red = (first_red) => Object.freeze({ ok: false, first_red, authority_granted: false });
  if (!grant || grant.kind !== 'OWNER_GRANT' || grant.schema !== OWNER_GRANT_SCHEMA) return red('OWNER_GRANT_MISSING');
  if (revoked) return red('OWNER_GRANT_REVOKED');
  const accepted = acceptTicket(grant.ticket, { product: GRANT_PRODUCT, now });
  if (!accepted.ok) return red(accepted.reason === 'RETURN_TO_LAUNCHER' ? 'OWNER_GRANT_EXPIRED' : 'OWNER_GRANT_' + accepted.reason);
  if (Date.parse(now) >= Date.parse(grant.expires_at)) return red('OWNER_GRANT_EXPIRED');
  if (grant.ticket.link_ref !== `project:${grant.project}`) return red('OWNER_GRANT_TAMPERED');
  if (path.resolve(workspace) !== grant.project) return red('OWNER_GRANT_WRONG_PROJECT');
  if (ELEVATED_OPERATIONS.includes(operation)) return red('OPERATION_ELEVATED_OUTSIDE_GRANT');
  if (!GRANTABLE_OPERATIONS.includes(operation)) return red('O1_OPERATION_UNKNOWN');
  if (!grant.operations.includes(operation)) return red('O8_OPERATION_NOT_GRANTED:' + operation);
  if (grant.source_generation !== source_generation) return red('O0_SOURCE_GENERATION_DRIFT');
  return Object.freeze({
    ok: true, grant_id: grant.grant_id, principal_ref: grant.principal_ref, operation,
    lifecycle: Object.freeze({
      executed: Object.freeze({ O0: 'PASS', O1: 'PASS', O8: 'PASS' }),
      not_applicable: Object.freeze(['O3', 'O4', 'O5', 'O6', 'O7', 'O9', 'O10'].map((id) => `${id}:NO_CONTRACT_DEPENDENCY_FOR_LOCAL_PROJECT_EDIT_TEST`)),
      not_complete: Object.freeze(['O2', 'O11']),
    }),
    authority_granted: false,
  });
}

/* ── store: owner-side only ── */
const grantFile = (dir, id) => path.join(dir, `${id.replace(/[^A-Za-z0-9_-]/g, '')}.json`);
function ensure(dir) { fs.mkdirSync(path.join(dir, 'revoked'), { recursive: true, mode: 0o700 }); }
export function audit(dir, row) {
  ensure(dir);
  fs.appendFileSync(path.join(dir, 'audit.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n', { mode: 0o600 });
}
export function saveGrant(dir, grant) {
  ensure(dir);
  const f = grantFile(dir, grant.grant_id); const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(grant, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(tmp, f);
  audit(dir, { event: 'GRANT', grant_id: grant.grant_id, project: grant.project, operations: grant.operations, expires_at: grant.expires_at });
  return f;
}
export function revokeGrant(dir, id) {
  ensure(dir);
  const ids = id === '--all' ? listGrants(dir).map((g) => g.grant_id) : [id];
  for (const g of ids) { fs.writeFileSync(path.join(dir, 'revoked', g.replace(/[^A-Za-z0-9_-]/g, '')), new Date().toISOString() + '\n', { mode: 0o600 }); audit(dir, { event: 'REVOKE', grant_id: g }); }
  return ids;
}
export function listGrants(dir) {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); }
  catch { return []; }
}
export function isRevoked(dir, id) { return fs.existsSync(path.join(dir, 'revoked', String(id).replace(/[^A-Za-z0-9_-]/g, ''))); }
/** The newest live grant for this project, rechecked from disk on every call. */
export function findGrant(dir, { workspace, now }) {
  const ws = path.resolve(workspace);
  const live = listGrants(dir).filter((g) => g.project === ws && Date.parse(g.expires_at) > Date.parse(now));
  live.sort((a, b) => Date.parse(b.issued_at) - Date.parse(a.issued_at));
  const g = live[0] || null;
  return g ? { grant: g, revoked: isRevoked(dir, g.grant_id) } : { grant: null, revoked: false };
}
