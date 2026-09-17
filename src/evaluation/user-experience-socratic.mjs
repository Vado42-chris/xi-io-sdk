const BIT_KEYS = [
  'required_bit','material_bit','atomic_bit','template_found_bit','primitive_found_bit',
  'new_class_bit','user_choice_bit','expected_known_bit','expected_value_bit',
  'observed_known_bit','observed_value_bit',
];

function bounded(value, max = 512) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
}

function refList(value, max = 64) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((x) => bounded(x)))].sort().slice(0, max);
}

function bit(value, label) {
  if (value !== 0 && value !== 1) throw new TypeError(`${label} must be 0|1`);
  return value;
}

function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('question node must be an object');
  const question_id = raw.question_id;
  if (!bounded(question_id)) throw new TypeError('question_id required');
  const node_kind = raw.node_kind;
  if (node_kind !== 'GROUP' && node_kind !== 'QUESTION') throw new TypeError(`node_kind invalid for ${question_id}`);
  const parent_question_id = raw.parent_question_id == null ? null : raw.parent_question_id;
  if (parent_question_id !== null && !bounded(parent_question_id)) throw new TypeError(`parent_question_id invalid for ${question_id}`);

  const out = {
    question_id,
    node_kind,
    parent_question_id,
    owner_ref: bounded(raw.owner_ref) ? raw.owner_ref : null,
    evidence_requirement_ref: bounded(raw.evidence_requirement_ref) ? raw.evidence_requirement_ref : null,
    evidence_refs: refList(raw.evidence_refs),
    affected_consumer_refs: refList(raw.affected_consumer_refs),
  };
  for (const key of BIT_KEYS) out[key] = bit(raw[key], `${question_id}.${key}`);

  if (out.expected_known_bit === 0 && out.expected_value_bit === 1) throw new TypeError(`invalid expected unknown encoding for ${question_id}`);
  if (out.observed_known_bit === 0 && out.observed_value_bit === 1) throw new TypeError(`invalid observed unknown encoding for ${question_id}`);
  if (out.required_bit === 1 && out.material_bit === 0) throw new TypeError(`required node cannot be non-material: ${question_id}`);
  if (out.new_class_bit === 1 && (out.template_found_bit === 1 || out.primitive_found_bit === 1)) {
    throw new TypeError(`new_class conflicts with existing template/primitive: ${question_id}`);
  }
  if (node_kind === 'GROUP' && out.atomic_bit !== 0) throw new TypeError(`GROUP must have atomic_bit=0: ${question_id}`);
  if (node_kind === 'QUESTION' && out.atomic_bit !== 1) throw new TypeError(`QUESTION must have atomic_bit=1: ${question_id}`);
  if (node_kind === 'QUESTION' && out.required_bit === 1 && out.material_bit === 1) {
    if (!out.owner_ref) throw new TypeError(`required material QUESTION needs owner_ref: ${question_id}`);
    if (!out.evidence_requirement_ref) throw new TypeError(`required material QUESTION needs evidence_requirement_ref: ${question_id}`);
  }
  return out;
}

function topoDepth(id, byId) {
  let depth = 0;
  const seen = new Set([id]);
  let cursor = byId.get(id)?.parent_question_id || null;
  while (cursor) {
    if (seen.has(cursor)) throw new TypeError(`parent cycle detected at ${id}`);
    seen.add(cursor);
    depth += 1;
    cursor = byId.get(cursor)?.parent_question_id || null;
  }
  return depth;
}

function stateFromBits(known, value) {
  if (known === 0) return 'UNKNOWN';
  return value === 1 ? 'MATCH' : 'MISMATCH';
}

function reduceRequiredChildren(children) {
  const relevant = children.filter((c) => c.required_bit === 1 && c.material_bit === 1);
  if (relevant.length === 0) return { known_bit:0, value_bit:0, defect:'NO_REQUIRED_MATERIAL_CHILDREN' };
  if (relevant.some((c) => c.effective_known_bit === 1 && c.effective_value_bit === 0)) {
    return { known_bit:1, value_bit:0, defect:null };
  }
  if (relevant.some((c) => c.effective_known_bit === 0)) return { known_bit:0, value_bit:0, defect:null };
  return { known_bit:1, value_bit:1, defect:null };
}

