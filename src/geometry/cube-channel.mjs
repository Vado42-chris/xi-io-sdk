import crypto from 'node:crypto';

export const CUBE_CHANNEL_SCHEMA='xiio.cube.channel/v0';

const EPS=1e-9;
const finite=n=>Number.isFinite(n);
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(finite);
const text=v=>typeof v==='string'&&v.trim()?v.trim():null;
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const norm2=a=>dot(a,a);
const dist=(a,b)=>Math.sqrt(norm2(sub(a,b)));
const midpoint=(a,b)=>mul(add(a,b),0.5);

function reqCube(c,label){
  if(!c||typeof c!=='object') throw new TypeError(label+'_REQUIRED');
  const uuid=text(c.uuid); if(!uuid) throw new TypeError(label+'_UUID_REQUIRED');
  if(!vec(c.center)) throw new TypeError(label+'_CENTER_REQUIRED');
  if(!(finite(c.half_extent)&&c.half_extent>0)) throw new TypeError(label+'_HALF_EXTENT_REQUIRED');
  if(!(finite(c.blast_radius)&&c.blast_radius>=0)) throw new TypeError(label+'_BLAST_RADIUS_REQUIRED');
  return {
    uuid,
    center:[...c.center],
    half_extent:c.half_extent,
    blast_radius:c.blast_radius,
    streaming:c.streaming===true,
    blast_radius_ref:text(c.blast_radius_ref),
  };
}

export function cubeCorners(cube){
  const c=reqCube(cube,'CUBE');
  const h=c.half_extent;
  const out=[];
  for(const sx of [-1,1]) for(const sy of [-1,1]) for(const sz of [-1,1]){
    out.push([c.center[0]+sx*h,c.center[1]+sy*h,c.center[2]+sz*h]);
  }
  return out;
}

export function cubeXSegments(cube){
  const c=reqCube(cube,'CUBE');
  return cubeCorners(c).map(corner=>({a:c.center,b:corner}));
}

function closestSegmentPair(p1,q1,p2,q2){
  const d1=sub(q1,p1), d2=sub(q2,p2), r=sub(p1,p2);
  const a=dot(d1,d1), e=dot(d2,d2), f=dot(d2,r);
  let s=0,t=0;
  if(a<=EPS && e<=EPS) return {s:0,t:0,p:p1,q:p2,d2:norm2(sub(p1,p2))};
  if(a<=EPS){
    s=0; t=Math.min(1,Math.max(0,f/e));
  }else{
    const c=dot(d1,r);
    if(e<=EPS){
      t=0; s=Math.min(1,Math.max(0,-c/a));
    }else{
      const b=dot(d1,d2), denom=a*e-b*b;
      s=denom!==0?Math.min(1,Math.max(0,(b*f-c*e)/denom)):0;
      const tnom=b*s+f;
      if(tnom<0){t=0;s=Math.min(1,Math.max(0,-c/a));}
      else if(tnom>e){t=1;s=Math.min(1,Math.max(0,(b-c)/a));}
      else t=tnom/e;
    }
  }
  const p=add(p1,mul(d1,s)), q=add(p2,mul(d2,t));
  return {s,t,p,q,d2:norm2(sub(p,q))};
}

function canonicalPoint(p){
  return p.map(x=>Math.abs(x)<EPS?0:Number(x.toFixed(9)));
}
function pointKey(p){return canonicalPoint(p).join(',');}

export function sharedXPoints(a,b){
  const aa=reqCube(a,'A'), bb=reqCube(b,'B');
  const found=new Map();
  for(const sa of cubeXSegments(aa)){
    for(const sb of cubeXSegments(bb)){
      const hit=closestSegmentPair(sa.a,sa.b,sb.a,sb.b);
      if(hit.d2<=EPS*EPS){
        const p=canonicalPoint(midpoint(hit.p,hit.q));
        found.set(pointKey(p),p);
      }
    }
  }
  return [...found.values()];
}

export function pointOnCubeX(cube,point){
  if(!vec(point)) return false;
  return cubeXSegments(cube).some(seg=>closestSegmentPair(seg.a,seg.b,point,point).d2<=EPS*EPS);
}

export function deriveCubeChannel(a,b){
  const A=reqCube(a,'A'), B=reqCube(b,'B');
  if(A.uuid===B.uuid) return Object.freeze({state:'NO_CHANNEL',reason:'SAME_CUBE'});
  const centerDistance=dist(A.center,B.center);
  const circlesTouch=centerDistance<=A.blast_radius+B.blast_radius+EPS;
  if(!circlesTouch) return Object.freeze({state:'NO_CHANNEL',reason:'CIRCLES_DO_NOT_TOUCH',center_distance:centerDistance});
  const points=sharedXPoints(A,B);
  if(!points.length) return Object.freeze({state:'NO_CHANNEL',reason:'NO_SHARED_X_POINT',center_distance:centerDistance});
  const mid=midpoint(A.center,B.center);
  points.sort((p,q)=>dist(p,mid)-dist(q,mid)||pointKey(p).localeCompare(pointKey(q)));
  const port=points[0];
  const ids=[A.uuid,B.uuid].sort();
  const channelId=crypto.createHash('sha256').update(ids.join('|')+'|'+pointKey(port)).digest('hex').slice(0,24);
  return Object.freeze({
    schema:CUBE_CHANNEL_SCHEMA,
    state:'CHANNEL',
    channel_id:channelId,
    cube_refs:ids,
    port:Object.freeze(port),
    mode:A.streaming&&B.streaming?'WEBSOCKET':'API',
    direction:'BIDIRECTIONAL',
    message_schema:'xiio.sdk.internal-agent-message/v1',
    ack_required:true,
    conservation:'EGRESS_1_TO_INGRESS_1',
    authority:false,
    effect_authority:0,
    close_policy:'CUT_AT_DELIVERY',
    center_distance:centerDistance,
    blast_radii:[A.blast_radius,B.blast_radius],
    blast_radius_refs:[A.blast_radius_ref,B.blast_radius_ref],
    hard:Object.freeze([
      'CHANNEL_DERIVED_NOT_CONFIGURED',
      'CIRCLES_TOUCH_AND_SHARED_X_REQUIRED',
      'OVERLAP_WITHOUT_SHARED_X != CHANNEL',
      'PORT_MUST_LIE_ON_BOTH_X',
      'CHANNEL_ID_DIRECTION_INVARIANT',
      'CHANNEL != AUTHORITY',
      'SEND_COUNT_MUST_EQUAL_RECEIVE_COUNT',
      'DELIVERY_CLOSES_CORD'
    ])
  });
}

export function evaluateChannelConservation({sent=0,received=0,acknowledged=0}={}){
  const ints=[sent,received,acknowledged].every(Number.isInteger);
  const pass=ints&&sent>=0&&sent===received&&received===acknowledged;
  return Object.freeze({
    schema:'xiio.cube.channel-conservation/v0',
    state:pass?'PASS':'FAIL',
    sent,received,acknowledged,
    effect_authority:0,
    hard:['ONE_EGRESS_ONE_INGRESS_ONE_ACK']
  });
}
