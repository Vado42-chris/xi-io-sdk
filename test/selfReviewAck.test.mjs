import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFlatpackPacket, reduceFlatpackArtifact} from '../src/flatpack/executable-packet.mjs';
import {compileSelfReviewAckProjection,applySelfReviewReturns} from '../src/evaluation/self-review-ack.mjs';

function stage(){
  const packet=compileFlatpackPacket({
    packet_id:'packet:synthetic',
    generation:'g1',
    one:{current_coordinate:{step_depth:2}},
    two:{mirror:'counter'},
    blast_radius:{
      coordinate_ref:'coord:synthetic',
      affected_refs:['ref:a','ref:b'],
      return_targets:['return:synthetic']
    },
    qualifiers:[
      {id:'Q1',state:'PASS',bit:1,evidence_ref:'e:q1',generation_ref:'g1',return_target:'return:synthetic'},
      {id:'Q2',state:'TRUE_WAIT',bit:null,evidence_ref:null,generation_ref:'g1',return_target:'return:synthetic'},
      {id:'Q3',state:'PASS',bit:1,evidence_ref:'e:q3',generation_ref:'g1',return_target:'return:synthetic'}
    ]
  });
  return reduceFlatpackArtifact(packet).stage1;
}

test('self review rotates existing carrier without inventing a new file type',()=>{
  const out=compileSelfReviewAckProjection({stage1:stage(),gear:3,axis:'DIRECTION',direction:'FORWARD',observer_ref:'observer:synthetic'});
  assert.equal(out.ok,true);
  assert.equal(out.projection.new_file_type_created,false);
  assert.equal(out.projection.carrier_schema,'xiio.sdk.flatpack-packet/v0');
  assert.equal(out.projection.self_verified,false);
  assert.equal(out.projection.review_requests.length,3);
  assert.equal(out.projection.review_requests[0].counter_projection.direction,'REVERSE');
});

test('independent returns can close selected review without self verification',()=>{
  const p=compileSelfReviewAckProjection({stage1:stage(),gear:3,observer_ref:'observer:synthetic'}).projection;
  const returns=p.review_requests.map(req=>({
    packet_id:p.packet_id,
    generation:p.generation,
    semantic_digest:p.semantic_digest,
    blast_radius_digest:p.blast_radius_digest,
    qualifier_id:req.qualifier_id,
    observer_ref:req.observer_ref,
    observed_state:'PASS',
    drift_state:'SAME',
    evidence_ref:'e:observer:'+req.qualifier_id,
    readback_ref:'r:observer:'+req.qualifier_id
  }));
  const applied=applySelfReviewReturns(p,returns);
  assert.equal(applied.ok,true);
  assert.equal(applied.result.state,'PASS');
  assert.equal(applied.result.self_verified,false);
  assert.equal(applied.result.recurse.same_carrier,true);
  assert.equal(applied.result.recurse.next_generation_allowed,true);
});

test('missing observer return stays true wait',()=>{
  const p=compileSelfReviewAckProjection({stage1:stage(),gear:3,observer_ref:'observer:synthetic'}).projection;
  const applied=applySelfReviewReturns(p,[]);
  assert.equal(applied.result.state,'TRUE_WAIT');
  assert.equal(applied.result.true_wait,3);
});

test('drift cannot average out',()=>{
  const p=compileSelfReviewAckProjection({stage1:stage(),gear:1,observer_ref:'observer:synthetic'}).projection;
  const req=p.review_requests[0];
  const applied=applySelfReviewReturns(p,[{
    packet_id:p.packet_id,generation:p.generation,semantic_digest:p.semantic_digest,blast_radius_digest:p.blast_radius_digest,
    qualifier_id:req.qualifier_id,observer_ref:req.observer_ref,observed_state:'PASS',drift_state:'DRIFT',
    evidence_ref:'e:drift',readback_ref:'r:drift'
  }]);
  assert.equal(applied.result.state,'FAIL');
  assert.equal(applied.result.fail,1);
});
