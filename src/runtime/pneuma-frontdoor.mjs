import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};

function readJson(file){
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}
}
function loopbackBus(bus){
  const raw=text(bus,'BUS');
  let u;
  try{u=new URL(raw);}catch{throw new TypeError('BUS_URL_INVALID');}
  if(!['ws:','wss:'].includes(u.protocol)) throw new TypeError('BUS_PROTOCOL_MUST_BE_WS');
  const host=u.hostname.replace(/^\[|\]$/g,'');
  if(!['localhost','127.0.0.1','::1'].includes(host)) throw new TypeError('BUS_MUST_BE_LOOPBACK');
  if(u.pathname!=='/aries/bus') throw new TypeError('BUS_PATH_MUST_BE_ARIES_BUS');
  const port=Number(u.port|| (u.protocol==='wss:'?443:80));
  if(!Number.isInteger(port)||port<1||port>65535) throw new TypeError('BUS_PORT_INVALID');
  return {raw,host,port,protocol:u.protocol};
}
function probeTcp({host,port},timeout=1200){
  return new Promise(resolve=>{
    const socket=net.createConnection({host,port});
    let settled=false;
    const finish=(state,detail)=>{
      if(settled)return; settled=true;
      try{socket.destroy();}catch{}
      resolve({state,detail});
    };
    socket.setTimeout(timeout,()=>finish('TRUE_WAIT','BUS_LISTENER_TIMEOUT'));
    socket.once('connect',()=>finish('PASS','BUS_LISTENER_REACHABLE'));
    socket.once('error',err=>finish('TRUE_WAIT','BUS_LISTENER_UNREACHABLE:'+String(err?.code||err?.message||err)));
  });
}
function stable(v){
  if(Array.isArray(v)) return v.map(stable);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
}
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');

