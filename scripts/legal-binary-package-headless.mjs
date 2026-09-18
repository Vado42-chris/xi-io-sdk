#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';
import { compileLegalBinaryPackage } from '../src/legal/binary-package.mjs';

function args(argv){
  const out={input:null,output:null};
  for(let i=2;i<argv.length;i++){
    if(argv[i]==='--input') out.input=argv[++i];
    else if(argv[i]==='--output') out.output=argv[++i];
    else if(argv[i]==='--help'){
      console.log('Usage: node scripts/legal-binary-package-headless.mjs --input input.json [--output result.json]');
      process.exit(0);
    } else throw new Error(`unknown arg: ${argv[i]}`);
  }
  if(!out.input) throw new Error('--input required');
  return out;
}

const opts=args(process.argv);
const raw=JSON.parse(await fs.readFile(opts.input,'utf8'));
const result=compileLegalBinaryPackage(raw);
const text=JSON.stringify(result,null,2)+'\n';
if(opts.output){
  const target=path.resolve(opts.output);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,text,'utf8');
} else {
  process.stdout.write(text);
}
if(!result.gate_pass) process.exitCode=2;
