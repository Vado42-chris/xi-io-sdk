import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCadenceEvidenceWidgetSurface,renderCadenceEvidenceWidget} from '../src/cadence/evidence-check-widget.mjs';
function fixture(){
 return {schema:'xiio.cadence.evidence-check-widget/v1',workflow_ref:'work:one',product_ref:'product:test',
 generation:'g1',state:'REVIEW_REQUIRED',checkpoint_count:2,reported_count:1,outstanding_count:1,
 effect_authority:false,ready_for_external_effect:false,
 provider_readback_verified_by_widget:false,public_content_included:false,
 article_groups:[
 {id:'group:source',phase:'SOURCE',checkpoints:[{id:'check1',phase:'SOURCE',label:'Check source',display_state:'REPORTED_PASS',has_receipt:true,source_generation_supplied:true}]},
 {id:'group:review',phase:'REVIEW',checkpoints:[{id:'check2',phase:'REVIEW',label:'Human review',display_state:'UNKNOWN',has_receipt:false,source_generation_supplied:false}]},
 ]};
}
test('Cadence widget produces bounded surface using existing SDK renderer',()=>{
 const widget=fixture();
 const surface=buildCadenceEvidenceWidgetSurface(widget);
 assert.equal(surface.sections.length,2);
 assert.equal(surface.actions.length,0);
 assert.equal(surface.statuses[0].tone,'warning');
 const html=renderCadenceEvidenceWidget(widget);
 assert.match(html,/data-xiui="page-shell"/);
 assert.match(html,/Evidence checks/);
 assert.match(html,/Source/);
 assert.match(html,/Review/);
 assert.doesNotMatch(html,/data-xiio-action=/);
 assert.doesNotMatch(html,/receipt:|work:one|product:test/);
});
test('a forged authority or inconsistent denominator fails closed',()=>{
 for(const key of ['effect_authority','ready_for_external_effect','provider_readback_verified_by_widget','public_content_included']){
 const x=fixture();x[key]=true;assert.throws(()=>buildCadenceEvidenceWidgetSurface(x),/WIDGET_AUTHORITY_FORBIDDEN/);
 }
 const x=fixture();x.checkpoint_count=10;assert.throws(()=>buildCadenceEvidenceWidgetSurface(x),/CHECKPOINT_COUNT_MISMATCH/);
});
test('pass without receipt and repeated checkpoint refuse',()=>{
 const no=fixture();no.article_groups[0].checkpoints[0].has_receipt=false;
 assert.throws(()=>buildCadenceEvidenceWidgetSurface(no),/REPORTED_PASS_NO_RECEIPT/);
 const duplicate=fixture();duplicate.article_groups[1].checkpoints[0].id='check1';
 assert.throws(()=>buildCadenceEvidenceWidgetSurface(duplicate),/DUPLICATE_CHECKPOINT/);
});
test('labels are escaped by SDK surface renderer and never execute',()=>{
 const x=fixture();x.article_groups[0].checkpoints[0].label='<script>alert(1)</script>';
 const html=renderCadenceEvidenceWidget(x);
 assert.doesNotMatch(html,/<script>/);
 assert.doesNotMatch(html,/alert\(1\)|&lt;script&gt;/);
});

test('forged reported count, completion state and repeated phases fail closed',()=>{
 const wrong=fixture();wrong.reported_count=2;
 assert.throws(()=>buildCadenceEvidenceWidgetSurface(wrong),/CHECKPOINT_SUMMARY_MISMATCH/);
 const completed=fixture();completed.state='SUPPLIED_CHECKS_COMPLETE_NOT_AUTHORIZED';
 assert.throws(()=>buildCadenceEvidenceWidgetSurface(completed),/CHECKPOINT_STATE_MISMATCH/);
 const repeated=fixture();repeated.article_groups[1].phase='SOURCE';repeated.article_groups[1].checkpoints[0].phase='SOURCE';
 assert.throws(()=>buildCadenceEvidenceWidgetSurface(repeated),/DUPLICATE_GROUP_PHASE/);
});
