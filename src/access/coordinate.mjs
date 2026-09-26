export const ACCESS_COORDINATE_SCHEMA = 'xiio.sdk.access-coordinate/v1';

const DEFAULTS = Object.freeze({
  studio_dev: Object.freeze({ id:'studio_dev', local_url:'http://127.0.0.1:8799/', public_url:'https://dev.xi-io.net/studio/', effect_class:'READ_PRIVATE_OR_LOCAL_DEV_SAFE' }),
  api_glass_box: Object.freeze({ id:'api_glass_box', local_url:'http://127.0.0.1:4390/api/v1/studio/local-truth/read', public_url:'https://dev.xi-io.net/api/v1/studio/local-truth/read', stream_local_url:'http://127.0.0.1:4390/api/v1/studio/local-truth/stream', stream_public_url:'https://dev.xi-io.net/api/v1/studio/local-truth/stream', effect_class:'READ_PRIVATE_OR_LOCAL_DEV_SAFE' }),
  inbox: Object.freeze({ id:'inbox', local_url:'http://127.0.0.1:8791/', public_url:'https://inbox.xi-io.net/', effect_class:'READ_PRIVATE' }),
  hex: Object.freeze({ id:'hex', local_url:'http://127.0.0.1:8798/', public_url:null, effect_class:'LOCAL_DEV_SAFE' }),
});

export function resolveAccessCoordinate(serviceId, observations={}) {
  const id=String(serviceId||'').trim().toLowerCase().replace(/[ -]+/g,'_');
  const base=DEFAULTS[id];
  if(!base) return Object.freeze({schema:ACCESS_COORDINATE_SCHEMA,id,state:'UNKNOWN_SERVICE',local_url:null,public_url:null,access_now:null,authority_granted:false,reason:'SERVICE_NOT_IN_ACCEPTED_COORDINATE_SET'});
  const localRunning=observations.local_running===true;
  const publicReadback=observations.public_readback===true;
  const authenticated=observations.authenticated===true;
  const requiresAuth=base.effect_class==='READ_PRIVATE';
  const publicUsable=publicReadback&&(!requiresAuth||authenticated);
  return Object.freeze({
    schema:ACCESS_COORDINATE_SCHEMA,...base,
    state:publicUsable?'PUBLIC_READBACK_PROVEN':localRunning?'LOCAL_RUNNING_PUBLIC_UNPROVEN':'RUNTIME_UNPROVEN',
    access_now:publicUsable?base.public_url:localRunning?base.local_url:null,
    local_running:localRunning,public_readback:publicReadback,authenticated:requiresAuth?authenticated:null,
    authority_granted:false,runtime_credit:publicUsable||localRunning?'OBSERVED_COORDINATE_ONLY':'NONE',
    next_probe:publicUsable?null:localRunning?(base.public_url?'PROVE_PUBLIC_ROUTE_READBACK':null):'PROVE_LOCAL_RUNTIME_FIRST',
    hard:Object.freeze(['LOCAL_URL!=PUBLIC_INGRESS','PUBLIC_URL_DECLARED!=PUBLIC_ROUTE_RUNNING','CLOUDFLARE_TUNNEL_EXISTS!=APPLICATION_AUTHENTICATED','HTTP_2XX!=EFFECT_AUTHORITY','ACCESS_COORDINATE!=MUTATION_AUTHORITY','RAW_LOCAL_PORT_MUST_NOT_BE_PROJECTED_AS_PUBLIC_API'])
  });
}
export function knownAccessCoordinates(){return Object.freeze(Object.values(DEFAULTS));}
