export const UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE=Object.freeze({
  schema:'xiio.universal-primitive-denominator-source/v1',
  framework_ref:'Vado42-chris/xi-io.net#1178:standards/primitives/universal-primitive-denominator.v1.json',
  source_state:'CANDIDATE_PENDING_FRAMEWORK_1178_ACCEPTANCE',
  framework_generation:null,
  contract_schema:'xiio.universal-primitive-denominator/v1',
  contract_version:1,
  contract_sha256:'d95710a7d097f2239dc4b230516a2280a0286b70a0990b92d3ad69a35d423952',
});

export const UNIVERSAL_PRIMITIVE_DENOMINATOR=Object.freeze({
  schema:'xiio.universal-primitive-denominator/v1',
  id:'XIIO_UNIVERSAL_PRIMITIVE_DENOMINATOR',
  version:1,
  purpose:'Canonical invariant denominator for primitive semantic families, structural operations and universal required primitive fields. Runtime currentness, authority, effects and readback remain separate receipts.',
  required_fields:Object.freeze(['identity','semantic_type','coordinates','relationships','operations','provenance','authority','state','version','projection']),
  families:Object.freeze({
    visual:Object.freeze(['rectangle','text','image','group','layer','constraint','connection']),
    document:Object.freeze(['paragraph','heading','table','cell','citation','media','section']),
    code:Object.freeze(['module','class','component','function','route','schema','property','test','api_operation']),
    studio:Object.freeze(['product','tool','setting','drawer','offering','plugin','service','person','agent','project']),
    work:Object.freeze(['task','check','action','input','command','selection','composer','stateful_control']),
  }),
  structural_operations:Object.freeze(['CREATE','SELECT','INSPECT','MOVE','RESIZE','TRANSFORM','GROUP','CONNECT','DUPLICATE','VERSION','DIFF','UNDO','DELETE','PUBLISH']),
  hard:Object.freeze([
    'CONTRACT_HASH_MATCH!=PRIMITIVE_INSTANCE_VALID',
    'ROOT_SUBSET_PRESENT!=EXACT_CANONICAL_DENOMINATOR',
    'NONEMPTY_FAMILY!=SEMANTIC_PARITY',
    'DUPLICATE_SEMANTIC_TYPE=FAIL',
    'DUPLICATE_OPERATION=FAIL',
    'REPRESENTATION_LOCAL_EXTENSION_WITHOUT_DENOMINATOR_VERSION=FAIL',
  ]),
});

export const UNIVERSAL_PRIMITIVE_SEMANTIC_TYPES=Object.freeze(
  Object.values(UNIVERSAL_PRIMITIVE_DENOMINATOR.families).flat()
);
