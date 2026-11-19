import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const PRODUCT_SURFACE_RUNTIME_DEPENDENCY_ID='xiio-sdk-product-surface-runtime';
export const PRODUCT_SURFACE_RUNTIME_OWNER_REPO='Vado42-chris/xi-io-sdk';
export const PRODUCT_SURFACE_RUNTIME_EXPORT='product_surface_module';
export const PRODUCT_SURFACE_RUNTIME_FILES=Object.freeze([
  'src/render/product-surface.mjs',
  'src/components/core.mjs',
  'src/components/shell.mjs',
]);

const generation=value=>{
  const out=String(value??'').trim();
  if(!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(out))
    throw new Error('PRODUCT_SURFACE_RUNTIME_GENERATION_INVALID');
  return out;
};
const destination=(accepted,source)=>
  'xi-io/sdk/'+generation(accepted)+'/product-surface/'+source.replace(/^src\//,'');

export async function buildProductSurfaceRuntimeInstallerManifest({
  root=process.cwd(),
  acceptedGeneration,
  profileId='sdk-product-surface-runtime',
  version=acceptedGeneration,
}={}){
  const accepted=generation(acceptedGeneration);
  const payload=[];
  for(const source of PRODUCT_SURFACE_RUNTIME_FILES){
    const bytes=await fs.readFile(path.join(root,source));
    payload.push(Object.freeze({
      source,
      sha256:createHash('sha256').update(bytes).digest('hex'),
      size:bytes.length,
      destination_scope:'xdg_data',
      destination:destination(accepted,source),
      mode:'0644',
      overwrite:'same_hash_ok',
    }));
  }
  return Object.freeze({
    schema_version:'xiio-installer-product-manifest-v1',
    profile_id:String(profileId),
    product_id:'xiio-sdk-product-surface-runtime',
    display_name:'XI-IO SDK Product Surface Runtime',
    version:String(version),
    channel:'stable',
    fixture:false,
    payload:Object.freeze(payload),
  });
}

export function buildProductSurfaceRuntimeDependencyDescriptor({
  acceptedGeneration,
  ownerRepo=PRODUCT_SURFACE_RUNTIME_OWNER_REPO,
}={}){
  const accepted=generation(acceptedGeneration);
  if(ownerRepo!==PRODUCT_SURFACE_RUNTIME_OWNER_REPO)
    throw new Error('PRODUCT_SURFACE_RUNTIME_OWNER_INVALID');
  return Object.freeze({
    schema:'xiio.installer-dependency-descriptor/v1',
    product_id:'xiio-sdk-product-surface-runtime',
    dependency_id:PRODUCT_SURFACE_RUNTIME_DEPENDENCY_ID,
    owner_repo:ownerRepo,
    accepted_generation:accepted,
    runtime_exports:Object.freeze({
      [PRODUCT_SURFACE_RUNTIME_EXPORT]:Object.freeze({
        destination_scope:'xdg_data',
        destination:destination(accepted,'src/render/product-surface.mjs'),
      }),
    }),
    authority_granted:false,
    provider_effect:false,
    effect_authority:false,
  });
}
