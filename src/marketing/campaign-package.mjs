// Portable, provider-neutral campaign package contract. No effects or authority.
const states = new Set(['UNCONFIGURED', 'CONFIGURED', 'AUTHORIZED', 'VERIFIED']);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const binsDigest = digest => digest && typeof digest === 'object' && !Array.isArray(digest)
  && digest.algorithm === 'sha256' && typeof digest.value === 'string'
  && /^[a-f0-9]{64}$/i.test(digest.value);

export function validateCampaignPackage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('CAMPAIGN_PACKAGE_INVALID');
  const {product_ref, product_generation, campaign_ref, assets, channels} = input;
  if (![product_ref, product_generation, campaign_ref].every(nonempty)) throw Error('CAMPAIGN_IDENTITY_MISSING');
  if (!Array.isArray(assets) || !Array.isArray(channels)) throw Error('CAMPAIGN_COLLECTIONS_INVALID');
  const seen = new Set();
  for (const asset of assets) {
    // Asset identity is presentation ownership. BINS resource_ref is the
    // independently addressable custody identity, not a filename or path.
    if (!asset || ![asset.asset_ref, asset.resource_ref, asset.version_ref].every(nonempty)
      || !binsDigest(asset.digest)) throw Error('CAMPAIGN_ASSET_CUSTODY_MISSING');
    if (seen.has(asset.asset_ref)) throw Error('CAMPAIGN_DUPLICATE_ASSET');
    seen.add(asset.asset_ref);
  }
  const channelNames = new Set();
  for (const channel of channels) {
    if (!channel || !nonempty(channel.channel_ref) || !states.has(channel.state)) throw Error('CAMPAIGN_CHANNEL_INVALID');
    if (channelNames.has(channel.channel_ref)) throw Error('CAMPAIGN_DUPLICATE_CHANNEL');
    channelNames.add(channel.channel_ref);
    if (channel.state === 'AUTHORIZED' || channel.state === 'VERIFIED') {
      // A registry claim is never an authorization or publication receipt.
      if (!nonempty(channel.authority_ref) || !nonempty(channel.authority_generation)) throw Error('CAMPAIGN_AUTHORITY_REFERENCE_MISSING');
    }
    if (channel.state === 'VERIFIED' && (!nonempty(channel.publication_ref) || !nonempty(channel.readback_ref))) {
      throw Error('CAMPAIGN_PUBLICATION_READBACK_MISSING');
    }
  }
  return Object.freeze({
    schema: 'xiio.sdk.product-campaign-package/v1',
    product_ref, product_generation, campaign_ref,
    asset_count: assets.length, channel_count: channels.length,
    claim_only: true,
    effect_authorized: false,
    publication_verified: false,
  });
}

// Existing game-campaign-kit/v1 consumers provide source-intake packets before
// BINS has assigned immutable asset versions. Preserve that distinction here.
// The output is an intake projection, never a publishable campaign package.
export function inspectGameCampaignIntake(packet) {
  if (!packet || packet.schema !== 'xiio.game-campaign-consumer-packet/v1'
    || ![packet.product_id, packet.source_generation, packet.kit_template, packet.candidate_id, packet.channel].every(nonempty)) {
    throw Error('CAMPAIGN_INTAKE_IDENTITY_INVALID');
  }
  if (!Array.isArray(packet.media_intake) || !packet.media_intake.every(item =>
    item && nonempty(item.id) && nonempty(item.source_registry) && nonempty(item.state))) {
    throw Error('CAMPAIGN_INTAKE_SOURCE_INVALID');
  }
  if (new Set(packet.media_intake.map(item => item.id)).size !== packet.media_intake.length) {
    throw Error('CAMPAIGN_INTAKE_SOURCE_DUPLICATED');
  }
  if (packet.egress?.publish !== false || packet.checks?.publication_allowed !== false) {
    throw Error('CAMPAIGN_INTAKE_UNVERIFIED_EGRESS');
  }
  return Object.freeze({
    schema: 'xiio.sdk.campaign-intake-projection/v1',
    product_ref: packet.product_id,
    product_generation: packet.source_generation,
    campaign_ref: packet.candidate_id,
    channel_ref: packet.channel,
    source_candidate_count: packet.media_intake.length,
    asset_custody_verified: false,
    effect_authorized: false,
    publication_verified: false,
  });
}
