const PLANES=Object.freeze(['XY','XZ','YZ']);
const EPS=1e-9;
const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};
const finite=(v,k)=>{if(typeof v!=='number'||!Number.isFinite(v))throw new TypeError(k+'_FINITE_REQUIRED');return v;};
const vec3=(v,k)=>{
  if(!Array.isArray(v)||v.length!==3)throw new TypeError(k+'_VEC3_REQUIRED');
  return v.map((n,i)=>finite(n,k+'_'+i));
};
const project3=(p,plane)=>{
  if(plane==='XY')return [p[0],p[1]];
  if(plane==='XZ')return [p[0],p[2]];
  if(plane==='YZ')return [p[1],p[2]];
  throw new TypeError('render_plane_INVALID');
};
const inside2=(p,h)=>Math.abs(p[0])<=h+EPS&&Math.abs(p[1])<=h+EPS;
const insideAll=(p,h)=>PLANES.every(plane=>inside2(project3(p,plane),h));
const overlap1d=(a0,a1,b0,b1)=>Math.max(a0,b0)<=Math.min(a1,b1)+EPS;
const dist3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

function cubesTouch(a,b){
  const ah=a.size/2,bh=b.size/2;
  return [0,1,2].some(axis=>{
    const touching=Math.abs(Math.abs(a.center[axis]-b.center[axis])-(ah+bh))<=EPS;
    if(!touching)return false;
    return [0,1,2].filter(i=>i!==axis).every(i=>
      overlap1d(a.center[i]-ah,a.center[i]+ah,b.center[i]-bh,b.center[i]+bh)
    );
  });
}
function sphereOverlap(a,b){
  const distance=dist3(a.center,b.center);
  const raw=(a.radius+b.radius)-distance;
  return Object.freeze({distance,intersects:raw>=-EPS,overlap_depth:Math.max(0,raw)});
}
function rope(raw={},i=0){
  const period_ms=finite(raw.period_ms??1000,'rope_period_ms_'+i);
  const amplitude=finite(raw.amplitude??1,'rope_amplitude_'+i);
  const phase=finite(raw.phase??0,'rope_phase_'+i);
  const return_lag_ms=finite(raw.return_lag_ms??0,'rope_return_lag_ms_'+i);
  if(period_ms<=0||amplitude<0||return_lag_ms<0)throw new TypeError('ROPE_PROFILE_INVALID');
  const start=String(raw.start_state||'X_FRACTAL_GREEN');
  const end=String(raw.end_state||'X_FRACTAL_GREEN');
  const first=String(raw.first_half_operation||'REAP_INWARD');
  const second=String(raw.second_half_operation||'SOW_OUTWARD');
  return Object.freeze({
    cycle_ref:text(raw.cycle_ref,'rope_cycle_ref_'+i),
    start_state:start,
    first_half:Object.freeze({operation:first,token:first==='REAP_INWARD'?'<<':'?'}),
    seam_crossing:'USER_TESTING_MIRROR',
    second_half:Object.freeze({operation:second,token:second==='SOW_OUTWARD'?'>>':'?'}),
    end_state:end,
    period_ms,amplitude,phase,return_lag_ms,
    cycle_hz:1000/period_ms,
    breathing:Object.freeze({
      measure:'SYSTEM_USER_TESTING_CADENCE',
      expansion:'SOW_OUTWARD',
      contraction:'REAP_INWARD',
      medical_claim:false
    }),
    closed:
      start==='X_FRACTAL_GREEN' &&
      first==='REAP_INWARD' &&
      second==='SOW_OUTWARD' &&
      end==='X_FRACTAL_GREEN'
  });
}

