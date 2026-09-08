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
  ['[babysit]', 'cadence.continue'],
  ['[REAP]', 'cadence.continue'],
  ['[EAT]', 'cadence.continue'],
  ['[CADENCE]', 'cadence.continue'],
  ['[golden_path]', 'cadence.continue'],
  ['[/babysit]', 'cadence.continue'],
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

const ambiguous = resolveLexiconCommand('#baseline');
assert.equal(ambiguous.state, 'AMBIGUOUS_COMMAND');
assert(ambiguous.matches.length > 1);
assert.equal(ambiguous.authority_granted, false);
assert.equal(ambiguous.provider_effect, false);

// Alias surface is semantic sugar only: temporal wording and BBCode do not create second schedulers or authority.
assert.equal(resolveLexiconCommand('burn').command.id, resolveLexiconCommand('overnight burn').command.id);
assert.equal(resolveLexiconCommand('/babysit').command.id, resolveLexiconCommand('#babysit').command.id);
for (const token of ['[REAP]', '[EAT]', '[CADENCE]', '[golden_path]', '[babysit]']) {
  assert.equal(resolveLexiconCommand(token).command.id, 'cadence.continue');
}
assert(resolveLexiconCommand('[REAP]').hard.includes('BBCODE_TOKEN != AUTHORITY'));

console.log(JSON.stringify({
  status: 'PASS',
  cases: cases.length + 3,
  burn_aliases_same_semantic_id: true,
  babysit_aliases_same_semantic_id: true,
  bbcode_aliases_same_semantic_id: true,
  ambiguous_tag_fails_closed: true,
  authority_granted: 0,
  provider_effects: 0
}));
