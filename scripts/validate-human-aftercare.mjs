import assert from 'node:assert/strict';import fs from 'node:fs';import {compileHumanAftercare} from '../src/projections/human-aftercare.mjs';
const i=JSON.parse(fs.readFileSync(new URL('../fixtures/aftercare/human-aftercare.synthetic.json',import.meta.url)));
const o=compileHumanAftercare(i);
assert.equal(o.schema,'xiio.sdk.human-aftercare/v1');assert.equal(o.requirements.denominator,1);assert.equal(o.templates.denominator,1);assert.equal(o.aftercare_ready,false);assert.equal(o.blastwave.scales.MESO.state,'WAIT');assert.equal(o.blastwave.scales.MACRO.state,'UNKNOWN');console.log('human-aftercare: PASS');
