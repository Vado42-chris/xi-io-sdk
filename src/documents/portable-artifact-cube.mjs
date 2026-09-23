import { PortableSemanticFile } from './portable-semantic-file.mjs';
import { bindHexFloorCurrentness } from '../currentness/hex-floor.mjs';
import { resolveArtifactProfile } from './artifact-profile-catalog.mjs';

export const PORTABLE_ARTIFACT_CUBE_SCHEMA='xiio.sdk.portable-artifact-cube/v1';
export const FILE_CUBE_CELLS=Object.freeze([
  'F01_SEMANTIC_IDENTITY',
  'F02_SOURCE_BINDING',
  'F03_DEPENDENCY_BINDING',
  'F04_PROFILE_BINDING',
  'F05_HEX_CURRENTNESS',
  'F06_BINS_CUSTODY',
  'F07_TRANSFER_INTEGRITY',
  'F08_PARSER_VALIDATION',
  'F09_CONSUMER_READBACK',
  'F10_AUTHORITY_BOUNDARY',
]);

const SHA=/^[a-f0-9]{64}$/;
const text=(v)=>typeof v==='string'&&v.trim()?v.trim():null;
const pass=(id,evidence_ref,detail={})=>({id,state:'PASS',evidence_ref,...detail});
const wait=(id,first_red,detail={})=>({id,state:'TRUE_WAIT',first_red,...detail});
const fail=(id,first_red,detail={})=>({id,state:'FAIL',first_red,...detail});

function sha(v){const x=text(v)?.toLowerCase();return x&&SHA.test(x)?x:null;}
function bytes(v){return Number.isInteger(v)&&v>=0?v:null;}

