import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { compilePortfolioBaseline, compileDistributedAcks, compileOrgBurnMap, BASELINE_CELLS } from '../src/baseline/compiler.mjs';
import { normalizeBaselineCommand, BASELINE_COMMANDS, commandCatalog } from '../src/lexicon/baseline-commands.mjs';
import { validateDistributedAck, makeAckTarget } from '../src/acks/distributed.mjs';

const snapshot = JSON.parse(fs.readFileSync(new URL('../fixtures/baseline/portfolio.synthetic.json', import.meta.url), 'utf8'));
const baseline = compilePortfolioBaseline(snapshot);
assert.equal(baseline.repository_denominator, 3);
assert.equal(baseline.cells_per_repository, 8);
assert.equal(baseline.cell_denominator, 24);
assert.equal(baseline.repository_accounting_100, true);
assert.equal(baseline.org_closure_100, false);
assert.equal(baseline.state_counts.PASS, 0);
assert.equal(baseline.state_counts.SUPPLIED_UNVERIFIED, 12);
assert.equal(baseline.state_counts.PARTIAL, 5);
assert.equal(baseline.state_counts.BLOCKED, 7);
assert.equal(baseline.state_counts.UNKNOWN, 0);
assert.equal(baseline.repositories.find((r) => r.repo_ref === 'repo:alpha').punchcard.closure_100, false);
assert.equal(baseline.repositories.find((r) => r.repo_ref === 'repo:beta').next.cell, 'INTEGRATION');
assert.equal(baseline.repositories.find((r) => r.repo_ref === 'repo:beta').punchcard.cells.find((c) => c.id === 'MAIN_STATUS').reason, 'DEFAULT_BRANCH_NOT_MAIN');
assert.equal(baseline.repositories.find((r) => r.repo_ref === 'repo:beta').punchcard.cells.find((c) => c.id === 'BRANCH_STEW').state, 'BLOCKED');

const unknownSnapshot = {
  source_generation: 'github-installation:synthetic:unknown-g1',
  observed_at: '2026-09-08T10:30:00.000Z',
  repositories: [{ repo_ref: 'repo:unobserved', default_branch: 'main', visibility: 'private' }],
};
const unknownBaseline = compilePortfolioBaseline(unknownSnapshot);
assert.equal(unknownBaseline.repository_denominator, 1);
assert.equal(unknownBaseline.state_counts.PASS, 0);
assert.equal(unknownBaseline.state_counts.UNKNOWN, 7);
assert.equal(unknownBaseline.state_counts.BLOCKED, 0);
assert.equal(unknownBaseline.repositories[0].punchcard.cells.find((c) => c.id === 'BRANCH_STEW').reason, 'BRANCH_CENSUS_UNKNOWN');
assert.equal(unknownBaseline.repositories[0].punchcard.cells.find((c) => c.id === 'INTEGRATION').reason, 'OBSERVATION_INCOMPLETE');

assert.equal(unknownBaseline.state_counts.SUPPLIED_UNVERIFIED, 1);

const ackSet = compileDistributedAcks(baseline);
assert.equal(ackSet.ack_denominator, 3);
assert.equal(ackSet.delivery_state, 'NOT_DELIVERED');
assert(ackSet.acks.every((a) => a.authority.source_mutation === false));
assert(ackSet.acks.every((a) => a.requested_return.required_cells.length === BASELINE_CELLS.length));

const returns = [
  {
    repo_ref: 'repo:alpha',
    repo_head_sha: baseline.repositories.find((r) => r.repo_ref === 'repo:alpha').head_sha,
    baseline_generation: baseline.baseline_generation,
    cell_receipts: [],
  },
  {
    repo_ref: 'repo:gamma',
    repo_head_sha: 'stale-head',
    baseline_generation: baseline.baseline_generation,
    cell_receipts: [],
  },
];
const burn = compileOrgBurnMap(baseline, returns);
assert.equal(burn.repository_denominator, 3);
assert.equal(burn.returns_observed, 2);
assert.equal(burn.current_returns, 0);
assert.equal(burn.stale_returns, 1);
assert.equal(burn.missing_returns, 1);
assert.equal(burn.closure_repositories, 0);

