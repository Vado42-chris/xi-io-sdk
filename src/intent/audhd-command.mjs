import crypto from 'node:crypto';

export const AUDHD_INTENT_SCHEMA = 'xiio.audhd-intent-projection/v1';
export const AUDHD_COMMAND_POLICY_SCHEMA = 'xiio.audhd-command-policy/v1';

const INTENSIFIER_WORDS = new Set([
  'fuck','fucking','fucked','fucker','fuckers','fuckin','fucks',
  'shit','shitty','damn','goddamn','goddammit','bloody',
]);

const WRITE_ACTIONS = new Set([
  'write','writing','edit','editing','change','changing','modify','modifying',
  'patch','patching','fix','fixing','update','updating','create','creating',
  'add','adding','delete','deleting','remove','removing','implement','implementing',
  'wire','wiring',
]);

const TERMINAL_ACTIONS = new Set([
  'run','running','execute','executing','execution','test','testing','build','building',
  'deploy','deploying','deployment','install','installing','lint','linting','check','checking',
  'commit','committing','checkout','fetch','fetching','pull','pulling','start','starting',
  'restart','restarting','smoke','simulate','simulating','simulation','verify','verifying',
  'verification','scan','scanning',
]);

const NEGATION_TOKENS = new Set([
  'not','never',"don't",'dont',"can't",'cant','cannot','without',
]);

const COMMAND_PREFIX = /^(?:@\w+\s+|#\w[\w-]*\s+|[+!#@][\w-]+\s*)*/i;

function stableRef(raw) {
  return `audhd-intent:${crypto.createHash('sha256').update(raw).digest('hex').slice(0,24)}`;
}

function normalizeApostrophes(value) {
  return String(value || '').replace(/[’‘]/g, "'");
}

function tokenize(value) {
  return normalizeApostrophes(value).toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [];
}

function policyTokens(tokens) {
  return tokens.filter((token) => !INTENSIFIER_WORDS.has(token));
}

function isWordChar(ch) {
  return typeof ch === 'string' && /^[\p{L}\p{N}]$/u.test(ch);
}

function splitProtected(text) {
  const parts = [];
  let current = '';
  let quote = null;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { current += ch; escaped = true; continue; }
    if (quote) {
      current += ch;
      if (ch === quote) { parts.push({ protected:true, text:current }); current=''; quote=null; }
      continue;
    }
    if (ch === "'" && isWordChar(text[i - 1]) && isWordChar(text[i + 1])) {
      current += ch;
      continue;
    }
    if (ch === '`' || ch === '"' || ch === "'") {
      if (current) parts.push({ protected:false, text:current });
      current = ch; quote = ch; continue;
    }
    current += ch;
  }
  if (current) parts.push({ protected:Boolean(quote), text:current });
  return parts;
}

