import crypto from 'node:crypto';
import { normalizeAudhdIntent } from '../intent/audhd-command.mjs';

const SOW=/\b(?:build|create|implement|add|wire|start|deploy|sow)\b/i;
const REAP=/\b(?:verify|close|resolve|merge|return|reap|readback|prove)\b/i;
const BLOCK=/\b(?:blocked|failed|stopped|missing|regressed|stale|unknown)\b/i;
const DEADLINE=/\b(?:today|tomorrow|monday|deadline|urgent|now|time)\b/i;
const BLAST=/\b(?:all|every|global|framework|sdk|studio|cross.?cut|force multiplier|blastwave)\b/i;

function digest(v){return 'sha256:'+crypto.createHash('sha256').update(v).digest('hex');}
function phase(text){if(REAP.test(text))return 'REAP';if(SOW.test(text))return 'SOW';return 'TRIAGE';}

export function compileMiniPromptStack(input){
  if(!input||typeof input.raw!=='string'||!input.raw.trim())throw new Error('MINI_PROMPT_STACK_REQUIRED');
  const intent=normalizeAudhdIntent(input.raw,{userCorrections:input.user_corrections||{}});
  const cards=intent.projected_lines.map((row,index)=>{
    const recurrence=input.raw.split(row.text).length-1;
    const urgency=DEADLINE.test(row.text)?3:0;
    const blastwave=BLAST.test(row.text)?3:0;
    const blocker=BLOCK.test(row.text)?2:0;
    const executable=row.kind==='DIRECTIVE'?2:0;
    const score=urgency+blastwave+blocker+executable+Math.min(3,Math.max(0,recurrence-1));
    return {card_id:`C${String(index+1).padStart(3,'0')}`,semantic_key:row.semantic_key,phase:phase(row.text),text:row.text,score,state:'UNPROVEN',ticks:0,cogs:0,hope:1,evidence_refs:[],receipt_ref:null};
  }).sort((a,b)=>b.score-a.score||a.card_id.localeCompare(b.card_id));
  const selected=cards.find(c=>c.phase==='REAP')||cards.find(c=>c.phase==='SOW')||cards[0]||null;
  const denominator={total:cards.length,sow:cards.filter(c=>c.phase==='SOW').length,reap:cards.filter(c=>c.phase==='REAP').length,triage:cards.filter(c=>c.phase==='TRIAGE').length,closed:0};
  return {schema:'xiio.sdk.mini-prompt-stack/v1',stack_ref:digest(input.raw),raw_ref:intent.raw_ref,raw_preserved:true,duplicate_lines_removed:intent.duplicate_semantic_lines_removed,denominator,cards,selected_card:selected,next:selected?{action:selected.phase,card_id:selected.card_id,state:'READY_FOR_ADMISSION'}:{action:'TRUE_WAIT',state:'EMPTY'},cadence:{phase_event:'PRE_ENTRY',result_required:true,return_required:true,apply_return_required:true,next_tick_required:true},game:{ticks:0,cogs:cards.length,hope:cards.length?1:0,rule:'EVIDENCE_ADDS_TICKS__OWNER_RESTATEMENT_ADDS_COGS__VERIFIED_REAP_RETURNS_HOPE'},hard:['PROSE!=SOW','RESULT!=REAP','CARD!=AUTHORITY','ACCOUNTING_100!=CLOSURE_100','NONTERMINAL_RESULT_REQUIRES_NEXT_TICK']};
}

export function applyMiniPromptReceipt(stack,{card_id,receipt_ref,verified=false}={}){
  if(!stack||stack.schema!=='xiio.sdk.mini-prompt-stack/v1')throw new Error('STACK_INVALID');
  const cards=stack.cards.map(c=>c.card_id===card_id?{...c,state:verified?'VERIFIED':'RESULT',ticks:c.ticks+(verified?1:0),cogs:Math.max(0,c.cogs-1),receipt_ref:receipt_ref||null}:c);
  const closed=cards.filter(c=>c.state==='VERIFIED').length;
  const next=cards.find(c=>c.state==='UNPROVEN')||null;
  return {...stack,cards,denominator:{...stack.denominator,closed},game:{...stack.game,ticks:cards.reduce((n,c)=>n+c.ticks,0),cogs:cards.filter(c=>c.state!=='VERIFIED').length,hope:closed},next:next?{action:next.phase,card_id:next.card_id,state:'READY_FOR_ADMISSION'}:{action:'TERMINAL_FIXED_POINT',state:'VERIFIED'},terminal:!next};
}
