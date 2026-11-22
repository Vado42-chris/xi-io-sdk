// Regression contract for the installer dependency-binding consumer.
// Consumed by: SDK check gate, Node vendored copy, and Ibal worker kits.
// Covers SECURITY-NODE-INSTALLER-TRUST-001: PATH-planted installer, unverified module bytes, path swap after check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  readVerifiedInstallerDependencyBinding,
  importVerifiedInstallerDependencyModule,
  resolveInstallerBinary,
  readVerifiedModuleBytes,
} from '../src/install/installer-dependency-binding-client.mjs';

const GOOD = 'export const value = "verified";\n';
const sha = (text) => createHash('sha256').update(text).digest('hex');
const request = (receipt) => ({
  binding_receipt_path: receipt,
  expected_dependency_id: 'provider-runtime',
  expected_owner_repo: 'owner/provider',
  expected_generation: 'a'.repeat(40),
  export_name: 'provider_module',
});

// Fake installer that reports the digest of GOOD, plus a marker file it writes when run.
function plantInstaller(t, { reportedSha, marker }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-sdk-trust-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const target = path.join(root, 'provider.mjs');
  fs.writeFileSync(target, GOOD);
  const receipt = path.join(root, 'binding.json');
  fs.writeFileSync(receipt, '{}');
  const script = path.join(bin, 'xi-io-installer');
  fs.writeFileSync(script, `#!/usr/bin/env node
const fs=require('node:fs');
${marker ? `fs.writeFileSync(${JSON.stringify(marker)},'ran');` : ''}
const receipt=process.argv[3];
process.stdout.write(JSON.stringify({
 schema:'xiio.installer-dependency-binding-receipt/v1',state:'VERIFIED',
 dependency_id:'provider-runtime',owner_repo:'owner/provider',accepted_generation:'a'.repeat(40),
 binding_receipt_path:receipt,binding_sha256:'d'.repeat(64),
 runtime_exports:{provider_module:{destination_scope:'xdg_data',destination:'xi-io/provider/provider.mjs',sha256:${JSON.stringify(reportedSha)},mode:'0644'}},
 fields:{provider_module:${JSON.stringify(target)}},provider_effect:false,effect_authority:false,custody_verified:true
}));
`, { mode: 0o755 });
  return { root, bin, target, receipt, script };
}

async function withEnv(vars, work) {
  const prior = {};
  for (const k of Object.keys(vars)) { prior[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return await work(); } finally {
    for (const k of Object.keys(prior)) { if (prior[k] === undefined) delete process.env[k]; else process.env[k] = prior[k]; }
  }
}

test('PATH-planted installer is never executed; only an absolute XIIO_INSTALLER_BIN is accepted', async (t) => {
  const marker = path.join(os.tmpdir(), `xiio-trust-ran-${process.pid}-${Date.now()}`);
  const f = plantInstaller(t, { reportedSha: sha(GOOD), marker });
  const priorPath = process.env.PATH;
  try {
    await withEnv({ PATH: `${f.bin}${path.delimiter}${priorPath}`, XIIO_INSTALLER_BIN: undefined }, async () => {
      assert.throws(() => resolveInstallerBinary(), { code: 'INSTALLER_BINARY_PATH_REQUIRED' });
      await assert.rejects(readVerifiedInstallerDependencyBinding(request(f.receipt)), { code: 'INSTALLER_BINARY_PATH_REQUIRED' });
    });
    await withEnv({ PATH: `${f.bin}${path.delimiter}${priorPath}`, XIIO_INSTALLER_BIN: 'xi-io-installer' }, async () => {
      assert.throws(() => resolveInstallerBinary(), { code: 'INSTALLER_BINARY_PATH_NOT_ABSOLUTE' });
      await assert.rejects(readVerifiedInstallerDependencyBinding(request(f.receipt)), { code: 'INSTALLER_BINARY_PATH_NOT_ABSOLUTE' });
    });
    assert.equal(fs.existsSync(marker), false, 'PATH-planted installer must not run');
    await withEnv({ XIIO_INSTALLER_BIN: f.script }, async () => {
      assert.equal(resolveInstallerBinary(), f.script);
    });
  } finally {
    process.env.PATH = priorPath;
    fs.rmSync(marker, { force: true });
  }
});

test('module whose bytes do not match the receipt digest is refused and its code never runs', async (t) => {
  const probe = 'xiioTrustProbe';
  const f = plantInstaller(t, { reportedSha: sha(GOOD) });
  fs.writeFileSync(f.target, `globalThis.${probe}=true;\n${GOOD}`);
  await withEnv({ XIIO_INSTALLER_BIN: f.script }, async () => {
    await assert.rejects(
      importVerifiedInstallerDependencyModule(request(f.receipt)),
      { code: 'INSTALLER_DEPENDENCY_MODULE_DIGEST_MISMATCH' },
    );
  });
  assert.equal(globalThis[probe], undefined, 'tampered module code must not execute');
});

test('the bytes that were verified are the bytes that run, even if the path is swapped afterwards', async (t) => {
  const f = plantInstaller(t, { reportedSha: sha(GOOD) });
  const verified = await readVerifiedModuleBytes(f.target, sha(GOOD));
  fs.writeFileSync(f.target, 'export const value = "swapped";\n');
  const mod = await import(`data:text/javascript;base64,${verified.toString('base64')}`);
  assert.equal(mod.value, 'verified');
});

test('an untampered module imports and returns the verified export', async (t) => {
  const f = plantInstaller(t, { reportedSha: sha(GOOD) });
  await withEnv({ XIIO_INSTALLER_BIN: f.script }, async () => {
    const result = await importVerifiedInstallerDependencyModule(request(f.receipt));
    assert.equal(result.module.value, 'verified');
    assert.equal(result.module_sha256, sha(GOOD));
  });
});
