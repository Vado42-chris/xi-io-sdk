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
 const r=runner(command.command,command.args,{cwd:command.cwd,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,env:process.env});
 if(r.error?.code==='ENOENT')return {schema:'xiio.sdk.stitch-action/v1',state:'STITCH_CLI_NOT_INSTALLED',action,effect:false};
 return {schema:'xiio.sdk.stitch-action/v1',state:r.status===0?'EXECUTED_UNVERIFIED':'FAILED',action,exit_code:r.status??null,stdout:String(r.stdout||'').slice(0,2000),stderr:String(r.stderr||'').slice(0,1000),effect:r.status===0&&action!=='doctor'&&action!=='skills-list'&&action!=='mcp-preview',readback_verified:false};
}
