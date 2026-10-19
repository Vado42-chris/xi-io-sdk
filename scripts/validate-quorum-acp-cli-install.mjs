import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const home=mkdtempSync(join(tmpdir(),'xiio-sdk-zed-install-'));
try{
 const result=spawnSync(process.execPath,[join(root,'bin/xi.mjs'),'install'],{
  env:{...process.env,HOME:home,SHELL:'/bin/fish',XIIO_NODE:process.execPath},
  cwd:root,encoding:'utf8',timeout:30_000
 });
 assert.equal(result.status,0,result.stderr||result.stdout);
 const target=join(home,'.local','bin','xi-quorum-acp');
 assert.ok(existsSync(target));
 assert.ok(statSync(target).mode&0o111);
 const wrapper=readFileSync(target,'utf8');
 assert.match(wrapper,/bin\/xi-quorum-acp\.mjs/);
 assert.doesNotMatch(wrapper,/exec .*bin\/xi\.mjs/);
 const sdkPath=readFileSync(join(home,'.local','share','xi-io','cli','sdk.path'),'utf8').trim();
 assert.equal(sdkPath,root);
 const receipt=JSON.parse(result.stdout);
 assert.ok(receipt.bins.includes(target));
 assert.equal(receipt.provider_effect,false);
 console.log(JSON.stringify({schema:'xiio.sdk.zed-quorum-cli-install/v1',checks:8,failures:0,workstation_installed:false}));
}finally{rmSync(home,{recursive:true,force:true});}
