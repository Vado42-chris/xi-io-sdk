import {harvestOccurrences} from './flap-harvest.mjs';
const SCHEMA='xiio.inbox.source-occurrence@1';
// Adapter to Inbox's canonical SourceOccurrence shape, never an alternate event schema.
// Payload bytes remain private input. No source-owner currentness or authority is inferred.
export function harvestSourceOccurrences(events,{bytesByOccurrence,source_ref,generation}={}){
 if(!Array.isArray(events)||!bytesByOccurrence||typeof bytesByOccurrence!=='object')throw Error('SOURCE_OCCURRENCE_INPUT_INVALID');
 const prepared=events.map(event=>{
  if(event?.schema!==SCHEMA||!event.occurrenceKey||!event.idempotencyKey||event.sourceRevision!==generation||typeof event.provider!=='string'||!event.provider.trim())throw Error('SOURCE_OCCURRENCE_SCHEMA_OR_GENERATION_INVALID');
  const bytes=bytesByOccurrence[event.occurrenceKey];
  if(!Buffer.isBuffer(bytes))throw Error('SOURCE_PAYLOAD_MISSING');
  return {occurrence_ref:event.occurrenceKey,generation,bytes};
 });
 return {...harvestOccurrences(prepared,{source_ref,generation}),source_event_schema:SCHEMA,provider_currentness:'UNVERIFIED',effect_authority:false};
}
