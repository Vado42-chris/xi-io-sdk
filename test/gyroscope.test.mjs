import test from 'node:test';
import assert from 'node:assert/strict';
import {compileProjectionGyroscope, normalizeGyroscopeGear} from '../src/orchestration/gyroscope.mjs';

const spine={
  root_ref:'root:synthetic',
  generation_ref:'g7',
  denominator_ref:'denom:synthetic',
  return_target_ref:'return:synthetic',
  effect_ceiling:'NO_EFFECT',
  privacy_ceiling:'PRIVATE_INHERITED',
  source_refs:['fixture:synthetic']
};

test('gear controls projection density without changing authority',()=>{
  const items=Array.from({length:10},(_,i)=>({work_ref:`work:${i+1}`,state:'READY',priority:10-i}));
  const one=compileProjectionGyroscope({spine,gear:1,axis:'DIRECTION',direction:'FORWARD',work_items:items});
  const nine=compileProjectionGyroscope({spine,gear:9,axis:'DIRECTION',direction:'REVERSE',work_items:items});
  assert.equal(one.ok,true);
  assert.equal(one.gyroscope.selected.length,1);
  assert.equal(nine.gyroscope.selected.length,9);
  assert.equal(one.gyroscope.spine.root_ref,nine.gyroscope.spine.root_ref);
  assert.equal(one.gyroscope.spine.effect_ceiling,'NO_EFFECT');
  assert.equal(nine.gyroscope.authority_granted,false);
});

test('blocked voice does not stop independent ready work',()=>{
  const out=compileProjectionGyroscope({
    spine,gear:3,
    work_items:[
      {work_ref:'work:blocked',state:'BLOCKED',blocked_by:['transport']},
      {work_ref:'work:a',state:'READY',priority:2},
      {work_ref:'work:b',state:'READY',priority:1},
    ]
  });
  assert.equal(out.ok,true);
  assert.deepEqual(out.gyroscope.selected.map(x=>x.work_ref),['work:a','work:b']);
  assert.equal(out.gyroscope.blocked.length,1);
  assert.equal(out.gyroscope.denominator,3);
});

test('gear is bounded to established 1/3/9/27 transmission',()=>{
  assert.equal(normalizeGyroscopeGear(27),27);
  assert.throws(()=>normalizeGyroscopeGear(2),/GYROSCOPE_GEAR_MUST_BE_1_3_9_27/);
});

test('rotation changes gimbal plane, not the invariant spine',()=>{
  const f=compileProjectionGyroscope({spine,gear:1,axis:'TIME',direction:'FORWARD',work_items:[{work_ref:'w',state:'READY'}]});
  const r=compileProjectionGyroscope({spine,gear:1,axis:'TIME',direction:'REVERSE',work_items:[{work_ref:'w',state:'READY'}]});
  assert.equal(f.gyroscope.gimbal.projection_plane,'TIME:FORWARD');
  assert.equal(r.gyroscope.gimbal.projection_plane,'TIME:REVERSE');
  assert.deepEqual(f.gyroscope.spine,r.gyroscope.spine);
});
