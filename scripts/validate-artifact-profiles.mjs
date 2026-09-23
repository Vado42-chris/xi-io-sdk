import assert from 'node:assert/strict';
import {artifactProfileCatalog,resolveArtifactProfile,resolveArtifactProfileByMediaType} from '../src/documents/artifact-profile-catalog.mjs';

const catalog=artifactProfileCatalog();
assert.equal(catalog.schema,'xiio.sdk.artifact-profile-catalog/v1');
assert(catalog.profiles.length>=9);
assert(catalog.profiles.every(p=>p.transport==='BYTES'));

const json=resolveArtifactProfile('json.semantic.v1');
assert.equal(json.state,'PASS');
assert.equal(json.profile.parser_class,'JSON_PARSE');

const pdf=resolveArtifactProfileByMediaType('application/pdf');
assert.equal(pdf.state,'PASS');
assert.equal(pdf.profile.profile_id,'pdf.bytes.v1');

const docx=resolveArtifactProfileByMediaType('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
assert.equal(docx.state,'PASS');
assert.equal(docx.profile.profile_id,'docx.opc.v1');

const unknown=resolveArtifactProfileByMediaType('application/x-unknown-xiio-test');
assert.equal(unknown.state,'UNKNOWN');

console.log(JSON.stringify({
  schema:'xiio.sdk.artifact-profile-catalog-check/v1',
  state:'PASS',
  denominator:catalog.profiles.length,
  byte_transport_profiles:catalog.profiles.filter(p=>p.transport==='BYTES').length,
  false_green:0,
  effect_authority:0
},null,2));
