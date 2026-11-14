import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCampaignPackage, inspectGameCampaignIntake} from '../src/marketing/campaign-package.mjs';

const base = () => ({product_ref:'product:veilrift',product_generation:'generation:1',campaign_ref:'campaign:launch',assets:[{asset_ref:'asset:hero',version_ref:'version:1',digest:'sha256:abc'}],channels:[{channel_ref:'channel:site',state:'CONFIGURED'}]});
test('portable package remains a claim, never a grant or provider result',()=>{
  const value=validateCampaignPackage(base());
  assert.equal(value.effect_authorized,false);assert.equal(value.publication_verified,false);
});
test('assets require custody and no duplicate identities',()=>{
  assert.throws(()=>validateCampaignPackage({...base(),assets:[{asset_ref:'asset:hero'}]}),/CAMPAIGN_ASSET_CUSTODY_MISSING/);
  const x=base();x.assets.push(x.assets[0]);assert.throws(()=>validateCampaignPackage(x),/CAMPAIGN_DUPLICATE_ASSET/);
});
test('a verified claim requires authority and readback references but never authenticates them',()=>{
  const x=base();x.channels[0].state='VERIFIED';assert.throws(()=>validateCampaignPackage(x),/CAMPAIGN_AUTHORITY_REFERENCE_MISSING/);
  x.channels[0].authority_ref='ward:grant';x.channels[0].authority_generation='g:1';
  assert.throws(()=>validateCampaignPackage(x),/CAMPAIGN_PUBLICATION_READBACK_MISSING/);
  x.channels[0].publication_ref='publisher:receipt';x.channels[0].readback_ref='bins:readback';
  assert.equal(validateCampaignPackage(x).publication_verified,false);
});
test('unknown channels and states fail closed',()=>{
  const x=base();x.channels[0].state='LIVE';assert.throws(()=>validateCampaignPackage(x),/CAMPAIGN_CHANNEL_INVALID/);
});
test('existing VeilRIFT campaign packet remains source intake, not asset custody',()=>{
  const packet={schema:'xiio.game-campaign-consumer-packet/v1',product_id:'veilrift-pandoras-cube',source_generation:'e9bb91a',kit_template:'sdk:templates/game-campaign-kit.v1.json',candidate_id:'veilrift-kickstarter-prelaunch-v1',channel:'kickstarter',media_intake:[{id:'card_art',source_registry:'assets/cards/register.json',state:'ART_AUDIT_RED'}],egress:{publish:false},checks:{publication_allowed:false}};
  const result=inspectGameCampaignIntake(packet);
  assert.equal(result.source_candidate_count,1);
  assert.equal(result.asset_custody_verified,false);
  assert.equal(result.publication_verified,false);
  packet.egress.publish=true;
  assert.throws(()=>inspectGameCampaignIntake(packet),/CAMPAIGN_INTAKE_UNVERIFIED_EGRESS/);
});
