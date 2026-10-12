import {createHash} from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const nonblank = v => typeof v === 'string' && v.length > 0 && v.length <= 256;
export function harvestOccurrences(occurrences, {generation, source_ref} = {}) {
  if (!nonblank(generation) || !nonblank(source_ref) || !Array.isArray(occurrences)) throw Error('HARVEST_INPUT_INVALID');
  const groups = new Map();
  const seen = new Set();
  for (const o of occurrences) {
    if (!nonblank(o?.occurrence_ref) || seen.has(o.occurrence_ref) || o.generation !== generation || !Buffer.isBuffer(o.bytes)) throw Error('HARVEST_OCCURRENCE_INVALID');
    seen.add(o.occurrence_ref);
    const digest = hash(o.bytes);
    const key = `${source_ref}:${generation}:${digest}`;
    const group = groups.get(key);
    if (group) group.occurrence_refs.push(o.occurrence_ref);
    else groups.set(key, {source_ref, generation, content_sha256:digest, byte_length:o.bytes.length, occurrence_refs:[o.occurrence_ref]});
  }
  return {schema:'xiio.sdk.flap-harvest/v1', source_ref, generation, received:occurrences.length, unique:groups.size, redundant:occurrences.length-groups.size, payloads:[...groups.values()], provider_effect:false};
}
export function resolveResume({source_ref,generation,content_sha256,cursor,acknowledged_cursor,effect_receipt,readback}={}) {
  if (![source_ref,generation,content_sha256].every(nonblank) || !/^[a-f0-9]{64}$/.test(content_sha256) || !Number.isSafeInteger(cursor) || cursor<0 || !Number.isSafeInteger(acknowledged_cursor) || acknowledged_cursor<0) throw Error('RESUME_INPUT_INVALID');
  if (acknowledged_cursor >= cursor) return {state:'ACKED',execute:false,next_cursor:acknowledged_cursor};
  if (!effect_receipt) return {state:'ELIGIBLE_FOR_SEPARATE_ADMISSION',execute:false,next_cursor:acknowledged_cursor};
  const same = effect_receipt.source_ref===source_ref && effect_receipt.generation===generation && effect_receipt.content_sha256===content_sha256 && effect_receipt.cursor===cursor;
  if (!same) return {state:'RED_RECEIPT_DRIFT',execute:false,next_cursor:acknowledged_cursor};
  if (!readback) return {state:'READBACK_REQUIRED',execute:false,next_cursor:acknowledged_cursor};
  if (readback.source_ref!==source_ref || readback.generation!==generation || readback.content_sha256!==content_sha256 || readback.cursor!==cursor || readback.committed_digest!==effect_receipt.committed_digest) return {state:'RED_READBACK_MISMATCH',execute:false,next_cursor:acknowledged_cursor};
  return {state:'RECOVER_EXISTING_EFFECT',execute:false,next_cursor:cursor,receipt_ref:effect_receipt.receipt_ref??null};
}
