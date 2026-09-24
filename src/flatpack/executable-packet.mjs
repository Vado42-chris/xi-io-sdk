import crypto from 'node:crypto';

export const FLATPACK_PACKET_SCHEMA='xiio.sdk.flatpack-packet/v0';
export const FLATPACK_QUALIFIER_STATES=Object.freeze(['PASS','FAIL','TRUE_WAIT','UNKNOWN','N_A']);

function object(value,key){
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new TypeError(key+'_OBJECT_REQUIRED');
  return value;
}
function text(value,key,max=512){
  if(typeof value!=='string'||!value.trim()||value.length>max) throw new TypeError(key+'_INVALID');
  return value.trim();
}
function optional(value,max=1024){
  return typeof value==='string'&&value.trim()&&value.length<=max?value.trim():null;
}
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])]));
  }
  return value;
}
function digest(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function stringList(value){
  return Object.freeze([...new Set((Array.isArray(value)?value:[]).filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))].sort());
}
function blastEnvelope(input,packet){
  const supplied=input?.blast_radius;
  const base=supplied&&typeof supplied==='object'&&!Array.isArray(supplied)?stable(supplied):{};
  const return_targets=stringList([
    ...(Array.isArray(base.return_targets)?base.return_targets:[]),
    ...packet.qualifiers.map(q=>q.return_target).filter(Boolean),
  ]);
  const affected_refs=stringList(base.affected_refs);
  const envelope=stable({
    ...base,
    generation:packet.generation,
    qualifier_denominator:packet.qualifier_denominator,
    return_targets,
    affected_refs,
  });
  return Object.freeze({
    ...envelope,
    semantic_digest:digest(envelope),
  });
}
function qualifier(input,index){
  object(input,'qualifier_'+index);
  const id=text(input.id,'qualifier_id',256);
  const state=text(input.state,'qualifier_state',32).toUpperCase();
  if(!FLATPACK_QUALIFIER_STATES.includes(state)) throw new TypeError('QUALIFIER_STATE_INVALID');
  const bit=input.bit===0||input.bit===1?input.bit:null;
  if(state==='PASS'&&bit!==1) throw new TypeError('PASS_REQUIRES_BIT_1');
  if(state==='FAIL'&&bit!==0) throw new TypeError('FAIL_REQUIRES_BIT_0');
  if(['TRUE_WAIT','UNKNOWN','N_A'].includes(state)&&bit!==null) throw new TypeError('UNRESOLVED_QUALIFIER_BIT_MUST_BE_NULL');
  return Object.freeze({
    id,
    state,
    bit,
    evidence_ref:optional(input.evidence_ref),
    generation_ref:optional(input.generation_ref),
    return_target:optional(input.return_target),
  });
}

export function compileFlatpackPacket(input={}){
  const one=stable(object(input.one,'one'));
  const two=stable(object(input.two,'two'));
  if(!Array.isArray(input.qualifiers)) throw new TypeError('QUALIFIERS_ARRAY_REQUIRED');

  const qualifiers=[...input.qualifiers].map(qualifier).sort((a,b)=>a.id.localeCompare(b.id));
  const ids=new Set();
  for(const row of qualifiers){
    if(ids.has(row.id)) throw new TypeError('QUALIFIER_ID_DUPLICATE');
    ids.add(row.id);
  }

  const applicable=qualifiers.filter((row)=>row.state!=='N_A');
  const pass=applicable.filter((row)=>row.bit===1);
  const fail=applicable.filter((row)=>row.bit===0);
  const waits=applicable.filter((row)=>row.state==='TRUE_WAIT');
  const unknowns=applicable.filter((row)=>row.state==='UNKNOWN');

  const state=fail.length?'FAIL':unknowns.length?'UNKNOWN':waits.length?'TRUE_WAIT':'PASS';
  const closure_100=state==='PASS'&&pass.length===applicable.length;
  const first_red=fail[0]||unknowns[0]||waits[0]||null;

  const identity={
    one,
    two,
    qualifiers:qualifiers.map(({id,state,bit,generation_ref})=>({id,state,bit,generation_ref})),
  };

  return Object.freeze({
    schema:FLATPACK_PACKET_SCHEMA,
    packet_id:text(input.packet_id,'packet_id',256),
    generation:text(input.generation,'generation',256),
    one:Object.freeze(one),
    two:Object.freeze(two),
    qualifiers:Object.freeze(qualifiers),
    qualifier_denominator:applicable.length,
    qualifier_counts:Object.freeze({
      pass:pass.length,
      fail:fail.length,
      true_wait:waits.length,
      unknown:unknowns.length,
      n_a:qualifiers.length-applicable.length,
    }),
    state,
    closure_100,
    first_red,
    semantic_digest:digest(identity),
    effect_authority:false,
    hard:Object.freeze([
      'FLATPACK_PACKET = ONE + TWO + QUALIFIERS',
      'RESOLVED_QUALIFIER_IS_BINARY',
      'PASS_REQUIRES_BIT_1',
      'FAIL_REQUIRES_BIT_0',
      'UNRESOLVED_QUALIFIER_HAS_NO_BIT',
      'PACKET != PROJECTION',
      'ONE_EXECUTABLE_PACKET -> MANY_DERIVED_PROJECTIONS',
      'NEW_USE_CASE != NEW_FILE_TYPE',
      'PROFILE_CHANGES_INTERPRETATION_NOT_CARRIER',
      'REPORT != RETURN != APPLY_RETURN',
    ]),
  });
}

