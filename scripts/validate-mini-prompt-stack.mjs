import assert from 'node:assert/strict';
import { compileMiniPromptStack, applyMiniPromptReceipt } from '../src/cadence/mini-prompt-stack.mjs';

const raw=['fix the CLI before monday','fix the CLI before monday','verify the live readback and reap it','use this across every studio product'].join('\n');
const stack=compileMiniPromptStack({raw});
assert.equal(stack.schema,'xiio.sdk.mini-prompt-stack/v1');
assert.equal(stack.duplicate_lines_removed,1);
assert.equal(stack.denominator.total,3);
assert.equal(stack.next.action,'REAP');
assert.equal(stack.cards.every(c=>c.state==='UNPROVEN'),true);
const result=applyMiniPromptReceipt(stack,{card_id:stack.next.card_id,receipt_ref:'receipt:test:1',verified:false});
assert.equal(result.terminal,false);
assert.equal(result.cards.some(c=>c.state==='RESULT'),true);
const reaped=applyMiniPromptReceipt(stack,{card_id:stack.next.card_id,receipt_ref:'receipt:test:2',verified:true});
assert.equal(reaped.denominator.closed,1);
assert.equal(reaped.game.ticks,1);
assert.notEqual(reaped.next.card_id,stack.next.card_id);
console.log('mini-prompt-stack: PASS');


// The final model Result is not a verified terminal state or APPLY_RETURN.
const single=compileMiniPromptStack({raw:'verify bounded result'});
const id=single.cards[0].card_id;
const pending=applyMiniPromptReceipt(single,{card_id:id,receipt_ref:'fixture:result',verified:false});
assert.equal(pending.denominator.closed,0);
assert.equal(pending.terminal,false);
assert.deepEqual(pending.next,{action:'TRUE_WAIT',card_id:id,state:'RESULT'});
assert.deepEqual(applyMiniPromptReceipt(pending,{card_id:id,receipt_ref:'fixture:result',verified:false}),pending);
const verified=applyMiniPromptReceipt(pending,{card_id:id,receipt_ref:'fixture:result',verified:true});
assert.equal(verified.terminal,true);
assert.equal(verified.denominator.closed,1);
assert.equal(verified.game.ticks,1);
assert.deepEqual(verified.next,{action:'TERMINAL_FIXED_POINT',state:'VERIFIED'});
assert.deepEqual(applyMiniPromptReceipt(verified,{card_id:id,receipt_ref:'fixture:result',verified:true}),verified);
assert.deepEqual(applyMiniPromptReceipt(verified,{card_id:id,receipt_ref:'fixture:result',verified:false}),verified);
assert.throws(()=>applyMiniPromptReceipt(verified,{card_id:id,receipt_ref:'fixture:other',verified:true}),/VERIFIED_RECEIPT_CONFLICT/);
assert.throws(()=>applyMiniPromptReceipt(single,{card_id:'missing',receipt_ref:'fixture:result',verified:true}),/CARD_NOT_FOUND/);
assert.throws(()=>applyMiniPromptReceipt(single,{card_id:id,verified:true}),/VERIFIED_RECEIPT_REQUIRED/);
assert.equal(applyMiniPromptReceipt(single,{card_id:id,receipt_ref:'fixture:result',verified:'true'}).terminal,false);
for(const heldState of ['RESULT','BLOCKED','WAIT','UNKNOWN']){
 const held={...single,denominator:{...single.denominator,total:2},cards:[...single.cards,{...single.cards[0],card_id:'C002',state:heldState}]};
 const out=applyMiniPromptReceipt(held,{card_id:id,receipt_ref:'fixture:result',verified:true});
 assert.equal(out.terminal,false);
 assert.equal(out.denominator.closed,1);
 assert.deepEqual(out.next,{action:'TRUE_WAIT',card_id:'C002',state:heldState});
}
const mixed={...single,denominator:{...single.denominator,total:2},cards:[...single.cards,{...single.cards[0],card_id:'C002'}]};
const workRemains=applyMiniPromptReceipt(mixed,{card_id:id,receipt_ref:'fixture:result',verified:false});
assert.equal(workRemains.terminal,false);
assert.equal(workRemains.next.card_id,'C002');
assert.equal(workRemains.next.state,'READY_FOR_ADMISSION');
const allResults=applyMiniPromptReceipt(workRemains,{card_id:'C002',receipt_ref:'fixture:second',verified:false});
assert.equal(allResults.terminal,false);
assert.equal(allResults.next.action,'TRUE_WAIT');
assert.equal(allResults.denominator.closed,0);
assert.equal(single.cards[0].state,'UNPROVEN','input remains immutable');
console.log('mini-prompt-stack terminal, held-state and receipt-idempotency regressions: PASS');
const duplicate={...single,denominator:{...single.denominator,total:2},cards:[...single.cards,{...single.cards[0]}]};
assert.throws(()=>applyMiniPromptReceipt(duplicate,{card_id:id,receipt_ref:'fixture:result',verified:true}),/STACK_CARD_ID_INVALID/);
for(const badRef of [null,undefined,'','  ',42]){
 const corrupt={...single,denominator:{...single.denominator,total:2},cards:[...single.cards,{...single.cards[0],card_id:'C002',state:'VERIFIED',receipt_ref:badRef}]};
 assert.throws(()=>applyMiniPromptReceipt(corrupt,{card_id:id,receipt_ref:'fixture:result',verified:true}),/VERIFIED_RECEIPT_REQUIRED/);
}
assert.throws(()=>applyMiniPromptReceipt({...single,cards:[]},{card_id:id}),/STACK_CARDS_INVALID/);
const cogStack={...single,cards:[{...single.cards[0],cogs:3}]};
const firstResult=applyMiniPromptReceipt(cogStack,{card_id:id,receipt_ref:'fixture:result',verified:false});
assert.equal(firstResult.cards[0].cogs,2);
assert.deepEqual(applyMiniPromptReceipt(firstResult,{card_id:id,receipt_ref:'fixture:result',verified:false}),firstResult);
const secondResult=applyMiniPromptReceipt(firstResult,{card_id:id,receipt_ref:'fixture:another-result',verified:false});
assert.equal(secondResult.cards[0].cogs,2);
console.log('mini-prompt-stack persisted identity, receipt and replay-cog hostiles: PASS');

assert.throws(()=>applyMiniPromptReceipt({...single,denominator:{...single.denominator,total:2}},{card_id:id,receipt_ref:'fixture:result',verified:true}),/STACK_DENOMINATOR_MISMATCH/);
