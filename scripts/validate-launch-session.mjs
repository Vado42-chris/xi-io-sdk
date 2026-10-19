#!/usr/bin/env node
import assert from 'node:assert/strict';
import { observeAccount, chooseAccount } from '../src/identity/account-binding.mjs';
import { openSession, mustPrompt, launchTicket, acceptTicket, planDesktopLaunch } from '../src/identity/launch-session.mjs';

const refusal = (fn, code) => assert.throws(fn, (e) => e.code === code, `expected ${code}`);
const t0 = '2026-10-12T19:00:00-06:00';
const later = '2026-10-13T08:00:00-06:00';
const afterExpiry = '2026-10-20T19:00:01-06:00';

const work = observeAccount({ provider: 'github', subject_id: 2222, login: 'Vado42-chris', observed_via: 'oauth_readback', observed_at: t0 });
const choice = chooseAccount([work], 'Vado42-chris', { chosen_by: 'person:owner' });
const session = openSession(choice, { session_id: 'sess:launcher-0001', credential_ref: 'keyring:xiio/hex/vado42', opened_at: t0, expires_at: '2026-10-19T19:00:00-06:00' });
assert.equal(session.principal_ref, 'github:2222');

/* The owner's rule: once signed in, nothing asks again. */
for (const surface of ['hex-launcher', 'desktop', 'inbox', 'zed-editor', 'sam_law']) {
  assert.equal(mustPrompt(session, { surface, now: later }).prompt, false, `${surface} must not ask while the session is live`);
}
/* No session: only the launcher asks; a sub-product sends you back instead of asking. */
assert.equal(mustPrompt(null, { surface: 'hex-launcher', now: t0 }).prompt, true);
const sub = mustPrompt(null, { surface: 'inbox', now: t0 });
assert.equal(sub.prompt, false);
assert.equal(sub.reason, 'RETURN_TO_LAUNCHER');
assert.equal(mustPrompt(session, { surface: 'inbox', now: afterExpiry }).reason, 'RETURN_TO_LAUNCHER', 'expiry sends you to the launcher, not to a password box');

/* Tickets: one per product, cannot be used for another product. */
const inbox = launchTicket(session, { product: 'inbox', now: later });
assert.equal(inbox.prompts_person, false);
assert.equal(acceptTicket(inbox, { product: 'inbox', now: later }).ok, true);
assert.equal(acceptTicket(inbox, { product: 'ward', now: later }).reason, 'TICKET_FOR_ANOTHER_PRODUCT');
assert.equal(acceptTicket(inbox, { product: 'inbox', now: '2026-10-14T19:00:00-06:00' }).reason, 'RETURN_TO_LAUNCHER', 'tickets are short; the session is not');
assert.ok(Date.parse(inbox.expires_at) <= Date.parse(session.expires_at), 'a ticket never outlives its session');

/* Deserialised tickets fail closed when incomplete, malformed, or not yet valid. */
const invalidTickets = [
  { kind: 'LAUNCH_TICKET', audience: 'inbox', expires_at: 'invalid' },
  { ...inbox, schema: undefined },
  { ...inbox, session_id: undefined },
  { ...inbox, principal_ref: undefined },
  { ...inbox, product: 'desktop' },
  { ...inbox, issued_at: undefined },
  { ...inbox, expires_at: 'invalid' },
  { ...inbox, expires_at: undefined },
  { ...inbox, issued_at: '2026-10-14T00:00:00Z' },
  { ...inbox, expires_at: inbox.issued_at },
  { ...inbox, expires_at: '2026-10-19T19:00:00-06:00' },
];
for (const ticket of invalidTickets) {
  assert.equal(acceptTicket(ticket, { product: 'inbox', now: later }).ok, false);
}
assert.equal(acceptTicket(inbox, { product: 'inbox', now: inbox.expires_at }).ok, false, 'expiry boundary is exclusive');

/* The launch the owner described: stable Desktop + linked Zed, zero prompts after sign-in. */
const plan = planDesktopLaunch(session, { now: later, desktop_url: 'https://xi-io.base44.app/DesktopExperience', zed_profile_dir: '/home/user/.local/share/xi-io/zed-profile', zed_workspace: '/home/user/xi-io/studio' });
assert.equal(plan.prompts_after_sign_in, 0);
assert.equal(plan.steps.length, 2);
assert.equal(plan.steps[0].ticket.link_ref, plan.link_ref, 'Desktop carries the link');
assert.equal(plan.steps[1].ticket.link_ref, plan.link_ref, 'Zed carries the same link');
assert.match(plan.link_ref, /^link:sess:launcher-0001:/, 'the link names the one sign-in');
assert.equal(plan.steps[1].ticket.audience, 'zed-editor');

