import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileLessonPromotion, assertLessonNotFlatplaned } from '../src/lessons/promotion.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/lessons/meta-pattern-under-technical-fix.synthetic.json', import.meta.url), 'utf8'));
const first = compileLessonPromotion(fixture);
assert.equal(first.punchcard.denominator, 7);
assert.equal(first.punchcard.pass, 3);
assert.equal(first.punchcard.blocked, 4);
assert.equal(first.punchcard.closure_100, false);
assert.throws(() => assertLessonNotFlatplaned(first), /LESSON_FLATPLANED:BINS_RECORDED,ACK_DISTRIBUTED,ADOPTER_PROVEN,RETURN_REJOINED/);

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
assert.equal(closed.punchcard.pass, 7);
assert.equal(closed.punchcard.blocked, 0);
assert.equal(closed.punchcard.closure_100, true);
assert.equal(assertLessonNotFlatplaned(closed), true);

console.log(`XIIO_SDK_LESSON_PROMOTION PASS open=${first.punchcard.pass}/7 closed=${closed.punchcard.pass}/7 owner_relay_is_blocker=${first.origin.owner_relay_required}`);
