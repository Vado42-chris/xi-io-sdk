#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const cwd = fs.realpathSync(process.cwd());
const execute = process.argv.includes('--execute');
const once = process.argv.includes('--once');
const model = process.env.XIIO_OLLAMA_MODEL || 'qwen2.5-coder:7b';
const ollama = 'http://127.0.0.1:11434';
const stateDir = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local/state'), 'xi-io', 'cli');
const workspaceId = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
const sessionFile = path.join(stateDir, `session-${workspaceId}.json`);
const blocked = new Set(['.git', '.ssh', 'node_modules']);
const commands = new Set(['git', 'node', 'npm', 'python', 'python3', 'bash']);
const gitCommands = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'branch', 'fetch', 'pull', 'switch']);
const MAX_ONCE_INPUT_BYTES = 65_536;

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name.toUpperCase().replaceAll('-', '_')}_VALUE_REQUIRED`);
  return value;
}

function target(raw) {
  if (typeof raw !== 'string' || !raw.trim() || path.isAbsolute(raw)) throw new Error('PATH_DENIED');
  const parts = raw.split(/[\\/]+/);
  if (parts.includes('..') || parts.some(p => blocked.has(p) || /^\.env(?:\.|$)/i.test(p))) throw new Error('PATH_DENIED');
  const resolved = path.resolve(cwd, raw);
  if (resolved !== cwd && !resolved.startsWith(cwd + path.sep)) throw new Error('PATH_DENIED');
  return resolved;
}

async function run(command, args = []) {
  if (!execute) return { ok:false, state:'BLOCKED', reason:'START_WITH_XI_CHAT_EXECUTE' };
  if (!commands.has(command) || !Array.isArray(args) || args.length > 32) throw new Error('COMMAND_DENIED');
  if (args.some(a => typeof a !== 'string' || a.includes('\0') || path.isAbsolute(a) || a.split(/[\\/]+/).includes('..'))) throw new Error('COMMAND_DENIED');
  if (command === 'git' && !gitCommands.has(args[0])) throw new Error('GIT_COMMAND_DENIED');
  if (command === 'bash' && (args[0] === '-c' || args[0] === '-lc')) throw new Error('SHELL_STRING_DENIED');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio:['ignore','pipe','pipe'] });
    let output=''; let timer=setTimeout(()=>child.kill('SIGTERM'),120000);
    const add = b => { if (Buffer.byteLength(output) < 98304) output += b.toString(); };
    child.stdout.on('data',add); child.stderr.on('data',add);
    child.on('error',reject);
    child.on('close',code=>{ clearTimeout(timer); resolve({ok:code===0,exitCode:code,output:output.slice(0,98304)}); });
  });
}

const tools=[
 {type:'function',function:{name:'read_workspace_text_file',description:'Read one text file inside the current workspace.',parameters:{type:'object',required:['path'],properties:{path:{type:'string'}}}}},
 {type:'function',function:{name:'edit_workspace_text_file',description:'Create or exactly replace bounded text inside the current workspace. Requires --execute.',parameters:{type:'object',required:['path','operation','new_text'],properties:{path:{type:'string'},operation:{type:'string',enum:['create','replace_exact']},old_text:{type:'string'},new_text:{type:'string'}}}}},
 {type:'function',function:{name:'run_workspace_command',description:'Run one allowlisted executable with structured arguments in the current workspace. Requires --execute.',parameters:{type:'object',required:['command'],properties:{command:{type:'string'},args:{type:'array',items:{type:'string'}}}}}}
];

async function tool(name,a={}) {
  if(name==='read_workspace_text_file') return {content:await fsp.readFile(target(a.path),'utf8')};
  if(name==='edit_workspace_text_file') {
    if(!execute) return {ok:false,state:'BLOCKED',reason:'START_WITH_XI_CHAT_EXECUTE'};
    const p=target(a.path), next=String(a.new_text??''); if(Buffer.byteLength(next)>262144) throw new Error('EDIT_TOO_LARGE');
    if(a.operation==='create') await fsp.writeFile(p,next,{flag:'wx'});
    else { const old=String(a.old_text??''), cur=await fsp.readFile(p,'utf8'); if(!old||cur.indexOf(old)<0||cur.indexOf(old)!==cur.lastIndexOf(old)) throw new Error('EDIT_STALE_OR_AMBIGUOUS'); await fsp.writeFile(p,cur.replace(old,next)); }
    return {ok:true,path:a.path,readback:(await fsp.readFile(p,'utf8')).length};
  }
  if(name==='run_workspace_command') return run(a.command,a.args||[]);
  throw new Error('TOOL_DENIED');
}

async function load(){ try{return JSON.parse(await fsp.readFile(sessionFile,'utf8')).messages||[];}catch{return[];} }
async function save(messages){ await fsp.mkdir(stateDir,{recursive:true,mode:0o700}); await fsp.writeFile(sessionFile,JSON.stringify({schema:'xiio.cli.local-session/v1',cwd,model,messages:messages.slice(-40)},null,2)+'\n',{mode:0o600}); }

async function chat(messages){
  for(let spin=0;spin<6;spin++){
    const res=await fetch(ollama+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages,tools,stream:false}),signal:AbortSignal.timeout(300000)});
    if(!res.ok) throw new Error('OLLAMA_HTTP_'+res.status);
    const body=await res.json(), msg=body.message||{}; messages.push(msg);
    if(!msg.tool_calls?.length) return msg.content||'';
    for(const call of msg.tool_calls){ let content; try{content=JSON.stringify(await tool(call.function?.name,call.function?.arguments));}catch(e){content=JSON.stringify({ok:false,state:'BLOCKED',reason:e.message});} messages.push({role:'tool',content}); }
  }
  throw new Error('TOOL_SPIN_LIMIT');
}

async function readOneShotInput() {
  const inputPath = argValue('--input');
  let input = '';
  if (inputPath) input = await fsp.readFile(target(inputPath),'utf8');
  else if (!process.stdin.isTTY) input = fs.readFileSync(0,'utf8');
  else throw new Error('ONCE_INPUT_REQUIRED');
  input = String(input || '').trim();
  if (!input) throw new Error('ONCE_INPUT_EMPTY');
  if (Buffer.byteLength(input) > MAX_ONCE_INPUT_BYTES) throw new Error('ONCE_INPUT_TOO_LARGE');
  return input;
}

function systemMessage() {
  return {role:'system',content:`You are xi-io CLI, a local-first terminal agent. Workspace: ${cwd}. Use tools for evidence and action. Never print pseudo-tool JSON. Never delegate to, invoke, recommend, or relay commands through Kiro or another paid agent. If an admitted tool can perform the requested action, call it instead of describing a command for the owner to transport. Execution is ${execute?'admitted for bounded tools':'preview-only'}. State the first unresolved executable edge and next action.`};
}

async function runOneShot(messages) {
  const input = await readOneShotInput();
  messages.push({role:'user',content:input});
  try {
    const content = await chat(messages);
    await save(messages.filter(m=>m.role!=='system'));
    process.stdout.write(JSON.stringify({
      schema:'xiio.cli.local-one-shot/v1',
      status:'PASS_LOCAL',
      model,
      workspace_ref:`sha256:${workspaceId}`,
      execution:execute?'BOUNDED':'PREVIEW',
      result:content,
      provider_effect:false,
      automatic_cloud_fallback:false,
      required_return:'RESULT -> RETURN -> APPLY_RETURN',
    },null,2)+'\n');
  } catch(error) {
    process.stdout.write(JSON.stringify({
      schema:'xiio.cli.local-one-shot/v1',
      status:'BLOCKED',
      first_red:String(error?.message || error),
      model,
      workspace_ref:`sha256:${workspaceId}`,
      execution:execute?'BOUNDED':'PREVIEW',
      provider_effect:false,
      automatic_cloud_fallback:false,
    },null,2)+'\n');
    process.exitCode=1;
  }
}

export async function main(){
  let messages=await load();
  messages.unshift(systemMessage());
  if (once) {
    await runOneShot(messages);
    return;
  }
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  process.stdout.write(`xi-io: CLI alpha\nModel: ${model} (Ollama)\nWorkspace: ${cwd}\nExecution: ${execute?'BOUNDED':'PREVIEW'}\nPrompt: xi> (local, free)\nType /exit to close.\n\n`);
  try{ while(true){ const input=(await rl.question('xi> ')).trim(); if(!input)continue; if(input==='/exit'||input==='/quit')break; if(input==='/status'){console.log(JSON.stringify({model,cwd,execute,session:sessionFile},null,2));continue;} messages.push({role:'user',content:input}); try{console.log('\n'+await chat(messages)+'\n');await save(messages.filter(m=>m.role!=='system'));}catch(e){console.error(`\nXIIO_CLI_BLOCKED=${e.message}\n`);} } } finally{rl.close();}
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href) main();
