#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveLexiconCommand } from '../src/lexicon/resolve-token.mjs';

for (const token of ['rotfl','/rotfl','@rotfl','#rotfl','[ROTFL]']) {
  const result = resolveLexiconCommand(token);
  assert.equal(result.state, 'RESOLVED', `${token} must resolve`);
  assert.equal(result.command.id, 'cadence.continue', `${token} must reuse cadence.continue`);
  assert.equal(result.authority_granted, false);
  assert.equal(result.provider_effect, false);
}

console.log(JSON.stringify({
  status:'PASS',
  semantic_owner:'cadence.continue',
  aliases:5,
  second_scheduler:false,
  authority_granted:false,
  provider_effects:0
}));
