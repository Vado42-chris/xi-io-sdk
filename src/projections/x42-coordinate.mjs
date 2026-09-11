export const X42_COORDINATE_SCHEMA = 'xiio.x42.coordinate-projection/v0.1';

export class CoordinateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CoordinateError';
    this.code = code;
  }
}

const IDENT = /[A-Za-z0-9_./:-]/;
const NUMBER = /[0-9.]/;

export function parseX42Coordinate(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new CoordinateError('COORDINATE_REQUIRED');
  let i = 0;
  const out = {
    schema: X42_COORDINATE_SCHEMA,
    raw,
    counts: { reap: 0, sow: 0, unknown: 0, blocked: 0, gain: 0, cost: 0 },
    principals: [], multipliers: [], axes: [], constraints: [], money: [], ratios: [],
    invariants: [], categories: [], generations: [], synthetic: [], operators: [],
    authority_granted: false,
  };

  const readIdent = () => {
    const start = i;
    while (i < raw.length && IDENT.test(raw[i])) i += 1;
    if (start === i) throw new CoordinateError('IDENTIFIER_REQUIRED');
    return raw.slice(start, i);
  };
  const readUntil = (close) => {
    const start = i;
    while (i < raw.length && raw[i] !== close) i += 1;
    if (i >= raw.length) throw new CoordinateError(`UNCLOSED_${close}`);
    const value = raw.slice(start, i);
    i += 1;
    return value;
  };
  const readNumber = () => {
    const start = i;
    if (/[+-]/.test(raw[i] || '')) i += 1;
    while (i < raw.length && NUMBER.test(raw[i])) i += 1;
    const text = raw.slice(start, i);
    if (!text || text === '+' || text === '-') throw new CoordinateError('NUMBER_REQUIRED');
    const value = Number(text);
    if (!Number.isFinite(value)) throw new CoordinateError('NUMBER_INVALID');
    return value;
  };
  const optionalCount = (fallback = 1) => {
    const start = i;
    while (i < raw.length && /\d/.test(raw[i])) i += 1;
    return i > start ? Number(raw.slice(start, i)) : fallback;
  };
  const csv = (value) => value.split(',').map((part) => part.trim()).filter(Boolean);

  while (i < raw.length) {
    const ch = raw[i];
    if (/\s/.test(ch) || ch === '|') { i += 1; continue; }
    if (raw.startsWith('<<', i)) { i += 2; out.counts.reap += optionalCount(); continue; }
    if (raw.startsWith('>>', i)) { i += 2; out.counts.sow += optionalCount(); continue; }
    if (ch === '<' || ch === '>') throw new CoordinateError('UNMATCHED_TOPOLOGY_ARROW');
    if (ch === '?') { i += 1; out.counts.unknown += optionalCount(); continue; }
    if (ch === 'x') { i += 1; out.counts.blocked += optionalCount(); continue; }
    if (ch === '+') { i += 1; out.counts.gain += optionalCount(); continue; }
    if (ch === '-') { i += 1; out.counts.cost += optionalCount(); continue; }
    if (ch === '@') { i += 1; out.principals.push(readIdent()); continue; }
    if (ch === '*') { i += 1; const value = optionalCount(0); if (value <= 0) throw new CoordinateError('MULTIPLIER_POSITIVE_REQUIRED'); out.multipliers.push(value); continue; }
    if (ch === '[') { i += 1; const values = csv(readUntil(']')); if (!values.length) throw new CoordinateError('AXES_REQUIRED'); out.axes.push(values); continue; }
    if (ch === '{') {
      i += 1;
      const entries = csv(readUntil('}'));
      if (!entries.length) throw new CoordinateError('CONSTRAINTS_REQUIRED');
      const env = {};
      for (const entry of entries) {
        if (!entry.includes('=')) throw new CoordinateError('CONSTRAINT_BINDING_REQUIRED');
        const [keyRaw, ...rest] = entry.split('=');
        const key = keyRaw.trim(); const value = rest.join('=').trim();
        if (!key || !value) throw new CoordinateError('CONSTRAINT_BINDING_REQUIRED');
        if (Object.hasOwn(env, key)) throw new CoordinateError('DUPLICATE_CONSTRAINT_KEY');
        env[key] = value;
      }
      out.constraints.push(env); continue;
    }
    if (ch === '$') { i += 1; out.money.push(readNumber()); continue; }
    if (ch === '%') {
      i += 1;
      const start = i; while (i < raw.length && /\d/.test(raw[i])) i += 1;
      if (start === i || raw[i] !== '/') throw new CoordinateError('RATIO_DENOMINATOR_REQUIRED');
      const numerator = Number(raw.slice(start, i)); i += 1;
      const dStart = i; while (i < raw.length && /\d/.test(raw[i])) i += 1;
      if (dStart === i) throw new CoordinateError('RATIO_DENOMINATOR_REQUIRED');
      const denominator = Number(raw.slice(dStart, i));
      if (denominator <= 0 || numerator < 0 || numerator > denominator) throw new CoordinateError('RATIO_BOUNDS_INVALID');
      out.ratios.push({ numerator, denominator, value: numerator / denominator }); continue;
    }
    if (ch === '!') { i += 1; out.invariants.push(readIdent()); continue; }
    if (ch === '#') { i += 1; out.categories.push(readIdent()); continue; }
    if (ch === '^') { i += 1; out.generations.push(readIdent()); continue; }
    if (ch === '~') { i += 1; out.synthetic.push(readIdent()); continue; }
    if (ch === '&' || ch === '=') { out.operators.push(ch); i += 1; continue; }
    throw new CoordinateError(`UNKNOWN_TOKEN:${ch}@${i}`);
  }

  out.net_delta = out.counts.gain - out.counts.cost;
  out.topology_delta = out.counts.sow - out.counts.reap;
  return Object.freeze(out);
}

export function qualifyX42Coordinate(parsed, evidence = {}) {
  const blockers = [];
  const notices = [];
  let moneyQualified = false;
  let closureQualified = false;

  if (parsed.money?.length) {
    if (evidence.money_observed === true && Array.isArray(evidence.money_evidence_refs) && evidence.money_evidence_refs.length) moneyQualified = true;
    else blockers.push('MONEY_UNOBSERVED');
  }
  if (parsed.ratios?.length) {
    if (evidence.closure_contract_satisfied === true && Array.isArray(evidence.closure_evidence_refs) && evidence.closure_evidence_refs.length) closureQualified = true;
    else notices.push('RATIO_IS_COVERAGE_NOT_CLOSURE');
  }
  if (parsed.principals?.length) notices.push('PRINCIPAL_LABEL_NOT_AUTHORITY');
  if (parsed.multipliers?.length) notices.push('MULTIPLICITY_NOT_USEFUL_CAPACITY');
  if (parsed.synthetic?.length) notices.push('SYNTHETIC_NOT_OBSERVED');
  if (parsed.counts?.reap) notices.push('REAP_COUNT_NOT_RETURN_APPLY_RETURN_PROOF');
  if (parsed.counts?.sow) notices.push('SOW_COUNT_NOT_ADMITTED_WORK');

  return Object.freeze({
    schema: 'xiio.x42.coordinate-qualification/v0.1',
    status: blockers.length ? 'BLOCKED' : 'PROJECTED',
    blockers, notices,
    money_qualified: moneyQualified,
    closure_qualified: closureQualified,
    authority_granted: false,
    live_granted: false,
    work_admitted: false,
    return_proven: false,
  });
}
