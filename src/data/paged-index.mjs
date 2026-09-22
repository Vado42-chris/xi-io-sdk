import crypto from 'node:crypto';

export const PAGED_INDEX_SCHEMA='xiio.sdk.paged-index/v1';
export const PAGED_INDEX_PAGE_SCHEMA='xiio.sdk.paged-index-page/v1';

const text=(v,k)=>{const s=String(v??'').trim();if(!s)throw new TypeError(k+'_REQUIRED');return s;};
const int=(v,k,{min=0,max=1000000}={})=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new TypeError(k+'_INVALID');return n;};
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export const fingerprint=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');

export function encodeCursor({generation,query_fingerprint,offset}={}){
  const payload={generation:text(generation,'GENERATION'),query_fingerprint:text(query_fingerprint,'QUERY_FINGERPRINT'),offset:int(offset,'OFFSET')};
  return Buffer.from(JSON.stringify(payload),'utf8').toString('base64url');
}
export function decodeCursor(cursor,{generation,query_fingerprint}={}){
  if(!cursor)return {offset:0};
  let p;
  try{p=JSON.parse(Buffer.from(String(cursor),'base64url').toString('utf8'));}catch{throw new TypeError('CURSOR_INVALID');}
  if(p.generation!==text(generation,'GENERATION'))throw new Error('CURSOR_GENERATION_STALE');
  if(p.query_fingerprint!==text(query_fingerprint,'QUERY_FINGERPRINT'))throw new Error('CURSOR_QUERY_STALE');
  return {offset:int(p.offset,'OFFSET')};
}
export function paginateIndex({rows=[],generation,query={},cursor=null,limit=50,index_ref='index:unknown'}={}){
  if(!Array.isArray(rows))throw new TypeError('ROWS_ARRAY_REQUIRED');
  const gen=text(generation,'GENERATION');
  const qf=fingerprint(query);
  const {offset}=decodeCursor(cursor,{generation:gen,query_fingerprint:qf});
  const size=int(limit,'LIMIT',{min:1,max:500});
  const page=rows.slice(offset,offset+size);
  const nextOffset=offset+page.length;
  return Object.freeze({
    schema:PAGED_INDEX_PAGE_SCHEMA,
    index_ref:text(index_ref,'INDEX_REF'),
    generation:gen,
    query_fingerprint:qf,
    offset,
    limit:size,
    total:rows.length,
    count:page.length,
    rows:Object.freeze(page.map(x=>structuredClone(x))),
    next_cursor:nextOffset<rows.length?encodeCursor({generation:gen,query_fingerprint:qf,offset:nextOffset}):null,
    falsifiers:Object.freeze([
      'CURSOR_GENERATION_STALE',
      'CURSOR_QUERY_STALE',
      'COUNT_GT_LIMIT',
      'OFFSET_GT_TOTAL',
      'ROW_ORDER_CHANGED_WITHOUT_GENERATION_CHANGE'
    ]),
    authority_granted:false,
    provider_effect:false,
  });
}
