#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { discoverInboxRecovery, recoverAriesRunner } from '../src/recovery/aries-runner.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-aries-recovery-test-'));
const repo=path.join(tmp,'.tmp','worktrees','dogfood-runtime-main');
fs.mkdirSync(path.join(repo,'scripts'),{recursive:true});
fs.writeFileSync(path.join(repo,'scripts','aries-runner-local-recovery.sh'),'#!/usr/bin/env bash\necho ARIES_RUNNER_RECOVERY=PASS\n',{mode:0o700});
let r=spawnSync('git',['init'],{cwd:repo,encoding:'utf8'});
assert.equal(r.status,0);
r=spawnSync('git',['remote','add','origin','https://github.com/Vado42-chris/xi-io-Inbox.git'],{cwd:repo,encoding:'utf8'});
assert.equal(r.status,0);
fs.writeFileSync(path.join(repo,'README.md'),'fixture\n');
spawnSync('git',['add','.'],{cwd:repo,encoding:'utf8'});
spawnSync('git',['-c','user.name=xiio-test','-c','user.email=xiio@test.invalid','commit','-m','fixture'],{cwd:repo,encoding:'utf8'});

const env={...process.env,HOME:tmp,USER:path.basename(tmp),XIIO_DOGFOOD_WORKTREE:repo};
const discovered=discoverInboxRecovery({env});
assert.equal(discovered.state,'PASS');
assert.equal(discovered.selected.repo,repo);
assert.equal(discovered.selected.origin,'https://github.com/Vado42-chris/xi-io-Inbox.git');

const plan=recoverAriesRunner({execute:false,env,host:'aries'});
assert.equal(plan.state,'PLAN_READY');
assert.equal(plan.checklist.path_owner_input_required,false);
assert.equal(plan.checklist.new_runner_registration,false);
assert.equal(plan.punchcards.length,10);
assert.equal(plan.scorecard.micro,'PASS');
assert.equal(plan.scorecard.meta,'WAIT');
assert.equal(plan.next,'RE-RUN_WITH_--execute');

const wrongHost=recoverAriesRunner({execute:false,env,host:'not-aries'});
assert.equal(wrongHost.state,'BLOCKED');
assert.equal(wrongHost.first_red,'WRONG_HOST');

const noCheckout=recoverAriesRunner({execute:false,env:{...process.env,HOME:path.join(tmp,'missing'),USER:'missing',XIIO_DOGFOOD_WORKTREE:''},host:'aries'});
assert.equal(noCheckout.state,'BLOCKED');
assert.equal(noCheckout.first_red,'INBOX_RECOVERY_CHECKOUT_NOT_FOUND');

fs.rmSync(tmp,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.cli.aries-runner-recovery-validation/v1',
  status:'PASS',
  cases:3,
  owner_path_input_required:false,
  punchcards:10,
  scorecard:true,
  execute_not_tested_on_hosted_runner:true,
  provider_effects:0
}));
