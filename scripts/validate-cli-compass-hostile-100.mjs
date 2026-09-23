#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileLocalCompass, writeCompassReceipt } from '../src/compass/local-truth.mjs';

const sdkRoot=fileURLToPath(new URL('../',import.meta.url));
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-compass-hostile-'));
let hostileCount=0;
let rejected=0;
let falseGreen=0;
const receipts=[];

function mkdir(p){fs.mkdirSync(p,{recursive:true});return p;}
function touch(p,text='x\n'){mkdir(path.dirname(p));fs.writeFileSync(p,text);}
function mkFramework(root){
  mkdir(root);
  touch(path.join(root,'AGENTS.md'),'# agents\n');
  touch(path.join(root,'public','.well-known','xi-io.json'),'{"schema":"xiio.bootstrap"}\n');
  touch(path.join(root,'scripts','install-xiio-cli'),'#!/usr/bin/env bash\n');
}
function result(ok,stdout='',stderr='',status=ok?0:1){
  return {ok,status,stdout,stderr,error:null};
}
function fakeExecFactory({framework,workspace,origin='https://github.com/Vado42-chris/xi-io.net.git',localHead='1'.repeat(40),providerHead=localHead,dirty=false,listener=true}){
  return (command,args,{cwd}={})=>{
    if(command==='git'){
      const sig=args.join(' ');
      if(sig==='rev-parse --show-toplevel') return result(true,framework+'\n');
      if(sig==='rev-parse --is-inside-work-tree') return result(true,'true\n');
      if(sig==='remote get-url origin') return result(true,origin+'\n');
      if(sig==='rev-parse HEAD') return result(true,localHead+'\n');
      if(sig==='branch --show-current') return result(true,'main\n');
      if(sig==='status --porcelain=v1') return result(true,dirty?' M README.md\n':'');
      if(sig==='ls-remote origin refs/heads/main') {
        if(providerHead===null) return result(false,'','offline',2);
        return result(true,providerHead+'\trefs/heads/main\n');
      }
      return result(false,'','unsupported git '+sig,2);
    }
    if(command==='systemctl'){
      const sig=args.join(' ');
      if(sig.includes('list-unit-files')) return result(true,'');
      if(sig.includes('is-active')) return result(false,'inactive\n','',3);
      return result(false,'','unsupported systemctl',2);
    }
    if(command==='pgrep'){
      if(listener) return result(true,`123 ${framework}/.runner-test/bin/Runner.Listener run\n`);
      return result(false,'','',1);
    }
    return result(false,'','unsupported '+command,2);
  };
}
function probeFactory({ollama='PASS',glass='PASS'}){
  return async (url)=>{
    const isOllama=url.includes('11434');
    const state=isOllama?ollama:glass;
    if(state==='PASS') return {state:'PASS',status:200,url,schema:isOllama?null:'xiio.api-glass-box.response-envelope/v1'};
    return {state:'WAIT_UNREACHABLE',status:null,url,error:'synthetic unreachable'};
  };
}
async function hostile(id,setup,verify){
  hostileCount++;
  try{
    const ctx=await setup();
    const ok=await verify(ctx);
    if(ok===true){rejected++;receipts.push({id,state:'EXPECTED'});}
    else {falseGreen++;receipts.push({id,state:'FALSE_GREEN'});}
  }catch(error){
    falseGreen++;
    receipts.push({id,state:'HARNESS_ERROR',error:String(error?.stack||error)});
  }
}

const weirdNames=[
  'Storage 22',
  'Storage with spaces',
  'semi;colon',
  'dollar$sign',
  'brackets[1]',
  'apostrophe-safe',
  'unicode-Δ',
  'tab-safe',
  'parentheses(1)',
  'hash#name',
];

