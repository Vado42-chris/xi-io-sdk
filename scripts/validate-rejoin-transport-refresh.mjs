#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileRejoinTransportRefresh } from '../src/transport/rejoin-refresh.mjs';

const base={
  root_ref:'root:rotf-r2',
  work_ref:'work:hvt-rejoin',
  parent_ref:'parent:studio',
  return_ref:'return:r2:001',
  apply_return_ref:'apply:r2:001',
  apply_return_state:'APPLY_RETURN',
  parent_generation_before:'studio:g41',
  parent_generation_after:'studio:g42',
  observed_at:'2026-09-10T18:00:00.000Z',
};

const red=compileRejoinTransportRefresh({
  ...base,
  transport_bindings:[
    {binding_ref:'binding:ack',transport:'ACK',consumer_ref:'worker:next',applicability:'REQUIRED',state:'CURRENT',bound_generation:'studio:g41',effect_class:'NO_EFFECT',evidence_refs:['ack:old']},
    {binding_ref:'binding:a2a',transport:'A2A',consumer_ref:'ibal:next',applicability:'REQUIRED',state:'UNBOUND',effect_class:'NO_EFFECT'},
    {binding_ref:'binding:mcp',transport:'MCP',consumer_ref:'tool:next',applicability:'REQUIRED',state:'UNKNOWN',effect_class:'READ_ONLY'},
    {binding_ref:'binding:crm',transport:'CRM',consumer_ref:'inbox:crm',applicability:'REQUIRED',state:'CURRENT',bound_generation:'studio:g42',effect_class:'NO_EFFECT',evidence_refs:['crm:projection:g42']},
    {binding_ref:'binding:imap',transport:'IMAP',consumer_ref:'inbox:mail-read',applicability:'REQUIRED',state:'UNBOUND',effect_class:'READ_ONLY'},
    {binding_ref:'binding:smtp',transport:'SMTP',consumer_ref:'inbox:mail-send',applicability:'REQUIRED',state:'CURRENT',bound_generation:'studio:g42',effect_class:'WRITE_CANDIDATE',qualification_ref:'qual:smtp:g42'},
    {binding_ref:'binding:cloudflare',transport:'CLOUDFLARE',consumer_ref:'edge:studio',applicability:'REQUIRED',state:'CURRENT',bound_generation:'studio:g42',effect_class:'WRITE_CANDIDATE',qualification_ref:'qual:cf:g42',readback_ref:'cf:route:readback:g42'},
    {binding_ref:'binding:slack',transport:'SLACK',consumer_ref:'triage:slack',applicability:'OPTIONAL',state:'CURRENT',bound_generation:'studio:g42',effect_class:'READ_ONLY',readback_ref:'slack:channel:readback:g42'},
    {binding_ref:'binding:unused',transport:'HTTP',consumer_ref:'legacy:unused',applicability:'N_A',state:'UNKNOWN',effect_class:'NO_EFFECT',evidence_refs:['n-a:legacy-http']},
  ],
});
assert.equal(red.status,'REJOIN_REFRESH_REQUIRED');
assert.equal(red.rejoin_complete,false);
assert.equal(red.provider_effects,0);
assert.equal(red.authority_granted,false);
assert.equal(red.owner_ingress_required,false);
assert.equal(red.counts.total,9);
assert.equal(red.counts.required,7);
assert.equal(red.counts.required_current,1);
assert(red.residue.stale.includes('binding:ack'));
assert(red.residue.unbound.includes('binding:a2a'));
assert(red.residue.unbound.includes('binding:imap'));
assert(red.residue.unknown.includes('binding:mcp'));
assert(red.residue.blocked_effect_precondition.includes('binding:smtp'));
assert(red.residue.blocked_effect_precondition.includes('binding:cloudflare'));
for(const packet of red.refresh_packets){
  assert.equal(packet.provider_effect,false);
  assert.equal(packet.authority_granted,false);
  assert.equal(packet.effect_ceiling,'READ_ONLY');
  assert.equal(packet.target_generation,'studio:g42');
}
assert.equal(red.transport_bindings.find(x=>x.binding_ref==='binding:crm').disposition,'CURRENT');
assert.equal(red.transport_bindings.find(x=>x.binding_ref==='binding:imap').disposition,'UNBOUND');
assert.equal(red.transport_bindings.find(x=>x.binding_ref==='binding:smtp').disposition,'BLOCKED_EFFECT_PRECONDITION');
assert.equal(red.transport_bindings.find(x=>x.binding_ref==='binding:unused').disposition,'NO_EFFECT_WITH_EVIDENCE');

