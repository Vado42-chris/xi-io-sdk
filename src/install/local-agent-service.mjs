export const LOCAL_AGENT_SERVICE_SCHEMA='xiio.sdk.local-agent-service/v1';
const text=v=>String(v??'').trim();

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
    status_endpoint:'http://127.0.0.1:3109/v1/status',
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
