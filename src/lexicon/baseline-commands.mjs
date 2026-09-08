export const BASELINE_COMMANDS = Object.freeze({
  census:   { term:'xi.framework.command.baseline.census',   aliases:['discover','inventory'], effect:'READ_ONLY' },
  classify: { term:'xi.framework.command.baseline.classify', aliases:['map','categorize'], effect:'READ_ONLY' },
  hydrate:  { term:'xi.framework.command.baseline.hydrate',  aliases:['rebase-context','load-current'], effect:'READ_ONLY_OR_LOCAL_CACHE' },
  qualify:  { term:'xi.framework.command.baseline.qualify',  aliases:['capabilities','preflight'], effect:'READ_ONLY' },
  main:     { term:'xi.framework.command.baseline.main',     aliases:['accepted','head'], effect:'READ_ONLY' },
  destew:   { term:'xi.framework.command.baseline.destew',   aliases:['branches','triage-branches'], effect:'PLAN_ONLY' },
  sdk:      { term:'xi.framework.command.baseline.sdk',      aliases:['adoption','primitives'], effect:'READ_ONLY' },
  ack:      { term:'xi.framework.command.baseline.ack',      aliases:['distributed-ack'], effect:'COORDINATION' },
  score:    { term:'xi.framework.command.baseline.score',    aliases:['100s','scorecard'], effect:'MATHS_ONLY' },
  burn:     { term:'xi.framework.command.baseline.burn',     aliases:['plan','dispatch-plan'], effect:'PLAN_ONLY' },
  return:   { term:'xi.framework.command.baseline.return',   aliases:['apply-return','fanin'], effect:'COORDINATION' },
  ratchet:  { term:'xi.framework.command.baseline.ratchet',  aliases:['freeze-next','rebaseline'], effect:'PLAN_ONLY' },
});

export function normalizeBaselineCommand(input) {
  const raw=String(input??'').trim().toLowerCase();
  for (const [verb,meta] of Object.entries(BASELINE_COMMANDS)) {
    if (raw===verb || meta.aliases.includes(raw)) return {verb,...meta};
  }
  return {verb:null,state:'UNKNOWN_COMMAND',input:raw};
}
