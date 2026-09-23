import crypto from 'node:crypto';

export const X_SEAM_CHANNEL_PROJECTION_SCHEMA='xiio.sdk.x-seam-channel-projection/v1';
export const X_SEAM_CHANNEL_SOURCE_SCHEMA='xiio.x-seam.derived-channel/v1';

const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};
const list2=(v,k)=>{
  if(!Array.isArray(v)||v.length!==2)throw new TypeError(k+'_TWO_REQUIRED');
  return v.map((x,i)=>text(x,k+'_'+i));
};
const digest=s=>'sha256:'+crypto.createHash('sha256').update(s).digest('hex');

export function expectedXSeamChannelId(endpointUuids,portRef){
  const uuids=[...list2(endpointUuids,'ENDPOINT_UUID')].sort();
  const port_ref=text(portRef,'PORT_REF');
  return digest(JSON.stringify({uuids,port_ref}));
}

export function compileXSeamChannelProjection(input={}){
  const channel=input.channel;
  if(!channel||channel.schema!==X_SEAM_CHANNEL_SOURCE_SCHEMA)throw new TypeError('X_SEAM_DERIVED_CHANNEL_REQUIRED');
  const endpoint_uuids=[...list2(channel.endpoint_uuids,'ENDPOINT_UUID')].sort();
  const port_ref=text(channel.port_ref,'PORT_REF');
  const expected=expectedXSeamChannelId(endpoint_uuids,port_ref);
  if(channel.channel_id!==expected)throw new TypeError('CHANNEL_ID_MISMATCH');
  if(!['WEBSOCKET','API'].includes(channel.mode))throw new TypeError('CHANNEL_MODE_INVALID');
  if(channel.bidirectional!==true)throw new TypeError('CHANNEL_BIDIRECTIONAL_REQUIRED');
  if(channel.authority!=='NONE'||channel.effect_authority!==false)throw new TypeError('CHANNEL_AUTHORITY_INFLATION');

  const endpoint_coordinate_refs=[...list2(input.endpoint_coordinate_refs,'ENDPOINT_COORDINATE_REF')].sort();
  const source_ref=text(input.source_ref,'SOURCE_REF');
  const generation_ref=text(input.generation_ref,'GENERATION_REF');
  const currentness_ref=text(input.currentness_ref,'CURRENTNESS_REF');

  return Object.freeze({
    schema:X_SEAM_CHANNEL_PROJECTION_SCHEMA,
    channel_ref:channel.channel_id,
    endpoint_uuids:Object.freeze(endpoint_uuids),
    endpoint_coordinate_refs:Object.freeze(endpoint_coordinate_refs),
    port_ref,
    mode:channel.mode,
    direction:'BIDIRECTIONAL',
    message_schema:'xiio.sdk.internal-agent-message/v1',
    ack_required:true,
    source_ref,
    generation_ref,
    currentness_ref,
    geometry_owner:'Vado42-chris/xi-io.net#1065',
    routing_owner:'Vado42-chris/xi-io-Switchboard',
    authority_granted:false,
    effect_authority:false,
    provider_effect:false,
    hard:Object.freeze([
      'SDK_PROJECTION != TOPOLOGY_DERIVATION',
      'FRAMEWORK_X_SEAM_OWNS_GEOMETRY',
      'CHANNEL_ID_MUST_MATCH_FRAMEWORK_DERIVATION',
      'ENDPOINT_COORDINATES_REQUIRED',
      'GENERATION_AND_CURRENTNESS_REQUIRED',
      'MESSAGE_SCHEMA_REUSED_NOT_REINVENTED',
      'CHANNEL_MODE != EFFECT_PERMISSION',
      'CHANNEL != AUTHORITY'
    ])
  });
}

export function verifyXSeamChannelProjection(projection={}){
  if(projection.schema!==X_SEAM_CHANNEL_PROJECTION_SCHEMA)return Object.freeze({state:'FAIL',reason:'SCHEMA'});
  const checks={
    ENDPOINTS:Array.isArray(projection.endpoint_uuids)&&projection.endpoint_uuids.length===2,
    COORDINATES:Array.isArray(projection.endpoint_coordinate_refs)&&projection.endpoint_coordinate_refs.length===2,
    PORT:typeof projection.port_ref==='string'&&projection.port_ref.length>0,
    CHANNEL_ID:projection.channel_ref===expectedXSeamChannelId(projection.endpoint_uuids,projection.port_ref),
    MODE:['WEBSOCKET','API'].includes(projection.mode),
    MESSAGE_SCHEMA:projection.message_schema==='xiio.sdk.internal-agent-message/v1',
    ACK:projection.ack_required===true,
    CURRENTNESS:typeof projection.generation_ref==='string'&&projection.generation_ref.length>0&&typeof projection.currentness_ref==='string'&&projection.currentness_ref.length>0,
    AUTHORITY:projection.authority_granted===false&&projection.effect_authority===false&&projection.provider_effect===false,
  };
  const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
  return Object.freeze({
    schema:'xiio.sdk.x-seam-channel-projection-verification/v1',
    state:failed.length?'FAIL':'PASS',
    checks:Object.freeze(checks),
    failed:Object.freeze(failed),
    effect_authority:0
  });
}
