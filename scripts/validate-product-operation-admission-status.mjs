#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
const status = JSON.parse(fs.readFileSync('projects/evidence/product-operation-admission-binding-status.json', 'utf8'));
assert.equal(status.source, 'PASS_LOCAL_6_OF_6');
assert.equal(status.accepted_main, 'PENDING');
assert.equal(status.installed, 'NOT_CLAIMED');
assert.equal(status.operational, 'NOT_CLAIMED');
console.log('product-operation-admission-status: pass');
