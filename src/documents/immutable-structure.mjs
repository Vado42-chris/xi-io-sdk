// Reusable pure-data snapshots. Callers must detach mutable inputs before
// freezing so SDK results never freeze the consumer's source objects.
export function freezeStructure(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeStructure(child, seen);
  return Object.freeze(value);
}
function stable(value,ancestors=new WeakSet()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){
  if(!Number.isFinite(value))throw new TypeError('SEMANTIC_NON_JSON_NUMBER');
  return value;
 }
 if(typeof value!=='object')throw new TypeError('SEMANTIC_NON_JSON_VALUE');
 if(ancestors.has(value))throw new TypeError('SEMANTIC_NON_JSON_CYCLE');
 ancestors.add(value);
 try{
  if(Array.isArray(value)){
   const count=value.length;
   const items=[];
   for(let i=0;i<count;i++){
    if(!Object.hasOwn(value,i))throw new TypeError('SEMANTIC_SPARSE_ARRAY');
    items.push(stable(value[i],ancestors));
   }
   return items;
  }
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)
   throw new TypeError('SEMANTIC_NON_JSON_OBJECT');
  if(Object.getOwnPropertySymbols(value).length)
   throw new TypeError('SEMANTIC_NON_JSON_SYMBOL_KEY');
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k],ancestors)]));
 }finally{ancestors.delete(value);}
}

// Browser-safe strict JSON snapshot shared by persisted SDK artifacts.
export function snapshotSemanticPayload(payload){return freezeStructure(stable(payload));}
