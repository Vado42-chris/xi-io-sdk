#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { compilePortfolioBaseline, compileDistributedAcks, compileOrgBurnMap } from '../src/baseline/compiler.mjs';

function usage(code = 0) {
  const text = `xi-io SDK CLI\n\nCommands:\n  xi baseline compile --input <snapshot.json> [--out <baseline.json>]\n  xi ack distribute --baseline <baseline.json> [--out <acks.json>]\n  xi burnmap compile --baseline <baseline.json> [--returns <returns.json>] [--out <burnmap.json>]\n\nAll commands are projection-only. They do not mutate repositories, deliver ACKs, call AI providers, merge, or deploy.\n`;
  (code ? process.stderr : process.stdout).write(text);
  process.exit(code);
}

function args(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value.startsWith('--')) {
      const key = value.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`--${key} requires a value`);
      flags[key] = next;
      i += 1;
    } else positionals.push(value);
  }
  return { flags, positionals };
}

function readJson(file, label) {
  if (!file) throw new Error(`${label} path is required`);
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function writeOutput(value, out) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  if (!out || out === '-') process.stdout.write(payload);
  else fs.writeFileSync(path.resolve(out), payload, 'utf8');
}

try {
  const { flags, positionals } = args(process.argv.slice(2));
  if (positionals.length < 2) usage(1);
  const [family, action] = positionals;

  if (family === 'baseline' && action === 'compile') {
    writeOutput(compilePortfolioBaseline(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'ack' && action === 'distribute') {
    writeOutput(compileDistributedAcks(readJson(flags.baseline, '--baseline')), flags.out);
  } else if (family === 'burnmap' && action === 'compile') {
    const baseline = readJson(flags.baseline, '--baseline');
    const returns = flags.returns ? readJson(flags.returns, '--returns') : [];
    writeOutput(compileOrgBurnMap(baseline, returns), flags.out);
  } else usage(1);
} catch (error) {
  process.stderr.write(`xi: ${error.message}\n`);
  process.exit(2);
}
