#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { evaluateAgentResponseRealization } from '../src/evaluation/tool-verb-fidelity.mjs';
import { commandCatalog } from '../src/lexicon/baseline-commands.mjs';
import { resolveLexiconCommand } from '../src/lexicon/resolve-token.mjs';
import { commandLexicon } from '../src/cli/public-exports.mjs';
import primitiveCatalog from '../src/catalog/primitives.json' with { type: 'json' };

const cwd = fs.realpathSync(process.cwd());
const execute = process.argv.includes('--execute');
const once = process.argv.includes('--once');
const model = process.env.XIIO_OLLAMA_MODEL || 'llama3.1:8b';
const ollama = 'http://127.0.0.1:11434';
const stateDir = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local/state'), 'xi-io', 'cli');
const workspaceId = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
const sessionFile = path.join(stateDir, `session-${workspaceId}.json`);
const blocked = new Set(['.git', '.ssh', 'node_modules']);
const commands = new Set(['git', 'node', 'python', 'python3', 'bash']);
const xiCli = fileURLToPath(new URL('./xi.mjs', import.meta.url));
const xiioFamilies = new Set([
  'baseline','product','fleet','100s','preflight','cadence','studio','stack',
  'work','ack','burnmap','lesson','lexicon','sdk','recover',
]);
const xiioPathFlags = new Set(['--input','--out','--baseline','--rotfl','--returns']);
const gitCommands = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'branch']);
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

export function validateWorkspaceCommand(command, args = []) {
  if (!commands.has(command) || !Array.isArray(args) || args.length > 32) throw new Error('COMMAND_DENIED');
  if (args.some(a => typeof a !== 'string' || a.includes('\0') || path.isAbsolute(a) || a.split(/[\\/]+/).includes('..'))) throw new Error('COMMAND_DENIED');

  if (command === 'git') {
    if (!gitCommands.has(args[0])) throw new Error('GIT_COMMAND_DENIED');
    return { command, args };
  }

  if (command === 'bash') {
    if (args[0] === '-c' || args[0] === '-lc') throw new Error('SHELL_STRING_DENIED');
    if (args.length !== 2 || args[0] !== '-n') throw new Error('BASH_COMMAND_DENIED');
    target(args[1]);
    return { command, args };
  }

  if (command === 'node') {
    if (args.length !== 2 || !['--check','-c'].includes(args[0])) throw new Error('NODE_COMMAND_DENIED');
    target(args[1]);
    return { command, args };
  }

  if (command === 'python' || command === 'python3') {
    if (args.length !== 3 || args[0] !== '-m' || args[1] !== 'py_compile') throw new Error('PYTHON_COMMAND_DENIED');
    target(args[2]);
    return { command, args };
  }

  throw new Error('COMMAND_DENIED');
}

async function run(command, args = []) {
  if (!execute) return { ok:false, state:'BLOCKED', reason:'START_WITH_XI_CHAT_EXECUTE' };
  validateWorkspaceCommand(command, args);
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
 {type:'function',function:{name:'list_workspace_files',description:'List bounded files and directories inside the current workspace. Read-only.',parameters:{type:'object',properties:{path:{type:'string'},max_results:{type:'integer'}}}}},
 {type:'function',function:{name:'search_workspace_text',description:'Search bounded text files inside the current workspace for a literal string. Read-only.',parameters:{type:'object',required:['query'],properties:{query:{type:'string'},path:{type:'string'},max_results:{type:'integer'}}}}},
 {type:'function',function:{name:'read_workspace_text_file',description:'Read one text file inside the current workspace. Read-only.',parameters:{type:'object',required:['path'],properties:{path:{type:'string'}}}}},
 {type:'function',function:{name:'read_workspace_git',description:'Read current workspace git state with a bounded read-only git verb: status, diff, log, show, rev-parse, or branch.',parameters:{type:'object',required:['operation'],properties:{operation:{type:'string',enum:['status','diff','log','show','rev-parse','branch']},args:{type:'array',items:{type:'string'}}}}}},
 {type:'function',function:{name:'read_local_runtime_status',description:'Read current xi-io workspace, Ollama model/readiness, execution mode, and available native tools. Read-only.',parameters:{type:'object',properties:{}}}},
 {type:'function',function:{name:'list_xiio_registry',description:'Read xi-io command, ACK, SDK callable, primitive, or local-tool registry. Read-only and grants no authority.',parameters:{type:'object',required:['kind'],properties:{kind:{type:'string',enum:['commands','ack','sdk','primitives','tools']}}}}},
 {type:'function',function:{name:'resolve_xiio_command',description:'Resolve a xi-io alias, hashtag, slash command, or command name through the canonical command lexicon. Read-only.',parameters:{type:'object',required:['token'],properties:{token:{type:'string'}}}}},
 {type:'function',function:{name:'run_xiio_cli_command',description:'Run one bounded xi-io SDK/projection command in the current workspace. No provider effects. Local --out writes require --execute.',parameters:{type:'object',required:['args'],properties:{args:{type:'array',items:{type:'string'}},stdin_text:{type:'string'}}}}},
 {type:'function',function:{name:'edit_workspace_text_file',description:'Create or exactly replace bounded text inside the current workspace. Requires --execute.',parameters:{type:'object',required:['path','operation','new_text'],properties:{path:{type:'string'},operation:{type:'string',enum:['create','replace_exact']},old_text:{type:'string'},new_text:{type:'string'}}}}},
 {type:'function',function:{name:'run_workspace_command',description:'Run one bounded validation command in the current workspace. Interpreters are syntax-check only; arbitrary scripts are denied. Requires --execute.',parameters:{type:'object',required:['command'],properties:{command:{type:'string'},args:{type:'array',items:{type:'string'}}}}}}
];
const toolNames=tools.map((entry)=>entry.function.name);

