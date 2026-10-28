/* ── ISOLATED EXECUTOR · xiio.sdk.isolated-executor/v1 ──────────────────────
 *
 * Tests and package scripts execute arbitrary code, so a command-name
 * allowlist is not containment. Every command run for the model goes through
 * bubblewrap (bwrap, the OS sandbox Codex also uses):
 *   - only system dirs, the node install and the project are visible, all
 *     read-only; nothing else on the host exists inside (no other homes,
 *     mounts, grants, keys or policy);
 *   - tests cannot change the project; /tmp and $HOME are empty scratch;
 *   - no network; dies with its parent; new session (no terminal injection).
 * If bwrap is missing or cannot start, the command is refused. There is no
 * fallback to host execution. */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ISOLATED_EXECUTOR_SCHEMA = 'xiio.sdk.isolated-executor/v1';

export function bwrapBin(env = process.env) { return env.XIIO_BWRAP_BIN || 'bwrap'; }

export function executorAvailable(env = process.env) {
  const r = spawnSync(bwrapBin(env), ['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-all', '--die-with-parent', 'true'], { stdio: 'ignore', timeout: 10000 });
  return r.status === 0;
}

/* Allowlisted view, never the host root: system dirs and the node install read-only,
   the project read-only (tests cannot change it; edits go only through the audited
   edit tool), an empty writable /tmp and HOME for scratch. Nothing else exists. */
export function bwrapArgs({ workspace, hide = [], home = os.homedir(), nodeBin = process.execPath }) {
  const ws = fs.realpathSync(workspace);
  for (const dir of hide) {
    let real = null;
    try { real = fs.realpathSync(dir); } catch { continue; }
    if (ws === real || ws.startsWith(real + path.sep) || real.startsWith(ws + path.sep)) throw new Error('EXECUTOR_PROJECT_CONTAINS_AUTHORITY_DIR');
  }
  const nodePrefix = path.dirname(path.dirname(fs.realpathSync(nodeBin)));
  const args = [];
  for (const sys of ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc']) args.push('--ro-bind-try', sys, sys);
  if (!['/usr', '/'].includes(nodePrefix)) args.push('--ro-bind', nodePrefix, nodePrefix);
  args.push('--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp', '--tmpfs', home,
    '--ro-bind', ws, ws, '--chdir', ws, '--setenv', 'HOME', home, '--setenv', 'TMPDIR', '/tmp',
    '--unshare-all', '--die-with-parent', '--new-session', '--');
  return args;
}

/** Run one command inside the sandbox. Resolves { ok, exitCode, output }; never runs on the host. */
export function runIsolated({ workspace, command, args = [], hide = [], timeoutMs = 120000, env = process.env }) {
  if (!executorAvailable(env)) return Promise.resolve({ ok: false, state: 'BLOCKED', reason: 'EXECUTOR_ISOLATION_UNAVAILABLE', provider_effect: false });
  let prefix;
  try { prefix = bwrapArgs({ workspace, hide }); } catch (e) { return Promise.resolve({ ok: false, state: 'BLOCKED', reason: e.message }); }
  return new Promise((resolve, reject) => {
    const child = spawn(bwrapBin(env), [...prefix, command, ...args], { env: { PATH: env.PATH, LANG: env.LANG || 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    const add = (b) => { if (Buffer.byteLength(output) < 98304) output += b.toString(); };
    child.stdout.on('data', add); child.stderr.on('data', add);
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, exitCode: code, output: output.slice(0, 98304), isolated: true, schema: ISOLATED_EXECUTOR_SCHEMA }); });
  });
}
