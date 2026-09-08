#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { compilePortfolioBaseline, compileDistributedAcks, compileOrgBurnMap } from '../src/baseline/compiler.mjs';
import { normalizeBaselineCommand, commandCatalog } from '../src/lexicon/baseline-commands.mjs';
import { validateDistributedAck } from '../src/acks/distributed.mjs';
import { compileLessonPromotion } from '../src/lessons/promotion.mjs';

function usage(code = 0) {
  const text = `xi-io SDK CLI\n\nPure compilers:\n  xi baseline compile --input <snapshot.json> [--out <baseline.json>]\n  xi ack distribute --baseline <baseline.json> [--out <acks.json>]\n  xi ack validate --input <ack.json> [--out <validation.json>]\n  xi burnmap compile --baseline <baseline.json> [--returns <returns.json>] [--out <burnmap.json>]\n  xi lesson promote --input <lesson.json> [--out <promotion.json>]\n\nProvider-neutral Ibal command envelopes:\n  xi baseline census [--subject <ref>]\n  xi baseline classify [--subject <ref>]\n  xi baseline hydrate [--subject <ref>]\n  xi baseline qualify [--subject <ref>]\n  xi baseline main [--subject <ref>]\n  xi baseline destew [--subject <ref>]\n  xi baseline sdk [--subject <ref>]\n  xi baseline score [--subject <ref>]\n  xi baseline burn [--subject <ref>]\n  xi baseline return [--subject <ref>]\n  xi baseline ratchet [--subject <ref>]\n\nCatalog:\n  xi lexicon commands\n\nThe SDK never discovers accounts, calls AI providers, delivers ACKs, mutates repositories, grants authority, merges, deploys, or claims runtime currentness. Host Ibal/framework adapters consume command envelopes and return receipts.\n`;
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

function compileBaselineCommandEnvelope(command, flags, trailingPositionals = []) {
  return {
    schema: 'xiio.sdk.baseline-command-envelope/v1',
    command: { id: command.id, verb: command.verb, cli: command.cli, aliases: command.aliases, hashtags: command.hashtags, effect_class: command.effect },
    subject_ref: flags.subject || null,
    baseline_ref: flags.baseline || null,
    resource_ref: flags.resource || null,
    capability_profile_ref: flags.capability || null,
    provider_family: flags.provider || 'ANY_QUALIFIED',
    agent_ref: flags.agent || null,
    args: trailingPositionals,
    state: 'COMPILED_NOT_EXECUTED',
    attempt: 0,
    authority: { source_mutation: false, provider_effect: false, merge: false, deploy: false },
    required_return: {
      schema: 'xiio.sdk.distributed-return/v1',
      fields: ['subject_ref', 'baseline_generation', 'ack_state', 'attempt', 'result_ref', 'return_target_ref', 'blockers', 'observed_at'],
    },
    next: 'IBAL_OR_QUALIFIED_HOST_ADAPTER_RESOLVES_CURRENT_INPUTS_AND_WORKER_FORMATION',
  };
}

try {
  const { flags, positionals } = args(process.argv.slice(2));
  if (positionals.length < 2) usage(1);
  const [family, action, ...rest] = positionals;

  if (family === 'baseline' && action === 'compile') {
    writeOutput(compilePortfolioBaseline(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'baseline') {
    const command = normalizeBaselineCommand(action);
    if (!command.verb || command.verb === 'compile') usage(1);
    writeOutput(compileBaselineCommandEnvelope(command, flags, rest), flags.out);
  } else if (family === 'ack' && action === 'distribute') {
    writeOutput(compileDistributedAcks(readJson(flags.baseline, '--baseline')), flags.out);
  } else if (family === 'ack' && action === 'validate') {
    const envelope = readJson(flags.input, '--input');
    writeOutput({ schema: 'xiio.sdk.distributed-ack-validation/v1', ...validateDistributedAck(envelope) }, flags.out);
  } else if (family === 'burnmap' && action === 'compile') {
    const baseline = readJson(flags.baseline, '--baseline');
    const returns = flags.returns ? readJson(flags.returns, '--returns') : [];
    writeOutput(compileOrgBurnMap(baseline, returns), flags.out);
  } else if (family === 'lesson' && action === 'promote') {
    writeOutput(compileLessonPromotion(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'lexicon' && action === 'commands') {
    writeOutput(commandCatalog(), flags.out);
  } else usage(1);
} catch (error) {
  process.stderr.write(`xi: ${error.message}\n`);
  process.exit(2);
}
