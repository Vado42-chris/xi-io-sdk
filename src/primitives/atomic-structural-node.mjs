import crypto from 'node:crypto';

export const ATOMIC_STRUCTURAL_NODE_SCHEMA = 'xiio.sdk.atomic-structural-node/v1';
export const PRIMITIVE_GRAPH_SCHEMA = 'xiio.sdk.primitive-graph/v1';
export const PRIMITIVE_OPERATION_SCHEMA = 'xiio.sdk.primitive-operation/v1';

export const NODE_KINDS = Object.freeze({
  visual: Object.freeze(['rectangle','text','image','group','layer','constraint','connection']),
  document: Object.freeze(['paragraph','heading','table','cell','citation','media','section']),
  code: Object.freeze(['module','class','function','component','property','route','schema','api_operation','test']),
  studio: Object.freeze(['product','tool','setting','drawer','offering','plugin','service','person','agent','project']),
});
export const OPERATIONS = Object.freeze(['CREATE','SELECT','INSPECT','MOVE','GROUP','CONNECT','DUPLICATE','TRANSFORM','VERSION','DIFF','DELETE','UNDO','PUBLISH']);
const ACTORS = new Set(['HUMAN','AI']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

function text(v,k,max=512){if(typeof v!=='string'||!v.trim()||v.length>max)throw new TypeError(`${k}_INVALID`);return v.trim();}
function id(v,k){const x=text(v,k,256);if(!ID.test(x))throw new TypeError(`${k}_INVALID`);return x;}
function integer(v,k,min=0){if(!Number.isInteger(v)||v<min)throw new TypeError(`${k}_INVALID`);return v;}
function finite(v,k){if(typeof v!=='number'||!Number.isFinite(v))throw new TypeError(`${k}_INVALID`);return v;}
function clone(v){return v===undefined?undefined:structuredClone(v);}
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function props(v,k){if(v===undefined)return Object.freeze({});if(!v||typeof v!=='object'||Array.isArray(v))throw new TypeError(`${k}_INVALID`);return Object.freeze(stable(clone(v)));}
function geometry(v={}){if(!v||typeof v!=='object'||Array.isArray(v))throw new TypeError('geometry_INVALID');const out={};for(const k of ['x','y','z','width','height','rotation'])if(v[k]!==undefined)out[k]=finite(v[k],`geometry.${k}`);return Object.freeze(out);}
function assertKind(domain,kind){const kinds=NODE_KINDS[domain];if(!kinds)throw new TypeError(`domain_INVALID:${domain}`);if(!kinds.includes(kind))throw new TypeError(`kind_INVALID:${domain}:${kind}`);}

export function AtomicStructuralNode(input={}){
  const domain=text(input.domain,'domain',32).toLowerCase();
  const kind=text(input.kind,'kind',64).toLowerCase();
  assertKind(domain,kind);
  return Object.freeze({
    schema:ATOMIC_STRUCTURAL_NODE_SCHEMA,
    node_id:id(input.node_id,'node_id'), artifact_id:id(input.artifact_id,'artifact_id'),
    generation:id(input.generation,'generation'), domain, kind,
    parent_id:input.parent_id==null?null:id(input.parent_id,'parent_id'),
    document_order:integer(input.document_order??0,'document_order'),
    semantic_depth:integer(input.semantic_depth??0,'semantic_depth'),
    geometry:geometry(input.geometry??{}), properties:props(input.properties,'properties'),
    bins_ref:input.bins_ref==null?null:text(input.bins_ref,'bins_ref',1024),
    ast_ref:input.ast_ref==null?null:text(input.ast_ref,'ast_ref',1024),
  });
}

export function PrimitiveGraph(input={}){
  const artifact_id=id(input.artifact_id,'artifact_id');
  const generation=id(input.generation,'generation');
  const nodes=(Array.isArray(input.nodes)?input.nodes:[]).map(n=>AtomicStructuralNode({...n,artifact_id:n.artifact_id??artifact_id,generation:n.generation??generation}));
  const seen=new Set();
  for(const n of nodes){if(seen.has(n.node_id))throw new TypeError(`duplicate_node:${n.node_id}`);seen.add(n.node_id);if(n.artifact_id!==artifact_id)throw new TypeError('NODE_ARTIFACT_MISMATCH');}
  for(const n of nodes)if(n.parent_id!==null&&!seen.has(n.parent_id))throw new TypeError(`PARENT_NOT_FOUND:${n.parent_id}`);
  const graph={schema:PRIMITIVE_GRAPH_SCHEMA,artifact_id,generation,nodes:Object.freeze(nodes),selected_node_ids:Object.freeze(input.selected_node_ids??[]),projection_candidates:Object.freeze(input.projection_candidates??[]),effect_authority:0};
  return Object.freeze({...graph,graph_digest:digest(graph)});
}

function compileOperation(input={}){
  const actor_kind=text(input.actor_kind,'actor_kind',16).toUpperCase();
  if(!ACTORS.has(actor_kind))throw new TypeError('actor_kind_INVALID');
  const operation=text(input.operation,'operation',32).toUpperCase();
  if(!OPERATIONS.includes(operation))throw new TypeError('operation_INVALID');
  return Object.freeze({schema:PRIMITIVE_OPERATION_SCHEMA,operation_id:id(input.operation_id,'operation_id'),operation,actor_kind,actor_ref:id(input.actor_ref,'actor_ref'),node_id:input.node_id==null?null:id(input.node_id,'node_id'),payload:props(input.payload,'payload')});
}
function replaceNode(nodes,node){return nodes.map(n=>n.node_id===node.node_id?node:n);}
function findNode(nodes,nodeId){const n=nodes.find(x=>x.node_id===nodeId);if(!n)throw new TypeError(`NODE_NOT_FOUND:${nodeId}`);return n;}
function nextId(base,nodes){let i=1;while(nodes.some(n=>n.node_id===`${base}:copy:${i}`))i++;return `${base}:copy:${i}`;}

export function applyPrimitiveOperation(graphInput, operationInput){
  const graph=PrimitiveGraph(graphInput);
  const operation=compileOperation(operationInput);
  let nodes=[...graph.nodes], selected=[...graph.selected_node_ids], projections=[...graph.projection_candidates], result=null;
  const node=operation.node_id?()=>findNode(nodes,operation.node_id):()=>{throw new TypeError('node_id_REQUIRED');};
  switch(operation.operation){
    case 'CREATE': {
      const created=AtomicStructuralNode({...operation.payload,artifact_id:graph.artifact_id,generation:graph.generation});
      if(nodes.some(n=>n.node_id===created.node_id))throw new TypeError('NODE_ALREADY_EXISTS');
      nodes.push(created); result=created; break;
    }
    case 'SELECT': node(); selected=[operation.node_id]; result=Object.freeze({selected_node_ids:Object.freeze(selected)}); break;
    case 'INSPECT': result=node(); break;
    case 'MOVE': {
      const n=node(), g={...n.geometry};
      for(const k of ['x','y'])if(operation.payload[k]!==undefined)g[k]=finite(operation.payload[k],k);
      const document_order=operation.payload.document_order===undefined?n.document_order:integer(operation.payload.document_order,'document_order');
      const moved=AtomicStructuralNode({...n,geometry:g,document_order}); nodes=replaceNode(nodes,moved); result=moved; break;
    }
    case 'TRANSFORM': {
      const n=node(), patch=operation.payload.geometry??operation.payload;
      const transformed=AtomicStructuralNode({...n,geometry:{...n.geometry,...patch},semantic_depth:operation.payload.semantic_depth===undefined?n.semantic_depth:integer(operation.payload.semantic_depth,'semantic_depth')});
      nodes=replaceNode(nodes,transformed); result=transformed; break;
    }
    case 'GROUP': {
      const ids=operation.payload.node_ids;
      if(!Array.isArray(ids)||ids.length<1)throw new TypeError('GROUP_NODE_IDS_REQUIRED');
      ids.forEach(x=>findNode(nodes,x));
      const groupId=id(operation.payload.group_id,'group_id');
      const group=AtomicStructuralNode({node_id:groupId,artifact_id:graph.artifact_id,generation:graph.generation,domain:'visual',kind:'group',document_order:integer(operation.payload.document_order??0,'document_order'),semantic_depth:integer(operation.payload.semantic_depth??0,'semantic_depth'),geometry:operation.payload.geometry??{},properties:operation.payload.properties??{}});
      nodes.push(group); nodes=nodes.map(n=>ids.includes(n.node_id)?AtomicStructuralNode({...n,parent_id:groupId}):n); result=group; break;
    }
    case 'CONNECT': {
      const from=node(), toId=id(operation.payload.to_node_id,'to_node_id'); findNode(nodes,toId);
      const connectionId=id(operation.payload.connection_id,'connection_id');
      const connection=AtomicStructuralNode({node_id:connectionId,artifact_id:graph.artifact_id,generation:graph.generation,domain:'visual',kind:'connection',document_order:nodes.length,semantic_depth:Math.max(from.semantic_depth,findNode(nodes,toId).semantic_depth),properties:{from_node_id:from.node_id,to_node_id:toId,relation:operation.payload.relation??'connected'}});
      nodes.push(connection); result=connection; break;
    }
    case 'DUPLICATE': {
      const n=node(), node_id=operation.payload.node_id?id(operation.payload.node_id,'payload.node_id'):nextId(n.node_id,nodes);
      const duplicate=AtomicStructuralNode({...n,node_id,document_order:operation.payload.document_order===undefined?n.document_order+1:integer(operation.payload.document_order,'document_order')});
      nodes.push(duplicate); result=duplicate; break;
    }
    case 'DELETE': {
      const n=node(); if(nodes.some(x=>x.parent_id===n.node_id))throw new TypeError('DELETE_PARENT_WITH_CHILDREN');
      nodes=nodes.filter(x=>x.node_id!==n.node_id); selected=selected.filter(x=>x!==n.node_id); result=Object.freeze({deleted_node_id:n.node_id}); break;
    }
    case 'VERSION': result=Object.freeze({artifact_id:graph.artifact_id,from_generation:graph.generation,candidate_generation:id(operation.payload.generation,'payload.generation'),effect_authority:0}); break;
    case 'DIFF': {
      const n=node(), against=AtomicStructuralNode({...operation.payload.against,artifact_id:graph.artifact_id,generation:graph.generation,node_id:n.node_id});
      result=Object.freeze({node_id:n.node_id,before_digest:digest(n),after_digest:digest(against),changed:digest(n)!==digest(against)}); break;
    }
    case 'UNDO': throw new TypeError('UNDO_REQUIRES_RECEIPT_STORE');
    case 'PUBLISH': {
      const n=node(), candidate=Object.freeze({projection_id:id(operation.payload.projection_id,'projection_id'),node_id:n.node_id,target:text(operation.payload.target,'target',128),node_digest:digest(n),effect_authority:0});
      projections.push(candidate); result=candidate; break;
    }
  }
  const nextBase={schema:PRIMITIVE_GRAPH_SCHEMA,artifact_id:graph.artifact_id,generation:graph.generation,nodes:Object.freeze(nodes),selected_node_ids:Object.freeze(selected),projection_candidates:Object.freeze(projections),effect_authority:0};
  const next=Object.freeze({...nextBase,graph_digest:digest(nextBase)});
  const receipt=Object.freeze({schema:'xiio.sdk.primitive-operation-receipt/v1',operation_id:operation.operation_id,operation:operation.operation,actor_kind:operation.actor_kind,actor_ref:operation.actor_ref,before_digest:graph.graph_digest,after_digest:next.graph_digest,changed:graph.graph_digest!==next.graph_digest,effect_authority:0,hard:Object.freeze(['HUMAN_OPERATION_PATH=AI_OPERATION_PATH','DOCUMENT_ORDER!=SEMANTIC_DEPTH','MOVE_XY!=SEMANTIC_Z','PUBLISH_CANDIDATE!=PUBLISH_EFFECT','GRAPH_DIGEST!=BINS_CUSTODY_PROOF'])});
  return Object.freeze({graph:next,result,receipt});
}
