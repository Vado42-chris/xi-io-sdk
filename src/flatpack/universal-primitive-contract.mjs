export const UNIVERSAL_PRIMITIVE_CONTRACT=Object.freeze({
  schema:'xiio.sdk.universal-primitive-contract-binding/v1',
  framework_contract_ref:'Vado42-chris/xi-io.net:standards/primitives/universal-primitive-root.v1.json',
  framework_contract_blob_sha:'f9e7778a3ca81e486ceeb764c3ab84eb4a14af3d',
  framework_contract_schema:'xiio.universal-primitive-root/v1',
  required_fields:Object.freeze([
    'identity','semantic_type','coordinates','relationships','operations',
    'provenance','authority','state','version','projection',
  ]),
  semantic_families:Object.freeze({
    visual:Object.freeze(['rectangle','text','image','group','layer','constraint','connection']),
    document:Object.freeze(['paragraph','heading','table','cell','citation','media','section']),
    code:Object.freeze(['module','class','component','function','route','schema','property','test','api_operation']),
    studio:Object.freeze(['product','tool','setting','drawer','offering','plugin','service','person','agent','project']),
    work:Object.freeze(['task','check','action','input','command','selection','composer','stateful_control']),
  }),
  structural_operations:Object.freeze([
    'CREATE','SELECT','INSPECT','MOVE','RESIZE','TRANSFORM','GROUP','CONNECT',
    'DUPLICATE','VERSION','DIFF','UNDO','REDO','DELETE','PUBLISH',
  ]),
});

const plain=(value)=>value&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const nonemptyString=(value)=>typeof value==='string'&&value.trim().length>0&&value===value.trim();

const SEMANTIC_TYPES=Object.freeze([
  ...new Set(Object.values(UNIVERSAL_PRIMITIVE_CONTRACT.semantic_families).flat()),
]);
const SEMANTIC_SET=new Set(SEMANTIC_TYPES);
const OPERATION_SET=new Set(UNIVERSAL_PRIMITIVE_CONTRACT.structural_operations);

export function validatePrimitiveAgainstUniversalContract(primitive){
  const fail=(first_red,detail)=>Object.freeze({ok:false,first_red,detail});
  if(!plain(primitive))return fail('PRIMITIVE_REQUIRED_FIELDS','primitive must be object');
  for(const field of UNIVERSAL_PRIMITIVE_CONTRACT.required_fields){
    if(!own(primitive,field))return fail('PRIMITIVE_REQUIRED_FIELDS',`missing required field:${field}`);
  }
  if(!nonemptyString(primitive.identity))return fail('PRIMITIVE_IDENTITY','identity must be one trimmed non-empty string');
  if(!nonemptyString(primitive.semantic_type)||!SEMANTIC_SET.has(primitive.semantic_type))
    return fail('PRIMITIVE_SEMANTIC_TYPE',`semantic_type not declared:${String(primitive.semantic_type??'')}`);
  if(!plain(primitive.coordinates))return fail('PRIMITIVE_COORDINATES','coordinates must be object');
  if(!Array.isArray(primitive.relationships))return fail('PRIMITIVE_RELATIONSHIPS','relationships must be array');
  if(!Array.isArray(primitive.operations)||primitive.operations.length===0)
    return fail('PRIMITIVE_OPERATIONS','operations must be a non-empty array');
  if(new Set(primitive.operations).size!==primitive.operations.length)
    return fail('PRIMITIVE_OPERATIONS','operations must be unique');
  for(const operation of primitive.operations){
    if(!nonemptyString(operation)||!OPERATION_SET.has(operation))
      return fail('PRIMITIVE_OPERATIONS',`operation not declared:${String(operation??'')}`);
  }
  if(!plain(primitive.provenance))return fail('PRIMITIVE_PROVENANCE','provenance must be object');
  if(!plain(primitive.authority))return fail('PRIMITIVE_AUTHORITY','authority must be object');
  if(primitive.state===null||primitive.state===undefined||primitive.state==='')
    return fail('PRIMITIVE_STATE','state required');
  if(!nonemptyString(primitive.version))return fail('PRIMITIVE_VERSION','version must be non-empty string');
  if(!Array.isArray(primitive.projection))return fail('PRIMITIVE_PROJECTION','projection must be array');
  return Object.freeze({
    ok:true,
    first_red:null,
    semantic_type:primitive.semantic_type,
    contract_ref:UNIVERSAL_PRIMITIVE_CONTRACT.framework_contract_ref,
    contract_blob_sha:UNIVERSAL_PRIMITIVE_CONTRACT.framework_contract_blob_sha,
  });
}

export const UNIVERSAL_PRIMITIVE_SEMANTIC_TYPES=SEMANTIC_TYPES;
