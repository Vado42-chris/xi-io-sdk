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

 let calls=[];
 const probe=(cmd,args)=>{calls.push({cmd,args});return {status:0,stdout:'stitch 1.0.0'};};
 const ward=runStitchAction('skills',dir,{execute:true,runner:probe});
 check(ward.state==='WARD_ADMISSION_REQUIRED');
 check(ward.effect===false&&ward.dispatched===false);
 check(calls.length===1&&calls[0].args.join(' ')==='--version');
 calls=[];
 check(runStitchAction('mcp-install',dir,{execute:true,runner:probe}).state==='WARD_ADMISSION_REQUIRED');
 check(calls.length===1&&calls[0].args.join(' ')==='--version');
 const doctor=runStitchAction('doctor',dir,{execute:true,runner:probe});
 check(doctor.command_executed===true&&doctor.effect===false&&doctor.readback_verified===false);
 check(runStitchAction('mcp-preview',dir,{execute:true,runner:probe}).effect===false);
 check(runStitchAction('skills',dir,{execute:true,runner:()=>({status:1})}).state==='STITCH_CLI_UNHEALTHY');

}finally{rmSync(dir,{recursive:true,force:true});}
console.log(JSON.stringify({schema:'xiio.sdk.stitch-integration-proof/v1',checks:n,failed:0,live_stitch_installed:false}));
