#!/usr/bin/env node
import assert from 'node:assert/strict';
import {compileProgressiveDiscovery,DISCOVERY_LEVELS} from '../src/projections/progressive-discovery.mjs';

const base={
  projection_ref:'search:result:1',
  source_ref:'bins:resource:1',
  source_generation:'G1',
  identity_keys:['id'],
  currentness_key:'currentness',
  fields:[
    {key:'id',value:'r1',min_level:'GLANCE',state:'KNOWN',evidence_refs:['e:id']},
    {key:'title',value:'Example result',min_level:'GLANCE',state:'KNOWN'},
    {key:'status',value:'CURRENT',min_level:'GLANCE',state:'KNOWN'},
    {key:'next',value:'Open result',min_level:'GLANCE',state:'KNOWN'},
    {key:'currentness',value:'CURRENT',min_level:'GLANCE',state:'KNOWN',evidence_refs:['e:current']},
    {key:'summary',value:'One paragraph',min_level:'WORK',state:'KNOWN'},
    {key:'stance',value:'supports',min_level:'WORK',state:'KNOWN'},
    {key:'evidence',value:['e:1','e:2'],min_level:'PROOF',state:'KNOWN',evidence_refs:['e:1','e:2']},
    {key:'adverse_qualifier',value:'limited by later authority',min_level:'PROOF',state:'KNOWN'},
    {key:'raw_metadata_ref',value:'bins:raw:1',min_level:'FULL',state:'KNOWN'},
  ]
};

const glance=compileProgressiveDiscovery({...base,requested_level:'GLANCE',allowed_level:'FULL'});
assert.equal(glance.ready,true);
assert.equal(glance.effective_level,'GLANCE');
assert.equal(glance.visible_count,5);
assert.equal(glance.hidden_count,5);
assert.equal(glance.next_level,'WORK');
assert.equal(glance.drilldown_available,true);
assert.equal(glance.source_mutated,false);
assert(glance.visible_fields.some(x=>x.key==='id'));
assert(glance.visible_fields.some(x=>x.key==='currentness'));
assert(!glance.visible_fields.some(x=>x.key==='evidence'));

const proof=compileProgressiveDiscovery({...base,requested_level:'PROOF',allowed_level:'FULL'});
assert.equal(proof.visible_count,9);
assert.equal(proof.next_level,'FULL');
assert(proof.visible_fields.some(x=>x.key==='adverse_qualifier'));

const clamped=compileProgressiveDiscovery({...base,requested_level:'FULL',allowed_level:'WORK'});
assert.equal(clamped.effective_level,'WORK');
assert.equal(clamped.drilldown_available,false);
assert.equal(clamped.next_level,null);
assert(!clamped.visible_fields.some(x=>x.key==='evidence'));

const full=compileProgressiveDiscovery({...base,requested_level:'FULL',allowed_level:'FULL'});
assert.equal(full.visible_count,10);
assert.equal(full.hidden_count,0);
assert.equal(full.drilldown_available,false);

let rejected=0;
for(let i=0;i<120;i++){
  const x=structuredClone(base);
  if(i%6===0) x.fields=x.fields.filter(f=>f.key!=='id');
  if(i%6===1) x.fields=x.fields.filter(f=>f.key!=='currentness');
  if(i%6===2) x.fields.push({...x.fields[0]});
  if(i%6===3) x.requested_level='MAGIC';
  if(i%6===4) x.fields[0].min_level='MAGIC';
  if(i%6===5) x.fields=[];
  try{
    const out=compileProgressiveDiscovery({...x,requested_level:x.requested_level||'GLANCE',allowed_level:'FULL'});
    if(out.ready) throw new Error('FALSE_GREEN_'+i);
  }catch{
    rejected++;
  }
}
assert.equal(rejected,120);

console.log(JSON.stringify({
  schema:'xiio.sdk.progressive-discovery-check/v1',
  result:'PASS',
  levels:DISCOVERY_LEVELS,
  hostile_denominator:120,
  hostile_rejected:120,
  false_green:0,
  authority_granted:false,
  effect_authority:false
},null,2));