export const FlatpackPacket=compileFlatpackPacket;

export function projectFlatpackQualifiers(packet){
  const compiled=compileFlatpackPacket(packet);
  return Object.freeze({
    schema:'xiio.sdk.flatpack-qualifier-projection/v0',
    packet_id:compiled.packet_id,
    generation:compiled.generation,
    semantic_digest:compiled.semantic_digest,
    denominator:compiled.qualifier_denominator,
    counts:compiled.qualifier_counts,
    state:compiled.state,
    closure_100:compiled.closure_100,
    first_red:compiled.first_red,
    qualifiers:compiled.qualifiers,
    effect_authority:false,
  });
}

export function validateFlatpackPacketRoundtrip(packet){
  const compiled=compileFlatpackPacket(packet);
  const replay=compileFlatpackPacket(JSON.parse(JSON.stringify(compiled)));
  return Object.freeze({
    schema:'xiio.sdk.flatpack-packet-roundtrip/v0',
    packet_id:compiled.packet_id,
    generation:compiled.generation,
    semantic_digest:compiled.semantic_digest,
    pass:
      replay.packet_id===compiled.packet_id &&
      replay.generation===compiled.generation &&
      replay.semantic_digest===compiled.semantic_digest &&
      replay.state===compiled.state &&
      replay.closure_100===compiled.closure_100,
    effect_authority:false,
  });
}


export function reduceFlatpackArtifact(input={}){
  const packet=compileFlatpackPacket(input);
  const blast_radius=blastEnvelope(input,packet);

  const stage3=Object.freeze({
    schema:'xiio.sdk.flatpack-reduction-stage/v1',
    stage:3,
    artifact_ref:packet.packet_id,
    generation:packet.generation,
    parts:Object.freeze({
      one:packet.one,
      two:packet.two,
      qualifiers:packet.qualifiers,
    }),
    blast_radius,
  });

  const stage2=Object.freeze({
    schema:'xiio.sdk.flatpack-reduction-stage/v1',
    stage:2,
    artifact_ref:packet.packet_id,
    generation:packet.generation,
    reciprocal_pair:Object.freeze({
      one:packet.one,
      two:packet.two,
    }),
    qualifier_vector:Object.freeze(packet.qualifiers.map(({id,state,bit,evidence_ref,generation_ref,return_target})=>({
      id,state,bit,evidence_ref,generation_ref,return_target
    }))),
    blast_radius,
  });

  const stage1=Object.freeze({
    schema:'xiio.sdk.flatpack-reduction/v1',
    stage:1,
    artifact_ref:packet.packet_id,
    generation:packet.generation,
    semantic_digest:packet.semantic_digest,
    state:packet.state,
    closure_100:packet.closure_100,
    first_red:packet.first_red,
    blast_radius,
    canonical_packet:packet,
  });

  return Object.freeze({
    schema:'xiio.sdk.flatpack-reduction-trace/v1',
    reduction:'3->2->1',
    stage3,
    stage2,
    stage1,
    artifact_result:stage1,
    blast_radius_digest:blast_radius.semantic_digest,
    hard:Object.freeze([
      'ONE_ARTIFACT_RESULT = REDUCE(THREE -> TWO -> ONE)',
      'STAGE_3_BLAST_RADIUS == STAGE_2_BLAST_RADIUS == STAGE_1_BLAST_RADIUS',
      'REDUCTION != INFORMATION_LOSS',
      'QUALIFIER_EVIDENCE_SURVIVES_REDUCTION',
      'RETURN_TARGETS_SURVIVE_REDUCTION',
      'AFFECTED_REFS_SURVIVE_REDUCTION',
      'STAGE_1_CONTAINS_CANONICAL_PACKET_FOR_DETERMINISTIC_EXPANSION',
    ]),
  });
}

