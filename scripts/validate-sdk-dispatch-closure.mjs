#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const catalogUrl = new URL('../src/catalog/primitives.json', import.meta.url);

export function validateDispatchClosure(catalog) {
  const dispatch = catalog?.dispatch || {};
  const expected = Number(dispatch.expected);
  const materialized = Number(dispatch.materialized_primitives);
  const knownGaps = Number(dispatch.known_gaps);
  const knownGapList = Array.isArray(catalog?.known_gaps) ? catalog.known_gaps.length : NaN;

  assert(Number.isInteger(expected) && expected >= 0, 'dispatch.expected must be a non-negative integer');
  assert(Number.isInteger(materialized) && materialized >= 0, 'dispatch.materialized_primitives must be a non-negative integer');
  assert(Number.isInteger(knownGaps) && knownGaps >= 0, 'dispatch.known_gaps must be a non-negative integer');
  assert.equal(knownGaps, knownGapList, 'dispatch.known_gaps must equal the explicit known_gaps list length');

  const unclassified = expected - materialized - knownGaps;
  assert(unclassified >= 0, 'dispatch denominator is over-classified');
  assert.equal(
    Number(dispatch.unclassified_expected),
    unclassified,
    'dispatch.unclassified_expected must explicitly preserve the arithmetic remainder',
  );

  const expectedClosureState = unclassified === 0 ? 'CLOSED' : 'UNKNOWN_REMAINDER_TYPED';
  assert.equal(
    dispatch.closure_state,
    expectedClosureState,
    'dispatch.closure_state must reflect whether the denominator is actually closed',
  );

  assert(
    Array.isArray(catalog?.hard) && catalog.hard.includes('DISPATCH_EXPECTED != MATERIALIZED + KNOWN_GAPS -> TYPED_UNCLASSIFIED_REMAINDER'),
    'catalog hard invariant for typed dispatch remainder is required',
  );

  return {
    expected,
    materialized,
    known_gaps: knownGaps,
    unclassified,
    closure_state: expectedClosureState,
    root_100_earned: unclassified === 0 ? null : false,
  };
}

const catalog = JSON.parse(fs.readFileSync(catalogUrl, 'utf8'));
const current = validateDispatchClosure(catalog);

// Hostile: deleting the explicit remainder must fail; arithmetic UNKNOWN may not disappear.
const missingRemainder = structuredClone(catalog);
delete missingRemainder.dispatch.unclassified_expected;
assert.throws(() => validateDispatchClosure(missingRemainder), /unclassified_expected/);

// Hostile: caller cannot declare CLOSED while arithmetic still has an unclassified remainder.
const falseClosed = structuredClone(catalog);
falseClosed.dispatch.closure_state = 'CLOSED';
assert.throws(() => validateDispatchClosure(falseClosed), /closure_state/);

// Hostile: known gap count cannot drift from the explicit gap identities.
const gapDrift = structuredClone(catalog);
gapDrift.dispatch.known_gaps += 1;
assert.throws(() => validateDispatchClosure(gapDrift), /known_gaps/);

console.log(JSON.stringify({
  status: current.unclassified === 0 ? 'PASS_CLOSED' : 'PASS_TYPED_WAIT',
  ...current,
  hostile_cases: 3,
  hard: [
    'EXPECTED != MATERIALIZED + KNOWN_GAPS -> TYPED_UNCLASSIFIED_REMAINDER',
    'UNKNOWN_REMAINDER != ZERO',
    'CATALOG_COUNT != ROOT_100',
  ],
}));