export function localToolCatalog() {
  return {
    schema:'xiio.cli.local-tool-registry/v1',
    workspace:cwd,
    execution:execute?'BOUNDED':'PREVIEW',
    provider_effect:false,
    tools:tools.map((entry)=>({
      name:entry.function.name,
      description:entry.function.description,
      execute_required:/Requires --execute\./.test(entry.function.description),
    })),
  };
}

export async function localRuntimeStatus() {
  let ollamaState='UNREACHABLE';
  let availableModels=[];
  try {
    const res=await fetch(ollama+'/api/tags',{signal:AbortSignal.timeout(1500)});
    if(res.ok){
      const body=await res.json();
      availableModels=(body.models||[]).map((row)=>row?.name).filter(Boolean);
      ollamaState=availableModels.includes(model)?'READY_MODEL_PRESENT':'READY_MODEL_NOT_LISTED';
    } else ollamaState='HTTP_'+res.status;
  } catch(error) {
    ollamaState='UNREACHABLE';
  }
  return {
    schema:'xiio.cli.local-runtime-status/v1',
    cwd,
    model,
    ollama_endpoint:ollama,
    ollama_state:ollamaState,
    model_present:availableModels.includes(model),
    available_model_count:availableModels.length,
    available_models:availableModels.slice(0,100),
    execution:execute?'BOUNDED':'PREVIEW',
    tools:toolNames,
    provider_effect:false,
    automatic_cloud_fallback:false,
  };
}

function printHumanRegistry(kind='all') {
  const catalog=commandCatalog();
  const local=localToolCatalog();
  if(kind==='tools' || kind==='all'){
    console.log('\nLocal workspace tools');
    for(const row of local.tools){
      console.log(`  ${row.name.padEnd(28)} ${row.execute_required?'[--execute]':'[read]'}  ${row.description}`);
    }
  }
  if(kind==='commands' || kind==='ack' || kind==='all'){
    console.log(kind==='ack'?'\nACK commands':'\nCommand registry');
    for(const row of catalog.commands){
      if(kind==='ack' && !row.id.startsWith('ack.')) continue;
      console.log(`  ${row.cli.padEnd(28)} ${row.effect.padEnd(20)} ${row.purpose}`);
    }
  }
}

function printInteractiveHelp() {
  console.log([
    '',
    'xi-io @ibal local operator',
    '  Ask @ibal normally. Ollama handles local reasoning and native tool calls in this workspace.',
    '  /workspace   current directory, model, mode, Ollama state',
    '  /tools       local files/git/runtime + xi-io registry/ACK tool surface',
    '  /commands    ACK/baseline/cadence command registry',
    '  /ack         ACK command subset',
    '  /model       selected local Ollama model',
    '  /models      installed Ollama models',
    '  /clear       clear this workspace session history',
    '  /status      compact runtime status',
    '  /exit        close xi-io',
    '',
    execute
      ? 'Execution mode: bounded edit/run tools are enabled.'
      : 'Preview mode: reads are available. Restart with: xi-io --execute',
    ''
  ].join('\n'));
}

