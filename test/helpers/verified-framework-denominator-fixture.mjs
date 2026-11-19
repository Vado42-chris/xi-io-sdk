import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {bindUniversalPrimitiveDenominatorFromInstaller} from '../../src/flatpack/universal-primitive-denominator.mjs';

const sha256=value=>createHash('sha256').update(value).digest('hex');

export async function bindSyntheticFrameworkDenominatorThroughInstaller(contract,{
  generation='a'.repeat(40),
  mutate_on_second_read=false,
  destination='xi-io/framework/runtime/primitives/universal-primitive-denominator.v1.json',
  destination_scope='xdg_data',
}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-sdk-primitive-denominator-'));
  const bin=path.join(root,'bin');fs.mkdirSync(bin);
  const contractPath=path.join(root,'universal-primitive-denominator.v1.json');
  const receiptPath=path.join(root,'framework-binding.json');
  const countPath=path.join(root,'count');
  const raw=Buffer.from(JSON.stringify(contract,null,2)+'\n');
  fs.writeFileSync(contractPath,raw,{mode:0o644});
  fs.writeFileSync(receiptPath,'{}\n',{mode:0o600});
  fs.writeFileSync(countPath,'0\n');
  const fileSha=sha256(raw);
  const cli=path.join(bin,'xi-io-installer');
  fs.writeFileSync(cli,`#!/usr/bin/env node
import fs from 'node:fs';
const countPath=${JSON.stringify(countPath)};
const contractPath=${JSON.stringify(contractPath)};
const receiptPath=${JSON.stringify(receiptPath)};
const generation=${JSON.stringify(generation)};
const fileSha=${JSON.stringify(fileSha)};
const mutate=${JSON.stringify(Boolean(mutate_on_second_read))};
const destination=${JSON.stringify(destination)};
const destinationScope=${JSON.stringify(destination_scope)};
let count=Number(fs.readFileSync(countPath,'utf8').trim()||'0')+1;
fs.writeFileSync(countPath,String(count)+'\\n');
if(mutate&&count===2)fs.appendFileSync(contractPath,' ');
const row={
 schema:'xiio.installer-dependency-binding-receipt/v1',
 state:'VERIFIED',
 dependency_id:'framework-runtime',
 owner_repo:'Vado42-chris/xi-io.net',
 accepted_generation:generation,
 binding_receipt_path:receiptPath,
 binding_sha256:'b'.repeat(64),
 fields:{universal_primitive_denominator_contract:contractPath},
 runtime_exports:{universal_primitive_denominator_contract:{
  sha256:fileSha,mode:'0644',destination_scope:destinationScope,
  destination
 }},
 custody_verified:true,authority_granted:false,provider_effect:false,effect_authority:false
};
process.stdout.write(JSON.stringify(row)+'\\n');
`,{mode:0o755});
  const prior=process.env.PATH;
  process.env.PATH=bin+path.delimiter+(prior||'');
  try{
    const binding=await bindUniversalPrimitiveDenominatorFromInstaller({
      binding_receipt_path:receiptPath,
      expected_framework_generation:generation,
      timeout_ms:5000,
    });
    return {binding,root,contract_path:contractPath,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
  }catch(error){
    fs.rmSync(root,{recursive:true,force:true});
    throw error;
  }finally{
    process.env.PATH=prior;
  }
}
