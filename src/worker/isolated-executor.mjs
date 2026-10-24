/* ── ISOLATED EXECUTOR · xiio.sdk.isolated-executor/v1 ──────────────────────
 *
 * Tests and package scripts execute arbitrary code, so a command-name
 * allowlist is not containment. Every command run for the model goes through
 * bubblewrap (bwrap, the OS sandbox Codex also uses):
 *   - the whole filesystem is read-only;
 *   - only the granted project is writable;
 *   - $HOME, /tmp and every authority directory (grants, admission state) are
 *     replaced by empty tmpfs, so no grant, key or policy is visible or writable;
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

export function bwrapArgs({ workspace, hide = [], home = os.homedir() }) {
  const ws = fs.realpathSync(workspace);
  const args = ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp', '--tmpfs', home];
  // NVM installs Node under HOME; masking HOME otherwise also masks the runtime.
  // Mount only the executable read-only into sandbox-private /tmp, never HOME.
  const hostNode = fs.realpathSync(process.execPath);
  args.push('--dir', '/tmp/xiio-runtime', '--ro-bind', hostNode, '/tmp/xiio-runtime/node');
  for (const dir of hide) {
    let real = null;
    try { real = fs.realpathSync(dir); } catch { continue; }
    if (ws === real || ws.startsWith(real + path.sep)) throw new Error('EXECUTOR_PROJECT_CONTAINS_AUTHORITY_DIR');
    args.push('--tmpfs', real);
  }
  args.push('--bind', ws, ws, '--chdir', ws, '--setenv', 'HOME', home,
    '--unshare-all', '--die-with-parent', '--new-session', '--');
  return args;
}

/** Run one command inside the sandbox. Resolves { ok, exitCode, output }; never runs on the host. */
export function runIsolated({ workspace, command, args = [], hide = [], timeoutMs = 120000, env = process.env }) {
  if (!executorAvailable(env)) return Promise.resolve({ ok: false, state: 'BLOCKED', reason: 'EXECUTOR_ISOLATION_UNAVAILABLE', provider_effect: false });
  let prefix;
  try { prefix = bwrapArgs({ workspace, hide }); } catch (e) { return Promise.resolve({ ok: false, state: 'BLOCKED', reason: e.message }); }
  return new Promise((resolve, reject) => {
    const sandboxCommand = command === 'node' ? '/tmp/xiio-runtime/node' : command;
    const child = spawn(bwrapBin(env), [...prefix, sandboxCommand, ...args], {
      env: { PATH: '/tmp/xiio-runtime:/usr/bin:/bin', LANG: env.LANG || 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = ''; const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    const add = (b) => { if (Buffer.byteLength(output) < 98304) output += b.toString(); };
    child.stdout.on('data', add); child.stderr.on('data', add);
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, exitCode: code, output: output.slice(0, 98304), isolated: true, schema: ISOLATED_EXECUTOR_SCHEMA }); });
  });
}