export function compileUserExperienceSocratic(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input must be an object');
  for (const key of ['root_ref','user_ref','experience_ref','source_generation']) {
    if (!bounded(input[key])) throw new TypeError(`${key} required`);
  }
  if (!Array.isArray(input.questions) || input.questions.length === 0) throw new TypeError('questions must be a non-empty array');

  const nodes = input.questions.map(normalizeNode);
  const byId = new Map();
  for (const n of nodes) {
    if (byId.has(n.question_id)) throw new TypeError(`duplicate question_id: ${n.question_id}`);
    byId.set(n.question_id, n);
  }
  for (const n of nodes) {
    if (n.parent_question_id && !byId.has(n.parent_question_id)) throw new TypeError(`unknown parent ${n.parent_question_id} for ${n.question_id}`);
  }
  const childrenById = new Map(nodes.map((n) => [n.question_id, []]));
  for (const n of nodes) if (n.parent_question_id) childrenById.get(n.parent_question_id).push(n.question_id);
  for (const n of nodes) {
    topoDepth(n.question_id, byId);
    const childIds = childrenById.get(n.question_id);
    if (n.node_kind === 'QUESTION' && childIds.length) throw new TypeError(`QUESTION cannot have children: ${n.question_id}`);
  }

  const depthOrder = [...nodes].sort((a,b) => topoDepth(b.question_id, byId) - topoDepth(a.question_id, byId) || a.question_id.localeCompare(b.question_id));
  const compiled = new Map();
  const defects = [];
  const reap_question_ids = [];

  for (const n of depthOrder) {
    if (n.node_kind === 'QUESTION') {
      let effective_known_bit = n.observed_known_bit;
      let effective_value_bit = 0;
      let disposition = 'UNKNOWN';
      let defect = null;

      if (n.material_bit === 0) {
        effective_known_bit = 1;
        effective_value_bit = 1;
        disposition = 'REAP_NON_MATERIAL';
        reap_question_ids.push(n.question_id);
      } else if (n.expected_known_bit === 0) {
        effective_known_bit = 0;
        effective_value_bit = 0;
        disposition = 'UNKNOWN';
        defect = 'EXPECTED_STATE_UNKNOWN';
      } else if (n.observed_known_bit === 0) {
        effective_known_bit = 0;
        effective_value_bit = 0;
        disposition = 'UNKNOWN';
      } else if (n.evidence_refs.length === 0) {
        effective_known_bit = 0;
        effective_value_bit = 0;
        disposition = 'UNKNOWN';
        defect = 'KNOWN_WITHOUT_EVIDENCE';
      } else {
        effective_known_bit = 1;
        effective_value_bit = n.observed_value_bit === n.expected_value_bit ? 1 : 0;
        disposition = stateFromBits(effective_known_bit, effective_value_bit);
      }
      const c = { ...n, depth: topoDepth(n.question_id, byId), effective_known_bit, effective_value_bit, disposition, defect };
      compiled.set(n.question_id, c);
      if (defect) defects.push({ question_id:n.question_id, defect });
    } else {
      const childCells = childrenById.get(n.question_id).map((id) => compiled.get(id));
      const reduced = reduceRequiredChildren(childCells);
      const c = {
        ...n,
        depth: topoDepth(n.question_id, byId),
        effective_known_bit: reduced.known_bit,
        effective_value_bit: reduced.value_bit,
        disposition: reduced.known_bit === 0 ? 'UNKNOWN' : reduced.value_bit === 1 ? 'MATCH' : 'MISMATCH',
        defect: reduced.defect,
        child_question_ids: childrenById.get(n.question_id).slice().sort(),
      };
      compiled.set(n.question_id, c);
      if (reduced.defect) defects.push({ question_id:n.question_id, defect:reduced.defect });
    }
  }

  const roots = nodes.filter((n) => n.parent_question_id === null).map((n) => compiled.get(n.question_id));
  const rootReduced = reduceRequiredChildren(roots);
  if (rootReduced.defect) defects.push({ question_id:'__ROOT__', defect:rootReduced.defect });

  const requiredMaterialQuestions = [...compiled.values()].filter((c) => c.node_kind === 'QUESTION' && c.required_bit === 1 && c.material_bit === 1);
  const mismatch = requiredMaterialQuestions
    .filter((c) => c.effective_known_bit === 1 && c.effective_value_bit === 0)
    .sort((a,b) => b.depth-a.depth || a.question_id.localeCompare(b.question_id));
  const unknown = requiredMaterialQuestions
    .filter((c) => c.effective_known_bit === 0)
    .sort((a,b) => b.depth-a.depth || a.question_id.localeCompare(b.question_id));
  const firstRed = mismatch[0] || unknown[0] || null;

  let next = null;
  if (firstRed) {
    let action;
    if (firstRed.user_choice_bit === 1) action = 'USER_CHOICE_REQUIRED';
    else if (firstRed.effective_known_bit === 0) action = 'OBSERVE_OR_HOLD_MISSING_BRIDGE';
    else if (firstRed.template_found_bit === 1 || firstRed.primitive_found_bit === 1) action = 'ADOPT_VERIFY_EXISTING';
    else if (firstRed.new_class_bit === 1) action = 'HOT_PATCH_NEW_CLASS';
    else action = 'HOT_PATCH_OR_COLLIDE_EXISTING_OWNER';
    next = {
      question_id:firstRed.question_id,
      action,
      owner_ref:firstRed.owner_ref,
      evidence_requirement_ref:firstRed.evidence_requirement_ref,
      affected_consumer_refs:firstRed.affected_consumer_refs,
    };
  }

  const cells = [...compiled.values()].sort((a,b) => a.question_id.localeCompare(b.question_id));
  const counts = {
    required_questions: requiredMaterialQuestions.length,
    match_questions: requiredMaterialQuestions.filter((c) => c.effective_known_bit === 1 && c.effective_value_bit === 1).length,
    mismatch_questions: mismatch.length,
    unknown_questions: unknown.length,
    reap_questions: reap_question_ids.length,
  };

  const terminal = rootReduced.known_bit === 1 && rootReduced.value_bit === 1 && firstRed === null;
  return Object.freeze({
    schema:'xiio.sdk.user-experience-socratic/v1',
    root_ref:input.root_ref,
    user_ref:input.user_ref,
    experience_ref:input.experience_ref,
    source_generation:input.source_generation,
    denominator:requiredMaterialQuestions.length,
    accounting_100: nodes.length === cells.length,
    root_known_bit:rootReduced.known_bit,
    root_value_bit:rootReduced.value_bit,
    root_state:rootReduced.known_bit === 0 ? 'UNKNOWN' : rootReduced.value_bit === 1 ? 'PASS' : 'FAIL',
    terminal,
    counts,
    first_red:firstRed ? {
      question_id:firstRed.question_id,
      disposition:firstRed.disposition,
      depth:firstRed.depth,
      owner_ref:firstRed.owner_ref,
      evidence_requirement_ref:firstRed.evidence_requirement_ref,
    } : null,
    next,
    reap_question_ids:reap_question_ids.sort(),
    cells,
    defects,
    authority_granted:false,
    provider_effect:false,
    hard:[
      'UNKNOWN!=FALSE',
      'QUESTION!=TASK',
      'TEST!=AUTHORITY',
      'LEAF_PASS!=PARENT_PASS',
      'ACCOUNTING_100!=CLOSURE_100',
      'SMALLER!=BETTER_BY_DEFAULT',
      'TEST_CASE!=PRIMITIVE',
      'REPEATED_WORDING!=STRUCTURAL_EQUIVALENCE',
      'MISMATCH!=AUTOMATIC_PATCH',
      'OBSERVER!=MUTATOR',
      'USER_EXPERIENCE_EVIDENCE!=UNIVERSAL_DOMAIN_TRUTH',
      'RESULT!=RETURN!=APPLY_RETURN',
    ],
  });
}
