import catalog from './artifact-profiles.json' with { type: 'json' };

export const ARTIFACT_PROFILE_CATALOG_SCHEMA='xiio.sdk.artifact-profile-catalog/v1';

export function artifactProfileCatalog(){
  return Object.freeze(structuredClone(catalog));
}

export function resolveArtifactProfile(profileId){
  if(typeof profileId!=='string'||!profileId.trim()) throw new TypeError('PROFILE_ID_REQUIRED');
  const id=profileId.trim();
  const row=catalog.profiles.find((x)=>x.profile_id===id);
  if(!row) return Object.freeze({
    schema:'xiio.sdk.artifact-profile-resolution/v1',
    state:'UNKNOWN',
    profile_id:id,
    first_red:'PROFILE_NOT_REGISTERED',
    profile:null,
    authority_granted:false,
    provider_effect:false,
  });
  return Object.freeze({
    schema:'xiio.sdk.artifact-profile-resolution/v1',
    state:'PASS',
    profile_id:id,
    profile:structuredClone(row),
    authority_granted:false,
    provider_effect:false,
  });
}

export function resolveArtifactProfileByMediaType(mediaType){
  if(typeof mediaType!=='string'||!mediaType.trim()) throw new TypeError('MEDIA_TYPE_REQUIRED');
  const media=mediaType.trim().toLowerCase();
  const matches=catalog.profiles.filter((x)=>(x.media_types||[]).map(v=>v.toLowerCase()).includes(media));
  if(matches.length!==1){
    return Object.freeze({
      schema:'xiio.sdk.artifact-profile-resolution/v1',
      state:matches.length?'AMBIGUOUS':'UNKNOWN',
      media_type:media,
      profiles:matches.map(x=>x.profile_id),
      first_red:matches.length?'MULTIPLE_PROFILES_MATCH_MEDIA_TYPE':'NO_PROFILE_MATCHES_MEDIA_TYPE',
      authority_granted:false,
      provider_effect:false,
    });
  }
  return resolveArtifactProfile(matches[0].profile_id);
}
