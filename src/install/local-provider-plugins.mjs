import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
const known=Object.freeze({
 figma:{provider:'figma',kind:'mcp',auth:'oauth',capabilities:['design.read','design.write']},
 slack:{provider:'slack',kind:'mcp',auth:'oauth',capabilities:['messages.read','messages.write']},
 asana:{provider:'asana',kind:'mcp',auth:'oauth',capabilities:['tasks.read','tasks.write']},
 adobe:{provider:'adobe',kind:'mcp',auth:'oauth',capabilities:['assets.read','assets.write']},
 google_drive:{provider:'google_drive',kind:'mcp',auth:'oauth',capabilities:['files.read','files.write']},
 github:{provider:'github',kind:'mcp',auth:'oauth',capabilities:['repo.read','repo.write']}
});
const sha=s=>createHash('sha256').update(s).digest('hex');
export function compileLocalProviderPlugin(provider){
 const definition=known[provider];
 if(!definition)throw Error('PROVIDER_UNSUPPORTED');
 return Object.freeze({schema:'xiio.sdk.local-provider-plugin/v1',id:'xiio-provider-'+provider,...definition,connection:'NOT_CONNECTED',authority:'NONE',installed_runtime:false,consent_required:true,capability_state:'DECLARED_UNVERIFIED'});
}
export async function installLocalProviderPlugin({provider,root}){
 if(typeof root!=='string'||!root.trim())throw Error('ROOT_REQUIRED');
 const plugin=compileLocalProviderPlugin(provider);
 const dir=resolve(root);
 const target=join(dir,plugin.id+'.json');
 if(isAbsolute(relative(dir,target))||relative(dir,target).startsWith('..'))throw Error('PATH_ESCAPE');
 const payload=JSON.stringify(plugin,null,2)+'\n';
 await mkdir(dir,{recursive:true});
 // wx prevents silently overwriting a user-modified plugin.
 await writeFile(target,payload,{flag:'wx',mode:0o600});
 const readback=await readFile(target,'utf8');
 if(readback!==payload)throw Error('READBACK_MISMATCH');
 return {schema:'xiio.sdk.local-plugin-install-receipt/v1',provider,path:target,sha256:sha(readback),bytes:Buffer.byteLength(readback),readback:'VERIFIED',runtime_connected:false,provider_effect:false};
}
export const supportedLocalProviders=Object.freeze(Object.keys(known));
