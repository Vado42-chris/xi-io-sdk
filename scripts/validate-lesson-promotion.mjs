import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileLessonPromotion, assertLessonNotFlatplaned } from '../src/lessons/promotion.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/lessons/meta-pattern-under-technical-fix.synthetic.json', import.meta.url), 'utf8'));
const first = compileLessonPromotion(fixture);
assert.equal(first.punchcard.denominator, 7);
assert.equal(first.punchcard.pass, 0);
assert.equal(first.punchcard.blocked, 4);
assert.equal(first.punchcard.closure_100, false);
assert.throws(() => assertLessonNotFlatplaned(first), /LESSON_FLATPLANED:AUTHENTICATED_EVIDENCE_REQUIRED/);

const closedInput = structuredClone(fixture);
closedInput.proof_tier = 'ADOPTED';
closedInput.bins = {
  ledger_target_ref: 'bins:lesson-ledger',
  record_ref: 'bins-record:lesson-001',
  record_generation: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};
closedInput.distributed_ack = {
  required: true,
  ack_set_ref: 'ack-set:baseline-001',
  target_denominator: 100,
};
closedInput.adopter = {
  adopter_ref: 'repo:synthetic-child',
  state: 'ADOPTED',
  proof_ref: 'receipt:adoption:001',
};
closedInput.return = {
  return_ref: 'return:001',
  apply_return_ref: 'apply-return:001',
  current_readback: true,
};
const closed = compileLessonPromotion(closedInput);
assert.equal(closed.punchcard.pass, 0);
assert.equal(closed.punchcard.blocked, 0);
assert.equal(closed.punchcard.closure_100, false);
assert.throws(() => assertLessonNotFlatplaned(closed), /AUTHENTICATED_EVIDENCE_REQUIRED/);
assert.equal(closed.punchcard.supplied, 7);
assert(closed.blockers.includes('OWNER_RELAY_REQUIRED'));
assert.equal(closed.proof_tier, 'UNVERIFIED');
assert.equal(closed.declared_proof_tier, 'ADOPTED');

const canary = JSON.parse(fs.readFileSync(new URL('../fixtures/ibal/switchboard-glass-box-canary.synthetic.json', import.meta.url), 'utf8'));
closedInput.learning = canary.lesson_fractal.learning;
closedInput.generalized.skill_refs = canary.lesson_fractal.skill_refs;
closedInput.return.target_ref = canary.return_target_ref;
closedInput.cadence = { next_action_ref: canary.exit_loop.next_action_ref };
const method = compileLessonPromotion(closedInput);
assert.equal(method.learning.supplied_stages, 6);
assert.equal(method.learning.verified_stages, 0);
assert.equal(method.learning.state, 'WAIT_VERIFICATION');
assert.equal(method.punchcard.closure_100, false);
assert(method.blockers.includes('OWNER_RELAY_REQUIRED'));
closedInput.origin.owner_relay_required = false;
const noRelay = compileLessonPromotion(closedInput);
assert.equal(noRelay.punchcard.closure_100, false);
assert(!noRelay.blockers.includes('OWNER_RELAY_REQUIRED'));
assert.throws(() => assertLessonNotFlatplaned({ ...noRelay, punchcard: { ...noRelay.punchcard, closure_100: true } }), /AUTHENTICATED_EVIDENCE_REQUIRED/);
delete closedInput.learning.peer_replay;
const missingPeer = compileLessonPromotion(closedInput);
assert.equal(missingPeer.learning.state, 'WAIT_EVIDENCE');
assert(missingPeer.blockers.includes('LEARNING_INDEPENDENT_PEER_REPLAY_UNKNOWN'));

console.log(`XIIO_SDK_LESSON_PROMOTION PASS open=${first.punchcard.pass}/7 unverified=${closed.punchcard.supplied}/7 owner_relay_is_blocker=${first.origin.owner_relay_required}`);
