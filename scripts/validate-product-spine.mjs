#!/usr/bin/env node
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

// Fixture qualification is separate from xi-io.net live qualification.
// Every expected identity comes from the pinned roster, never a literal count.
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const ids=x=>new Set(x.map(p=>typeof p==='string'?p:p?.id));
const exact=(a,b)=>a.size===b.size&&[...a].every(x=>b.has(x));
export function validateProductSpine(catalogue,{roster,publishedRoster,sourcePin,livePin}={}){
 const failures=[];
 const products=Array.isArray(catalogue?.products)?catalogue.products:null;
 const members=Array.isArray(roster)?roster:null;
 const published=Array.isArray(publishedRoster)?publishedRoster:null;
 const fail=x=>failures.push(x);
 if(!products)fail('PRODUCTS_ARRAY_MISSING');
 if(!members||!members.length)fail('PINNED_ROSTER_REQUIRED');
 if(!published)fail('PUBLISHED_ROSTER_REQUIRED');
 if(!sourcePin||!livePin||sourcePin!==livePin)fail('STALE_OR_MISSING_PIN');
 const expected=members?ids(members):new Set();
 if(members&&(![...expected].every(x=>typeof x==='string'&&x.trim())||expected.size!==members.length))fail('ROSTER_IDS_INVALID');
 const publicIds=published?ids(published):new Set();
 if(published&&(![...publicIds].every(x=>typeof x==='string'&&x.trim())||publicIds.size!==published.length||![...publicIds].every(x=>expected.has(x))))fail('PUBLISHED_ROSTER_INVALID');
 const seen=new Set(),actualPublished=[];
 for(const [i,p] of (products||[]).entries()){
  if(!p||typeof p!=='object'||Array.isArray(p)){fail('PRODUCT_RECORD_INVALID:'+i);continue;}
  if(typeof p.id!=='string'||!p.id.trim())fail('PRODUCT_ID_MISSING:'+i);
  else if(seen.has(p.id))fail('PRODUCT_ID_DUPLICATE:'+p.id);
  else seen.add(p.id);
  if(typeof p.name!=='string'||!p.name.trim())fail('PRODUCT_NAME_MISSING:'+i);
  if(typeof p.published!=='boolean')fail('PUBLISHED_BOOLEAN_MISSING:'+p.id);
  if(p.published===true)actualPublished.push(p.id);
  for(const field of ['classification','commercial','maturity','authorization_ref']){
   if(!has(p,field)||typeof p[field]!=='string'||!p[field].trim())fail('DIMENSION_MISSING:'+field+':'+p.id);
   if(!p.basis||typeof p.basis[field]!=='string'||!p.basis[field].trim())fail('DIMENSION_BASIS_MISSING:'+field+':'+p.id);
  }
  if(p.maturity==='SIVER')fail('MATURITY_TYPO_SIVER:'+p.id);
  if(typeof p.maturity==='string'&&!['BRONZE','SILVER','GOLD','PLATINUM'].includes(p.maturity))fail('MATURITY_INVALID:'+p.id);
  if(has(p,'price')||has(p,'pricing')||has(p,'price_by_maturity')||has(p,'maturity_price'))fail('PRODUCT_PRICE_FORBIDDEN:'+p.id);
  if(typeof p.authorization_ref==='string'&&/^(persona|person|user|human|role):/i.test(p.authorization_ref))fail('PERSONA_NOT_AUTHORIZATION:'+p.id);
  if(p.authorization_ref===p.persona||p.authorization_ref===p.persona_name)fail('PERSONA_NOT_AUTHORIZATION:'+p.id);
 }
 if(products&&members&&!exact(seen,expected))fail('CATALOGUE_MEMBERSHIP_MISMATCH');
 if(products&&published&&!exact(new Set(actualPublished),publicIds))fail('PUBLISHED_SET_MISMATCH');
 return {schema:'xiio.product-spine-qualification/v2',ok:failures.length===0,first_red:failures[0]||null,failures,visible:failures.length?[]:products.filter(p=>p.published===true),count:products?.length||0,effect_authority:0,publication_authorized:false,qualification_basis:'PINNED_ROSTER'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [cataloguePath,rosterPath,publishedPath,sourcePin,livePin]=process.argv.slice(2);
  if(!cataloguePath||!rosterPath||!publishedPath)throw Error('CATALOGUE_AND_ROSTERS_REQUIRED');
  const result=validateProductSpine(JSON.parse(fs.readFileSync(cataloguePath)),{roster:JSON.parse(fs.readFileSync(rosterPath)),publishedRoster:JSON.parse(fs.readFileSync(publishedPath)),sourcePin,livePin});
  console.log(JSON.stringify({...result,visible:result.visible.map(p=>p.id)},null,2));if(!result.ok)process.exitCode=1;
 }catch(error){console.error(JSON.stringify({ok:false,first_red:'INPUT_OR_PARSE_FAILED',detail:error.message}));process.exitCode=2;}
}
