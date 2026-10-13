import assert from 'node:assert/strict';
import {compileObserver55,reconcileObserver55} from '../src/observability/mode-aware-55.mjs';
const fixture={fixture_sha256:'a'.repeat(64),predicate_sha256:'b'.repeat(64),generation:1};
let checks=0;const ok=v=>{assert.ok(v);checks++};
for(const mode of ['WORK','PRIVATE','HOME'])for(const view of ['BLACK_BOX','GLASS_BOX','BLACK_HOLE','API']){
 const verdicts=[{coordinate:'x',result:'PASS',evidence_sha256:'c'.repeat(64)}];
 const a=compileObserver55({mode,view,fixture,observer:'yin',verdicts});
 const b=compileObserver55({mode,view,fixture,observer:'yang',verdicts});
 ok(reconcileObserver55({fixture,observations:[a]}).status==='WAIT_QUORUM');
 ok(reconcileObserver55({fixture,observations:[a,b]}).status==='MATCH_UNQUALIFIED');
 ok(reconcileObserver55({fixture,observations:[a,a]}).reason==='DUPLICATE_OBSERVER');
 const changed=compileObserver55({mode,view,fixture,observer:'yang',verdicts:[{...verdicts[0],result:'FAIL'}]});
 ok(reconcileObserver55({fixture,observations:[a,changed]}).status==='RED_DIVERGENCE');
 ok(reconcileObserver55({fixture,observations:[a,{...b,mode:'HOME'}]}).status==='RED');
 ok(reconcileObserver55({fixture,observations:[a,b]}).effect_authority===false);
}
console.log(JSON.stringify({schema:'xiio.sdk.observer55-proof/v1',checks,mode_count:3,view_count:4,qualified_runtime:false}));
