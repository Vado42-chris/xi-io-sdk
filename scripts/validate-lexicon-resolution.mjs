#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveLexiconCommand } from '../src/lexicon/resolve-token.mjs';

const cases = [
  ['burn', 'baseline.burn'],
  ['/burn', 'baseline.burn'],
  ['@burn', 'baseline.burn'],
  ['#burn', 'baseline.burn'],
  ['overnight burn', 'baseline.burn'],
  ['overnight-burn', 'baseline.burn'],
  ['babysit', 'cadence.continue'],
  ['/babysit', 'cadence.continue'],
  ['@babysit', 'cadence.continue'],
  ['#babysit', 'cadence.continue'],
  ['reap-eat', 'cadence.continue'],
  ['#100s', '100s.compile'],
];

for (const [token, expected] of cases) {
  const result = resolveLexiconCommand(token);
  assert.equal(result.state, 'RESOLVED', `${token} must resolve`);
  assert.equal(result.command.id, expected, `${token} -> ${expected}`);
  assert.equal(result.authority_granted, false);
  assert.equal(result.provider_effect, false);
}

const unknown = resolveLexiconCommand('/invent-random-authority');
assert.equal(unknown.state, 'UNKNOWN_COMMAND');
assert.equal(unknown.matches.length, 0);

const empty = resolveLexiconCommand('');
assert.equal(empty.state, 'UNKNOWN_COMMAND');
assert.equal(empty.requested, null);

// Alias surface is semantic sugar only: temporal wording does not create a second scheduler.
assert.equal(resolveLexiconCommand('burn').command.id, resolveLexiconCommand('overnight burn').command.id);
assert.equal(resolveLexiconCommand('/babysit').command.id, resolveLexiconCommand('#babysit').command.id);

console.log(JSON.stringify({
  status: 'PASS',
  cases: cases.length + 2,
  burn_aliases_same_semantic_id: true,
  babysit_aliases_same_semantic_id: true,
  authority_granted: 0,
  provider_effects: 0
}));