const duplicate = structuredClone(snapshot);
duplicate.repositories.push(structuredClone(duplicate.repositories[0]));
assert.throws(() => compilePortfolioBaseline(duplicate), /duplicate repo_ref/);

const forged = structuredClone(snapshot);
for (const repo of forged.repositories) {
  for (const flag of ['managed_manifest_current', 'hydration_current', 'worker_capability_current', 'sdk_cli_adopted', 'ack_current', 'return_readback_current']) repo[flag] = true;
  repo.head_sha = 'not-a-sha';
  repo.classification = 'UNCLASSIFIED';
  delete repo.branches;
}
const unverified = compilePortfolioBaseline(forged);
assert.equal(unverified.org_closure_100, false);
assert.equal(unverified.state_counts.PASS, 0);
for (const repo of unverified.repositories) {
  assert.equal(repo.punchcard.cells.find(cell => cell.id === 'BRANCH_STEW').state, 'UNKNOWN');
  assert.equal(repo.punchcard.cells.find(cell => cell.id === 'MAIN_STATUS').state, 'UNKNOWN');
  assert.equal(repo.punchcard.cells.find(cell => cell.id === 'INTEGRATION').reason, 'CLASSIFICATION_UNBOUND');
}
assert.equal(burn.incomplete_returns, 1);
const fullReturn = { ...returns[0], current_readback: true, verified: true,
  cell_receipts: BASELINE_CELLS.map(cell_id => ({ cell_id, receipt_ref: `synthetic:receipt:${cell_id}` })) };
const suppliedReturn = compileOrgBurnMap(baseline, [fullReturn]);
assert.equal(suppliedReturn.current_returns, 0);
assert.equal(suppliedReturn.supplied_binding_count, 1);
assert.equal(suppliedReturn.rows.find(row => row.repo_ref === fullReturn.repo_ref).return_state, 'SUPPLIED_UNVERIFIED');
assert.throws(() => compileOrgBurnMap(baseline, [fullReturn, fullReturn]), /duplicate/);
assert.throws(() => compileOrgBurnMap(baseline, [{ ...fullReturn, repo_ref: 'unknown:repo' }]), /outside/);
const duplicateCell = structuredClone(fullReturn);
duplicateCell.cell_receipts[1] = duplicateCell.cell_receipts[0];
assert.equal(compileOrgBurnMap(baseline, [duplicateCell]).incomplete_returns, 1);

const catalog = commandCatalog();
assert.equal(catalog.schema, 'xiio.sdk.command-lexicon/v1');
const commandIds = new Set(catalog.commands.map((entry) => entry.id));
for (const requiredId of [
  'baseline.compile','baseline.census','baseline.classify','baseline.hydrate','baseline.qualify',
  'baseline.main','baseline.destew','baseline.sdk','baseline.score','baseline.burn',
  'baseline.return','baseline.ratchet','ack.distribute','ack.validate','burnmap.compile','lesson.promote','sdk.commands','sdk.call',
]) assert(commandIds.has(requiredId), `missing command ${requiredId}`);
assert.equal(Object.keys(BASELINE_COMMANDS).length, 12);
assert.equal(normalizeBaselineCommand('100s').verb, 'score');
assert.equal(normalizeBaselineCommand('inventory').verb, 'census');
assert.equal(normalizeBaselineCommand('do-whatever').state, 'UNKNOWN_COMMAND');

const futureProviderAck = {
  ack_id: 'ack:1',
  root_ref: 'root:1',
  work_ref: 'work:1',
  baseline_generation: baseline.baseline_generation,
  target_ref: 'repo:alpha',
  provider_family: 'FUTURE_PROVIDER',
  agent_ref: 'external-agent:1',
  capability_profile_ref: 'baseline-probe/v1',
  subject_generation: 'subject:g1',
  effect_ceiling: 'NO_EFFECT',
  ack_state: 'ACK',
  attempt: 0,
  return_target_ref: 'return:root:1',
  observed_at: '2026-09-08T10:00:00Z',
};
assert.equal(validateDistributedAck(futureProviderAck).ok, true);
assert.equal(validateDistributedAck({ ...futureProviderAck, attempt: 1 }).ok, false);
assert.equal(validateDistributedAck({ ...futureProviderAck, provider_family: 'CLAUDE' }).ok, true);
assert.equal(validateDistributedAck({ ...futureProviderAck, provider_family: 'CHATGPT' }).ok, true);
assert.equal(validateDistributedAck({ ...futureProviderAck, provider_family: 'OLLAMA' }).ok, true);

