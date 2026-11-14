#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Evaluate only the inspected guard and install phase, never the CLI entrypoint.
// All install-phase mutations are intercepted; fixture setup owns its temp HOME.
const source=fs.readFileSync(new URL('../bin/xi.mjs',import.meta.url),'utf8');
const guardSource=source.slice(source.indexOf('function cliWrapperConflict('),source.indexOf('function installLocalCli('));
const installSource=source.slice(source.indexOf('function installLocalCli('),source.indexOf('\nasync function compass(')).replaceAll('import.meta.url',JSON.stringify('file:///synthetic/sdk/bin/xi.mjs'));
const wrapperSource=installSource.slice(installSource.indexOf('  const wrapper=['),installSource.indexOf("  const bins=['xi-io','xiio','xi'];"));
const wrapper=vm.runInNewContext(wrapperSource+'\nwrapper;');
const guard=vm.runInNewContext(guardSource+'\ncliWrapperConflict;',{fs,Buffer});
const foreign='#!/usr/bin/env bash\nset -euo pipefail\nROOT="${XIIO_CLI_PREFIX:-$HOME/.local/share/xi-io/cli}/current"\nexec node "$ROOT/src/xiio.mjs" "$@"\n';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-wrapper-ownership-'));
let cases=0;
function snapshot(root){
  const rows=[];
  function visit(file){
    const stat=fs.lstatSync(file);const rel=path.relative(root,file);
    rows.push({path:rel,mode:stat.mode,ino:stat.ino,nlink:stat.nlink,...(stat.isSymbolicLink()?{link:fs.readlinkSync(file)}:stat.isFile()?{bytes:fs.readFileSync(file).toString('hex')}:{})});
    if(stat.isDirectory()) for(const child of fs.readdirSync(file).sort())visit(path.join(file,child));
  }
  visit(root);return rows;
}
function check(label,seed,allowed=false){
  const root=path.join(temp,String(cases++));fs.mkdirSync(root);
  const file=path.join(root,'xiio');seed(file,root);
  const before=snapshot(root);const result=guard(file,wrapper);
  assert.equal(result===null,allowed,label);
  assert.deepEqual(snapshot(root),before,label+' changed fixture bytes/modes');
}
try{
  check('absent',()=>{},true);
  check('exact current owner',file=>fs.writeFileSync(file,wrapper,{mode:0o700}),true);
  check('foreign sibling wrapper',file=>fs.writeFileSync(file,foreign,{mode:0o640}));
  for(const [label,bytes] of [['empty',''],['one-byte',wrapper.replace('bash','zsh')],['CRLF',wrapper.replaceAll('\n','\r\n')],['extra newline',wrapper+'\n'],['missing newline',wrapper.slice(0,-1)],['binary',Buffer.from([0,255,1])],['historic dispatch',wrapper.replace('exec "$NODE"','XIIO_INVOKED_AS="xiio" exec "$NODE"')]]) check(label,file=>fs.writeFileSync(file,bytes,{mode:0o640}));
  for(const [label,bytes] of [['owned target',wrapper],['foreign target',foreign]])check('symlink '+label,(file,root)=>{const target=path.join(root,'target');fs.writeFileSync(target,bytes,{mode:0o700});fs.symlinkSync(target,file);});
  check('dangling symlink',file=>fs.symlinkSync('missing',file));
  check('directory',file=>fs.mkdirSync(file));
  check('hard link',(file,root)=>{const target=path.join(root,'target');fs.writeFileSync(target,wrapper,{mode:0o700});fs.linkSync(target,file);});
  for(const code of ['EACCES','ENOTDIR','ELOOP']){
    const denied=vm.runInNewContext(guardSource+'\ncliWrapperConflict;',{fs:{lstatSync(){throw Object.assign(new Error(code),{code});}},Buffer});
    assert.equal(denied('/fixture',wrapper).reason,'DESTINATION_INSPECTION_FAILED');cases++;
  }
  for(const code of ['EACCES','ENOENT']){
    const unreadable=vm.runInNewContext(guardSource+'\ncliWrapperConflict;',{fs:{lstatSync(){return {isFile:()=>true,isSymbolicLink:()=>false,nlink:1,size:Buffer.byteLength(wrapper)};},readFileSync(){throw Object.assign(new Error('denied'),{code});}},Buffer});
    assert.equal(unreadable('/fixture',wrapper).reason,'DESTINATION_INSPECTION_FAILED');cases++;
  }
  const mutations=new Set(['mkdirSync','writeFileSync','appendFileSync','unlinkSync','chmodSync','renameSync','rmSync']);
  for(const conflictAlias of ['xi-io','xiio','xi'])for(const othersExist of [false,true]){
    const home=path.join(temp,'phase-'+conflictAlias+'-'+othersExist);const bin=path.join(home,'.local','bin');fs.mkdirSync(bin,{recursive:true});
    for(const alias of ['xi-io','xiio','xi'])if(othersExist || alias===conflictAlias)fs.writeFileSync(path.join(bin,alias),alias===conflictAlias?foreign:wrapper,{mode:0o700});
    const share=path.join(home,'.local','share','xi-io','cli');fs.mkdirSync(share,{recursive:true});
    for(const name of ['sdk.path','env.sh'])fs.writeFileSync(path.join(share,name),'existing '+name+'\n',{mode:0o640});
    const state=path.join(home,'.local','state','xi-io','cli');fs.mkdirSync(state,{recursive:true});
    fs.writeFileSync(path.join(state,'install.current.json'),'existing receipt\n',{mode:0o640});
    fs.writeFileSync(path.join(home,'.bashrc'),'existing shell content\n',{mode:0o640});
    const before=snapshot(home);let writes=0;let output='';const processStub={env:{SHELL:'/bin/bash'},stdout:{write(value){output+=value;}},exitCode:0};
    const checkedFs=new Proxy(fs,{get(target,key){if(mutations.has(key))return()=>{writes++;throw new Error('INSTALL_MUTATION_NOT_ALLOWED');};return target[key];}});
    vm.runInNewContext(guardSource+'\n'+installSource+'\ninstallLocalCli();',{fs:checkedFs,Buffer,path,os:{homedir:()=>home},fileURLToPath,process:processStub});
    assert.equal(writes,0,'no local install mutation before full alias preflight');
    assert.equal(processStub.exitCode,2);
    const receipt=JSON.parse(output);assert.equal(receipt.first_red,'CLI_WRAPPER_OWNERSHIP_CONFLICT');assert.equal(receipt.installed,false);
    assert.equal(receipt.conflicts[0].path,path.join(bin,conflictAlias));
    assert.deepEqual(snapshot(home),before,'all aliases/state/shell preserved');cases++;
  }
  assert(installSource.indexOf('const conflicts=')<installSource.indexOf('fs.mkdirSync('));
  console.log(`CLI_WRAPPER_OWNERSHIP=PASS cases=${cases} installer_entrypoints_run=0 mutation_calls=0 scope=LOCAL_INSTALL_PHASE_ONLY`);
} finally {fs.rmSync(temp,{recursive:true,force:true});}