async function listWorkspaceFiles(a={}) {
  const start=target(a.path || '.');
  const max=Math.max(1,Math.min(500,Number(a.max_results || 200)));
  const rows=[];
  async function walk(abs,rel,depth){
    if(rows.length>=max || depth>6)return;
    const entries=await fsp.readdir(abs,{withFileTypes:true});
    entries.sort((x,y)=>x.name.localeCompare(y.name,'en'));
    for(const entry of entries){
      if(rows.length>=max)break;
      if(blocked.has(entry.name) || /^\.env(?:\.|$)/i.test(entry.name))continue;
      const childRel=rel==='.'?entry.name:path.join(rel,entry.name);
      rows.push({path:childRel,type:entry.isDirectory()?'directory':entry.isFile()?'file':'other'});
      if(entry.isDirectory()) await walk(path.join(abs,entry.name),childRel,depth+1);
    }
  }
  const rel=path.relative(cwd,start)||'.';
  await walk(start,rel,0);
  return {workspace:cwd,path:rel,results:rows,truncated:rows.length>=max};
}

async function searchWorkspaceText(a={}) {
  const query=String(a.query || '');
  if(!query || query.length>512)throw new Error('SEARCH_QUERY_INVALID');
  const start=target(a.path || '.');
  const max=Math.max(1,Math.min(200,Number(a.max_results || 50)));
  const hits=[];
  async function walk(abs,rel,depth){
    if(hits.length>=max || depth>6)return;
    const entries=await fsp.readdir(abs,{withFileTypes:true});
    for(const entry of entries){
      if(hits.length>=max)break;
      if(blocked.has(entry.name) || /^\.env(?:\.|$)/i.test(entry.name))continue;
      const childAbs=path.join(abs,entry.name);
      const childRel=rel==='.'?entry.name:path.join(rel,entry.name);
      if(entry.isDirectory()){
        await walk(childAbs,childRel,depth+1);
        continue;
      }
      if(!entry.isFile())continue;
      let stat;
      try{stat=await fsp.stat(childAbs);}catch{continue;}
      if(stat.size>524288)continue;
      let content;
      try{content=await fsp.readFile(childAbs,'utf8');}catch{continue;}
      if(content.includes('\u0000'))continue;
      const lines=content.split(/\r?\n/);
      for(let i=0;i<lines.length && hits.length<max;i++){
        const column=lines[i].indexOf(query);
        if(column<0)continue;
        hits.push({
          path:childRel,
          line:i+1,
          column:column+1,
          preview:lines[i].slice(Math.max(0,column-120),column+query.length+120),
        });
      }
    }
  }
  const rel=path.relative(cwd,start)||'.';
  await walk(start,rel,0);
  return {workspace:cwd,path:rel,query,results:hits,truncated:hits.length>=max};
}

async function readWorkspaceGit(a={}) {
  const operation=String(a.operation||'').trim();
  const allowed=new Set(['status','diff','log','show','rev-parse','branch']);
  if(!allowed.has(operation)) throw new Error('GIT_READ_OPERATION_DENIED');
  const args=Array.isArray(a.args)?a.args:[];
  if(args.length>24 || args.some((value)=>(
    typeof value!=='string'
    || value.includes('\0')
    || path.isAbsolute(value)
    || value.split(/[\\/]+/).includes('..')
  ))) throw new Error('GIT_READ_ARGS_DENIED');
  const globallyDenied=args.some((value)=>(
    /^--output(?:=|$)/.test(value)
    || value==='--ext-diff'
    || value==='--no-index'
  ));
  if(globallyDenied) throw new Error('GIT_READ_MUTATION_OR_ESCAPE_DENIED');
  if(operation==='branch'){
    const branchReadFlags=new Set([
      '--show-current','--list','-a','-r','-v','-vv','--merged','--no-merged',
      '--contains','--no-contains',
    ]);
    if(args.some((value)=>!branchReadFlags.has(value))){
      throw new Error('GIT_BRANCH_READ_ARGS_DENIED');
    }
  }
  return new Promise((resolveRead,reject)=>{
    const child=spawn('git',[operation,...args],{
      cwd,
      env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},
      stdio:['ignore','pipe','pipe'],
    });
    let stdout='';let stderr='';
    const timer=setTimeout(()=>child.kill('SIGTERM'),15000);
    const add=(key,chunk)=>{
      const text=chunk.toString();
      if(key==='stdout' && Buffer.byteLength(stdout)<524288) stdout+=text;
      if(key==='stderr' && Buffer.byteLength(stderr)<131072) stderr+=text;
    };
    child.stdout.on('data',(chunk)=>add('stdout',chunk));
    child.stderr.on('data',(chunk)=>add('stderr',chunk));
    child.on('error',(error)=>{clearTimeout(timer);reject(error);});
    child.on('close',(code)=>{
      clearTimeout(timer);
      resolveRead({
        ok:code===0,
        operation,
        exit_code:code,
        stdout:stdout.slice(0,524288),
        stderr:stderr.slice(0,131072),
        provider_effect:false,
      });
    });
  });
}

