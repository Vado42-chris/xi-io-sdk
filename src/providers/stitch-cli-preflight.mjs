import {spawnSync} from 'node:child_process';
const targets=new Set(['claude-code','cursor','gemini-cli','antigravity','vscode','claude-desktop']);
export function stitchPreflight({runner=spawnSync,command='stitch'}={}){
 const probe=runner(command,['--version'],{encoding:'utf8',timeout:8000,env:process.env});
 if(probe.error?.code==='ENOENT')return {schema:'xiio.sdk.stitch-preflight/v1',installed:false,code:'STITCH_CLI_NOT_INSTALLED',effect:false};
 if(probe.error||probe.status!==0)return {schema:'xiio.sdk.stitch-preflight/v1',installed:false,code:'STITCH_CLI_UNHEALTHY',detail:String(probe.stderr||probe.error?.message||'').slice(0,400),effect:false};
 return {schema:'xiio.sdk.stitch-preflight/v1',installed:true,version:String(probe.stdout||'').trim().slice(0,120),effect:false};
}
export function stitchInstallPlan({scope='project',target='cursor'}={}){
 if(!targets.has(target))throw Error('UNSUPPORTED_STITCH_TARGET');
 if(!['project','user'].includes(scope))throw Error('UNSUPPORTED_STITCH_SCOPE');
 return {schema:'xiio.sdk.stitch-install-plan/v1',prerequisite:'STITCH_CLI_INSTALLED_AND_AUTHENTICATED',commands:[
 ['stitch','agent-skills','add',...(scope==='user'?['--user']:[])],
 ['stitch','mcp','install','--target',target,'--dry-run'],
 ['stitch','agent-skills','list']
 ],effect:false,requires_live_owner_runtime:true};
}