const green=compileRejoinTransportRefresh({
  ...base,
  transport_bindings:[
    {binding_ref:'binding:ack',transport:'ACK',consumer_ref:'worker:next',applicability:'REQUIRED',state:'CURRENT',bound_generation:'studio:g42',effect_class:'NO_EFFECT',evidence_refs:['ack:new']},
    {binding_ref:'binding:a2a',transport:'A2A',consumer_ref:'ibal:next',applicability:'REQUIRED',state:'CURRENT',bound_generation:'studio:g42',effect_class:'READ_ONLY',readback_ref:'a2a:readback:g42'},
    {binding_ref:'binding:mcp',transport:'MCP',consumer_ref:'tool:next',applicability:'REQUIRED',state:'CURRENT',bound_generation:'studio:g42',effect_class:'READ_ONLY',readback_ref:'mcp:readback:g42'},
    {binding_ref:'binding:crm',transport:'CRM',consumer_ref:'inbox:crm',applicability:'REQUIRED',state:'CURRENT',bound_generation:'studio:g42',effect_class:'NO_EFFECT'},
    {binding_ref:'binding:imap',transport:'IMAP',consumer_ref:'inbox:mail-read',applicability:'REQUIRED',state:'CURRENT',bound_generation:'studio:g42',effect_class:'READ_ONLY',readback_ref:'imap:readback:g42'},
    {binding_ref:'binding:smtp',transport:'SMTP',consumer_ref:'inbox:mail-send',applicability:'REQUIRED',state:'CURRENT',bound_generation:'studio:g42',effect_class:'WRITE_CANDIDATE',qualification_ref:'qual:smtp:g42',ward_profile_ref:'ward:smtp:g42',authority_ref:'switchboard:smtp:g42',readback_ref:'smtp:readback:g42'},
    {binding_ref:'binding:cloudflare',transport:'CLOUDFLARE',consumer_ref:'edge:studio',applicability:'REQUIRED',state:'CURRENT',bound_generation:'studio:g42',effect_class:'WRITE_CANDIDATE',qualification_ref:'qual:cf:g42',ward_profile_ref:'ward:cf:g42',authority_ref:'switchboard:cf:g42',readback_ref:'cf:route:readback:g42'},
  ],
});
assert.equal(green.status,'CURRENT');
assert.equal(green.rejoin_complete,true);
assert.equal(green.counts.required,7);
assert.equal(green.counts.required_current,7);
assert.equal(green.refresh_packets.length,0);
assert.equal(green.next,'REAP_AND_REJOIN_READBACK');
assert.equal(green.provider_effects,0);

assert.throws(()=>compileRejoinTransportRefresh({...base,transport_bindings:[]}),/TRANSPORT_BINDINGS_REQUIRED/);
assert.throws(()=>compileRejoinTransportRefresh({...base,transport_bindings:[{binding_ref:'x',transport:'HTTP',consumer_ref:'x',applicability:'N_A',state:'UNKNOWN',effect_class:'NO_EFFECT'}]}),/N_A_EVIDENCE_REQUIRED/);
assert.throws(()=>compileRejoinTransportRefresh({...base,transport_bindings:[
  {binding_ref:'dup',transport:'ACK',consumer_ref:'a',applicability:'OPTIONAL',state:'UNKNOWN',effect_class:'NO_EFFECT'},
  {binding_ref:'dup',transport:'MCP',consumer_ref:'b',applicability:'OPTIONAL',state:'UNKNOWN',effect_class:'NO_EFFECT'},
]}),/DUPLICATE_BINDING_REF/);

console.log(JSON.stringify({
  status:'PASS',
  red_required_current:`${red.counts.required_current}/${red.counts.required}`,
  red_refresh_packets:red.refresh_packets.length,
  green_required_current:`${green.counts.required_current}/${green.counts.required}`,
  crm_does_not_imply_imap:red.transport_bindings.find(x=>x.binding_ref==='binding:imap').disposition,
  crm_does_not_imply_smtp:red.transport_bindings.find(x=>x.binding_ref==='binding:smtp').disposition,
  provider_effects:0,
  authority_granted:false,
}));
