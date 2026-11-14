/**
 * Read-only Cube quorum operator surface (afg-19).
 * Hard: OLLAMA_VOTE != WARD_ADMIT · SECOND_COUNCIL_DB != CUBE · COUNCIL_PASS != RUNTIME_PASS
 */
import fs from 'node:fs';
import path from 'node:path';
import { evaluateAgentResponseRealization } from '../evaluation/tool-verb-fidelity.mjs';

export function resolveCubeRoot(flags = {}, env = process.env) {
  // A white-label installation has no implicit user, product or volume name.
  const project = String(flags.project || '').trim();
  if (project && (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(project) || project === '..')) return null;
  const configured = flags.cube || env.XIIO_CUBE_ROOT;
  if (!configured || !String(configured).trim()) return null;
  const root = path.resolve(String(configured));
  // An explicit --cube identifies the selected Cube, not a parent folder.
  return project && !flags.cube ? path.join(root, project) : root;
}

function cubeRootFailure(cubeRoot, flags = {}) {
  if (flags.project && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(String(flags.project))) return 'CUBE_PROJECT_REF_INVALID';
  if (!cubeRoot) return 'CUBE_ROOT_UNCONFIGURED';
  try { if (fs.statSync(cubeRoot).isDirectory()) return null; } catch { /* unavailable */ }
  return 'CUBE_ROOT_NOT_FOUND';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function regularFile(filePath) {
  try { const stat = fs.lstatSync(filePath); return stat.isFile() && !stat.isSymbolicLink(); }
  catch { return false; }
}

function listBugsLedgers(cubeRoot) {
  if (!cubeRoot || !fs.existsSync(cubeRoot)) return [];
  return fs.readdirSync(cubeRoot)
    .filter((n) => /^CUBE\.bugs\..*\.json$/i.test(n))
    .filter((n) => regularFile(path.join(cubeRoot, n)))
    .sort()
    .map((n) => path.join(cubeRoot, n));
}

function findBusinessRecord(cubeRoot) {
  if (!cubeRoot || !fs.existsSync(cubeRoot)) return null;
  const entries = fs.readdirSync(cubeRoot)
    .filter((n) => /^CUBE\.business-record\..*\.json$/i.test(n))
    .filter((n) => regularFile(path.join(cubeRoot, n)));
  // Without an explicit ledger binding multiple business records are ambiguous.
  return entries.length === 1 ? path.join(cubeRoot, entries[0]) : null;
}

function loadBugs(cubeRoot) {
  const ledgers = listBugsLedgers(cubeRoot);
  if (!ledgers.length) {
    return { ledgerPath: null, bugs: [], business_record: findBusinessRecord(cubeRoot), ledgers: [] };
  }
  const byId = new Map();
  let primary = null;
  for (const ledgerPath of ledgers) {
    const ledger = readJson(ledgerPath);
    if (!primary) primary = { ledgerPath, ledger };
    for (const bug of Array.isArray(ledger.bugs) ? ledger.bugs : []) {
      if (!bug?.bug_uuid) continue;
      if (!byId.has(bug.bug_uuid)) byId.set(bug.bug_uuid, bug);
    }
  }
  return {
    ledgerPath: primary.ledgerPath,
    ledgers,
    bugs: [...byId.values()],
    business_record: primary.ledger.business_record || findBusinessRecord(cubeRoot),
    ledger: primary.ledger,
  };
}

function bugById(bugs, id) {
  const needle = String(id || '').trim();
  return bugs.find((b) => b.bug_uuid === needle || String(b.n) === needle) || null;
}

export function quorumStatus({ flags = {} } = {}) {
  const cubeRoot = resolveCubeRoot(flags);
  const rootRed = cubeRootFailure(cubeRoot, flags);
  const { ledgerPath, bugs, business_record } = loadBugs(cubeRoot);
  const recordPath = business_record && path.isAbsolute(String(business_record))
    ? business_record
    : business_record
      ? path.join(cubeRoot, business_record)
      : findBusinessRecord(cubeRoot);
  const recordRelative = recordPath && cubeRoot ? path.relative(cubeRoot, recordPath) : null;
  const recordEscapes = recordRelative !== null && (recordRelative === '..' || recordRelative.startsWith(`..${path.sep}`) || path.isAbsolute(recordRelative));
  const recordUnreadable = Boolean(recordPath && !recordEscapes && !regularFile(recordPath));
  let record = null;
  if (recordPath && !recordEscapes && regularFile(recordPath)) record = readJson(recordPath);
  const open = bugs.filter((b) => b.state === 'OPEN' || b.state === 'IN_PROGRESS').length;
  return Object.freeze({
    schema: 'xiio.cli.quorum.status/v1',
    state: !rootRed && ledgerPath && !recordEscapes && !recordUnreadable ? 'PASS' : 'TRUE_WAIT',
    first_red: rootRed || (recordEscapes ? 'CUBE_BUSINESS_RECORD_OUTSIDE_ROOT' : recordUnreadable ? 'CUBE_BUSINESS_RECORD_UNREADABLE' : ledgerPath ? null : 'CUBE_BUGS_LEDGER_ABSENT'),
    project: flags.project || record?.project || null,
    cube_root: cubeRoot,
    bugs_ledger: ledgerPath,
    business_record: recordEscapes || recordUnreadable ? null : recordPath,
    monetization: record?.monetization || null,
    bug_count: bugs.length,
    bugs_open: open,
    denominator_100s: record?.denominator_100s || null,
    effect_authority: 0,
    authority_granted: false,
    hard: [
      'SECOND_COUNCIL_DB != CUBE',
      'DATAFORGE_UI_CLAIM != WORKSPACE_CUBE_ABSENT',
      'OLLAMA_VOTE != WARD_ADMIT',
    ],
  });
}

export function quorumBugs({ flags = {} } = {}) {
  const cubeRoot = resolveCubeRoot(flags);
  const rootRed = cubeRootFailure(cubeRoot, flags);
  const { ledgerPath, bugs } = loadBugs(cubeRoot);
  return Object.freeze({
    schema: 'xiio.cli.quorum.bugs/v1',
    state: !rootRed && ledgerPath ? 'PASS' : 'TRUE_WAIT',
    first_red: rootRed || (ledgerPath ? null : 'CUBE_BUGS_LEDGER_ABSENT'),
    cube_root: cubeRoot,
    bugs_ledger: ledgerPath,
    bugs: bugs.map((b) => Object.freeze({
      bug_uuid: b.bug_uuid,
      n: b.n,
      title: b.title,
      state: b.state,
      first_red: b.first_red,
      deliverable: b.deliverable,
    })),
    effect_authority: 0,
    authority_granted: false,
  });
}

export function quorumVotes({ bugId, flags = {} } = {}) {
  const cubeRoot = resolveCubeRoot(flags);
  const rootRed = cubeRootFailure(cubeRoot, flags);
  const { ledgerPath, bugs } = loadBugs(cubeRoot);
  const bug = bugById(bugs, bugId);
  if (!bug) {
    return Object.freeze({
      schema: 'xiio.cli.quorum.votes/v1',
      state: 'TRUE_WAIT',
      first_red: rootRed || 'BUG_UUID_NOT_FOUND',
      bug_uuid: bugId || null,
      cube_root: cubeRoot,
      bugs_ledger: ledgerPath,
      effect_authority: 0,
    });
  }
  const votes = Array.isArray(bug.votes) ? bug.votes : [];
  const admitted = votes.filter((v) => v.gate_pass === true);
  return Object.freeze({
    schema: 'xiio.cli.quorum.votes/v1',
    state: 'PASS',
    bug_uuid: bug.bug_uuid,
    title: bug.title,
    first_red: bug.first_red,
    missing_evidence: bug.missing_evidence || [],
    votes: admitted,
    votes_raw_count: votes.length,
    votes_admitted_count: admitted.length,
    dissent: votes.filter((v) => v.gate_pass === false || v.disposition === 'DISSENT'),
    effect_authority: 0,
    hard: ['CLAIMED_MEASUREMENT != NATIVE_CALL', 'GATE_SIMULATION_RESULT != NATIVE_CALL'],
  });
}

/**
 * Local review: assessment text is gated. Without --assessment, returns the
 * prompt shape only (no invented Ollama call). With --assessment, gate then
 * refuse ledger mutation even if --write is requested without Ward admission.
 */
export function quorumReview({ bugId, flags = {}, assessmentText = null } = {}) {
  const cubeRoot = resolveCubeRoot(flags);
  const rootRed = cubeRootFailure(cubeRoot, flags);
  const { bugs } = loadBugs(cubeRoot);
  const bug = bugById(bugs, bugId);
  if (!bug) {
    return Object.freeze({
      schema: 'xiio.cli.quorum.review/v1',
      state: 'TRUE_WAIT',
      first_red: rootRed || 'BUG_UUID_NOT_FOUND',
      bug_uuid: bugId || null,
      effect_authority: 0,
    });
  }
  const local = Boolean(flags.local);
  if (!local) {
    return Object.freeze({
      schema: 'xiio.cli.quorum.review/v1',
      state: 'TRUE_WAIT',
      first_red: 'REVIEW_REQUIRES_LOCAL_FLAG',
      next: 'xi-io quorum review <bug-uuid> --local [--assessment <file>]',
      bug_uuid: bug.bug_uuid,
      effect_authority: 0,
    });
  }

  let text = assessmentText;
  if (!text && flags.assessment) {
    text = fs.readFileSync(path.resolve(String(flags.assessment)), 'utf8');
  }

  if (!text) {
    return Object.freeze({
      schema: 'xiio.cli.quorum.review/v1',
      state: 'PASS',
      mode: 'PROMPT_ONLY',
      bug_uuid: bug.bug_uuid,
      title: bug.title,
      deliverable: bug.deliverable,
      evidence: bug.evidence || [],
      missing_evidence: bug.missing_evidence || [],
      first_red: bug.first_red,
      ollama_hint: 'Pass --assessment <file> with model output; gate runs before any vote counts.',
      effect_authority: 0,
      hard: ['OLLAMA_VOTE != WARD_ADMIT', 'CLAIMED_GO != ADMITTED_GO'],
    });
  }

  const gate = evaluateAgentResponseRealization({
    responseText: text,
    observedToolCalls: [],
    availableToolNames: ['read_workspace_text_file', 'edit_workspace_text_file', 'run_workspace_command'],
    issuedPolicyReasons: [],
  });

  const vote = {
    at: new Date().toISOString(),
    seat: 'local-ollama',
    gate_pass: gate.pass === true,
    gate_blockers: gate.blockers || [],
    disposition: gate.pass ? 'ASSESSMENT_ADMITTED_FOR_HUMAN' : 'REJECTED_BY_GATE',
    note: gate.pass
      ? 'Text cleared realization gate; not a Ward admit and not RUNTIME_PASS.'
      : 'Assessment blocked — not counted as a council vote.',
  };

  // Passing the response-realization gate is not a Ward lease. This SDK
  // surface cannot grant a consequential ledger write, even when --write is set.
  const writeRefused = Boolean(flags.write);
  return Object.freeze({
    schema: 'xiio.cli.quorum.review/v1',
    state: gate.pass && !writeRefused ? 'PASS' : 'BLOCKED',
    first_red: writeRefused ? 'WARD_LEDGER_WRITE_ADMISSION_REQUIRED' : gate.pass ? null : 'ASSESSMENT_GATE_REJECTED',
    mode: 'GATED_ASSESSMENT',
    bug_uuid: bug.bug_uuid,
    gate,
    vote,
    wrote_to_ledger: false,
    effect_authority: 0,
    authority_granted: false,
    hard: [
      'OLLAMA_VOTE != WARD_ADMIT',
      'COUNCIL_PASS != RUNTIME_PASS',
      'CLAIMED_MEASUREMENT != NATIVE_CALL',
    ],
  });
}

export function quorumDispatchDryRun({ bugId, flags = {} } = {}) {
  const cubeRoot = resolveCubeRoot(flags);
  const rootRed = cubeRootFailure(cubeRoot, flags);
  const { bugs } = loadBugs(cubeRoot);
  const bug = bugById(bugs, bugId);
  if (!bug) {
    return Object.freeze({
      schema: 'xiio.cli.quorum.dispatch/v1',
      state: 'TRUE_WAIT',
      first_red: rootRed || 'BUG_UUID_NOT_FOUND',
      effect_authority: 0,
    });
  }
  return Object.freeze({
    schema: 'xiio.cli.quorum.dispatch/v1',
    state: 'PASS',
    mode: 'DRY_RUN',
    bug_uuid: bug.bug_uuid,
    title: bug.title,
    reaper_plan: {
      select: bug.deliverable,
      depends_on: bug.missing_evidence || [],
      first_red: bug.first_red,
    },
    ward_admission: {
      owed: true,
      effect_authority: 0,
      note: 'No Git/runtime mutation. Ward must admit before execute.',
    },
    effect_authority: 0,
    hard: ['OLLAMA != EFFECT_AUTHORITY', 'DISPATCH_DRY_RUN != EXECUTE'],
  });
}

export function quorumReturnObserve({ workUuid, flags = {} } = {}) {
  const cubeRoot = resolveCubeRoot(flags);
  const needle = String(workUuid || '').trim();
  const rootRed = cubeRootFailure(cubeRoot, flags);
  const candidates = rootRed ? [] : fs.readdirSync(cubeRoot)
    .filter((n) => /RETURN|READBACK|PROOF/i.test(n) && n.endsWith('.json'))
    .filter((n) => regularFile(path.join(cubeRoot, n)))
    .filter((n) => !needle || n.includes(needle) || fs.readFileSync(path.join(cubeRoot, n), 'utf8').includes(needle))
    .slice(0, 32);
  return Object.freeze({
    schema: 'xiio.cli.quorum.return/v1',
    state: candidates.length ? 'PASS' : 'TRUE_WAIT',
    first_red: rootRed || (candidates.length ? null : 'RETURN_RECEIPT_NOT_FOUND'),
    work_uuid: needle || null,
    cube_root: cubeRoot,
    receipts: candidates.map((n) => path.join(cubeRoot, n)),
    effect_authority: 0,
    hard: ['COUNCIL_PASS != RUNTIME_PASS', 'OLLAMA != EFFECT_AUTHORITY'],
  });
}

export async function runQuorumCli({ action, target, flags = {} } = {}) {
  const a = String(action || 'status').toLowerCase();
  if (a === 'status') return quorumStatus({ flags });
  if (a === 'bugs') return quorumBugs({ flags });
  if (a === 'votes') return quorumVotes({ bugId: target, flags });
  if (a === 'review') return quorumReview({ bugId: target, flags });
  if (a === 'dispatch') {
    if (!flags['dry-run'] && !flags.dryRun) {
      return Object.freeze({
        schema: 'xiio.cli.quorum.dispatch/v1',
        state: 'BLOCKED',
        first_red: 'DISPATCH_REQUIRES_DRY_RUN',
        next: 'xi-io quorum dispatch <bug-uuid> --dry-run',
        effect_authority: 0,
      });
    }
    return quorumDispatchDryRun({ bugId: target, flags });
  }
  if (a === 'return') return quorumReturnObserve({ workUuid: target, flags });
  return Object.freeze({
    schema: 'xiio.cli.quorum/v1',
    state: 'BLOCKED',
    first_red: 'UNKNOWN_QUORUM_ACTION',
    action: a,
    next: 'xi-io quorum status|bugs|review|votes|dispatch|return',
    effect_authority: 0,
  });
}
