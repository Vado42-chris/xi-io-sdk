import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, existsSync, symlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pullRemoteFolder, PROVIDER_ADAPTERS } from '../src/providers/remote-file-pull.mjs';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6]);
function fakeDrive(files, { truncate = new Set(), status = 200 } = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, auth: init?.headers?.Authorization });
    if (status !== 200) return new Response('no', { status });
    if (url.includes('?q=')) return Response.json({ files: files.map(({ body, ...f }) => ({ ...f, size: String(body.length) })) });
    const id = decodeURIComponent(url.split('/files/')[1].split('?')[0]);
    const f = files.find((x) => x.id === id);
    return new Response(truncate.has(id) ? f.body.subarray(0, 3) : f.body);
  };
  return { fetcher, calls };
}

test('copies every accepted file with exact bytes and a receipt, using the supplied key', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pull-'));
  try {
    const { fetcher, calls } = fakeDrive([{ id: 'a1', name: 'Hero One.png', mimeType: 'image/png', body: png }, { id: 'b2', name: 'notes.txt', mimeType: 'text/plain', body: Buffer.from('x') }]);
    const out = await pullRemoteFolder({ provider: 'google_drive', folderId: 'F', targetDir: dir, getAccessToken: () => 'K', fetcher, accept: (f) => f.mimeType.startsWith('image/') });
    assert.equal(out.ok, true);
    assert.equal(out.written.length, 1);
    assert.deepEqual(readFileSync(join(dir, 'Hero-One.png')), png);
    assert.equal(out.skipped[0].reason, 'NOT_ACCEPTED');
    assert.ok(calls.every((c) => c.auth === 'Bearer K'));
    assert.equal(out.authority_granted, false);
    const again = await pullRemoteFolder({ provider: 'google_drive', folderId: 'F', targetDir: dir, getAccessToken: () => 'K', fetcher, accept: (f) => f.mimeType.startsWith('image/') });
    assert.equal(again.written.length, 0);
    assert.equal(again.skipped.find((s) => s.id === 'a1').reason, 'ALREADY_PRESENT');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a cut-off download is refused and nothing is written for it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pull-'));
  try {
    const { fetcher } = fakeDrive([{ id: 'a1', name: 'cut.png', mimeType: 'image/png', body: png }], { truncate: new Set(['a1']) });
    const out = await pullRemoteFolder({ provider: 'google_drive', folderId: 'F', targetDir: dir, getAccessToken: () => 'K', fetcher });
    assert.equal(out.ok, false);
    assert.equal(out.refused[0].reason, 'TRUNCATED');
    assert.equal(existsSync(join(dir, 'cut.png')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('missing or rejected keys and unknown providers fail with typed states', async () => {
  assert.equal((await pullRemoteFolder({ provider: 'google_drive', folderId: 'F', targetDir: '/tmp/x', getAccessToken: () => '' })).reason, 'HOST_AUTH_REQUIRED');
  const { fetcher } = fakeDrive([], { status: 401 });
  assert.equal((await pullRemoteFolder({ provider: 'google_drive', folderId: 'F', targetDir: '/tmp/x', getAccessToken: () => 'K', fetcher })).reason, 'HOST_AUTH_REQUIRED');
  assert.equal((await pullRemoteFolder({ provider: 'nope', folderId: 'F', targetDir: '/tmp/x', getAccessToken: () => 'K' })).reason, 'PROVIDER_UNKNOWN');
  assert.match(PROVIDER_ADAPTERS.google_drive.read_scope, /drive\.readonly$/);
});

test('prototype-inherited provider keys refuse before credentials or network access', async () => {
  let credentials = 0, requests = 0;
  for (const provider of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const result = await pullRemoteFolder({
      provider, folderId:'fixture-folder', targetDir:'/tmp/untrusted-target',
      getAccessToken:()=>{ credentials++; throw Error('must not request credential'); },
      fetcher:()=>{ requests++; throw Error('must not request provider'); },
    });
    assert.equal(result.ok,false);
    assert.equal(result.reason,'PROVIDER_UNKNOWN');
  }
  assert.equal(credentials,0);
  assert.equal(requests,0);
});

test('different remote files with the same sanitized name are refused without overwriting', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pull-collision-'));
  try {
    const one = Buffer.from('first file');
    const two = Buffer.from('second file');
    const {fetcher} = fakeDrive([
      {id:'first',name:'case notes?.pdf',mimeType:'application/pdf',body:one},
      {id:'second',name:'case notes*.pdf',mimeType:'application/pdf',body:two},
    ]);
    const result = await pullRemoteFolder({provider:'google_drive',folderId:'F',targetDir:dir,getAccessToken:()=> 'K',fetcher});
    assert.equal(result.ok,false);
    assert.equal(result.written.length,1);
    assert.equal(result.refused[0].reason,'LOCAL_NAME_COLLISION');
    assert.deepEqual(readFileSync(join(dir,'case-notes-.pdf')),one);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('pagination limit refuses an incomplete remote inventory before downloading or writing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pull-pages-'));
  try {
    let calls=0;
    const fetcher=async(url)=>{
      calls++;
      return Response.json({files:[],nextPageToken:'next-'+calls});
    };
    const result=await pullRemoteFolder({provider:'google_drive',folderId:'F',targetDir:dir,getAccessToken:()=> 'K',fetcher});
    assert.equal(result.ok,false);
    assert.equal(result.reason,'LIST_PAGINATION_LIMIT');
    assert.equal(calls,50);
    assert.deepEqual(readdirSync(dir), [], 'pagination refusal leaves staging empty');
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test('distinct remote files that normalize to one local name are refused without overwrite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pull-'));
  try {
    const files = [
      { id: 'one', name: 'Case File.pdf', mimeType: 'application/pdf', body: Buffer.from('first') },
      { id: 'two', name: 'Case@File.pdf', mimeType: 'application/pdf', body: Buffer.from('second') },
    ];
    const { fetcher } = fakeDrive(files);
    const out = await pullRemoteFolder({ provider: 'google_drive', folderId: 'F', targetDir: dir, getAccessToken: () => 'K', fetcher });
    assert.equal(out.ok, false);
    assert.equal(out.refused[0].reason, 'LOCAL_NAME_COLLISION');
    assert.deepEqual(readFileSync(join(dir, 'Case-File.pdf')), files[0].body);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('missing declared size is refused before any destination write', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pull-'));
  try {
    const body = Buffer.from('no declared length');
    const fetcher = async (url) => url.includes('?q=')
      ? Response.json({ files: [{ id: 'unknown-size', name: 'unknown.pdf', mimeType: 'application/pdf' }] })
      : new Response(body);
    const out = await pullRemoteFolder({ provider: 'google_drive', folderId: 'F', targetDir: dir, getAccessToken: () => 'K', fetcher });
    assert.equal(out.ok, false);
    assert.equal(out.refused[0].reason, 'DECLARED_SIZE_REQUIRED');
    assert.equal(existsSync(join(dir, 'unknown.pdf')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('native Google Workspace documents are typed as requiring export', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pull-'));
  try {
    let downloads = 0;
    const fetcher = async (url) => {
      if (url.includes('?q=')) return Response.json({ files: [{ id: 'native-doc', name: 'Pleading', mimeType: 'application/vnd.google-apps.document', size: '0' }] });
      downloads += 1; return new Response(new Uint8Array());
    };
    const out = await pullRemoteFolder({ provider: 'google_drive', folderId: 'F', targetDir: dir, getAccessToken: () => 'K', fetcher });
    assert.equal(out.ok, false);
    assert.equal(out.refused[0].reason, 'NATIVE_WORKSPACE_EXPORT_REQUIRED');
    assert.equal(out.written.length, 0);
    assert.equal(downloads, 0, 'native Workspace document is classified before unsupported alt=media download');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('dry run reports planned files without claiming writes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pull-'));
  try {
    const { fetcher } = fakeDrive([{ id: 'a1', name: 'plan.pdf', mimeType: 'application/pdf', body: Buffer.from('plan') }]);
    const out = await pullRemoteFolder({ provider: 'google_drive', folderId: 'F', targetDir: dir, getAccessToken: () => 'K', fetcher, dryRun: true });
    assert.equal(out.ok, true);
    assert.equal(out.written.length, 0);
    assert.equal(out.skipped[0].reason, 'DRY_RUN_WOULD_COPY');
    assert.equal(existsSync(join(dir, 'plan.pdf')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('page-cap exhaustion refuses an incomplete folder listing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pull-'));
  try {
    let pages = 0;
    const fetcher = async () => { pages += 1; return Response.json({ files: [], nextPageToken: 'more-' + pages }); };
    const out = await pullRemoteFolder({ provider: 'google_drive', folderId: 'F', targetDir: dir, getAccessToken: () => 'K', fetcher });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'LIST_PAGINATION_LIMIT');
    assert.equal(pages, 50);
    assert.equal(out.written, undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a symlinked staging directory refuses before requesting provider credentials', async () => {
  const base=mkdtempSync(join(tmpdir(),'pull-symlink-target-'));
  try {
    const real=join(base,'real'),link=join(base,'alias');
    mkdirSync(real);
    symlinkSync(real,link,'dir');
    let keys=0,requests=0;
    const result=await pullRemoteFolder({
      provider:'google_drive',folderId:'F',targetDir:link,
      getAccessToken:()=>{keys++;return 'K';},
      fetcher:async()=>{requests++;throw Error('unsafe directory must not reach network');},
    });
    assert.equal(result.ok,false);
    assert.equal(result.reason,'STAGING_DIRECTORY_UNSAFE');
    assert.equal(keys,0);
    assert.equal(requests,0);
    assert.equal(existsSync(join(real,'asset.png')),false);
  } finally {rmSync(base,{recursive:true,force:true});}
});

test('a symlink in a staging parent cannot redirect a new output directory',async()=>{
  const base=mkdtempSync(join(tmpdir(),'pull-symlink-parent-'));
  try {
    const real=join(base,'real'),link=join(base,'alias');
    mkdirSync(real);
    symlinkSync(real,link,'dir');
    const result=await pullRemoteFolder({
      provider:'google_drive',folderId:'F',targetDir:join(link,'new-child'),
      getAccessToken:()=>{throw Error('must deny before token');},
    });
    assert.equal(result.reason,'STAGING_DIRECTORY_UNSAFE');
    assert.equal(existsSync(join(real,'new-child')),false);
  } finally {rmSync(base,{recursive:true,force:true});}
});

test('a staging directory replaced by a symlink during download cannot publish bytes',async()=>{
  const base=mkdtempSync(join(tmpdir(),'pull-symlink-race-'));
  try {
    const dest=join(base,'stage'),outside=join(base,'outside');
    mkdirSync(dest);mkdirSync(outside);
    const body=Buffer.from('private-case');
    let moved=false;
    const fetcher=async url=>{
      if(url.includes('?q=')) return Response.json({files:[{
        id:'file',name:'private.pdf',mimeType:'application/pdf',size:String(body.length),
      }]});
      renameSync(dest,join(base,'old-stage'));
      symlinkSync(outside,dest,'dir');
      moved=true;
      return new Response(body);
    };
    const result=await pullRemoteFolder({
      provider:'google_drive',folderId:'F',targetDir:dest,
      getAccessToken:()=> 'K',fetcher,
    });
    assert.equal(moved,true);
    assert.equal(result.ok,false);
    assert.equal(result.refused[0].reason,'STAGING_DIRECTORY_UNSAFE');
    assert.equal(existsSync(join(outside,'private.pdf')),false);
    assert.equal(existsSync(join(base,'old-stage','private.pdf')),false);
  } finally {rmSync(base,{recursive:true,force:true});}
});

test('a staging directory swapped for a different real directory during download refuses publication',async()=>{
  const base=mkdtempSync(join(tmpdir(),'pull-directory-swap-'));
  try {
    const dest=join(base,'stage'),outside=join(base,'outside');
    mkdirSync(dest);mkdirSync(outside);
    const body=Buffer.from('legal fixture bytes');
    const fetcher=async url=>{
      if(url.includes('?q=')) return Response.json({files:[{
        id:'file',name:'evidence.pdf',mimeType:'application/pdf',size:String(body.length),
      }]});
      renameSync(dest,join(base,'original-stage'));
      renameSync(outside,dest);
      return new Response(body);
    };
    const result=await pullRemoteFolder({provider:'google_drive',folderId:'F',
      targetDir:dest,getAccessToken:()=> 'K',fetcher});
    assert.equal(result.ok,false);
    assert.equal(result.refused[0].reason,'STAGING_DIRECTORY_UNSAFE');
    assert.equal(existsSync(join(dest,'evidence.pdf')),false);
    assert.equal(existsSync(join(base,'original-stage','evidence.pdf')),false);
  } finally {rmSync(base,{recursive:true,force:true});}
});

test('a staging directory removed during download refuses without escaping or throwing',async()=>{
  const base=mkdtempSync(join(tmpdir(),'pull-directory-removed-'));
  try {
    const dest=join(base,'stage');mkdirSync(dest);
    const body=Buffer.from('legal fixture bytes');
    const fetcher=async url=>{
      if(url.includes('?q=')) return Response.json({files:[{
        id:'file',name:'evidence.pdf',mimeType:'application/pdf',size:String(body.length),
      }]});
      rmSync(dest,{recursive:true});
      return new Response(body);
    };
    const result=await pullRemoteFolder({provider:'google_drive',folderId:'F',
      targetDir:dest,getAccessToken:()=> 'K',fetcher});
    assert.equal(result.ok,false);
    assert.equal(result.refused[0].reason,'STAGING_DIRECTORY_UNSAFE');
    assert.equal(existsSync(join(dest,'evidence.pdf')),false);
  } finally {rmSync(base,{recursive:true,force:true});}
});

test('same-name distinct remote objects with identical bytes cannot share one receipt',async()=>{
 const base=mkdtempSync(join(tmpdir(),'pull-identical-collision-'));
 try{
  const body=Buffer.from('identical');
  const {fetcher}=fakeDrive([
   {id:'first',name:'Record?.pdf',mimeType:'application/pdf',body},
   {id:'second',name:'Record*.pdf',mimeType:'application/pdf',body},
  ]);
  const result=await pullRemoteFolder({
   provider:'google_drive',folderId:'F',targetDir:base,getAccessToken:()=> 'K',fetcher,
  });
  assert.equal(result.ok,false);
  assert.equal(result.written.length,1);
  assert.equal(result.written[0].remote_id,'first');
  assert.equal(result.refused[0].reason,'LOCAL_NAME_COLLISION');
  assert.equal(result.refused[0].conflicts_with_remote_id,'first');
  assert.deepEqual(readFileSync(join(base,'Record-.pdf')),body);
 }finally{rmSync(base,{recursive:true,force:true});}
});

test('dot and dot-dot provider names cannot become filesystem destinations',async()=>{
 const base=mkdtempSync(join(tmpdir(),'pull-dot-'));
 try{
  const body=Buffer.from('private');
  const {fetcher}=fakeDrive([
   {id:'a',name:'.',mimeType:'application/pdf',body},
   {id:'b',name:'..',mimeType:'application/pdf',body},
  ]);
  const result=await pullRemoteFolder({
   provider:'google_drive',folderId:'F',targetDir:base,getAccessToken:()=> 'K',fetcher,
  });
  assert.equal(result.ok,false);
  assert.equal(result.written.length,0);
  assert.deepEqual(result.refused.map(x=>x.reason),['INVALID_LOCAL_NAME','INVALID_LOCAL_NAME']);
 }finally{rmSync(base,{recursive:true,force:true});}
});
