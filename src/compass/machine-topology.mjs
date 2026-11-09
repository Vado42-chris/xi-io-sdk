import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function run(command,args,{cwd=process.cwd(),env=process.env,timeout=4000}={}){
  const r=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout,maxBuffer:1024*1024});
  return {
    ok:!r.error && r.status===0,
    status:Number.isInteger(r.status)?r.status:null,
    stdout:String(r.stdout||'').trim(),
    stderr:String(r.stderr||'').trim(),
    error:r.error?String(r.error.message||r.error):null,
  };
}
function exists(p){try{return fs.existsSync(p);}catch{return false;}}
function dir(p){try{return fs.statSync(p).isDirectory();}catch{return false;}}
function real(p){try{return fs.realpathSync(p);}catch{return path.resolve(p);}}
function parseOptions(raw){return new Set(String(raw||'').split(',').map(x=>x.trim()).filter(Boolean));}
function mountFor(target,{exec=run,env=process.env}={}){
  const r=exec('findmnt',['-no','TARGET,OPTIONS','-T',target],{env});
  if(!r.ok || !r.stdout) return {state:'UNKNOWN',target:null,options:[],noexec:null,raw:r.stderr||r.error||null};
  const first=r.stdout.split(/\r?\n/)[0];
  const [mountTarget,...rest]=first.trim().split(/\s+/);
  const opts=rest.join(' ');
  const set=parseOptions(opts);
  return {state:'PASS',target:mountTarget||null,options:[...set],noexec:set.has('noexec'),raw:first};
}
function fingerprint(text){
  const r=spawnSync('sha256sum',[],{input:String(text),encoding:'utf8'});
  if(r.status===0 && /^[0-9a-f]{64}/.test(String(r.stdout))) return String(r.stdout).slice(0,16);
  let h=2166136261;
  for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,'0');
}
function cargoTargetFor(root,{env=process.env}={}){
  const base=env.XIIO_CARGO_CACHE_ROOT
    || path.join(env.XDG_CACHE_HOME || path.join(env.HOME || os.homedir(),'.cache'),'xi-io','cargo-targets');
  const key=fingerprint(real(root));
  return path.join(base,key,'target');
}
function nearestExistingParent(value){
  let cursor=path.resolve(value);
  while(cursor!==path.dirname(cursor)){
    if(dir(cursor)) return cursor;
    cursor=path.dirname(cursor);
  }
  return dir(cursor)?cursor:null;
}
function commandState(name,{exec=run,env=process.env}={}){
  const r=exec('bash',['-lc',`command -v ${name}`],{env});
  return {state:r.ok?'PASS':'WAIT_MISSING',path:r.ok?r.stdout:null};
}
function pkgConfigProbe(spec,{exec=run,env=process.env}={}){
  const has=commandState('pkg-config',{exec,env});
  if(has.state!=='PASS') return {state:'WAIT_MISSING_TOOL',spec,version:null};
  const existsProbe=exec('pkg-config',['--exists',spec],{env});
  if(!existsProbe.ok) return {state:'WAIT_MISSING_METADATA',spec,version:null};
  const base=String(spec).split(/\s+/)[0];
  const version=exec('pkg-config',['--modversion',base],{env});
  return {state:'PASS',spec,version:version.ok?version.stdout:null};
}
function manifestText(root){
  const candidates=[
    path.join(root,'Cargo.toml'),
    path.join(root,'voice-host','Cargo.toml'),
    path.join(root,'codex-rs','Cargo.toml'),
    path.join(root,'codex-rs','voice-host','Cargo.toml'),
  ];
  return candidates.filter(exists).map(p=>fs.readFileSync(p,'utf8')).join('\n');
}
function inferRustRequirements(root){
  const text=manifestText(root);
  const voice=[
    path.join(root,'voice-host','Cargo.toml'),
    path.join(root,'codex-rs','voice-host','Cargo.toml')
  ].find(exists);
  let gstMin=null;
  if(voice){
    const v=fs.readFileSync(voice,'utf8');
    const matches=[...v.matchAll(/features\s*=\s*\[\s*["']v1_(\d+)["']/g)].map(m=>Number(m[1]));
    if(matches.length) gstMin=`1.${Math.max(...matches)}`;
  }
  return {
    cargo:exists(path.join(root,'Cargo.toml')),
    pkg_config:/pkg-config/.test(text)||/gstreamer|cpal/.test(text),
    gstreamer:/gstreamer(?:-app|-audio)?\s*=/.test(text),
    gstreamer_min:gstMin,
    glib:/gstreamer(?:-app|-audio)?\s*=/.test(text),
    alsa:/cpal\s*=/.test(text),
    cmake:/^opus\s*=/m.test(text),
    c_compiler:/^opus\s*=/m.test(text),
  };
}
export function inspectMachineTopology({
  workspace=process.cwd(),
  env=process.env,
  exec=run,
}={}){
  const root=real(workspace);
  const sourceMount=mountFor(root,{exec,env});
  const cargoTarget=cargoTargetFor(root,{env});
  const cargoTargetProbeRoot=nearestExistingParent(path.dirname(cargoTarget));
  const targetMount=cargoTargetProbeRoot?mountFor(cargoTargetProbeRoot,{exec,env}):{state:'UNKNOWN',target:null,options:[],noexec:null,raw:null};
  const req=inferRustRequirements(root);

  const tools={
    cargo:commandState('cargo',{exec,env}),
    pkg_config:commandState('pkg-config',{exec,env}),
    cmake:commandState('cmake',{exec,env}),
    cc:commandState('cc',{exec,env}),
    gcc:commandState('gcc',{exec,env}),
    clang:commandState('clang',{exec,env}),
  };
  const native={};
  if(req.gstreamer){
    const spec=req.gstreamer_min?`gstreamer-1.0 >= ${req.gstreamer_min}`:'gstreamer-1.0';
    native.gstreamer=pkgConfigProbe(spec,{exec,env});
    native.gstreamer_app=pkgConfigProbe(req.gstreamer_min?`gstreamer-app-1.0 >= ${req.gstreamer_min}`:'gstreamer-app-1.0',{exec,env});
    native.gstreamer_audio=pkgConfigProbe(req.gstreamer_min?`gstreamer-audio-1.0 >= ${req.gstreamer_min}`:'gstreamer-audio-1.0',{exec,env});
  }
  if(req.glib) native.glib=pkgConfigProbe('glib-2.0',{exec,env});
  if(req.alsa) native.alsa=pkgConfigProbe('alsa',{exec,env});

  const cells=[
    {id:'SOURCE_MOUNT_OBSERVED',state:sourceMount.state==='PASS'?'PASS':'UNKNOWN',value:sourceMount},
    {id:'CARGO_TARGET_EXECUTABLE',state:req.cargo?(targetMount.state==='PASS'&&targetMount.noexec===false?'PASS':targetMount.noexec===true?'FAIL':'UNKNOWN'):'N_A_WITH_EVIDENCE',value:req.cargo?{path:cargoTarget,mount:targetMount}:{reason:'NO_CARGO_MANIFEST'}},
    {id:'CARGO_AVAILABLE',state:req.cargo?tools.cargo.state:'N_A_WITH_EVIDENCE',value:req.cargo?tools.cargo:{reason:'NO_CARGO_MANIFEST'}},
    {id:'PKG_CONFIG',state:req.pkg_config?tools.pkg_config.state:'N_A_WITH_EVIDENCE',value:req.pkg_config?tools.pkg_config:{reason:'NOT_REQUIRED_BY_DETECTED_MANIFEST'}},
    {id:'GSTREAMER_METADATA',state:req.gstreamer?(native.gstreamer?.state==='PASS'&&native.gstreamer_app?.state==='PASS'&&native.gstreamer_audio?.state==='PASS'?'PASS':'FAIL'):'N_A_WITH_EVIDENCE',value:req.gstreamer?native:{reason:'NOT_REQUIRED_BY_DETECTED_MANIFEST'}},
    {id:'GLIB_METADATA',state:req.glib?(native.glib?.state==='PASS'?'PASS':'FAIL'):'N_A_WITH_EVIDENCE',value:req.glib?(native.glib||null):{reason:'NOT_REQUIRED_BY_DETECTED_MANIFEST'}},
    {id:'ALSA_METADATA',state:req.alsa?(native.alsa?.state==='PASS'?'PASS':'FAIL'):'N_A_WITH_EVIDENCE',value:req.alsa?(native.alsa||null):{reason:'NOT_REQUIRED_BY_DETECTED_MANIFEST'}},
    {id:'CMAKE',state:req.cmake?tools.cmake.state:'N_A_WITH_EVIDENCE',value:req.cmake?tools.cmake:{reason:'NOT_REQUIRED_BY_DETECTED_MANIFEST'}},
    {id:'C_COMPILER',state:req.c_compiler?([tools.cc,tools.gcc,tools.clang].some(x=>x.state==='PASS')?'PASS':'FAIL'):'N_A_WITH_EVIDENCE',value:req.c_compiler?{cc:tools.cc,gcc:tools.gcc,clang:tools.clang}:{reason:'NOT_REQUIRED_BY_DETECTED_MANIFEST'}},
  ];
  const firstRed=cells.find(x=>x.state==='FAIL')||cells.find(x=>x.state==='UNKNOWN')||cells.find(x=>x.state==='WAIT_MISSING')||null;
  const hardFail=cells.some(x=>x.state==='FAIL');
  const unknown=cells.some(x=>x.state==='UNKNOWN'||x.state==='WAIT_MISSING');
  return {
    schema:'xiio.machine-topology/v1',
    state:hardFail?'FAIL_CURRENT':unknown?'PASS_WITH_WAITS':'PASS',
    workspace:root,
    source_mount:sourceMount,
    cargo_target:{
      path:cargoTarget,
      strategy:sourceMount.noexec===true?'REROUTE_REQUIRED':'PORTABLE_CACHE_PREFERRED',
      probe_root:cargoTargetProbeRoot,
      mount:targetMount,
      env_key:'CARGO_TARGET_DIR',
    },
    rust_requirements:req,
    native,
    tools,
    cells,
    first_red:firstRed?.id||null,
    provider_effect:false,
    authority_granted:false,
    hard:[
      'SOURCE_MOUNT_NOEXEC != CARGO_TARGET_NOEXEC',
      'CHMOD != EXEC_PERMISSION',
      'CARGO_TARGET_DIR_RUNTIME_BOUND',
      'NATIVE_DEP_SOURCE_DECLARED != HOST_METADATA_AVAILABLE',
      'APT_PACKAGE_PRESENT != MIN_VERSION_SATISFIED',
      'SOURCE_BUILD_PASS != PACKAGED_RUNTIME_PASS',
    ],
  };
}


export function prepareCargoExecution({
  workspace=process.cwd(),
  env=process.env,
  exec=run,
  create=true,
}={}){
  const topology=inspectMachineTopology({workspace,env,exec});
  if(topology.state==='FAIL_CURRENT' || topology.first_red){
    return {
      schema:'xiio.cargo-execution-prep/v1',
      state:'BLOCKED',
      first_red:topology.first_red||'MACHINE_TOPOLOGY_NOT_READY',
      topology,
      provider_effect:false,
      authority_granted:false,
    };
  }
  const target=topology.cargo_target.path;
  const tmp=path.join(path.dirname(target),'tmp');
  if(create){
    fs.mkdirSync(target,{recursive:true});
    fs.mkdirSync(tmp,{recursive:true});
  }
  const targetMount=mountFor(nearestExistingParent(target)||target,{exec,env});
  if(targetMount.noexec===true){
    return {
      schema:'xiio.cargo-execution-prep/v1',
      state:'BLOCKED',
      first_red:'CARGO_TARGET_NOEXEC',
      topology,
      target_mount:targetMount,
      provider_effect:false,
      authority_granted:false,
    };
  }
  return {
    schema:'xiio.cargo-execution-prep/v1',
    state:'PASS',
    workspace:real(workspace),
    cargo_target_dir:target,
    tmpdir:tmp,
    env:{CARGO_TARGET_DIR:target,TMPDIR:tmp},
    topology,
    provider_effect:false,
    authority_granted:false,
  };
}