for(let i=0;i<100;i++){
  const group=Math.floor(i/10);
  const variant=i%10;
  await hostile(`COMPASS_${String(i+1).padStart(3,'0')}`,async()=>{
    const caseRoot=mkdir(path.join(sandbox,`case-${i}-${weirdNames[variant]}`));
    const home=mkdir(path.join(caseRoot,'home'));
    const volume=mkdir(path.join(caseRoot,'Storage 22'));
    const common=path.join(volume,'002_Work','xi-io_common');
    const studio=path.join(volume,'001_Flatpack_installs','xi-io-studio');
    const framework=path.join(volume,'999_Work','003_Projects','003_xi-io_net');
    let workspace=common;
    mkdir(common); mkdir(studio); mkFramework(framework);

    let origin='https://github.com/Vado42-chris/xi-io.net.git';
    let localHead='1'.repeat(40);
    let providerHead=localHead;
    let providerRead=true;
    let listener=true;
    let ollama='PASS';
    let glass='PASS';

    if(group===1) origin='https://github.com/example/not-framework.git';
    if(group===2) providerHead='2'.repeat(40);
    if(group===3) providerRead=false;
    if(group===4){ fs.rmSync(common,{recursive:true,force:true}); workspace=mkdir(path.join(volume,'002_Work','unrelated')); }
    if(group===5) fs.rmSync(studio,{recursive:true,force:true});
    if(group===6) listener=false;
    if(group===7) ollama='WAIT';
    if(group===8) glass='WAIT';

    const env={
      ...process.env,
      HOME:home,
      XDG_STATE_HOME:path.join(home,'.local','state'),
      USER:'tester',
      XIIO_VOLUME_ROOT:volume,
      XIIO_FRAMEWORK_ROOT:group===1?framework:'',
      XIIO_COMMON_ROOT:'',
      XIIO_STUDIO_FINAL_ROOT:'',
      XIIO_COMPASS_PROVIDER_READ:providerRead?'1':'0',
    };
    const exec=fakeExecFactory({framework,workspace,origin,localHead,providerHead,listener});
    const probe=probeFactory({ollama,glass});
    const compass=await compileLocalCompass({
      cwd:workspace,env,sdkRoot,hostname:'aries',exec,probe,providerRead
    });
    return {caseRoot,home,volume,common,studio,framework,workspace,compass,env,group,variant};
  },async({home,common,studio,framework,compass,env,group})=>{
    assert.equal(compass.schema,'xiio.cli.compass/v1');
    assert.equal(compass.node_ref,'node.aries');
    assert.equal(compass.provider_effect,false);
    assert.equal(compass.authority_granted,false);
    assert.equal(compass.denominator,11);
    assert.equal(compass.machine.home,fs.realpathSync(home));
    assert.ok(compass.hard.includes('DECLARED_PATH != PHYSICAL_PATH'));
    assert.ok(compass.hard.includes('PHYSICAL_PATH != CURRENT_GENERATION'));

    if(group===0){
      assert.equal(compass.state,'PASS');
      assert.equal(compass.roots.framework.selected.state,'PASS');
      assert.equal(compass.roots.framework.selected.generation_state,'EXACT_PROVIDER_MAIN');
      assert.equal(compass.roots.common.path,fs.realpathSync(common));
      assert.equal(compass.roots.studio.path,fs.realpathSync(studio));
    } else if(group===1){
      assert.equal(compass.state,'MAP_WITH_REDS');
      assert.equal(compass.first_red,'FRAMEWORK');
      assert.equal(compass.roots.framework.state,'FAIL');
    } else if(group===2){
      assert.equal(compass.first_red,'FRAMEWORK_CURRENTNESS');
      assert.equal(compass.roots.framework.selected.generation_state,'DIFFERENT_FROM_PROVIDER_MAIN');
    } else if(group===3){
      assert.equal(compass.first_red,'FRAMEWORK_CURRENTNESS');
      assert.equal(compass.roots.framework.selected.generation_state,'UNKNOWN');
    } else if(group===4){
      assert.equal(compass.first_red,'COMMON');
      assert.equal(compass.roots.common.state,'UNKNOWN');
    } else if(group===5){
      assert.equal(compass.first_red,'STUDIO');
      assert.equal(compass.roots.studio.state,'UNKNOWN');
    } else if(group===6){
      assert.equal(compass.first_red,'RUNNER');
      assert.equal(compass.runtime.runner.state,'UNKNOWN_NOT_DEEP_SCANNED');
    } else if(group===7){
      assert.equal(compass.first_red,'OLLAMA');
      assert.notEqual(compass.runtime.ollama.state,'PASS');
    } else if(group===8){
      assert.equal(compass.first_red,'API_GLASS_BOX');
      assert.notEqual(compass.runtime.api_glass_box.state,'PASS');
    } else if(group===9){
      assert.equal(compass.state,'PASS');
      const receipt=writeCompassReceipt(compass,{env});
      assert.ok(receipt.current.startsWith(home+path.sep));
      const reread=JSON.parse(fs.readFileSync(receipt.current,'utf8'));
      assert.equal(reread.node_ref,'node.aries');
      assert.equal(reread.roots.framework.selected.path,fs.realpathSync(framework));
    }
    return true;
  });
}

if (rejected!==100 || falseGreen!==0) {
  const failures=receipts.filter((row)=>row.state!=='EXPECTED');
  const families=new Map();
  for(const row of failures){
    const number=Number(String(row.id||'').split('_').at(-1)||0);
    const family=Math.floor((Math.max(1,number)-1)/10);
    const key='FAMILY_'+family;
    const firstLine=String(row.error||row.state||'UNKNOWN').split('\\n')[0].slice(0,240);
    const existing=families.get(key)||{family,failures:0,samples:[]};
    existing.failures++;
    if(existing.samples.length<2) existing.samples.push({id:row.id,state:row.state,error:firstLine});
    families.set(key,existing);
  }
  console.error(JSON.stringify({
    schema:'xiio.cli.compass-hostile-debug/v2',
    hostileCount,rejected,falseGreen,
    families:[...families.values()].sort((a,b)=>a.family-b.family),
  }));
}
assert.equal(hostileCount,100);
assert.equal(rejected,100);
assert.equal(falseGreen,0);

fs.rmSync(sandbox,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.cli.compass-hostile-100/v1',
  result:'PASS',
  denominator:hostileCount,
  expected:rejected,
  false_green:falseGreen,
  groups:{
    exact_truth:10,
    wrong_origin:10,
    provider_drift:10,
    provider_unknown:10,
    common_missing:10,
    studio_missing:10,
    runner_missing:10,
    ollama_missing:10,
    glass_missing:10,
    receipt_boundary:10,
  },
  hard:[
    'DECLARED_PATH != PHYSICAL_PATH',
    'PHYSICAL_PATH != CURRENT_GENERATION',
    'OLD_FRAMEWORK_CLI_FILES != FRAMEWORK_IDENTITY',
    'UNKNOWN != ABSENT',
  ],
  provider_effects:0,
  authority_granted:false,
},null,2));