function humanCommandCatalog() {
  const catalog=commandCatalog();
  return {
    ...catalog,
    commands:(catalog.commands||[]).map((row)=>({
      ...row,
      cli:String(row.cli||'').replace(/^xi\b/,'xi-io'),
    })),
  };
}

function readXiioRegistry(kind) {
  if(kind==='commands') return humanCommandCatalog();
  if(kind==='ack') return {
    schema:'xiio.cli.ack-registry/v1',
    authority_granted:false,
    provider_effect:false,
    commands:humanCommandCatalog().commands.filter((row)=>row.id.startsWith('ack.')),
  };
  if(kind==='sdk') return commandLexicon();
  if(kind==='primitives') return primitiveCatalog;
  if(kind==='tools') return localToolCatalog();
  throw new Error('REGISTRY_KIND_DENIED');
}

export function validateXiioCliArgs(argv,{executionEnabled=execute}={}) {
  if(!Array.isArray(argv) || argv.length<1 || argv.length>64) throw new Error('XIIO_ARGS_INVALID');
  if(argv.some((value)=>typeof value!=='string' || value.includes('\0'))) throw new Error('XIIO_ARGS_INVALID');
  if(!xiioFamilies.has(argv[0])) throw new Error('XIIO_COMMAND_FAMILY_DENIED');
  if(argv[0]==='recover'){
    if(argv[1]!=='aries-runner') throw new Error('XIIO_RECOVERY_TARGET_DENIED');
    if(argv.includes('--execute') && !executionEnabled) throw new Error('XIIO_RECOVERY_REQUIRES_EXECUTE');
  }
  for(let i=0;i<argv.length;i+=1){
    const flag=argv[i];
    if(!xiioPathFlags.has(flag)) continue;
    const value=argv[i+1];
    if(!value || value.startsWith('--')) throw new Error('XIIO_PATH_VALUE_REQUIRED');
    if(flag==='--out' && value==='-'){i+=1;continue;}
    target(value);
    if(flag==='--out' && !execute) throw new Error('XIIO_LOCAL_WRITE_REQUIRES_EXECUTE');
    i+=1;
  }
  return argv;
}

async function runXiioCliCommand(a={}) {
  const argv=validateXiioCliArgs(a.args);
  const stdin=String(a.stdin_text || '');
  if(Buffer.byteLength(stdin)>1_048_576) throw new Error('XIIO_STDIN_TOO_LARGE');
  return new Promise((resolveRun,reject)=>{
    const child=spawn(process.execPath,[xiCli,...argv],{
      cwd,
      env:process.env,
      stdio:['pipe','pipe','pipe'],
    });
    let stdout='';let stderr='';
    const timer=setTimeout(()=>child.kill('SIGTERM'),120000);
    const add=(key,chunk)=>{
      const text=chunk.toString();
      if(key==='stdout' && Buffer.byteLength(stdout)<1_048_576) stdout+=text;
      if(key==='stderr' && Buffer.byteLength(stderr)<262144) stderr+=text;
    };
    child.stdout.on('data',(chunk)=>add('stdout',chunk));
    child.stderr.on('data',(chunk)=>add('stderr',chunk));
    child.on('error',(error)=>{clearTimeout(timer);reject(error);});
    child.on('close',(code)=>{
      clearTimeout(timer);
      resolveRun({
        ok:code===0,
        exit_code:code,
        stdout:stdout.slice(0,1_048_576),
        stderr:stderr.slice(0,262144),
        provider_effect:false,
        authority_granted:false,
      });
    });
    child.stdin.end(stdin);
  });
}