/* Zed stays the default; an explicit adapter choice shares the same conversation and identity. */
assert.equal(plan.external_surface, 'zed-editor');
assert.equal(plan.steps[1].step, 'open_zed', 'preserve the existing Zed consumer');
const launchOptions = { now: later, desktop_url: 'https://xi-io.base44.app/DesktopExperience' };
for (const product of ['zed-editor', 'cursor-editor', 'vscode-editor', 'custom-editor']) {
  const selected = planDesktopLaunch(session, {
    ...launchOptions, conversation_ref: 'conversation:trinity-001',
    external_surface: { product, profile_dir: '/isolated/profile', workspace: '/local/project' },
  });
  assert.equal(selected.external_surface, product);
  assert.equal(selected.steps[1].ticket.audience, product);
  assert.equal(selected.steps[1].profile_dir, '/isolated/profile');
  assert.equal(selected.steps[1].workspace, '/local/project');
  assert.equal(selected.steps[1].ticket.principal_ref, selected.steps[0].ticket.principal_ref);
  assert.equal(selected.steps[1].ticket.session_id, selected.steps[0].ticket.session_id);
  assert.equal(selected.steps[1].ticket.link_ref, selected.steps[0].ticket.link_ref);
  assert.equal(selected.steps[1].conversation_ref, selected.steps[0].conversation_ref);
  assert.equal(selected.conversation_ref, 'conversation:trinity-001');
  assert.equal(selected.prompts_after_sign_in, 0);
}
for (const external_surface of [null, [], 'cursor-editor', {}, { product: 'desktop' }]) {
  assert.throws(() => planDesktopLaunch(session, { ...launchOptions, external_surface }));
}
const external_surface = { product: 'cursor-editor', profile_dir: '/profile', workspace: '/project' };
refusal(() => planDesktopLaunch(session, { ...launchOptions, external_surface: { ...external_surface, profile_dir: 'relative' } }), 'EXTERNAL_PROFILE_DIR_REQUIRED');
refusal(() => planDesktopLaunch(session, { ...launchOptions, external_surface: { ...external_surface, workspace: 'relative' } }), 'EXTERNAL_WORKSPACE_REQUIRED');
refusal(() => planDesktopLaunch(session, { ...launchOptions, external_surface: { ...external_surface, token: 'not-allowed' } }), 'SECRET_FIELD_REFUSED');
refusal(() => planDesktopLaunch(session, { ...launchOptions, external_surface, conversation_ref: ' ' }), 'CONVERSATION_REF_INVALID');

/* Hostiles. */
refusal(() => openSession(choice, { session_id: 'sess:x0000001', credential_ref: 'keyring:a', opened_at: t0, expires_at: later, surface: 'inbox' }), 'ONLY_THE_LAUNCHER_SIGNS_IN');
refusal(() => openSession(choice, { session_id: 'sess:x0000001', credential_ref: 'gho_raw_token_value', opened_at: t0, expires_at: later }), 'CREDENTIAL_BY_REFERENCE_REQUIRED');
let leaked = '';
try { openSession(choice, { session_id: 'sess:x0000001', credential_ref: 'keyring:a', opened_at: t0, expires_at: later, password: 'hunter2-SHOULD-NOT-ECHO' }); }
catch (e) { leaked = `${e.message}${e.code}`; }
assert.match(leaked, /SECRET_FIELD_REFUSED/);
assert.equal(leaked.includes('hunter2'), false, 'a password is refused and never echoed');
refusal(() => openSession({ kind: 'CHOSEN_ACCOUNT', account: work }, { session_id: 'sess:x0000001', credential_ref: 'keyring:a', opened_at: t0, expires_at: later }), 'ACCOUNT_NOT_CHOSEN');
refusal(() => openSession(choice, { session_id: 'sess:x0000001', credential_ref: 'keyring:a', opened_at: t0, expires_at: '2027-12-01T00:00:00Z' }), 'SESSION_TOO_LONG');
refusal(() => launchTicket(session, { product: 'inbox', now: afterExpiry }), 'SESSION_EXPIRED_RETURN_TO_LAUNCHER');
refusal(() => planDesktopLaunch(session, { now: later, desktop_url: 'http://xi-io.base44.app/DesktopExperience', zed_profile_dir: '/p', zed_workspace: '/w' }), 'DESKTOP_URL_HTTPS_REQUIRED');
assert.equal(JSON.stringify(plan).includes('keyring:xiio'), false, 'the credential reference stays in the session, not in tickets handed to products');

console.log(JSON.stringify({
  schema: 'xiio.sdk.launch-session-check/v1',
  result: 'PASS',
  cases: 41,
  editor_selection_scenarios: 15,
  hard: ['ONE_SIGN_IN_AT_LAUNCHER', 'SUB_PRODUCT_PROMPT = NEVER', 'EXPIRED -> RETURN_TO_LAUNCHER', 'TICKET_PER_PRODUCT', 'CREDENTIAL_BY_REFERENCE', 'DESKTOP+ZED_ONE_LINK'],
}, null, 2));
