import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const IGNORE=new Set(['.git','node_modules','.venv','venv','dist','build','coverage','__pycache__']);
const STUB_PATTERNS=[
  {kind:'python_pass',re:/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\([^\n]*\):\s*\n\s+pass\s*$/gm},
  {kind:'python_not_implemented',re:/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\([^\n]*\):[\s\S]{0,240}?raise\s+NotImplementedError/gm},
  {kind:'js_todo_throw',re:/(?:function\s+|const\s+)([A-Za-z_$][\w$]*)[\s\S]{0,180}?throw\s+new\s+Error\([^\n]*(?:not implemented|todo)/gim},
];
function walk(root,out=[]){
  for(const ent of fs.readdirSync(root,{withFileTypes:true})){
    if(IGNORE.has(ent.name)) continue;
    const p=path.join(root,ent.name);
    if(ent.isDirectory()) walk(p,out);
    else if(/\.(py|js|mjs|cjs|ts|tsx|jsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}
const digest=(v)=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function scanXaxis(root='.'){
  const base=fs.realpathSync(path.resolve(root)); const findings=[];
  for(const file of walk(base)){
    let text; try{text=fs.readFileSync(file,'utf8')}catch{continue}
    const rel=path.relative(base,file).split(path.sep).join('/');
    for(const spec of STUB_PATTERNS){ spec.re.lastIndex=0; let m; while((m=spec.re.exec(text))) findings.push({path:rel,line:text.slice(0,m.index).split('\n').length,symbol:m[1]||null,kind:spec.kind}); }
  }
  const signatures={};
  for(const f of findings){const k=[f.kind,f.symbol||''].join(':');(signatures[k]??=[]).push(f)}
  const groups=Object.entries(signatures).map(([signature,items])=>({signature,count:items.length,items}));
  return {schema:'xiio.xaxis.local-scan/v1',root:base,files_scanned:walk(base).length,stub_occurrences:findings.length,unique_signatures:groups.length,groups,receipt_digest:digest(groups)};
}
export function earnRcp(scan){
  const unique=scan.groups.filter(g=>g.count===1);
  const duplicates=scan.groups.filter(g=>g.count>1);
  const state=scan.stub_occurrences===0?'PASS':'WAIT';
  const body={schema:'xiio.xaxis.rcp/v1',axis:'X',state,scan_digest:scan.receipt_digest,denominator:scan.stub_occurrences,duplicate_occurrences:duplicates.reduce((n,g)=>n+g.count,0),unique_occurrences:unique.length,duplicate_groups:duplicates,unique_artifacts:unique.map(g=>g.items[0]),hard:['RCP != RUNTIME_AUTHORITY','SCAN != EFFECT','DUPLICATE != UNIQUE_ARTIFACT']};
  return {...body,receipt_digest:digest(body)};
}
export function ibalBalance({left=0,right=0,unknown=0}={}){
  for(const n of [left,right,unknown]) if(!Number.isFinite(Number(n))||Number(n)<0) throw new Error('balance values must be non-negative numbers');
  const l=Number(left),r=Number(right),u=Number(unknown),known=l+r,delta=l-r,total=known+u;
  return {schema:'xiio.ibal.balance/v1',left:l,right:r,unknown:u,known,total,delta,absolute_delta:Math.abs(delta),balanced:delta===0&&u===0,ratio:known?{left:l/known,right:r/known}:null,hard:['UNKNOWN != ZERO','BALANCE != AUTHORITY','BALANCED != CLOSED']};
}
