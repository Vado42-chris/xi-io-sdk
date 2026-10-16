import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stitchCommand,runStitchAction} from '../src/integrations/stitch-cli.mjs';
const dir=mkdtempSync(join(tmpdir(),'xiio-stitch-'));let n=0;
const check=x=>{assert.ok(x);n++};
try{
 check(stitchCommand('mcp-preview',dir).args.includes('--dry-run'));
 check(stitchCommand('mcp-cursor',dir).args.includes('cursor'));
 check(runStitchAction('skills',dir).state==='PLAN_ONLY');
 check(runStitchAction('doctor',dir,{execute:true,runner:()=>({status:0,stdout:'stitch 1.0'})}).state==='EXECUTED_UNVERIFIED');
 check(runStitchAction('skills',dir,{execute:true,runner:()=>({error:{code:'ENOENT'}})}).state==='STITCH_CLI_NOT_INSTALLED');
 check(runStitchAction('mcp-preview',dir,{execute:true,runner:()=>({status:0})}).effect===false);
 assert.throws(()=>stitchCommand('arbitrary-shell',dir),/UNSUPPORTED/);n++;
 assert.throws(()=>stitchCommand('doctor',dir+'/missing'),/WORKSPACE_NOT_FOUND/);n++;
}finally{rmSync(dir,{recursive:true,force:true});}
console.log(JSON.stringify({schema:'xiio.sdk.stitch-integration-proof/v1',checks:n,failed:0,live_stitch_installed:false}));
