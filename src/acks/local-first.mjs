export const LOCAL_ACK_FIRST_SCHEMA = 'xiio.local-ack-first/v2';

const normalize = (value) => String(value ?? '').trim().toUpperCase();

export function compileLocalAckFirstPreflight({
  localRuntime = 'UNKNOWN',
  localAck = 'NO',
  localSimulation = 'NOT_RUN',
  localExecutor = 'UNKNOWN',
  localExecutorReadback = 'UNKNOWN',
  cordFree = false,
  ownerPathIndependent = false,
  automaticCloudFallback = true,
  crmCurrent = false,
  hvtSelected = false,
  externalProjectionRequested = false,
  remoteExecutorState = 'UNKNOWN',
} = {}) {
  const runtime = normalize(localRuntime);
  const ack = normalize(localAck);
  const simulation = normalize(localSimulation);
  const executor = normalize(localExecutor);
  const executorReadback = normalize(localExecutorReadback);
  const remote = normalize(remoteExecutorState);
  const blockers = [];
  const notices = [];

  if (!['AVAILABLE','RUNNING','BOUND'].includes(runtime)) blockers.push('LOCAL_RUNTIME_UNPROVEN');
  if (!['YES','ACKED'].includes(ack)) blockers.push('LOCAL_ACK_MISSING');
  if (!['PASS','SIM_PASS'].includes(simulation)) blockers.push('LOCAL_SIMULATION_MISSING');

  // Root execution gate: xi-io local-first is not satisfied by "a local process".
  // The executor must terminate at local Ollama, be installed/discovered without
  // owner-specific cords, return a native readback, and forbid automatic cloud
  // substitution. Zed ACP is the accepted interim execution shell over Ollama.
  if (!['OLLAMA','ZED_ACP_OLLAMA'].includes(executor)) blockers.push('CORD_FREE_OLLAMA_EXECUTOR_UNBOUND');
  if (!['PASS','READBACK_PASS','ACKED'].includes(executorReadback)) blockers.push('CORD_FREE_OLLAMA_READBACK_MISSING');
  if (cordFree !== true) blockers.push('OWNER_CORD_DEPENDENCY_PRESENT');
  if (ownerPathIndependent !== true) blockers.push('OWNER_PATH_DEPENDENCY_PRESENT');
  if (automaticCloudFallback !== false) blockers.push('AUTOMATIC_CLOUD_FALLBACK_FORBIDDEN');

  if (crmCurrent !== true) blockers.push('CRM_CURRENTNESS_UNPROVEN');
  if (hvtSelected !== true) blockers.push('HVT_NOT_SELECTED');

  const localReady = blockers.length === 0;
  const remoteBlocked = [
    'BILLING_BLOCKED',
    'SPEND_LIMIT_BLOCKED',
    'PAYMENT_FAILED',
    'PRE_RUNNER_BLOCKED',
    'HOLD_PROVIDER_BILLING',
    'BLOCKED_PROVIDER_BILLING',
    'HOLD_PROVIDER_START_FAILURE',
  ].includes(remote);
  if (remoteBlocked) notices.push('REMOTE_EXECUTOR_BLOCKED_USE_LOCAL_SIBLINGS');

  const externalProjectionAllowed = localReady && externalProjectionRequested === true;

  return Object.freeze({
    schema: LOCAL_ACK_FIRST_SCHEMA,
    status: localReady ? 'LOCAL_READY' : 'WAIT_LOCAL_FIRST',
    blockers,
    notices,
    local_ready: localReady,
    local_executor: executor || 'UNKNOWN',
    local_executor_readback: executorReadback || 'UNKNOWN',
    cord_free: cordFree === true,
    owner_path_independent: ownerPathIndependent === true,
    automatic_cloud_fallback: automaticCloudFallback === true,
    remote_executor_eligible: !remoteBlocked,
    remote_requalification_required: remoteBlocked,
    external_projection_allowed: externalProjectionAllowed,
    owner_relay_required: false,
    next: !localReady
      ? blockers[0]
      : externalProjectionAllowed
        ? 'PROJECT_EXTERNAL_EGRESS'
        : 'EXECUTE_LOCAL_OR_RETURN_TYPED_WAIT',
    hard: [
      'LOCAL_REPO_RUNTIME != CHATGPT_CONTROL_PLANE',
      'LOCAL_ACK_REQUIRED_BEFORE_REMOTE_WAIT',
      'LOCAL_SIM_BEFORE_EXTERNAL_PROJECTION',
      'CORD_FREE_OLLAMA_BEFORE_PRODUCT_AUTOMATION',
      'ZED_ACP_OLLAMA != CLOUD_PROVIDER',
      'OWNER_PATH != RUNTIME_DEPENDENCY',
      'AUTOMATIC_CLOUD_FALLBACK = FORBIDDEN',
      'CRM_CURRENT_BEFORE_TEAM_PROJECTION',
      'HVT_SELECTED_BEFORE_ATTEMPT',
      'OWNER_AS_SWITCHBOARD = FAIL',
      'REMOTE_BLOCKED != ROOT_STOP',
      'REMOTE_BILLING_BLOCKED != ECONOMICALLY_ELIGIBLE',
      'ACK != ATTEMPT != RESULT',
    ],
  });
}