async function tool(name,a={}) {
  if(name==='list_workspace_files') return listWorkspaceFiles(a);
  if(name==='search_workspace_text') return searchWorkspaceText(a);
  if(name==='read_workspace_text_file') return {content:await fsp.readFile(target(a.path),'utf8')};
  if(name==='read_workspace_git') return readWorkspaceGit(a);
  if(name==='read_local_runtime_status') return localRuntimeStatus();
  if(name==='list_xiio_registry') return readXiioRegistry(String(a.kind||''));
  if(name==='resolve_xiio_command') return resolveLexiconCommand(String(a.token||''));
  if(name==='run_xiio_cli_command') return runXiioCliCommand(a);
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

function realizationCorrection(realization) {
  return {
    role:'system',
    content:[
      'ROTFL_REALIZATION_GATE blocked the previous assistant terminal response.',
      `BLOCKERS=${realization.blockers.join('|') || 'UNKNOWN'}`,
      'Do not print JSON that resembles a function/tool call and do not invent tool names.',
      `Use native tool calls only from: ${toolNames.join(', ')}.`,
      'Workspace file paths must be relative to the current workspace; never use /LUNAR or another absolute path.',
      'If no admitted native tool can perform the requested action, return a typed blocker and exact wake. Do not claim the action ran.',
      'After a native mutation, rely on the tool result/readback before claiming success.',
    ].join(' '),
  };
}

async function chat(messages){
  const observedToolCalls=[];
  for(let spin=0;spin<6;spin++){
    const res=await fetch(ollama+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages,tools,stream:false}),signal:AbortSignal.timeout(300000)});
    if(!res.ok) throw new Error('OLLAMA_HTTP_'+res.status);
    const body=await res.json(), msg=body.message||{}; messages.push(msg);
    if(!msg.tool_calls?.length) {
      const realization=evaluateAgentResponseRealization({
        responseText:msg.content||'',
        observedToolCalls,
        availableToolNames:toolNames,
        workspacePathMode:'RELATIVE_ONLY',
      });
      if(realization.pass) return msg.content||'';
      messages.push(realizationCorrection(realization));
      continue;
    }
    for(const call of msg.tool_calls){
      const name=String(call.function?.name||'').trim();
      if(name) observedToolCalls.push(name);
      let content;
      try{content=JSON.stringify(await tool(name,call.function?.arguments));}
      catch(e){content=JSON.stringify({ok:false,state:'BLOCKED',reason:e.message});}
      messages.push({role:'tool',content});
    }
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
  return {role:'system',content:`You are @ibal inside the xi-io local operator, a local-first terminal conductor. Workspace: ${cwd}. Use tools and registries for evidence and action. Never print pseudo-tool JSON. Never delegate to, invoke, recommend, or relay commands through Kiro or another paid agent. If an admitted tool can perform the requested action, call it instead of describing a command for the owner to transport. Execution is ${execute?'admitted for bounded tools':'preview-only'}. State the first unresolved executable edge and next action.`};
}

async function runOneShot(messages) {
  try {
    const input = await readOneShotInput();
    messages.push({role:'user',content:input});
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
  const runtime=await localRuntimeStatus();
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  process.stdout.write([
    '',
    'xi-io local operator',
    `Workspace: ${cwd}`,
    `Model: ${model}`,
    `Ollama: ${runtime.ollama_state}`,
    `Mode: ${execute?'BOUNDED EXECUTION':'PREVIEW / READ-ONLY'}`,
    'Prompt: xi>',
    'Type /help for commands.',
    '',
  ].join('\n'));
  try{
    while(true){
      const input=(await rl.question('xi> ')).trim();
      if(!input)continue;
      if(input==='/exit'||input==='/quit')break;
      if(input==='/help'){printInteractiveHelp();continue;}
      if(input==='/tools'){printHumanRegistry('tools');continue;}
      if(input==='/commands'||input==='/registry'){printHumanRegistry('commands');continue;}
      if(input==='/ack'){printHumanRegistry('ack');continue;}
      if(input==='/model'){console.log(`model=${model} ollama=${ollama}`);continue;}
      if(input==='/models'){
        const status=await localRuntimeStatus();
        console.log((status.available_models||[]).join('\n') || 'NO_MODELS_REPORTED');
        continue;
      }
      if(input==='/workspace'){
        console.log(JSON.stringify(await localRuntimeStatus(),null,2));
        continue;
      }
      if(input==='/status'){
        const status=await localRuntimeStatus();
        console.log(JSON.stringify({
          model:status.model,
          workspace:status.cwd,
          execution:status.execution,
          ollama_state:status.ollama_state,
          session:sessionFile,
          tool_count:status.tools.length,
        },null,2));
        continue;
      }
      if(input==='/clear'){
        messages=[systemMessage()];
        await save([]);
        console.log('session=cleared');
        continue;
      }
      messages.push({role:'user',content:input});
      try{
        console.log('\n'+await chat(messages)+'\n');
        await save(messages.filter(m=>m.role!=='system'));
      }catch(e){
        console.error(`\nXIIO_CLI_BLOCKED=${e.message}\n`);
      }
    }
  } finally{rl.close();}
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href) main();
