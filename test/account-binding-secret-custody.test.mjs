import test from 'node:test';
import assert from 'node:assert/strict';
import { observeAccount, chooseAccount, bindOwner } from '../src/identity/account-binding.mjs';

const observedAt = '2026-11-17T12:00:00Z';
const account = observeAccount({
  provider: 'github',
  subject_id: '189627615',
  login: 'Vado42-chris',
  observed_via: 'provider_api_readback',
  observed_at: observedAt,
});
const choice = chooseAccount([account], account.principal_ref, { chosen_by: 'person:owner' });

function expectRefusal(fn, code, secret) {
  let error;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `expected ${code}`);
  assert.equal(error.code, code);
  assert.equal(`${error.name}:${error.message}`.includes(secret), false, 'credential value must not be echoed');
}

test('account observation refuses credentials at any record depth', () => {
  for (const input of [
    { metadata: { access_token: 'nested-observe-secret' } },
    { metadata: [{ client_secret: 'array-observe-secret' }] },
  ]) {
    const secret = input.metadata.access_token || input.metadata[0].client_secret;
    expectRefusal(() => observeAccount({
      provider: 'github',
      subject_id: '1',
      login: 'owner',
      observed_via: 'provider_api_readback',
      observed_at: observedAt,
      ...input,
    }), 'SECRET_FIELD_REFUSED', secret);
  }
});

test('owner binding refuses nested credentials before copying the subject', () => {
  for (const subject of [
    { team_ref: 'team:nested', config: { refresh_token: 'nested-bind-secret' } },
    { team_ref: 'team:array', providers: [{ authorization: 'array-bind-secret' }] },
  ]) {
    const secret = subject.config?.refresh_token || subject.providers[0].authorization;
    expectRefusal(() => bindOwner(subject, choice), 'SECRET_FIELD_REFUSED', secret);
  }
});

test('credential scan refuses accessors without evaluating them', () => {
  let reads = 0;
  const subject = { team_ref: 'team:accessor' };
  Object.defineProperty(subject, 'provider', {
    enumerable: true,
    get() {
      reads += 1;
      return { access_token: 'getter-secret' };
    },
  });

  expectRefusal(() => bindOwner(subject, choice), 'ACCESSOR_FIELD_REFUSED', 'getter-secret');
  assert.equal(reads, 0, 'accessor must not execute during credential inspection');
});

test('ordinary nested data remains bindable and cycles terminate safely', () => {
  const metadata = { region: 'ca-central', labels: ['owner', 'local-first'] };
  metadata.self = metadata;
  const bound = bindOwner({ team_ref: 'team:plain', metadata }, choice);
  assert.equal(bound.owner_principal_ref, account.principal_ref);
  assert.equal(bound.metadata, metadata);
  assert.equal(bound.authority_granted, false);
});
