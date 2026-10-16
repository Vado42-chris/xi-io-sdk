import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compileLocalProviderPlugin,installLocalProviderPlugin,supportedLocalProviders} from '../src/install/local-provider-plugins.mjs';
const root=await mkdtemp(join(tmpdir(),'xiio-local-plugin-'));let checks=0;
try{
 assert.ok(supportedLocalProviders.length>=3);checks++;
 for(const provider of ['figma','slack','asana']){
  const receipt=await installLocalProviderPlugin({provider,root});
  assert.equal(receipt.readback,'VERIFIED');checks++;
  assert.equal(receipt.provider_effect,false);checks++;
  assert.equal(JSON.parse(await readFile(receipt.path,'utf8')).connection,'NOT_CONNECTED');checks++;
  await assert.rejects(installLocalProviderPlugin({provider,root}),{code:'EEXIST'});checks++;
 }
 assert.throws(()=>compileLocalProviderPlugin('untrusted'),/PROVIDER_UNSUPPORTED/);checks++;
 console.log(JSON.stringify({schema:'xiio.sdk.local-plugin-proof/v1',checks,failures:0,providers:['figma','slack','asana'],live_provider_connections:0}));
}finally{await rm(root,{recursive:true,force:true});}
