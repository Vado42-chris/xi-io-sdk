import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyClaim} from '../src/ibal/receipt-claim-canary.mjs';
test('unsupported simulation claim fails closed',()=>assert.equal(qualifyClaim({text:'I simulated and scored 6 of 8'}).state,'RED'));
test('6 of 8 cannot silently become 7 of 8',()=>assert.ok(qualifyClaim({text:'scored',score:{passed:6,total:8,threshold:7}}).failures.includes('SCORE_THRESHOLD_DRIFT')));
test('8 of 8 without native receipt is false green',()=>assert.ok(qualifyClaim({text:'tested',score:{passed:8,total:8,threshold:8}}).failures.includes('FALSE_GREEN_SCORE')));
test('native evidence permits claim qualification, not effect authority',()=>{const r=qualifyClaim({text:'tested',toolReceipts:[{native:true,status:'PASS',operation:'node-test',evidence_ref:'run:123'}]});assert.equal(r.state,'RECEIPT_QUALIFIED');assert.equal(r.effect_authority,0)});
test('plan is not past execution',()=>assert.equal(qualifyClaim({text:'I plan to run the tests'}).state,'RECEIPT_QUALIFIED'));
