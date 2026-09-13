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