function stripIntensityFromUnprotected(text) {
  const tokens = text.split(/(\s+|[^\p{L}\p{N}_@#+!:=/.-]+)/u);
  const removed = [];
  const kept = tokens.map((token) => {
    const key = token.toLowerCase();
    if (INTENSIFIER_WORDS.has(key)) { removed.push(token); return ''; }
    return token;
  }).join('');
  return { text: kept.replace(/[ \t]{2,}/g,' ').replace(/\s+([,.;:!?])/g,'$1'), removed };
}

function semanticLine(line) {
  const protectedParts = splitProtected(line);
  const removed = [];
  const normalized = protectedParts.map((part) => {
    if (part.protected) return part.text;
    const out = stripIntensityFromUnprotected(part.text);
    removed.push(...out.removed);
    return out.text;
  }).join('').replace(/[ \t]{2,}/g,' ').trim();
  return { normalized, removed };
}

function canonicalKey(line) {
  return line.toLowerCase().replace(/[^a-z0-9@#+!:=/.-]+/g,' ').replace(/\s+/g,' ').trim();
}

function classifyLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return 'EMPTY';
  if (/\b(?:not done|not complete|still red|still blocked|=\s*no|=\s*not|live\s*=\s*no)\b/i.test(trimmed)) return 'STATE_ASSERTION';
  if (/^(?:hard|invariant|truth)\s*[:=]/i.test(trimmed)) return 'INVARIANT';
  if (/^(?:no|do not|don't|never)\b/i.test(trimmed)) return 'NEGATIVE_DIRECTIVE';
  const withoutTags = trimmed.replace(COMMAND_PREFIX,'').trim();
  if (/^(?:use|fix|run|execute|rebase|re-onboard|onboard|simulate|compile|project|return|reap|apply|promote|deploy|keep|continue|fill|find|check|read|distribute|filter|prove|get|reduce|batch|plan|bind|consume|rejoin|mirror|pull|merge)\b/i.test(withoutTags)) return 'DIRECTIVE';
  return 'CONTEXT';
}

export function normalizeAudhdIntent(rawInput, { userCorrections = {} } = {}) {
  const raw = String(rawInput ?? '');
  if (!raw.trim()) throw new Error('RAW_INPUT_REQUIRED');
  const lines = raw.split(/\r?\n/);
  const projected = [];
  const intensitySignals = [];
  const seen = new Set();

  for (const sourceLine of lines) {
    const { normalized, removed } = semanticLine(sourceLine);
    if (removed.length) intensitySignals.push({ source_line:sourceLine, tokens:removed });
    if (!normalized) continue;
    const correction = userCorrections[normalized] || userCorrections[sourceLine];
    const corrected = typeof correction === 'string' && correction.trim() ? correction.trim() : normalized;
    const kind = classifyLine(corrected);
    if (kind === 'EMPTY') continue;
    const key = `${kind}:${canonicalKey(corrected)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    projected.push({ kind, text:corrected, semantic_key:key });
  }

  const directives = projected.filter((row) => ['DIRECTIVE','NEGATIVE_DIRECTIVE'].includes(row.kind));
  const stateAssertions = projected.filter((row) => row.kind === 'STATE_ASSERTION');
  const invariants = projected.filter((row) => row.kind === 'INVARIANT');
  return {
    schema:AUDHD_INTENT_SCHEMA,
    raw_ref:stableRef(raw),
    raw_preserved:true,
    raw_text:raw,
    privacy_posture:'PRIVATE_BY_DEFAULT',
    intensity_is_context_not_authority:true,
    intensity_signals:intensitySignals,
    projected_lines:projected,
    directives,
    state_assertions:stateAssertions,
    invariants,
    duplicate_semantic_lines_removed: Math.max(0, lines.filter((line)=>line.trim()).length - projected.length),
    command_ready:directives.length > 0,
    hard:[
      'RAW_USER_LANGUAGE_PRESERVED',
      'INTENSITY!=COMMAND_AUTHORITY',
      'PROFANITY_AS_INTENSIFIER!=OPERAND',
      'USER_CORRECTION_OVERRIDES_PROJECTION',
      'STATE_ASSERTION!=EXECUTION_REQUEST',
    ],
  };
}

function splitClauses(value) {
  return normalizeApostrophes(value)
    .split(/(?:[\n;.!?]+|\bbut\b|\bhowever\b|\bthen\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function actionNegated(tokens, index) {
  const start = Math.max(0, index - 5);
  const prefix = policyTokens(tokens.slice(start, index));
  if (prefix.some((token) => NEGATION_TOKENS.has(token))) return true;
  for (let i = 0; i < prefix.length - 1; i += 1) {
    if (prefix[i] === 'do' && prefix[i + 1] === 'not') return true;
  }
  return false;
}

function classifyActions(text) {
  const result = { positiveWrite:0, negatedWrite:0, positiveTerminal:0, negatedTerminal:0 };
  for (const clause of splitClauses(text)) {
    const tokens = tokenize(clause);
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const negated = actionNegated(tokens, index);
      if (WRITE_ACTIONS.has(token)) result[negated ? 'negatedWrite' : 'positiveWrite'] += 1;
      if (TERMINAL_ACTIONS.has(token)) result[negated ? 'negatedTerminal' : 'positiveTerminal'] += 1;
    }
  }
  return result;
}

function blanketToolRestraint(text) {
  const normalized = policyTokens(tokenize(text)).join(' ');
  return /\b(?:do not|don't|dont|never) (?:use )?(?:any )?tools?\b/i.test(normalized)
    || /\bplan only\b/i.test(normalized)
    || /\bdo not execute\b/i.test(normalized)
    || /\bstop and wait for go\b/i.test(normalized);
}

export function compileCommandIntentProjection(userText, { workspaceIdentityState = 'bound' } = {}) {
  const raw = String(userText || '').trim();
  const intent = raw ? normalizeAudhdIntent(raw) : null;
  if (workspaceIdentityState !== 'bound') {
    return Object.freeze({ schema:AUDHD_COMMAND_POLICY_SCHEMA, allowWrite:false, allowTerminal:false, reason:'session_workspace_identity_unbound', intent });
  }
  if (blanketToolRestraint(raw)) {
    return Object.freeze({ schema:AUDHD_COMMAND_POLICY_SCHEMA, allowWrite:false, allowTerminal:false, reason:'user_blanket_restraint', intent });
  }
  const actions = classifyActions(raw);
  return Object.freeze({
    schema:AUDHD_COMMAND_POLICY_SCHEMA,
    allowWrite:actions.positiveWrite > 0,
    allowTerminal:actions.positiveTerminal > 0,
    reason:'current_turn_meaning_projection',
    intent,
    projection:Object.freeze({ rawPreserved:true, emphasisTokensAreAuthorityNeutral:true, scopedNegation:true, ...actions }),
  });
}
