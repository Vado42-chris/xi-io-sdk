// xi-io kernel maths (claim ids KM1..KM16, distinct from osforgeKernel K01..K13): the owner's kernel rules as executable, falsifiable functions.
// Independent JavaScript implementation of scripts/kernel_maths.py (written separately,
// not translated line by line), so the two can cross-check each other.
// Rules not yet defined by the owner (light/sound/time, rotation, containment/decay,
// pi vs phi roles) are deliberately absent.
import crypto from 'node:crypto';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

/** KM1: the 1..9 -> 0 cycle with carry. Digits least-significant first. */
export const CYCLE = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
export function stepCycle(digits) {
  const out = [...digits];
  for (let i = 0; i < out.length; i++) {
    const next = CYCLE[(CYCLE.indexOf(out[i]) + 1) % CYCLE.length];
    out[i] = next;
    if (next !== 0) return out;            // no carry: this scale absorbed the step
  }
  out.push(1);                             // every scale closed: a new scale opens with one 1
  return out;
}
export const cycleValue = (digits) => Number([...digits].reverse().join(''));

/** KM2/K12: the ten cell positions and the nine seams between them (as exact halves). */
export const CELLS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
export const SEAMS_X2 = Object.freeze([3, 5, 7, 9, 11, 13, 15, 17, 19]); // seam k+0.5 stored as 2k+1
export const centroidX2 = (cells = CELLS) => (2 * cells.reduce((a, b) => a + b, 0)) / cells.length;

/** KM4/K6: seams on an n-plane and an n-cube: [paired (two-sided), open (one-sided)]. */
export const planeSeams = (n) => [2 * n * (n - 1), 4 * n];
export const cubeSeams = (n) => [3 * n * n * (n - 1), 6 * n * n];
export function enumerateSeams(n, dims) {
  let paired = 0, open = 0;
  const total = n ** dims;
  for (let idx = 0; idx < total; idx++) {
    const c = Array.from({ length: dims }, (_, d) => Math.floor(idx / n ** d) % n);
    for (let d = 0; d < dims; d++) for (const s of [-1, 1]) {
      const v = c[d] + s;
      if (v >= 0 && v < n) paired++; else open++;
    }
  }
  return [paired / 2, open];
}
/** KM7: sizes where paired seams equal open seams. */
export const balancePoints = (fn, max) => Array.from({ length: max }, (_, i) => i + 1).filter((n) => fn(n)[0] === fn(n)[1]);

/** KM10: lineage survives reconstruction; instance identity carries the generation. */
export const lineageId = (template, coord) => sha256(`lineage|${template}|${canon(coord)}`);
export const instanceId = (template, coord, gen) => sha256(`instance|${lineageId(template, coord)}|${gen}`);

/** KM12: a seam's identity is derived from both cells and their generations, order-free. */
export function seamId(a, b) {
  const [lo, hi] = [a, b].map((x) => `${x.cell}@${x.gen}`).sort();
  return sha256(`seam|${lo}|${hi}`);
}

/** KM13: the 5.5 crossing barrier. Tolerance is fixed at 0 and cannot be widened. */
export const CROSSING_TOLERANCE = 0;
/** KM17: admission refuses malformed evidence before any comparison. */
export function isWellFormed(x) {
  return typeof x?.cube === 'string' && x.cube.trim() !== ''
    && Number.isInteger(x.gen) && typeof x.gen === 'number' && x.gen >= 0
    && typeof x.digest === 'string' && x.digest !== ''
    && typeof x.boundary === 'boolean';
}
export function crossing(a, b, { tolerance = CROSSING_TOLERANCE } = {}) {
  if (tolerance !== CROSSING_TOLERANCE) return 'REFUSED_TOLERANCE_WIDENED';
  if (!a || !b) return 'NO_EFFECT_WAITING';
  if (!(isWellFormed(a) && isWellFormed(b))) return 'REFUSED_MALFORMED';
  if (a.cube !== b.cube) return 'NO_EFFECT_IDENTITY';
  if (Math.abs(a.gen - b.gen) > tolerance) return 'NO_EFFECT_MISFIRE';
  if (a.digest !== b.digest) return 'NO_EFFECT_EVIDENCE';
  if (!(a.boundary === true && b.boundary === true)) return 'NO_EFFECT_BOUNDARY';
  return 'CROSSING_EVENT';
}

/** KM14: only information crosses. Authority and process never enter the stream. */
const stateDigest = (coord, gen, state) => sha256(canon([coord, gen, state]));
export function encodeForStream(cube) {
  const { template, coord, gen, state } = cube;
  return { template, coord, gen, state, digest: stateDigest(coord, gen, state) };
}
export function decodeFromStream(template, payload) {
  if (Object.prototype.hasOwnProperty.call(payload, 'authority')) return { state: 'REFUSED_AUTHORITY_IN_STREAM' };
  if (payload.template !== template) return { state: 'REFUSED_TEMPLATE' };
  if (stateDigest(payload.coord, payload.gen, payload.state) !== payload.digest) return { state: 'REFUSED_DIGEST' };
  return { state: 'VERIFIED', cube: { template, coord: payload.coord, gen: payload.gen, state: payload.state } };
}

/** KM15/K16: a parent is the conjunction of its children; a stack is one unit one scale up. */
export const conjunction = (atoms) => atoms.length > 0 && atoms.every((x) => x === true);
export function stack(children) {
  const ok = children.length > 0 && children.every((c) => c.state === 'PASS' && Boolean(c.evidence));
  const ids = children.map((c) => `${c.id}@${c.gen}`).sort();
  return {
    id: sha256(`stack|${ids.join(',')}`).slice(0, 16),
    gen: 1,
    scale: Math.max(...children.map((c) => c.scale)) + 1,
    state: ok ? 'PASS' : 'RED',
    children: children.length,
    evidence: ok ? ids : null,
  };
}

/** KM18: stage position is relative to the observing frame (translation mod 10); identity is not. */
export const relativePosition = (position, observerOffset) => (((position + observerOffset) % 10) + 10) % 10;
/** KM19: the doubling projection, 2n mod 10. */
export const doubling = (n) => (2 * n) % 10;
/** KM20: a closed loop of translations returns home only if the offsets cancel. */
export const closesLoop = (offsets) => offsets.reduce((a, b) => a + b, 0) % 10 === 0;
/** KM21: independent passes are distinct (direction, observer, evidence) triples. */
export const independentPasses = (passes) => new Set(passes.map((p) => `${p.direction}|${p.observer}|${p.digest}`)).size;