const cli = spawnSync(process.execPath, [new URL('../bin/xi.mjs', import.meta.url).pathname, 'baseline', 'census', '--subject', 'account:fixture'], { encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr);
const envelope = JSON.parse(cli.stdout);
assert.equal(envelope.schema, 'xiio.sdk.baseline-command-envelope/v1');
assert.equal(envelope.command.id, 'baseline.census');
assert.equal(envelope.subject_ref, 'account:fixture');
assert.equal(envelope.provider_family, 'ANY_QUALIFIED');
assert.equal(envelope.attempt, 0);
assert.equal(envelope.authority.provider_effect, false);
assert.equal(envelope.state, 'COMPILED_NOT_EXECUTED');

console.log(`XIIO_SDK_BASELINE_CLI PASS repos=${baseline.repository_denominator} cells=${baseline.cell_denominator} pass=${baseline.state_counts.PASS} partial=${baseline.state_counts.PARTIAL} blocked=${baseline.state_counts.BLOCKED} unknown_preserved=${unknownBaseline.state_counts.UNKNOWN}/7 ack_packets=${ackSet.ack_denominator} current_returns=${burn.current_returns} commands=${catalog.commands.length} provider_agnostic_ack=PASS`);

{
const base={ack_id:'fixture:ack',root_ref:'fixture:root',work_ref:'fixture:work',baseline_generation:'fixture:g1',target_ref:'fixture:target',provider_family:'fixture:provider',agent_ref:'fixture:agent',capability_profile_ref:'fixture:capability',subject_generation:'fixture:g1',effect_ceiling:'NO_EFFECT',ack_state:'ACK',attempt:0,return_target_ref:'fixture:return',observed_at:'2026-09-08T12:00:00Z'};
let checked=0;
for(const attempt of ['invalid-number','0',false,{},[],NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1]){assert.equal(validateDistributedAck({...base,ack_state:'RESULT',attempt}).ok,false);checked++;}
for(const field of Object.keys(base).filter(x=>x!=='attempt'))for(const value of [' ',{},0,'x'.repeat(257)]){assert.equal(validateDistributedAck({...base,[field]:value}).ok,false);checked++;}
for(const observed_at of ['not-a-date','2026-02-31T12:00:00Z','2026-09-08','1']){assert.equal(validateDistributedAck({...base,observed_at}).ok,false);checked++;}
for(const ack_state of ['POSTED','ACK','REJECT','WAIT']){assert.equal(validateDistributedAck({...base,ack_state,attempt:1}).ok,false);assert.equal(validateDistributedAck({...base,ack_state,attempt:0}).ok,true);checked+=2;}
assert.equal(validateDistributedAck({...base,ack_state:'ATTEMPTED',attempt:0}).ok,false);checked++;
for(const ack_state of ['ATTEMPTED','RESULT','RETURN','APPLY_RETURN']){assert.equal(validateDistributedAck({...base,ack_state,attempt:1}).ok,true);checked++;}
for(const ack_state of ['RESULT','RETURN','APPLY_RETURN']){assert.equal(validateDistributedAck({...base,ack_state,attempt:0}).ok,true);checked++;}
const forged=validateDistributedAck({...base,authenticated:true,authority_granted:true});assert.equal(forged.authenticated,false);assert.equal(forged.authority_granted,false);assert.equal(forged.proof_state,'STRUCTURAL_ONLY');checked++;
assert.throws(()=>makeAckTarget({...base,target_ref:' '}));checked++;
assert.equal(makeAckTarget(base).target_ref,base.target_ref);checked++;
console.log(JSON.stringify({mode:'SYNTHETIC_SOURCE_CONFORMANCE_ONLY',checks:checked,result:'PASS',effects:0}));


}
