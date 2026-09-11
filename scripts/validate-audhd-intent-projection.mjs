import assert from 'node:assert/strict';
import {
  normalizeAudhdIntent,
  compileCommandIntentProjection,
} from '../src/intent/audhd-command.mjs';

const raw=`THE ISSUE IS YOU FUCKING FAIL TO RETURN CORRECTLY ON REAPS AFTER A POI FIX
USE HEURISTICS TO TELL FOR EVIDENCE IN SIMULATION BEFORE SENDING
LIVE PROMOTION = NOT DONE
AND IBAL CANT TALK BECAUSE YOU DIDNT USE THE FUCKING AUDHD GUIDE TO FILTER MY SWEARS FROM THE COMMANDS PROPERLY
USE THE FUCKING AUDHD GUIDE TO FILTER MY SWEARS FROM THE COMMANDS PROPERLY`;

const intent=normalizeAudhdIntent(raw);
assert.equal(intent.raw_text,raw);
assert.equal(intent.raw_preserved,true);
assert(intent.intensity_signals.length >= 2);
assert(intent.directives.some((x)=>/USE HEURISTICS/i.test(x.text)));
assert(intent.directives.some((x)=>/USE THE AUDHD GUIDE/i.test(x.text)));
assert.equal(intent.directives.filter((x)=>/USE THE AUDHD GUIDE/i.test(x.text)).length,1);
assert(intent.state_assertions.some((x)=>/LIVE PROMOTION = NOT DONE/i.test(x.text)));
assert(!intent.directives.some((x)=>/FUCK/i.test(x.text)));

const known=[
  ["don't fucking deploy; run the tests", false, true],
  ["fix the fucking parser; don't run deployment", true, false],
  ['do not use any fucking tools', false, false],
  ['run the fucking tests', false, true],
  ["don't fucking write files", false, false],
  [raw, true, true],
];
for (const [text,write,terminal] of known) {
  const out=compileCommandIntentProjection(text,{workspaceIdentityState:'bound'});
  assert.equal(out.allowWrite,write,text);
  assert.equal(out.allowTerminal,terminal,text);
}
const unbound=compileCommandIntentProjection('fix it and run tests',{workspaceIdentityState:'unknown'});
assert.equal(unbound.allowWrite,false);
assert.equal(unbound.allowTerminal,false);

console.log(JSON.stringify({
  schema:'xiio.sdk.audhd-intent-check/v1',
  raw_preserved:true,
  intensity_signals:intent.intensity_signals.length,
  directives:intent.directives.length,
  known_answers:known.length,
  result:'PASS',
},null,2));
