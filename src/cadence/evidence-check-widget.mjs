import {renderProductSurface, normalizeProductSurface} from '../render/product-surface.mjs';

export const CADENCE_EVIDENCE_WIDGET_SCHEMA='xiio.cadence.evidence-check-widget/v1';
const PHASES=new Set(['SOURCE','FACT','DRAFT','SAVE','READBACK','REVIEW','EFFECT','RETURN']);
const DISPLAY=new Set(['REPORTED_PASS','REPORTED_N_A','WAIT','FAIL','UNKNOWN']);
const ID=/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$/;
function need(ok,reason){if(!ok)throw new TypeError(reason);}
function id(v,label){need(typeof v==='string'&&ID.test(v),label+'_INVALID');return v;}
function text(v,label){need(typeof v==='string'&&v.trim()&&v.length<=160,label+'_INVALID');return v;}
function safeCheck(row) {
  need(row&&typeof row==='object'&&!Array.isArray(row),'CHECKPOINT_REQUIRED');
  id(row.id,'CHECKPOINT_ID');text(row.label,'CHECKPOINT_LABEL');
  need(PHASES.has(row.phase),'CHECKPOINT_PHASE_INVALID');
  need(DISPLAY.has(row.display_state),'CHECKPOINT_DISPLAY_STATE_INVALID');
  need(typeof row.has_receipt==='boolean'&&typeof row.source_generation_supplied==='boolean','CHECKPOINT_EVIDENCE_FLAG_INVALID');
  if(row.display_state==='REPORTED_PASS') need(row.has_receipt&&row.source_generation_supplied,'REPORTED_PASS_NO_RECEIPT');
  return {label:row.label,value:row.display_state,status:{
    label:row.display_state==='REPORTED_PASS'?'Reported, awaiting host verification':
      row.display_state==='REPORTED_N_A'?'Not applicable, reported':row.display_state.replaceAll('_',' '),
    tone:row.display_state==='FAIL'?'critical':row.display_state==='UNKNOWN'?'unknown':'warning'}};
}
export function buildCadenceEvidenceWidgetSurface(widget) {
  need(widget&&typeof widget==='object'&&!Array.isArray(widget),'WIDGET_REQUIRED');
  need(widget.schema===CADENCE_EVIDENCE_WIDGET_SCHEMA,'CADENCE_WIDGET_SCHEMA_INVALID');
  id(widget.workflow_ref,'WORKFLOW_REF');id(widget.generation,'GENERATION');id(widget.product_ref,'PRODUCT_REF');
  need(widget.effect_authority===false&&widget.ready_for_external_effect===false
    &&widget.provider_readback_verified_by_widget===false&&widget.public_content_included===false,'WIDGET_AUTHORITY_FORBIDDEN');
  need(Array.isArray(widget.article_groups)&&widget.article_groups.length>=1&&widget.article_groups.length<=8,'ARTICLE_GROUPS_INVALID');
  const seen=new Set();
  const sections=widget.article_groups.map((group,index)=>{
    need(group&&typeof group==='object'&&!Array.isArray(group),'GROUP_INVALID');
    id(group.id,'GROUP_ID');need(PHASES.has(group.phase),'GROUP_PHASE_INVALID');
    need(Array.isArray(group.checkpoints)&&group.checkpoints.length>0&&group.checkpoints.length<=64,'GROUP_CHECKPOINTS_INVALID');
    return {id:'group-'+index,title:group.phase.charAt(0)+group.phase.slice(1).toLowerCase(),
      summary:'Reported checkpoint observations, not effect authority.',
      rows:group.checkpoints.map(row=>{
        need(row.phase===group.phase,'CHECKPOINT_GROUP_PHASE_MISMATCH');
        need(!seen.has(row.id),'DUPLICATE_CHECKPOINT');seen.add(row.id);
        return safeCheck(row);
      })};
  });
  need(seen.size===widget.checkpoint_count,'CHECKPOINT_COUNT_MISMATCH');
  const surface={
    schema:'xiio.sdk.product-surface/v1',
    surface_id:'cadence-evidence-check',
    title:'Evidence checks',
    subtitle:'Progress and source-readback checkpoints',
    environment:'UNKNOWN',
    statuses:[{label:widget.state==='SUPPLIED_CHECKS_COMPLETE_NOT_AUTHORIZED'?'All checks reported, verify with provider':'Review required',tone:'warning'}],
    notice:'Supplied results do not prove Ward authority, BINS custody, legal compliance or provider effects.',
    sections,
    actions:[],
  };
  return normalizeProductSurface(surface);
}
export function renderCadenceEvidenceWidget(widget){
  return renderProductSurface(buildCadenceEvidenceWidgetSurface(widget));
}
