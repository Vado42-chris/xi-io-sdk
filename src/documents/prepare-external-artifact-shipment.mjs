import { compilePortableArtifactCube } from './portable-artifact-cube.mjs';
import { resolveArtifactProfile } from './artifact-profile-catalog.mjs';

const text=(v)=>typeof v==='string'&&v.trim()?v.trim():null;

export function prepareExternalArtifactShipment(input={}){
  const descriptor=input.descriptor;
  if(!descriptor||typeof descriptor!=='object'||Array.isArray(descriptor)) throw new TypeError('DESCRIPTOR_OBJECT_REQUIRED');

  const fileId=text(input.file_id);
  const artifactRole=text(input.artifact_role);
  const sourceRef=text(input.source_ref);
  const sourceGeneration=text(input.source_generation);
  const profileId=text(input.profile_id)||'json.semantic.v1';

  if(!fileId) throw new TypeError('FILE_ID_REQUIRED');
  if(!artifactRole) throw new TypeError('ARTIFACT_ROLE_REQUIRED');
  if(!sourceRef) throw new TypeError('SOURCE_REF_REQUIRED');
  if(!sourceGeneration) throw new TypeError('SOURCE_GENERATION_REQUIRED');

  const profile=resolveArtifactProfile(profileId);
  if(profile.state!=='PASS') throw new TypeError('PROFILE_NOT_REGISTERED');

  const manifest={
    cube_id:text(input.cube_id)||`file-cube:${fileId}`,
    file:{
      file_id:fileId,
      artifact_role:artifactRole,
      semantic_generation:sourceGeneration,
      profile_id:profileId,
      payload:{descriptor},
      source_bindings:[{ref:sourceRef,generation:sourceGeneration,role:'primary'}],
      dependency_bindings:Array.isArray(input.dependency_bindings)?input.dependency_bindings:[],
      projection_refs:Array.isArray(input.projection_refs)?input.projection_refs:[],
      provider_projections:Array.isArray(input.provider_projections)?input.provider_projections:[],
    },
    dependency_policy:text(input.dependency_policy)||(Array.isArray(input.dependency_bindings)&&input.dependency_bindings.length?'EXPLICIT':'NONE_REQUIRED'),
    parser_profile:{profile_id:profileId},
    consumer_profile:{profile_id:profileId},
    hex_floor:input.hex_floor||null,
    hex_subject_ref:text(input.hex_subject_ref)||artifactRole,
    hex_subject_generation:text(input.hex_subject_generation)||sourceGeneration,
    bins_custody:input.bins_custody||{},
    transfer_readback:input.transfer_readback||{},
    parser_readback:input.parser_readback||{},
    consumer_readback:input.consumer_readback||{},
    authority_gate:input.authority_gate||{required:false,held:false},
  };

  const cube=compilePortableArtifactCube(manifest);
  return Object.freeze({
    schema:'xiio.sdk.external-artifact-shipment-preparation/v1',
    descriptor_schema:text(descriptor.schema),
    source_ref:sourceRef,
    source_generation:sourceGeneration,
    manifest:Object.freeze(manifest),
    cube,
    missing_cells:Object.freeze(cube.cells.filter((x)=>x.state!=='PASS').map((x)=>({
      id:x.id,state:x.state,first_red:x.first_red||null
    }))),
    ready_to_ship:cube.closure_100,
    effect_authority:0,
    hard:Object.freeze([
      'EXTERNAL_PRIMITIVE -> SAME_PORTABLE_FILE_CUBE',
      'EXTERNAL_REPO != NEW_FILE_GRAMMAR',
      'DESCRIPTOR_PAYLOAD != SOURCE_CUSTODY',
      'PREPARED != SHIPPED',
      'NO_SDK_REGISTRATION_REQUIRED_FOR_EXTERNAL_DESCRIPTOR',
    ])
  });
}
