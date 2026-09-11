import assert from 'node:assert/strict';
import { CoordinateError, parseX42Coordinate, qualifyX42Coordinate } from '../src/projections/x42-coordinate.mjs';

const matrix=parseX42Coordinate('<<<<<<<<<<|??????????|>>>>>>>>>>|xxxxxxxxxx|++++++++++|----------');
assert.deepEqual(matrix.counts,{reap:5,sow:5,unknown:10,blocked:10,gain:10,cost:10});
assert.equal(matrix.net_delta,0);
assert.equal(matrix.topology_delta,0);

const compact=parseX42Coordinate('@ibal*5[truth,source,runtime,fleet,return]<<5?2>>5x1+7-3{live=0,r1=1}!no-flatplanes%4/5');
assert.deepEqual(compact.principals,['ibal']);
assert.deepEqual(compact.multipliers,[5]);
assert.equal(compact.counts.reap,5);
assert.equal(compact.counts.sow,5);
assert.equal(compact.ratios[0].numerator,4);
assert.equal(compact.ratios[0].denominator,5);

for (const raw of ['<','>','<<<','>>>','%4','%4/','%6/5','%1/0','*','*0','{}','{live}','{=1}','{live=}','{a=1,a=2}','<<5§>>5']) {
  assert.throws(()=>parseX42Coordinate(raw),CoordinateError,raw);
}

const plus=qualifyX42Coordinate(parseX42Coordinate('+10'));
assert.equal(plus.money_qualified,false);
assert.equal(plus.status,'PROJECTED');

const moneyBlocked=qualifyX42Coordinate(parseX42Coordinate('$42+10'));
assert.equal(moneyBlocked.status,'BLOCKED');
assert(moneyBlocked.blockers.includes('MONEY_UNOBSERVED'));
const moneyObserved=qualifyX42Coordinate(parseX42Coordinate('$42+10'),{money_observed:true,money_evidence_refs:['receipt:metered-42']});
assert.equal(moneyObserved.money_qualified,true);

const ratio=qualifyX42Coordinate(parseX42Coordinate('%4/5'));
assert.equal(ratio.closure_qualified,false);
assert(ratio.notices.includes('RATIO_IS_COVERAGE_NOT_CLOSURE'));

const authority=qualifyX42Coordinate(parseX42Coordinate('@ibal*42<<5>>5+99%5/5!all-green'),{closure_contract_satisfied:true,closure_evidence_refs:['receipt:closure']});
assert.equal(authority.authority_granted,false);
assert.equal(authority.live_granted,false);
assert.equal(authority.work_admitted,false);
assert.equal(authority.return_proven,false);

console.log(JSON.stringify({schema:'xiio.sdk.x42-coordinate-check/v1',known_answer:'PASS',hostiles:16,money_inflation:'BLOCKED',coverage_inflation:'BLOCKED',authority_inflation:'BLOCKED',result:'PASS'},null,2));
