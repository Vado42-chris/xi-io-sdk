/* `xi grant` · the owner's side of the bounded local-agent grant.
 * Runs only for a person at a real terminal: the model's tool calls are piped
 * (never a TTY) and the isolated executor has no terminal and cannot see the
 * grant directory, so neither can reach this. */
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { composeGrant, describeGrant, saveGrant, revokeGrant, listGrants, isRevoked, defaultGrantDir } from './owner-grant.mjs';

function out(v) { process.stdout.write(JSON.stringify(v, null, 2) + '\n'); }
function flag(argv, name, dflt = null) {
  const eq = argv.find((a) => a.startsWith(name + '=')); if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
}

export async function runGrantCli(argv, { sourceGeneration, env = process.env } = {}) {
  const dir = defaultGrantDir(env);
  const sub = argv[0] || 'status';
  if (sub === 'status') {
    const rows = listGrants(dir).map((g) => ({ grant_id: g.grant_id, project: g.project, operations: g.operations, expires_at: g.expires_at, revoked: isRevoked(dir, g.grant_id), expired: Date.parse(g.expires_at) <= Date.now() }));
    return out({ schema: 'xiio.cli.owner-grant-status/v1', grant_dir: dir, grants: rows });
  }
  if (sub === 'revoke') {
    const id = argv[1]; if (!id) throw new Error('usage: xi grant revoke <grant_id>|--all');
    return out({ schema: 'xiio.cli.owner-grant-revoke/v1', revoked: revokeGrant(dir, id) });
  }
  if (sub !== 'create' && !sub.startsWith('--')) throw new Error('usage: xi grant [create] --project <dir> [--ops edit,test] [--hours N] | status | revoke <id>|--all');
  const args = sub === 'create' ? argv.slice(1) : argv;
  // Human only.
  if (!process.stdin.isTTY || !process.stdout.isTTY || env.XIIO_LOCAL_AGENT_CHILD) {
    out({ schema: 'xiio.cli.owner-grant/v1', state: 'BLOCKED', first_red: 'GRANT_REQUIRES_OWNER_AT_A_TERMINAL', authority_granted: false });
    process.exitCode = 2; return;
  }
  const project = path.resolve(flag(args, '--project', process.cwd()));
  const operations = String(flag(args, '--ops', 'edit,test')).split(',').map((s) => s.trim()).filter(Boolean);
  const hoursRaw = flag(args, '--hours', null);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const hours = Number(hoursRaw ?? await rl.question('How many hours should this grant last (max 12)? '));
    const who = spawnSync('gh', ['api', 'user', '--jq', '{id:.id,login:.login}'], { encoding: 'utf8', timeout: 15000 });
    if (who.status !== 0) { out({ state: 'BLOCKED', first_red: 'ACCOUNT_NOT_OBSERVED_RUN_gh_auth_login' }); process.exitCode = 2; return; }
    const me = JSON.parse(who.stdout);
    const grant = composeGrant({
      observed: { provider: 'github', observed_via: 'provider_api_readback', subject_id: me.id, login: me.login, observed_at: new Date().toISOString() },
      chosen: me.login, project, operations, hours, now: new Date().toISOString(), source_generation: sourceGeneration,
    });
    process.stdout.write('\nGrant for the local agent (@ibal):\n' + describeGrant(grant) + '\n\n');
    const yes = (await rl.question('Grant this? Type "yes" to confirm: ')).trim().toLowerCase();
    if (yes !== 'yes') { out({ state: 'DECLINED', authority_granted: false }); return; }
    saveGrant(dir, grant);
    out({ schema: 'xiio.cli.owner-grant/v1', state: 'GRANTED', grant_id: grant.grant_id, project: grant.project, operations: grant.operations, expires_at: grant.expires_at, revoke: `xi grant revoke ${grant.grant_id}`, lifecycle_steps_marked_complete: 0 });
  } finally { rl.close(); }
}
