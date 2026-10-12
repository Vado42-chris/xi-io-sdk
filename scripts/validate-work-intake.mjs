#!/usr/bin/env node
// GitHub PR work-intake verification. Fail closed; no GitHub mutation.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const matchesRefs=(body)=>[...String(body||'').matchAll(/\bRefs\s+#(\d+)\b/gi)].map(x=>Number(x[1]));
const issueRefs=(body)=>new Set(matchesRefs(body));
const isPr=x=>Boolean(x?.pull_request);
export function validateWorkIntake({pr,issues=[],openPrs=[],lookupComplete=false}={}){
 const errors=[];
 const body=String(pr?.body||'');
 const refs=[...issueRefs(body)];
 if(!pr||!Number.isSafeInteger(pr.number))errors.push('PR_ID_MISSING');
 if(refs.length!==1)errors.push('EXACT_ONE_OPEN_ISSUE_REF_REQUIRED');
 if(!/^Reuses:\s*\S+/im.test(body)){
  const explanation=body.match(/^New because:\s*(.+)$/im)?.[1]||'';
  const searches=[...body.matchAll(/^Search(?: 1| 2)?:\s*.+$/gim)];
  if(!explanation.trim()||searches.length<2)errors.push('REUSE_OR_TWO_SEARCHES_REQUIRED');
 }
 if(!lookupComplete)errors.push('PROVIDER_LOOKUP_INCOMPLETE');
 if(refs.length===1){
  const issue=issues.find(i=>i.number===refs[0]);
  if(!issue||issue.state!=='open'||isPr(issue))errors.push('REFERENCED_ISSUE_NOT_OPEN:'+refs[0]);
  for(const other of openPrs){
   if(other.number===pr?.number||other.state!=='open')continue;
   if(issueRefs(other.body).has(refs[0]))errors.push('EXTEND_EXISTING_PR:'+other.number);
  }
 }
 return {schema:'xiio.sdk.work-intake-gate/v1',ok:errors.length===0,first_red:errors[0]||null,errors,authority:'NONE'};
}
async function request(token,url){
 const res=await fetch(url,{headers:{'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
 if(!res.ok)throw Error('GITHUB_API_'+res.status);
 return {body:await res.json(),link:res.headers.get('link')||''};
}
async function allPages(token,url){
 const rows=[];let next=url;
 for(let i=0;next&&i<30;i++){
  const {body,link}=await request(token,next);
  if(!Array.isArray(body))throw Error('GITHUB_API_ARRAY_EXPECTED');
  rows.push(...body);
  next=link.match(/<([^>]+)>;\s*rel="next"/)?.[1]||null;
 }
 if(next)throw Error('GITHUB_PAGINATION_INCOMPLETE');
 return rows;
}
export async function validateCurrentPr({env=process.env}={}){
 const token=env.GITHUB_TOKEN||env.GH_TOKEN,repo=env.GITHUB_REPOSITORY,eventFile=env.GITHUB_EVENT_PATH;
 if(!token||!repo||!eventFile)throw Error('GITHUB_CURRENTNESS_INPUT_REQUIRED');
 const event=JSON.parse(fs.readFileSync(eventFile,'utf8'));
 const n=event.pull_request?.number;
 if(!Number.isSafeInteger(n))throw Error('PULL_REQUEST_EVENT_REQUIRED');
 const base='https://api.github.com/repos/'+repo;
 const [pr,openPrs]=await Promise.all([request(token,base+'/pulls/'+n).then(x=>x.body),allPages(token,base+'/pulls?state=open&per_page=100')]);
 const refs=[...issueRefs(pr.body)];
 const issues=await Promise.all(refs.map(number=>request(token,base+'/issues/'+number).then(x=>x.body).catch(e=>({number,state:'UNKNOWN',lookup_error:String(e)}))));
 return validateWorkIntake({pr,openPrs,issues,lookupComplete:true});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const result=await validateCurrentPr();
  console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
 }catch(error){console.error(JSON.stringify({ok:false,first_red:'WORK_INTAKE_READBACK_UNAVAILABLE',detail:String(error.message)}));process.exitCode=2;}
}
