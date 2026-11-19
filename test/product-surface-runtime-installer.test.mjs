import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {
  buildProductSurfaceRuntimeInstallerManifest,
  buildProductSurfaceRuntimeDependencyDescriptor,
  PRODUCT_SURFACE_RUNTIME_DEPENDENCY_ID,
  PRODUCT_SURFACE_RUNTIME_FILES,
  PRODUCT_SURFACE_RUNTIME_EXPORT,
  PRODUCT_SURFACE_RUNTIME_CORE_EXPORT,
  PRODUCT_SURFACE_RUNTIME_SHELL_EXPORT,
} from '../scripts/build-product-surface-runtime-installer-manifest.mjs';

const G='a'.repeat(40);

test('SDK product-surface runtime exports complete import closure through Installer custody',async()=>{
  const manifest=await buildProductSurfaceRuntimeInstallerManifest({acceptedGeneration:G});
  const descriptor=buildProductSurfaceRuntimeDependencyDescriptor({acceptedGeneration:G});
  assert.equal(manifest.schema_version,'xiio-installer-product-manifest-v1');
  assert.equal(manifest.product_id,'xiio-sdk-product-surface-runtime');
  assert.deepEqual(manifest.payload.map(row=>row.source),[...PRODUCT_SURFACE_RUNTIME_FILES]);
  assert.equal(descriptor.schema,'xiio.installer-dependency-descriptor/v1');
  assert.equal(descriptor.dependency_id,PRODUCT_SURFACE_RUNTIME_DEPENDENCY_ID);
  assert.equal(descriptor.accepted_generation,G);
  assert.deepEqual(Object.keys(descriptor.runtime_exports),[
    PRODUCT_SURFACE_RUNTIME_EXPORT,
    PRODUCT_SURFACE_RUNTIME_CORE_EXPORT,
    PRODUCT_SURFACE_RUNTIME_SHELL_EXPORT,
  ]);
  assert.match(
    descriptor.runtime_exports[PRODUCT_SURFACE_RUNTIME_EXPORT].destination,
    new RegExp('xi-io/sdk/'+G+'/product-surface/render/product-surface\\.mjs$'),
  );
  assert.match(
    descriptor.runtime_exports[PRODUCT_SURFACE_RUNTIME_CORE_EXPORT].destination,
    new RegExp('xi-io/sdk/'+G+'/product-surface/components/core\\.mjs$'),
  );
  assert.match(
    descriptor.runtime_exports[PRODUCT_SURFACE_RUNTIME_SHELL_EXPORT].destination,
    new RegExp('xi-io/sdk/'+G+'/product-surface/components/shell\\.mjs$'),
  );
  for(const row of manifest.payload){
    const bytes=await fs.readFile(row.source);
    assert.equal(row.sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(row.size,bytes.length);
    assert.equal(row.destination_scope,'xdg_data');
    assert.equal(row.mode,'0644');
    assert.doesNotMatch(row.destination,/\/home\/|\/media\/|aries|loki|chrishallberg/i);
  }
  assert.equal(descriptor.authority_granted,false);
  assert.equal(descriptor.provider_effect,false);
  assert.equal(descriptor.effect_authority,false);
});

test('materialized runtime imports bindProductSurface without source checkout',async()=>{
  const manifest=await buildProductSurfaceRuntimeInstallerManifest({acceptedGeneration:G});
  const descriptor=buildProductSurfaceRuntimeDependencyDescriptor({acceptedGeneration:G});
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiio-sdk-product-surface-'));
  try{
    for(const row of manifest.payload){
      const bytes=await fs.readFile(row.source);
      const target=path.join(root,row.destination);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,bytes,{mode:0o644});
    }
    const modulePath=path.join(root,descriptor.runtime_exports[PRODUCT_SURFACE_RUNTIME_EXPORT].destination);
    const mod=await import(pathToFileURL(modulePath).href);
    assert.equal(typeof mod.bindProductSurface,'function');
    assert.equal(typeof mod.validateProductSurfaceValues,'function');
    assert.equal(typeof mod.collectProductSurfaceValues,'function');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('generation and owner substitutions refuse',async()=>{
  await assert.rejects(
    ()=>buildProductSurfaceRuntimeInstallerManifest({acceptedGeneration:'main'}),
    /GENERATION_INVALID/,
  );
  assert.throws(
    ()=>buildProductSurfaceRuntimeDependencyDescriptor({acceptedGeneration:G,ownerRepo:'foreign/repo'}),
    /OWNER_INVALID/,
  );
});