export function expandFlatpackArtifact(stage1Input={}){
  const stage1=object(stage1Input,'stage1');
  if(stage1.schema!=='xiio.sdk.flatpack-reduction/v1'||stage1.stage!==1){
    throw new TypeError('STAGE_1_ARTIFACT_REQUIRED');
  }
  const packet=compileFlatpackPacket(stage1.canonical_packet);
  if(packet.packet_id!==stage1.artifact_ref) throw new TypeError('STAGE_1_ARTIFACT_REF_MISMATCH');
  if(packet.generation!==stage1.generation) throw new TypeError('STAGE_1_GENERATION_MISMATCH');
  if(packet.semantic_digest!==stage1.semantic_digest) throw new TypeError('STAGE_1_SEMANTIC_DIGEST_MISMATCH');

  const blast=stable(object(stage1.blast_radius,'blast_radius'));
  const blastDigest=blast.semantic_digest;
  const blastCore={...blast};
  delete blastCore.semantic_digest;
  if(blastDigest!==digest(blastCore)) throw new TypeError('BLAST_RADIUS_DIGEST_MISMATCH');
  const blast_radius=Object.freeze(blast);

  const stage2=Object.freeze({
    schema:'xiio.sdk.flatpack-reduction-stage/v1',
    stage:2,
    artifact_ref:packet.packet_id,
    generation:packet.generation,
    reciprocal_pair:Object.freeze({
      one:packet.one,
      two:packet.two,
    }),
    qualifier_vector:Object.freeze(packet.qualifiers.map(({id,state,bit,evidence_ref,generation_ref,return_target})=>({
      id,state,bit,evidence_ref,generation_ref,return_target
    }))),
    blast_radius,
  });

  const stage3=Object.freeze({
    schema:'xiio.sdk.flatpack-reduction-stage/v1',
    stage:3,
    artifact_ref:packet.packet_id,
    generation:packet.generation,
    parts:Object.freeze({
      one:packet.one,
      two:packet.two,
      qualifiers:packet.qualifiers,
    }),
    blast_radius,
  });

  return Object.freeze({
    schema:'xiio.sdk.flatpack-expansion-trace/v1',
    expansion:'1->2->3',
    stage1:Object.freeze(stage1),
    stage2,
    stage3,
    blast_radius_digest:blastDigest,
    hard:Object.freeze([
      'EXPANSION_USES_STAGE_1_ONLY',
      'NO_EXTERNAL_STATE_REQUIRED',
      'BLAST_RADIUS_DIGEST_STABLE',
      'RETURN_TARGETS_RESTORED',
      'QUALIFIER_EVIDENCE_RESTORED',
    ]),
  });
}

export function validateFlatpackReductionRoundtrip(input={}){
  const reduced=reduceFlatpackArtifact(input);
  const expanded=expandFlatpackArtifact(reduced.stage1);
  const sameBlast=
    reduced.stage3.blast_radius.semantic_digest===reduced.stage2.blast_radius.semantic_digest &&
    reduced.stage2.blast_radius.semantic_digest===reduced.stage1.blast_radius.semantic_digest &&
    reduced.stage1.blast_radius.semantic_digest===expanded.stage2.blast_radius.semantic_digest &&
    expanded.stage2.blast_radius.semantic_digest===expanded.stage3.blast_radius.semantic_digest;
  const samePacket=
    expanded.stage3.parts.one &&
    digest(expanded.stage3.parts.one)===digest(reduced.stage3.parts.one) &&
    digest(expanded.stage3.parts.two)===digest(reduced.stage3.parts.two) &&
    digest(expanded.stage3.parts.qualifiers)===digest(reduced.stage3.parts.qualifiers);

  return Object.freeze({
    schema:'xiio.sdk.flatpack-reduction-roundtrip/v1',
    state:sameBlast&&samePacket?'PASS':'FAIL',
    reduction:'3->2->1',
    expansion:'1->2->3',
    packet_id:reduced.stage1.artifact_ref,
    semantic_digest:reduced.stage1.semantic_digest,
    blast_radius_digest:reduced.blast_radius_digest,
    same_blast_radius:sameBlast,
    same_packet_topology:samePacket,
    external_state_reads:0,
    effect_authority:0,
  });
}
