#!/usr/bin/env node
import assert from 'node:assert/strict';
import { observeAccount, chooseAccount, bindOwner } from '@xi-io/sdk/identity/account-binding';
import { compileIbalTeamKit } from '../src/ibal/team-kit.mjs';

const at = '2026-10-12T18:45:00-06:00';
const refusal = (fn, code) => assert.throws(fn, (e) => e.code === code, `expected ${code}`);

/* The real case: one person, two GitHub accounts, browser signed in to the wrong one. */
const browserAccount = observeAccount({ provider: 'GitHub', subject_id: 1111, login: 'hallberg-personal', observed_via: 'oauth_readback', observed_at: at });
const workAccount = observeAccount({ provider: 'github', subject_id: 2222, login: 'Vado42-chris', observed_via: 'provider_api_readback', observed_at: at });
assert.equal(workAccount.principal_ref, 'github:2222');
assert.equal(browserAccount.provider, 'github', 'provider is normalised');

const choice = chooseAccount([browserAccount, workAccount], 'vado42-chris', { chosen_by: 'person:owner' });
assert.equal(choice.account.principal_ref, 'github:2222', 'login match is case-insensitive');
assert.deepEqual([...choice.alternatives], ['hallberg-personal'], 'the other account stays visible, not silently dropped');

const kit = compileIbalTeamKit({
  role: 'EXECUTE_RESOLVE', team_ref: 'team:xi-io-core', generation: 'g1', parent_root_ref: 'root:studio',
  partition_ref: 'p:1', skill_refs: ['skill:a'], script_refs: ['script:a'], flatpack_template_ref: 'flatpack:a',
  hot_folder_ref: 'hot:a', ack_template_refs: ['ack:a'], return_target_ref: 'mail:a',
});
const team = bindOwner(kit, choice);
assert.equal(team.owner_principal_ref, 'github:2222', 'team is owned by the chosen account');
assert.equal(team.owner_display, 'github:Vado42-chris');
assert.equal(team.authority_granted, false, 'owning is not authority');
assert.equal(team.team_ref, 'team:xi-io-core', 'the kit is kept whole');

/* A renamed login does not change who owns it. */
const renamed = observeAccount({ provider: 'github', subject_id: 2222, login: 'chris-renamed', observed_via: 'oauth_readback', observed_at: at });
assert.equal(renamed.principal_ref, team.owner_principal_ref);
assert.doesNotThrow(() => bindOwner(team, chooseAccount([renamed], 'chris-renamed', { chosen_by: 'person:owner' })), 'same subject rebinds cleanly');

/* Hostiles: each guess is refused by name. */
refusal(() => observeAccount({ provider: 'github', subject_id: 3, login: 'typed', observed_via: 'user_typed', observed_at: at }), 'ACCOUNT_NOT_OBSERVED');
refusal(() => observeAccount({ provider: 'github', login: 'noid', observed_via: 'oauth_readback', observed_at: at }), 'SUBJECT_ID_REQUIRED');
refusal(() => observeAccount({ provider: 'github', subject_id: 4, login: 'someone@example.com', observed_via: 'oauth_readback', observed_at: at }), 'EMAIL_IS_NOT_AN_ACCOUNT');
refusal(() => observeAccount({ provider: 'github', subject_id: 5, login: 'x', observed_via: 'oauth_readback', observed_at: 'yesterday' }), 'OBSERVED_AT_REQUIRED');
let leaked = '';
try { observeAccount({ provider: 'github', subject_id: 6, login: 'x', observed_via: 'oauth_readback', observed_at: at, access_token: 'gho_SHOULD_NOT_ECHO' }); }
catch (e) { leaked = String(e.message) + String(e.code); }
assert.equal(leaked.includes('gho_SHOULD_NOT_ECHO'), false, 'a token is refused and never echoed');
assert.match(leaked, /SECRET_FIELD_REFUSED/);

refusal(() => chooseAccount([browserAccount, workAccount], 'not-observed', { chosen_by: 'person:owner' }), 'CHOSEN_ACCOUNT_NOT_OBSERVED');
refusal(() => chooseAccount([browserAccount, workAccount], 'Vado42-chris', { chosen_by: 'browser_session' }), 'CHOICE_MUST_BE_THE_PERSONS');
refusal(() => chooseAccount([browserAccount, workAccount], 'Vado42-chris'), 'CHOICE_ACTOR_REQUIRED');
refusal(() => chooseAccount([{ kind: 'OBSERVED_ACCOUNT', login: 'forged', principal_ref: 'github:9' }], 'forged', { chosen_by: 'person:owner' }), 'ACCOUNT_NOT_OBSERVED');
refusal(() => chooseAccount([], 'x', { chosen_by: 'person:owner' }), 'NO_OBSERVED_ACCOUNTS');
const gitlab = observeAccount({ provider: 'gitlab', subject_id: 7, login: 'Vado42-chris', observed_via: 'oauth_readback', observed_at: at });
refusal(() => chooseAccount([workAccount, gitlab], 'Vado42-chris', { chosen_by: 'person:owner' }), 'CHOICE_AMBIGUOUS');
assert.equal(chooseAccount([workAccount, gitlab], 'gitlab:7', { chosen_by: 'person:owner' }).account.provider, 'gitlab', 'principal_ref disambiguates');

refusal(() => bindOwner(kit, { kind: 'CHOSEN_ACCOUNT', account: workAccount }), 'OWNER_NOT_CHOSEN');
refusal(() => bindOwner(team, chooseAccount([browserAccount], 'hallberg-personal', { chosen_by: 'person:owner' })), 'OWNER_ALREADY_BOUND');
refusal(() => bindOwner({ team_ref: 't', password: 'x' }, choice), 'SECRET_FIELD_REFUSED');

console.log(JSON.stringify({
  schema: 'xiio.sdk.account-binding-check/v1',
  result: 'PASS',
  cases: 22,
  hard: ['BROWSER_SESSION != CHOSEN_ACCOUNT', 'EMAIL != PRINCIPAL', 'LOGIN != PRINCIPAL', 'TYPED_LOGIN != OBSERVED_ACCOUNT', 'OWNER_BOUND != AUTHORITY_GRANTED', 'TOKEN_NEVER_ECHOED'],
}, null, 2));
