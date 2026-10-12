#!/usr/bin/env python3
"""Read-only Cursor history inventory. Never reads chat bodies, modifies databases or uploads data."""
import argparse,hashlib,json,os,platform
from pathlib import Path
DB_NAMES={'state.vscdb','state.vscdb.backup','state.vscdb-wal','state.vscdb-shm'}
def roots(home):
    if platform.system()=='Windows':
        app=Path(os.environ.get('APPDATA',home/'AppData'/'Roaming'))
        return [app/'Cursor'/'User',home/'.cursor'/'acp-sessions',home/'.cursor'/'projects']
    if platform.system()=='Darwin':
        return [home/'Library'/'Application Support'/'Cursor'/'User',home/'.cursor'/'acp-sessions',home/'.cursor'/'projects']
    return [home/'.config'/'Cursor'/'User',home/'.var'/'app'/'com.cursor.Cursor'/'config'/'Cursor'/'User',home/'.cursor'/'acp-sessions',home/'.cursor'/'projects']
def inspect(root,limit):
    rows=[];visited=0;denied=0
    if not root.exists():return dict(root=str(root),state='NOT_PRESENT',items=[])
    for folder,dirs,files in os.walk(root,followlinks=False):
        dirs[:]=[d for d in dirs if not (Path(folder)/d).is_symlink()]
        for name in files:
            visited+=1
            if visited>limit:continue
            p=Path(folder)/name
            if p.is_symlink() or (name not in DB_NAMES and p.suffix.lower() not in ('.jsonl','.sqlite','.db','.json','.vscdb','.backup')):continue
            try:
                st=p.stat()
                rows.append({'relative_path':str(p.relative_to(root)),'bytes':st.st_size,'mtime_ns':st.st_mtime_ns,'kind':'sqlite_candidate' if name in DB_NAMES or p.suffix.lower() in ('.db','.sqlite','.vscdb') else 'transcript_candidate'})
            except OSError:denied+=1
    return dict(root=str(root),state='INVENTORIED',entries_scanned=min(visited,limit),entries_omitted=max(0,visited-limit),permission_errors=denied,items=rows)
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--home',type=Path,default=Path.home())
    p.add_argument('--root',type=Path,action='append')
    p.add_argument('--out',type=Path,help='Create local metadata JSON, never raw transcripts')
    p.add_argument('--limit',type=int,default=250000)
    a=p.parse_args()
    entries=list(dict.fromkeys(roots(a.home.expanduser())+(a.root or [])))
    report={'schema':'xiio.sdk.cursor-history-inventory/v1','platform':platform.system(),'mode':'LOCAL_READ_ONLY_METADATA','cloud_history_complete':False,'raw_conversation_exported':False,'roots':[inspect(x,a.limit) for x in entries]}
    payload=json.dumps(report,indent=2)+'\n'
    if a.out:
        target=a.out.expanduser()
        target.parent.mkdir(parents=True,exist_ok=True)
        fd=os.open(str(target),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:f.write(payload)
        print(json.dumps({'output':str(target),'sha256':hashlib.sha256(payload.encode()).hexdigest(),'files':sum(len(x['items']) for x in report['roots'])}))
    else:print(payload,end='')
if __name__=='__main__':main()
