import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_BINDING_SCHEMA,
  observeAccount,
  chooseAccount,
  bindOwner,
} from '../src/identity/account-binding.mjs';

const observedAt = '2026-11-17T12:00:00Z';
const canonical = observeAccount({
  provider: 'github',
  subject_id: '189627615',
  login: 'Vado42-chris',
  observed_via: 'provider_api_readback',
  observed_at: observedAt,
});

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test('choice reconstructs every provider-observed principal before matching', () => {
  for (const forged of [
    { ...canonical, principal_ref: 'github:forged' },
    { ...canonical, authority_granted: true },
    { ...canonical, provider: 'GitHub' },
    { ...canonical, subject_id: 189627615 },
    { ...canonical, observed_via: 'user_typed' },
  ]) {
    expectCode(
      () => chooseAccount([forged], forged.principal_ref, { chosen_by: 'person:owner' }),
      forged.observed_via === 'user_typed' ? 'ACCOUNT_NOT_OBSERVED' : 'ACCOUNT_OBSERVATION_MISMATCH',
    );
  }
});

test('a direct caller-shaped choice cannot bypass account observation', () => {
  const forgedChoice = {
    schema: ACCOUNT_BINDING_SCHEMA,
    kind: 'CHOSEN_ACCOUNT',
    account: { ...canonical, principal_ref: 'github:forged' },
    chosen_by: 'person:owner',
    alternatives: [],
    authority_granted: false,
  };
  expectCode(() => bindOwner({ team_ref: 'team:forged' }, forgedChoice), 'ACCOUNT_OBSERVATION_MISMATCH');

  const authorityChoice = { ...forgedChoice, account: canonical, authority_granted: true };
  expectCode(() => bindOwner({ team_ref: 'team:authority' }, authorityChoice), 'OWNER_CHOICE_INVALID');

  const missingActor = { ...forgedChoice, account: canonical, chosen_by: undefined };
  expectCode(() => bindOwner({ team_ref: 'team:actor' }, missingActor), 'CHOICE_ACTOR_REQUIRED');
});

test('observed account accessors are refused without provider or getter execution', () => {
  let reads = 0;
  const forged = { ...canonical };
  Object.defineProperty(forged, 'metadata', {
    enumerable: true,
    get() {
      reads += 1;
      return { access_token: 'getter-secret' };
    },
  });
  expectCode(() => chooseAccount([forged], canonical.principal_ref, { chosen_by: 'person:owner' }), 'ACCESSOR_FIELD_REFUSED');
  assert.equal(reads, 0);
});

test('canonical choice and direct owner binding preserve the stable subject principal', () => {
  const choice = chooseAccount([canonical], canonical.principal_ref, { chosen_by: 'person:owner' });
  const bound = bindOwner({ team_ref: 'team:canonical' }, choice);
  assert.equal(choice.account, canonical);
  assert.equal(bound.owner_principal_ref, 'github:189627615');
  assert.equal(bound.owner_display, 'github:Vado42-chris');
  assert.equal(bound.authority_granted, false);
  assert.ok(bound.hard.includes('CALLER_SHAPED_ACCOUNT != OBSERVED_ACCOUNT'));
});
