import {spawnSync} from 'node:child_process';
import {existsSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
const steps={
  doctor:['--version'],
  skills:['agent-skills','add'],
  'skills-user':['agent-skills','add','--user'],
  'skills-list':['agent-skills','list'],
  'skills-update':['agent-skills','update'],
  'mcp-preview':['mcp','install','--dry-run'],
  'mcp-install':['mcp','install'],
  'mcp-cursor':['mcp','install','--target','cursor'],
  'mcp-gemini':['mcp','install','--target','gemini-cli'],
  'mcp-antigravity':['mcp','install','--target','antigravity'],
  'mcp-vscode':['mcp','install','--target','vscode'],
};
export function stitchCommand(action,workspace){
 if(!Object.hasOwn(steps,action))throw Error('STITCH_ACTION_UNSUPPORTED');
 if(!workspace||!existsSync(workspace))throw Error('WORKSPACE_NOT_FOUND');
 return {command:'stitch',args:steps[action],cwd:realpathSync(resolve(workspace)),action};
}
export function runStitchAction(action,workspace,{execute=false,runner=spawnSync}={}){
 const command=stitchCommand(action,workspace);
 if(!execute)return {schema:'xiio.sdk.stitch-action/v1',state:'PLAN_ONLY',...command,effect:false};
 const opts={cwd:command.cwd,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,env:process.env};
 const readOnly=new Set(['doctor','skills-list','mcp-preview']);
 // SDK never self-admits a privileged tool effect. Only source-owner Ward
 // authorization at the execution sink can unlock installing skills or MCPs.
 if(!readOnly.has(action)){
   const probe=runner(command.command,['--version'],opts);
   if(probe.error?.code==='ENOENT')return {schema:'xiio.sdk.stitch-action/v1',state:'STITCH_CLI_NOT_INSTALLED',action,effect:false,dispatched:false};
   if(probe.error||probe.status!==0)return {schema:'xiio.sdk.stitch-action/v1',state:'STITCH_CLI_UNHEALTHY',action,effect:false,dispatched:false,exit_code:probe.status??null};
   return {schema:'xiio.sdk.stitch-action/v1',state:'WARD_ADMISSION_REQUIRED',action,cli_version:String(probe.stdout||'').trim().slice(0,120),
     effect:false,dispatched:false,readback_verified:false,first_red:'WARD_AND_WORKERASSIGNMENT_UNVERIFIED'};
 }
 const r=runner(command.command,command.args,opts);
 if(r.error?.code==='ENOENT')return {schema:'xiio.sdk.stitch-action/v1',state:'STITCH_CLI_NOT_INSTALLED',action,effect:false,dispatched:false};
 return {schema:'xiio.sdk.stitch-action/v1',state:r.status===0?'EXECUTED_UNVERIFIED':'FAILED',
   action,exit_code:r.status??null,stdout:String(r.stdout||'').slice(0,2000),stderr:String(r.stderr||'').slice(0,1000),
   command_executed:r.status===0,readback_verified:false,effect:false,effect_verified:false,provider_effect:false};
}