export function compilePortableArtifactCube(input={}){
  let file=null;
  const cells=[];

  try{
    file=PortableSemanticFile(input.file||{});
    cells.push(pass('F01_SEMANTIC_IDENTITY',`semantic:${file.content_digest}`,{
      file_id:file.file_id,semantic_generation:file.semantic_generation,content_digest:file.content_digest
    }));
  }catch(error){
    cells.push(fail('F01_SEMANTIC_IDENTITY','PORTABLE_SEMANTIC_FILE_INVALID',{error:String(error?.message||error)}));
  }

  if(file?.source_bindings?.length){
    cells.push(pass('F02_SOURCE_BINDING',file.source_bindings[0].ref,{count:file.source_bindings.length}));
  }else{
    cells.push(wait('F02_SOURCE_BINDING','SOURCE_BINDING_REQUIRED'));
  }

  const depPolicy=input.dependency_policy||'EXPLICIT';
  if(file && (file.dependency_bindings.length>0 || depPolicy==='NONE_REQUIRED')){
    cells.push(pass('F03_DEPENDENCY_BINDING',file.dependency_bindings[0]?.ref||'N_A_WITH_EVIDENCE',{policy:depPolicy,count:file.dependency_bindings.length}));
  }else{
    cells.push(wait('F03_DEPENDENCY_BINDING','DEPENDENCY_BINDING_OR_NONE_REQUIRED_POLICY'));
  }

  const profile=file?.profile_id?resolveArtifactProfile(file.profile_id):{state:'UNKNOWN'};
  if(profile.state==='PASS' && input.parser_profile?.profile_id===file.profile_id && input.consumer_profile?.profile_id===file.profile_id){
    cells.push(pass('F04_PROFILE_BINDING',`profile:${file.profile_id}`,{profile_id:file.profile_id,profile:profile.profile}));
  }else{
    cells.push(wait('F04_PROFILE_BINDING',profile.state!=='PASS'?'PROFILE_NOT_REGISTERED':'PARSER_AND_CONSUMER_PROFILE_MUST_MATCH_FILE_PROFILE'));
  }

  const hex=file?bindHexFloorCurrentness(input.hex_floor,{
    subject_ref:input.hex_subject_ref||file.artifact_role,
    subject_generation:input.hex_subject_generation||file.semantic_generation,
  }):{state:'UNVERIFIED',projection_ref:null,blocker:'FILE_INVALID',missing_punchcards:[]};
  if(hex.state==='HEX_QUALIFIED_CURRENT'){
    cells.push(pass('F05_HEX_CURRENTNESS',hex.projection_ref,{state:hex.state,missing_punchcards:[]}));
  }else{
    cells.push(wait('F05_HEX_CURRENTNESS',hex.blocker||hex.state,{state:hex.state,projection_ref:hex.projection_ref,missing_punchcards:hex.missing_punchcards}));
  }

  const custody=input.bins_custody||{};
  const custodySha=sha(custody.sha256);
  if(text(custody.resource_version_ref)&&custodySha&&bytes(custody.byte_length)!==null&&text(custody.source_ref)){
    cells.push(pass('F06_BINS_CUSTODY',custody.resource_version_ref,{sha256:custodySha,byte_length:custody.byte_length,source_ref:custody.source_ref}));
  }else{
    cells.push(wait('F06_BINS_CUSTODY','BINS_RESOURCEVERSION_SHA_BYTES_SOURCE_REQUIRED'));
  }

  const transfer=input.transfer_readback||{};
  const sourceSha=sha(transfer.source_sha256);
  const destSha=sha(transfer.destination_sha256);
  const sourceBytes=bytes(transfer.source_bytes);
  const destBytes=bytes(transfer.destination_bytes);
  if(sourceSha&&destSha&&sourceSha===destSha&&sourceBytes!==null&&sourceBytes===destBytes&&text(transfer.final_readback_ref)){
    cells.push(pass('F07_TRANSFER_INTEGRITY',transfer.final_readback_ref,{sha256:destSha,bytes:destBytes}));
  }else if(sourceSha&&destSha&&(sourceSha!==destSha || (sourceBytes!==null&&destBytes!==null&&sourceBytes!==destBytes))){
    cells.push(fail('F07_TRANSFER_INTEGRITY','TRANSFER_BYTES_OR_HASH_MISMATCH'));
  }else{
    cells.push(wait('F07_TRANSFER_INTEGRITY','SOURCE_DEST_HASH_BYTES_FINAL_READBACK_REQUIRED'));
  }

  const parser=input.parser_readback||{};
  if(parser.state==='PASS'&&parser.profile_id===file?.profile_id&&text(parser.receipt_ref)){
    cells.push(pass('F08_PARSER_VALIDATION',parser.receipt_ref,{profile_id:parser.profile_id}));
  }else if(parser.state==='FAIL'){
    cells.push(fail('F08_PARSER_VALIDATION','PARSER_REJECTED',{receipt_ref:parser.receipt_ref||null}));
  }else{
    cells.push(wait('F08_PARSER_VALIDATION','PROFILE_MATCHED_PARSER_RECEIPT_REQUIRED'));
  }

  const consumer=input.consumer_readback||{};
  if(consumer.state==='PASS'&&consumer.profile_id===file?.profile_id&&text(consumer.receipt_ref)){
    cells.push(pass('F09_CONSUMER_READBACK',consumer.receipt_ref,{profile_id:consumer.profile_id}));
  }else if(consumer.state==='FAIL'){
    cells.push(fail('F09_CONSUMER_READBACK','CONSUMER_REJECTED',{receipt_ref:consumer.receipt_ref||null}));
  }else{
    cells.push(wait('F09_CONSUMER_READBACK','TARGET_CONSUMER_READBACK_REQUIRED'));
  }

  const auth=input.authority_gate||{};
  if(auth.required===false || (auth.required===true&&auth.held===true&&text(auth.authority_ref))){
    cells.push(pass('F10_AUTHORITY_BOUNDARY',auth.authority_ref||'NO_EFFECT_DATA_ONLY',{
      authority_required:auth.required===true,
      authority_held:auth.held===true,
    }));
  }else{
    cells.push(wait('F10_AUTHORITY_BOUNDARY','REQUIRED_AUTHORITY_GATE_UNSET'));
  }

  const failures=cells.filter(x=>x.state==='FAIL');
  const waits=cells.filter(x=>x.state==='TRUE_WAIT');
  const state=failures.length?'FAIL':waits.length?'TRUE_WAIT':'PASS';
  return Object.freeze({
    schema:PORTABLE_ARTIFACT_CUBE_SCHEMA,
    cube_id:text(input.cube_id)||`file-cube:${file?.file_id||'invalid'}`,
    file,
    denominator:FILE_CUBE_CELLS.length,
    cells:Object.freeze(cells),
    counts:Object.freeze({pass:cells.filter(x=>x.state==='PASS').length,fail:failures.length,true_wait:waits.length}),
    state,
    closure_100:state==='PASS'&&cells.length===FILE_CUBE_CELLS.length,
    first_red:failures[0]||waits[0]||null,
    hex_projection_ref:hex.projection_ref,
    missing_punchcards:Object.freeze(hex.missing_punchcards||[]),
    effect_authority:false,
    hard:Object.freeze([
      'ONE_FILE_FORMAT_CUBE_MANY_FILE_TYPES',
      'FILE_TYPE_CHANGES_PROFILE_NOT_CELL_TOPOLOGY',
      'SEMANTIC_FILE != SHIPPING_CUBE',
      'HASH_MATCH != PARSER_PASS',
      'PARSER_PASS != CONSUMER_READBACK',
      'SEARCH_RESULT != BINS_CUSTODY',
      'HEX_CURRENT != AUTHORITY',
      'TRANSFER_REQUEST != TRANSFER_COMPLETE',
      'FILE_CUBE_PASS != PUBLICATION_OR_LEGAL_EFFECT',
    ]),
  });
}