export async function executePneuma({
  root='local',
  aries='root',
  bus='ws://localhost:4390/aries/bus',
  exec_rotfl=false,
  state_root=null,
  output_path=null,
  probe_timeout_ms=1200,
}={}){
  if(root!=='local') throw new TypeError('PNEUMA_ROOT_MUST_BE_LOCAL');
  if(aries!=='root') throw new TypeError('PNEUMA_ARIES_MUST_BE_ROOT');
  const busInfo=loopbackBus(bus);
  const base=path.resolve(state_root || process.env.XIIO_STATE_ROOT || path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(),'.local','state'),'xi-io'));

  const files={
    pneuma:path.join(base,'studio','pneuma.current.json'),
    lifecycle:path.join(base,'studio','lifecycle.current.json'),
    hex:path.join(base,'hex','floor.current.json'),
    search_bins:path.join(base,'studio','search-bins.current.json'),
    remote:path.join(base,'remote-desktop.current.json'),
    ward:path.join(base,'studio','ward-adoption.current.json'),
  };
  const state=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,readJson(v)]));

  const checks=[];
  const add=(id,stateValue,evidence_ref,first_red=null,detail={})=>checks.push({id,state:stateValue,evidence_ref,first_red,...detail});

  const p=state.pneuma;
  add('PNEUMA_RECURSION',
    p?.schema==='xiio.studio.pneuma-recursion/v1'&&p?.state==='PASS'?'PASS':'TRUE_WAIT',
    files.pneuma,
    p?'PNEUMA_RECURSION_NOT_PASS':'PNEUMA_STATE_MISSING',
    {recursion_ref:p?.recursion_ref||null,packet_id:p?.packet_vector?.packet_id||null,blast_radius_digest:p?.packet_vector?.blast_radius_digest||null});

  const lifecycle=state.lifecycle;
  add('LIFECYCLE_CURRENT',
    lifecycle?.schema==='xiio.studio.rotfl-lifecycle/v1'&&!['FAIL','FAIL_CURRENT','BLOCKED'].includes(lifecycle?.state)?'PASS':'TRUE_WAIT',
    files.lifecycle,
    lifecycle?'LIFECYCLE_NOT_CURRENT':'LIFECYCLE_STATE_MISSING',
    {generation:lifecycle?.generation||null,lifecycle_state:lifecycle?.state||null});

  const hex=state.hex;
  add('HEX_FLOOR',
    hex?.schema==='xiio.hex.global-floor-projection/v1'?'PASS':'TRUE_WAIT',
    files.hex,
    hex?'HEX_FLOOR_SCHEMA_OR_STATE_INVALID':'HEX_FLOOR_MISSING',
    {projection_ref:hex?.projection_ref||null,fleet_generation:hex?.fleet_generation||null});

  const sb=state.search_bins;
  add('SEARCH_BINS_READBACK',
    sb&&['PASS','CURRENT','ACCEPTED_MAIN'].some(x=>String(sb?.state||sb?.status||'').includes(x))?'PASS':'TRUE_WAIT',
    files.search_bins,
    sb?'SEARCH_BINS_READBACK_NOT_PASS':'SEARCH_BINS_READBACK_MISSING',
    {resource_ref:sb?.resource_ref||null,version_ref:sb?.version_ref||null,sha256:sb?.sha256||null});

  const remote=state.remote;
  const auth=remote?.authentication?.state||'UNKNOWN';
  const registration=remote?.device_registration?.state||'UNKNOWN';
  const session=remote?.live_device_session?.state||'UNKNOWN';
  add('REMOTE_AUTH',auth==='PASS'?'PASS':'TRUE_WAIT',files.remote,auth==='PASS'?null:'REMOTE_AUTH_NOT_PASS',{observed:auth});
  add('REMOTE_DEVICE_REGISTRATION',registration==='PASS'?'PASS':'TRUE_WAIT',files.remote,registration==='PASS'?null:'REMOTE_DEVICE_REGISTRATION_NOT_PASS',{observed:registration});
  add('REMOTE_LIVE_SESSION',session==='PASS'?'PASS':'TRUE_WAIT',files.remote,session==='PASS'?null:'REMOTE_LIVE_SESSION_NOT_PASS',{observed:session});

  const ward=state.ward;
  add('WARD_ADOPTION',
    ward&&String(ward?.state||ward?.status||'').includes('PASS')?'PASS':'TRUE_WAIT',
    files.ward,
    ward?'WARD_NATIVE_ADOPTION_NOT_PASS':'WARD_ADOPTION_MISSING');

  const busProbe=exec_rotfl?await probeTcp(busInfo,probe_timeout_ms):{state:'TRUE_WAIT',detail:'BUS_NOT_PROBED_WITHOUT_EXEC_ROTFL'};
  add('ARIES_BUS',busProbe.state,busInfo.raw,busProbe.state==='PASS'?null:busProbe.detail);

  const fail=checks.filter(x=>x.state==='FAIL');
  const waits=checks.filter(x=>x.state==='TRUE_WAIT');
  const preState=fail.length?'FAIL':waits.length?'TRUE_WAIT':'PASS';

  const custodyClaims={
    ct16_verified:Boolean(sb?.ct16_verified===true),
    ct17_verified:Boolean(sb?.ct17_verified===true),
  };
  const zeroStubClaim=Boolean(p?.zero_unverified_stubs===true);
  const loopClosed=preState==='PASS'&&custodyClaims.ct16_verified&&custodyClaims.ct17_verified&&zeroStubClaim;

  const pulse={
    schema:'xiio.cli.pneuma-pulse/v1',
    state:loopClosed?'PASS':preState,
    root,
    aries,
    bus:busInfo.raw,
    exec_rotfl:Boolean(exec_rotfl),
    packet_id:p?.packet_vector?.packet_id||null,
    semantic_digest:p?.packet_vector?.semantic_digest||null,
    blast_radius_digest:p?.packet_vector?.blast_radius_digest||null,
    affected_refs:p?.packet_vector?.affected_refs||[],
    return_targets:p?.packet_vector?.return_targets||[],
    recursion_ref:p?.recursion_ref||null,
    face_denominator:p?.rotation_engine?.face_denominator||null,
    projection_denominator:p?.rotation_engine?.projection_denominator||null,
    reciprocal_projection_denominator:p?.rotation_engine?.reciprocal_projection_denominator||null,
    checks,
    claims:{
      ct16_byte_custody_verified:custodyClaims.ct16_verified,
      ct17_byte_custody_verified:custodyClaims.ct17_verified,
      zero_unverified_stubs:zeroStubClaim,
      rotfl_loop_closed:loopClosed,
      pneuma_pulse_active:loopClosed,
    },
    first_red:
      checks.find(x=>x.state==='FAIL')?.first_red
      || checks.find(x=>x.state==='TRUE_WAIT')?.first_red
      || (!custodyClaims.ct16_verified?'CT16_CUSTODY_NOT_PROVEN'
      : !custodyClaims.ct17_verified?'CT17_CUSTODY_NOT_PROVEN'
      : !zeroStubClaim?'ZERO_UNVERIFIED_STUBS_NOT_PROVEN'
      : null),
    provider_effect:false,
    authority_granted:false,
    legal_effect_authority:0,
    hard:[
      'PNEUMA_OUTPUT_CLAIM_REQUIRES_BOUND_READBACK',
      'CT16_CT17_CUSTODY_CANNOT_BE_INFERRED',
      'REMOTE_AUTH_PASS != LIVE_SESSION_PASS',
      'BUS_URL_CONFIGURED != BUS_REACHABLE',
      'PNEUMA_RECURSION_PASS != ROTFL_LOOP_CLOSED',
      'ZERO_UNVERIFIED_STUBS_REQUIRES_EXPLICIT_EVIDENCE',
      'OWNER_FACTUAL_ADOPTION_REMAINS_HUMAN_ONLY',
    ],
  };

  if(exec_rotfl){
    const out=path.resolve(output_path || process.env.XIIO_PNEUMA_PULSE_PATH || path.join(base,'studio','pneuma-pulse.current.json'));
    fs.mkdirSync(path.dirname(out),{recursive:true,mode:0o700});
    const body=JSON.stringify(stable(pulse),null,2)+'\n';
    const tmp=out+'.tmp-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');
    fs.writeFileSync(tmp,body,{encoding:'utf8',mode:0o600});
    fs.renameSync(tmp,out);
    try{fs.chmodSync(out,0o600);}catch{}
    pulse.pulse_path=out;
    pulse.pulse_sha256=sha(pulse);
  }

  return Object.freeze(pulse);
}
