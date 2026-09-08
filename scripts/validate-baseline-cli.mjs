import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compilePortfolioBaseline, compileDistributedAcks, compileOrgBurnMap, BASELINE_CELLS } from '../src/baseline/compiler.mjs';

const snapshot = JSON.parse(fs.readFileSync(new URL('../fixtures/baseline/portfolio.synthetic.json', import.meta.url), 'utf8'));
const baseline = compilePortfolioBaseline(snapshot);
assert.equal(baseline.repository_denominator, 3);
assert.equal(baseline.cells_per_repository, 8);
assert.equal(baseline.cell_denominator, 24);
assert.equal(baseline.repository_accounting_100, true);
assert.equal(baseline.org_closure_100, false);
assert.equal(baseline.state_counts.PASS, 12);
assert.equal(baseline.state_counts.PARTIAL, 5);
assert.equal(baseline.state_counts.BLOCKED, 7);
assert.equal(baseline.state_counts.UNKNOWN, 0);
assert.equal(baseline.repositories.find((r) => r.repo_ref === 'repo:alpha').punchcard.closure_100, true);
assert.equal(baseline.repositories.find((r) => r.repo_ref === 'repo:beta').next.cell, 'INTEGRATION');
assert.equal(baseline.repositories.find((r) => r.repo_ref === 'repo:beta').punchcard.cells.find((c) => c.id === 'MAIN_STATUS').reason, 'DEFAULT_BRANCH_NOT_MAIN');
assert.equal(baseline.repositories.find((r) => r.repo_ref === 'repo:beta').punchcard.cells.find((c) => c.id === 'BRANCH_STEW').state, 'BLOCKED');

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
assert.equal(burn.current_returns, 1);
assert.equal(burn.stale_returns, 1);
assert.equal(burn.missing_returns, 1);
assert.equal(burn.closure_repositories, 1);

const duplicate = structuredClone(snapshot);
duplicate.repositories.push(structuredClone(duplicate.repositories[0]));
assert.throws(() => compilePortfolioBaseline(duplicate), /duplicate repo_ref/);

console.log(`XIIO_SDK_BASELINE_CLI PASS repos=${baseline.repository_denominator} cells=${baseline.cell_denominator} pass=${baseline.state_counts.PASS} partial=${baseline.state_counts.PARTIAL} blocked=${baseline.state_counts.BLOCKED} ack_packets=${ackSet.ack_denominator} current_returns=${burn.current_returns}`);
