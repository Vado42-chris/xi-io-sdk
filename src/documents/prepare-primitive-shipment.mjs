import primitiveCatalog from '../catalog/primitives.json' with { type: 'json' };
import { compilePortableArtifactCube } from './portable-artifact-cube.mjs';

const SHA=/^[a-f0-9]{40}$/i;
const text=(v)=>typeof v==='string'&&v.trim()?v.trim():null;

function requireGeneration(value){
  const v=text(value);
  if(!v) throw new TypeError('SOURCE_GENERATION_REQUIRED');
  return v;
}

export function prepareRegisteredPrimitiveShipment(input={}){
  const primitiveId=text(input.primitive_id);
  if(!primitiveId) throw new TypeError('PRIMITIVE_ID_REQUIRED');
  const primitive=primitiveCatalog.primitives.find((x)=>x.id===primitiveId);
  if(!primitive) throw new TypeError('PRIMITIVE_NOT_REGISTERED');

  const sourceGeneration=requireGeneration(input.source_generation);
  const sourceRef=text(input.source_ref)||'Vado42-chris/xi-io-sdk:src/catalog/primitives.json';
  const fileId=text(input.file_id)||`sdk.primitive.${primitive.id}`;
  const artifactRole=text(input.artifact_role)||'sdk.primitive';

  const manifest={
    cube_id:text(input.cube_id)||`file-cube:${fileId}`,
    file:{
      file_id:fileId,
      artifact_role:artifactRole,
      semantic_generation:sourceGeneration,
      profile_id:'json.semantic.v1',
      payload:{
        primitive:{
          id:primitive.id,
          callable_uuid:primitive.callable_uuid,
          family:primitive.family,
          kind:primitive.kind,
          export:primitive.export,
          source:primitive.source,
          specifier:primitive.specifier,
          styles:primitive.styles||[],
          maturity:primitive.maturity,
        }
      },
      source_bindings:[{ref:sourceRef,generation:sourceGeneration,role:'catalog'}],
      dependency_bindings:[],
      projection_refs:[],
      provider_projections:[],
    },
    dependency_policy:'NONE_REQUIRED',
    parser_profile:{profile_id:'json.semantic.v1'},
    consumer_profile:{profile_id:'json.semantic.v1'},
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
    schema:'xiio.sdk.registered-primitive-shipment-preparation/v1',
    primitive_id:primitive.id,
    source_generation:sourceGeneration,
    source_generation_looks_like_git_sha:SHA.test(sourceGeneration),
    manifest:Object.freeze(manifest),
    cube,
    missing_cells:Object.freeze(cube.cells.filter((x)=>x.state!=='PASS').map((x)=>({
      id:x.id,state:x.state,first_red:x.first_red||null
    }))),
    ready_to_ship:cube.closure_100,
    effect_authority:0,
    hard:Object.freeze([
      'REGISTERED_PRIMITIVE -> ONE_PORTABLE_FILE_CUBE',
      'PREPARED != SHIPPED',
      'MACHINE_KNOWN_FIELDS_AUTO_FILLED',
      'UNKNOWN_SHIPPING_FIELDS_REMAIN_TYPED_WAIT',
      'NO_OWNER_RELAY_FOR_MACHINE_RESOLVABLE_FIELDS',
    ])
  });
}
