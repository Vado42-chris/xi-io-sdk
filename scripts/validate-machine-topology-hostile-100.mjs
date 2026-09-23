#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectMachineTopology } from '../src/compass/machine-topology.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-machine-topology-'));
try{
  fs.writeFileSync(path.join(tmp,'Cargo.toml'),'[workspace]\nmembers=["voice-host"]\n');
  fs.mkdirSync(path.join(tmp,'voice-host'),{recursive:true});
  fs.writeFileSync(path.join(tmp,'voice-host','Cargo.toml'),`[package]
name="fixture"
version="0.0.0"
[target.'cfg(target_os = "linux")'.dependencies]
gstreamer = { version = "=0.25.3", features = ["v1_28"] }
gstreamer-app = { version = "=0.25.2", features = ["v1_28"] }
gstreamer-audio = { version = "=0.25.3", features = ["v1_28"] }
cpal = "=0.18.2"
opus = "=0.4.0"
`);

  function fakeExecFactory(mut={}){
    return (command,args=[])=>{
      const joined=[command,...args].join(' ');
      if(command==='findmnt'){
        const target=args.at(-1);
        const source=target===tmp;
        if(source) return {ok:true,status:0,stdout:`/media/storage rw,noexec,nosuid,nodev`,stderr:'',error:null};
        return {ok:true,status:0,stdout:`/home rw,exec,relatime`,stderr:'',error:null};
      }
      if(command==='bash' && args[0]==='-lc'){
        const name=String(args[1]).replace(/^command -v /,'');
        if(mut.missingTool===name) return {ok:false,status:1,stdout:'',stderr:'',error:null};
        return {ok:true,status:0,stdout:`/usr/bin/${name}`,stderr:'',error:null};
      }
      if(command==='pkg-config'){
        if(args[0]==='--exists'){
          const spec=String(args[1]||'');
          if(mut.pkgMissing && spec.startsWith(mut.pkgMissing)) return {ok:false,status:1,stdout:'',stderr:'',error:null};
          return {ok:true,status:0,stdout:'',stderr:'',error:null};
        }
        if(args[0]==='--modversion') return {ok:true,status:0,stdout:mut.gstVersion||'1.28.0',stderr:'',error:null};
      }
      return {ok:true,status:0,stdout:'',stderr:'',error:null};
    };
  }

  const control=inspectMachineTopology({
    workspace:tmp,
    env:{...process.env,HOME:os.homedir(),XDG_CACHE_HOME:path.join(tmp,'cache')},
    exec:fakeExecFactory()
  });
  const nodeOnly=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-node-only-'));
  try{
    fs.writeFileSync(path.join(nodeOnly,'package.json'),'{"type":"module"}\n');
    const nodeState=inspectMachineTopology({
      workspace:nodeOnly,
      env:{...process.env,HOME:os.homedir(),XDG_CACHE_HOME:path.join(nodeOnly,'cache')},
      exec:fakeExecFactory()
    });
    assert.equal(nodeState.rust_requirements.cargo,false);
    assert.equal(nodeState.cells.find(x=>x.id==='CARGO_TARGET_EXECUTABLE').state,'N_A_WITH_EVIDENCE');
    assert.equal(nodeState.cells.find(x=>x.id==='PKG_CONFIG').state,'N_A_WITH_EVIDENCE');
    assert.equal(nodeState.cells.find(x=>x.id==='GSTREAMER_METADATA').state,'N_A_WITH_EVIDENCE');
  } finally { fs.rmSync(nodeOnly,{recursive:true,force:true}); }
  assert.equal(control.source_mount.noexec,true);
  assert.equal(control.cargo_target.strategy,'REROUTE_REQUIRED');
  assert.equal(control.cargo_target.mount.noexec,false);
  assert.equal(control.rust_requirements.gstreamer,true);
  assert.equal(control.rust_requirements.gstreamer_min,'1.28');
  assert.equal(control.cells.find(x=>x.id==='GSTREAMER_METADATA').state,'PASS');

  const roots=[
    ['cargo','cargo'],
    ['pkg-config','pkg-config'],
    ['cmake','cmake'],
    ['cc','cc'],
    ['gstreamer','gstreamer-1.0'],
    ['gstreamer-app','gstreamer-app-1.0'],
    ['gstreamer-audio','gstreamer-audio-1.0'],
    ['glib','glib-2.0'],
    ['alsa','alsa'],
    ['target-mount','__target_mount__'],
  ];
  let rejected=0,falseGreen=0;
  for(let context=0;context<10;context++){
    for(const [root,token] of roots){
      let exec=fakeExecFactory(
        ['cargo','pkg-config','cmake','cc'].includes(root)?{missingTool:token}:
        ['gstreamer','gstreamer-app','gstreamer-audio','glib','alsa'].includes(root)?{pkgMissing:token}:{}
      );
      if(root==='target-mount'){
        exec=(command,args=[])=>{
          if(command==='findmnt' && args.at(-1)!==tmp) return {ok:true,status:0,stdout:'/home rw,noexec',stderr:'',error:null};
          return fakeExecFactory()(command,args);
        };
      }
      const got=inspectMachineTopology({
        workspace:tmp,
        env:{...process.env,HOME:os.homedir(),XDG_CACHE_HOME:path.join(tmp,'cache-'+context+'-'+root)},
        exec
      });
      const bad=got.state==='FAIL_CURRENT'||got.state==='PASS_WITH_WAITS'||got.first_red!==null;
      if(bad) rejected++; else falseGreen++;
    }
  }
  assert.equal(rejected,100);
  assert.equal(falseGreen,0);
  console.log('MACHINE_TOPOLOGY_100S=PASS hostile_rejected=100 false_green=0 noexec_reroute=1 native_version_gate=1');
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}
