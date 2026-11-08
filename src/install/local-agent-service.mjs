import {LOCAL_AGENT_HTTP_SCHEMA} from '../cli/local-agent-http.mjs';

export const LOCAL_AGENT_SERVICE_SCHEMA='xiio.sdk.local-agent-service/v1';
const text=v=>String(v??'').trim();
const STATUS_ENDPOINT='http://127.0.0.1:3109/v1/status';

// systemd Type=simple ACTIVE precedes HTTP readiness. Observe the existing
// loopback door for a bounded interval; never start/restart it or send a turn.
// Listener readback is not installed-generation, model, or effect admission.
export async function waitForLocalAgentServiceStatus({
  timeoutMs=10000,
  requestTimeoutMs=1500,
  retryDelayMs=250,
  fetchImpl=globalThis.fetch,
}={}){
  for(const value of [timeoutMs,requestTimeoutMs,retryDelayMs]){
    if(!Number.isInteger(value)||value<1||value>30000)throw new Error('LOCAL_AGENT_STATUS_TIMING_INVALID');
  }
  if(typeof fetchImpl!=='function')throw new Error('LOCAL_AGENT_STATUS_FETCH_REQUIRED');
  const started=performance.now(),deadline=started+timeoutMs;
  let attempts=0,reason='LOCAL_AGENT_STATUS_TIMEOUT';
  while(performance.now()<deadline){
    attempts+=1;
    const controller=new AbortController();
    let timer;
    try{
      const budget=Math.max(1,Math.min(requestTimeoutMs,Math.ceil(deadline-performance.now())));
      const attemptDeadline=Math.min(deadline,performance.now()+budget);
      const probe=(async()=>{
        const response=await fetchImpl(STATUS_ENDPOINT,{method:'GET',redirect:'error',signal:controller.signal});
        if(response.status!==200)throw new Error('LOCAL_AGENT_STATUS_HTTP');
        const status=await response.json();
        if(status?.schema!==LOCAL_AGENT_HTTP_SCHEMA||status?.service_listener_observed!==true){
          throw new Error('LOCAL_AGENT_STATUS_INVALID');
        }
        return status;
      })();
      const expired=new Promise((_,reject)=>{
        timer=setTimeout(()=>{
          controller.abort();
          reject(new Error('LOCAL_AGENT_STATUS_TIMEOUT'));
        },budget);
      });
      const status=await Promise.race([probe,expired]);
      if(performance.now()>attemptDeadline)throw new Error('LOCAL_AGENT_STATUS_TIMEOUT');
      return {status_readback:true,status,attempts,elapsed_ms:Math.ceil(performance.now()-started),reason:null,
        provider_effect:false,authority_granted:false};
    }catch(error){
      reason=['LOCAL_AGENT_STATUS_HTTP','LOCAL_AGENT_STATUS_INVALID','LOCAL_AGENT_STATUS_TIMEOUT'].includes(error?.message)
        ? error.message : 'LOCAL_AGENT_STATUS_UNAVAILABLE';
    }finally{
      clearTimeout(timer);
      controller.abort();
    }
    const remaining=deadline-performance.now();
    if(remaining>0)await new Promise(resolve=>setTimeout(resolve,Math.min(retryDelayMs,remaining)));
  }
  return {status_readback:false,status:null,attempts,elapsed_ms:Math.ceil(performance.now()-started),reason,
    provider_effect:false,authority_granted:false};
}

function quoteSystemd(value){
  const s=text(value);
  if(!s||s.includes('\n')||s.includes('\r')||s.includes('\0'))throw new Error('LOCAL_AGENT_SERVICE_VALUE_INVALID');
  return '"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
}

export function compileLocalAgentServiceUnit({node_path,sdk_root,workspace_dir}={}){
  const node=text(node_path),root=text(sdk_root),workspace=text(workspace_dir);
  if(!node||!root||!workspace)throw new Error('LOCAL_AGENT_SERVICE_INPUT_REQUIRED');
  const agent=root.replace(/\/$/,'')+'/bin/xi-local-agent.mjs';
  return Object.freeze({
    schema:LOCAL_AGENT_SERVICE_SCHEMA,
    unit:'xiio-local-agent.service',
    endpoint:'http://127.0.0.1:3109',
    status_endpoint:STATUS_ENDPOINT,
    execute_mode:'BOUNDED_REQUIRES_ROTFL_ADMISSION',
    provider_effect:false,
    authority_granted:false,
    content:[
      '[Unit]',
      'Description=XI-IO local CLI agent API',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'WorkingDirectory='+quoteSystemd(workspace),
      'ExecStart='+quoteSystemd(node)+' '+quoteSystemd(agent)+' --serve --execute',
      'Restart=on-failure',
      'RestartSec=2',
      '',
      '[Install]',
      'WantedBy=default.target',
      '',
    ].join('\n'),
  });
}
