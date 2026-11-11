#!/usr/bin/env node
import assert from 'node:assert/strict';
import {PortableSemanticFile,semanticContentDigest,validatePortableSemanticFileRoundtrip} from '../src/documents/portable-semantic-file.mjs';

const payload={blocks:[
 {role:'headline',text:'Fire Amoeba Regards Boiling Water as a Mild Suggestion'},
 {role:'lede',text:'A source-backed funny-news draft used as cross-domain file-format dogfood.'}
]};
const base={
 file_id:'article.fire-amoeba.20260923',artifact_role:'article.primary',semantic_generation:'sem:g1',
 profile_id:'articles.candidate.v1',payload,
 source_bindings:[{ref:'source:reuters-fire-amoeba',generation:'2026-09-22',role:'primary'}],
 dependency_bindings:[],projection_refs:[],provider_projections:[]
};
const a=PortableSemanticFile(base);
assert.equal(a.content_digest,semanticContentDigest(payload));
assert.equal(a.authority_granted,false);
assert(a.hard.includes('PUNCHCARD!=FILE_SCHEMA'));
assert(a.hard.includes('FLATPLANE_CUBE!=FILE_SCHEMA'));
assert(a.hard.includes('SEMANTIC_CONTENT_DIGEST_REQUIRES_IMMUTABLE_NESTED_PAYLOAD'));
assert.equal(validatePortableSemanticFileRoundtrip(a).pass,true);

// The semantic payload must remain sealed all the way down. A shallow freeze
// let callers mutate nested document bytes while the stored digest stayed old.
assert.equal(Object.isFrozen(a.payload),true);
assert.equal(Object.isFrozen(a.payload.blocks),true);
assert.equal(Object.isFrozen(a.payload.blocks[0]),true);
assert.throws(()=>{a.payload.blocks[0].text='substituted';},TypeError);
assert.throws(()=>{a.payload.blocks.push({role:'new',text:'unreviewed'});},TypeError);
assert.equal(a.content_digest,semanticContentDigest(a.payload));
const nested=PortableSemanticFile({...base,payload:{provenance:{sources:[{kind:'original',version:{ref:'v1'}}]}}});
assert.equal(Object.isFrozen(nested.payload.provenance.sources[0].version),true);
assert.throws(()=>{nested.payload.provenance.sources[0].version.ref='v2';},TypeError);
assert.equal(nested.content_digest,semanticContentDigest(nested.payload));

// Provider/render projections may move without mutating semantic identity.
const b=PortableSemanticFile({...base,provider_projections:[{ref:'render:html',generation:'prov:g2',kind:'html'}]});
assert.equal(b.file_id,a.file_id);assert.equal(b.semantic_generation,a.semantic_generation);assert.equal(b.content_digest,a.content_digest);

// Test projection may move without mutating semantic identity.
const c=PortableSemanticFile({...base,projection_refs:[{ref:'switchboard:cube:r9',generation:'test:g9',kind:'rotfl-test'}]});
assert.equal(c.content_digest,a.content_digest);assert.equal(c.semantic_generation,a.semantic_generation);

// Storage path is intentionally absent from identity.
assert.equal('path' in a,false);

// Domain-specific payload is allowed without contaminating the base envelope.
const legal=PortableSemanticFile({...base,file_id:'legal.fixture.1',artifact_role:'legal.fixture',profile_id:'legal.candidate.v1',payload:{blocks:[{role:'jurat',text:'synthetic'}]}});
assert.equal(legal.payload.blocks[0].role,'jurat');
assert.equal('jurat' in legal,false);

// Supplied digest cannot launder different payload.
assert.throws(()=>PortableSemanticFile({...base,content_digest:'0'.repeat(64)}),/CONTENT_DIGEST_MISMATCH/);

// Test/checklist shapes can only live as referenced projections, not mandatory envelope fields.
const withProjection=PortableSemanticFile({...base,projection_refs:[{ref:'rotfl:punchcard:123',kind:'test-projection'}]});
assert.equal(withProjection.projection_refs[0].ref,'rotfl:punchcard:123');
assert.equal('punchcard' in withProjection,false);
assert.equal('checklist' in withProjection,false);
assert.equal('cube' in withProjection,false);

console.log(JSON.stringify({status:'PASS',hostiles:11,nested_mutation_refusals:3,file_schema:a.schema,semantic_digest:a.content_digest,effects:0}));