export function compileTopographyGeometry(input={}){
  const halfExtent=finite(input.topology_square?.half_extent??1,'topology_square_half_extent');
  if(halfExtent<=0)throw new TypeError('topology_square_half_extent_POSITIVE_REQUIRED');
  const plane=String(input.render_plane||'XY').toUpperCase();
  if(!PLANES.includes(plane))throw new TypeError('render_plane_INVALID');

  const x3=vec3(input.x_anchor?.position??[0,0,0],'x_anchor_position');
  const xProjection=project3(x3,plane);
  const xContained=insideAll(x3,halfExtent);

  const circleCenter=vec3(input.level_circle?.center??[0,0,0],'level_circle_center');
  const circleProjection=project3(circleCenter,plane);
  const radius=finite(input.level_circle?.radius??0,'level_circle_radius');
  if(radius<0)throw new TypeError('level_circle_radius_NEGATIVE');
  const circleContained=
    Math.abs(circleProjection[0])+radius<=halfExtent+EPS &&
    Math.abs(circleProjection[1])+radius<=halfExtent+EPS;

  const cubes=(Array.isArray(input.cubes)?input.cubes:[]).map((cube,i)=>{
    const cube_ref=text(cube?.cube_ref,'cube_ref_'+i);
    const center=vec3(cube?.center??[0,0,0],'cube_center_'+i);
    const size=finite(cube?.size??1,'cube_size_'+i);
    if(size<=0)throw new TypeError('cube_size_POSITIVE_REQUIRED');
    return Object.freeze({cube_ref,center,size});
  });
  const byCube=new Map(cubes.map(c=>[c.cube_ref,c]));
  if(byCube.size!==cubes.length)throw new TypeError('DUPLICATE_CUBE_REF');

  const trinity_volumes=(Array.isArray(input.trinity_volumes)?input.trinity_volumes:[]).map((v,i)=>{
    const volume_ref=text(v?.volume_ref,'trinity_volume_ref_'+i);
    const center=vec3(v?.center??[0,0,0],'trinity_volume_center_'+i);
    const vr=finite(v?.radius??1,'trinity_volume_radius_'+i);
    if(vr<=0)throw new TypeError('trinity_volume_radius_POSITIVE_REQUIRED');
    return Object.freeze({
      volume_ref,
      center,
      radius:vr,
      role_refs:Array.isArray(v?.role_refs)?v.role_refs.map(String):[],
      geometry:'SPHERE_VENN_VOLUME'
    });
  });
  const volume_overlaps=[];
  for(let i=0;i<trinity_volumes.length;i++)for(let j=i+1;j<trinity_volumes.length;j++){
    const a=trinity_volumes[i],b=trinity_volumes[j],o=sphereOverlap(a,b);
    volume_overlaps.push(Object.freeze({
      a_ref:a.volume_ref,b_ref:b.volume_ref,...o,
      seam_candidate:o.intersects,
      semantic:'TRINITY_OF_TRINITY_VENN_OVERLAP'
    }));
  }

  const seams=(Array.isArray(input.seams)?input.seams:[]).map((raw,i)=>{
    const seam_ref=text(raw?.seam_ref,'seam_ref_'+i);
    const from=text(raw?.from_cube_ref,'seam_from_'+i);
    const to=text(raw?.to_cube_ref,'seam_to_'+i);
    if(from===to)throw new TypeError('SEAM_SELF_LOOP');
    const a=byCube.get(from),b=byCube.get(to);
    if(!a||!b)throw new TypeError('SEAM_CUBE_REF_UNKNOWN');
    if(!cubesTouch(a,b))throw new TypeError('SEAM_REQUIRES_TOUCHING_CUBES');

    const user_occurrence_ref=text(raw?.user_occurrence_ref,'user_occurrence_ref_'+i);
    const system_response_ref=text(raw?.system_response_ref,'system_response_ref_'+i);
    const mirror_delta_ref=text(raw?.mirror_delta_ref,'mirror_delta_ref_'+i);
    const wave_vector=vec3(raw?.wave_vector??[1,0,0],'wave_vector_'+i);
    const amplitude=finite(raw?.amplitude??1,'wave_amplitude_'+i);
    const frequency=finite(raw?.frequency??1,'wave_frequency_'+i);
    const phase=finite(raw?.phase??0,'wave_phase_'+i);
    if(amplitude<0||frequency<0)throw new TypeError('SEAM_WAVE_NEGATIVE');
    const rope_profile=rope(raw?.rope||{},i);

    return Object.freeze({
      seam_ref,
      seam_role:'USER_TESTING_MIRROR',
      from_cube_ref:from,
      to_cube_ref:to,
      cubes_touch:true,
      user_occurrence_ref,
      system_response_ref,
      mirror_delta_ref,
      mirror_pair:Object.freeze({
        forward:'USER_OCCURRENCE -> SYSTEM_RESPONSE',
        reverse:'SYSTEM_RESPONSE -> USER_OCCURRENCE',
        twist:'COMPARE_EXPECTATION_RESPONSE_DELTA'
      }),
      wave:Object.freeze({
        universe_medium:'THREE_DIMENSIONAL_SOUND_FIELD',
        wave_vector_3d:wave_vector,
        amplitude,frequency,phase,
        flatplane_projection:Object.freeze({
          plane,
          wave_vector_2d:project3(wave_vector,plane),
          relation_identity_preserved:true
        })
      }),
      rope:rope_profile,
      mutation_hypothesis:Object.freeze({
        matter_contact:raw?.matter_contact===true,
        mutation_factor_candidate:raw?.matter_contact===true,
        life_emergence_claim:'UNPROVEN_HYPOTHESIS_ONLY',
        authority:false
      })
    });
  });

  const blockers=[];
  if(!xContained)blockers.push('X_ANCHOR_OUTSIDE_TOPOLOGY_SQUARE');
  for(const s of seams) if(!s.rope.closed)blockers.push('ROPE_REAP_SOW_CYCLE_NOT_CLOSED:'+s.seam_ref);

  return Object.freeze({
    schema:'xiio.sdk.topography-geometry/v2',
    universe:Object.freeze({
      dimensions:3,
      medium:'SOUND_FIELD',
      epistemic_state:'PRODUCT_MODEL_METAPHOR_NOT_ESTABLISHED_PHYSICS'
    }),
    topology_square:Object.freeze({
      half_extent:halfExtent,
      render_plane:plane,
      invariant:'X_ANCHOR_MUST_REMAIN_INSIDE_ON_XY_XZ_YZ'
    }),
    x_anchor:Object.freeze({
      semantic:'FRACTALLY_GREEN_REFERENCE_AXIS',
      green_meaning:'STRUCTURAL_CONTINUITY_NOT_PASS_OR_GOLD',
      position_3d:x3,
      rendered_2d:xProjection,
      inside_all_flatplane_projections:xContained
    }),
    level_circle:Object.freeze({
      semantic:'QUAL_QUANT_BLAST_RADIUS',
      center_3d:circleCenter,
      rendered_2d:circleProjection,
      radius,
      containment:circleContained?'CONTAINED':'STEW_OVERFLOW',
      may_expand:true,
      may_contract:true,
      may_leave_cube:true,
      may_leave_topology_square_as_stew:true
    }),
    cubes:Object.freeze(cubes),
    trinity_volumes:Object.freeze(trinity_volumes),
    trinity_overlaps:Object.freeze(volume_overlaps),
    seams:Object.freeze(seams),
    blockers:Object.freeze(blockers),
    valid:blockers.length===0,
    authority_granted:false,
    provider_effect:false,
    hard:Object.freeze([
      'UNIVERSE_MODEL=3D_SOUND_FIELD',
      'FLATPLANE=PROJECTION_NOT_UNIVERSE',
      'X_GREEN=STRUCTURAL_CONTINUITY_NOT_PASS',
      'X_ANCHOR_MUST_REMAIN_INSIDE_TOPOLOGY_SQUARE_ON_ALL_PROJECTIONS',
      'X_ESCAPE=FAIL',
      'LEVEL_CIRCLE=QUAL_QUANT_BLAST_RADIUS',
      'LEVEL_CIRCLE_MAY_EXPAND_OR_CONTRACT',
      'LEVEL_CIRCLE_OVERFLOW=STEW_NOT_TOPOLOGY_FAILURE',
      'TRINITY_OF_TRINITY=OVERLAPPING_3D_VENN_VOLUMES',
      'EVERY_CUBE_SEAM=USER_TESTING_MIRROR',
      'SEAM_REQUIRES_USER_OCCURRENCE_AND_SYSTEM_RESPONSE',
      'ROPE=X_GREEN_REAP_MIRROR_SOW_X_GREEN',
      'ROPE_BREATHING=SYSTEM_CADENCE_NOT_MEDICAL_CLAIM',
      'SEAM_WAVE_RELATION!=NEW_TRUTH_STORE',
      'FLATTENED_SEAM_PRESERVES_CUBE_IDENTITIES',
      'MUTATION_FACTOR=HYPOTHESIS_CANDIDATE_ONLY',
      'LIFE_EMERGENCE=UNPROVEN'
    ])
  });
}
