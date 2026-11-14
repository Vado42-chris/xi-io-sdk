// Portable, provider-neutral campaign package contract. No effects or authority.
const states = new Set(['UNCONFIGURED', 'CONFIGURED', 'AUTHORIZED', 'VERIFIED']);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

export function validateCampaignPackage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('CAMPAIGN_PACKAGE_INVALID');
  const {product_ref, product_generation, campaign_ref, assets, channels} = input;
  if (![product_ref, product_generation, campaign_ref].every(nonempty)) throw Error('CAMPAIGN_IDENTITY_MISSING');
  if (!Array.isArray(assets) || !Array.isArray(channels)) throw Error('CAMPAIGN_COLLECTIONS_INVALID');
  const seen = new Set();
  for (const asset of assets) {
    if (!asset || ![asset.asset_ref, asset.version_ref, asset.digest].every(nonempty)) throw Error('CAMPAIGN_ASSET_CUSTODY_MISSING');
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
