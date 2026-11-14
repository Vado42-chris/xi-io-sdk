# Game campaign kit v1, reusable candidate template

Status: **CANDIDATE CONTRACT, NOT REGISTERED CALLABLE PRIMITIVE AND NOT AN EXECUTABLE PUBLISHER ADAPTER**.

Owner: XI-IO SDK public template contract. Product truth lives with each game. Publisher owns channel export/publish behavior; Articles owns editorial content; BINS owns versioned artifacts; Ward owns authorization; Switchboard owns admitted worker delivery; Desktop is the operator surface. Never add this to `src/catalog/primitives.json` until an executable portable file-cube shipping path, validation and provider-qualified consumption exist.

## Reuse existing primitives and boundaries

1. Product submits its own canonical source refs, lore, visuals, gameplay captures, release qualification and owner approvals. No copies of canonical sprite or card inventories.
2. Publisher assembles a versioned campaign candidate from editorial items, approved artwork, evidence, audience segments, channel formats and a budget.
3. Articles supplies dated devlogs, announcements, press copy, FAQ and backer updates as editable, source-backed content.
4. Each channel adapter maps the same campaign candidate to its own deliverable contract. Kickstarter is first egress, website/social/email/press are sibling egresses. Adapter availability is not assumed.
5. Ward-authorized human confirmation is required for external publish, account mutation, spend and financial commitments. Preview and export never imply submission.
6. BINS custody, immutable revision, independent readback, recipient/channel preview, redaction/link checks, source attribution and post-publish receipts form the delivery gate. A returned provider response is not APPLY_RETURN.
7. Each game owns budget and cash-flow risk, reward feasibility, shipping/tax treatment, rights clearances, release claims, community promises and campaign go/no-go. No model defaults may invent them.

## Kickstarter Canada first-adapter constraints, checked 2026-11-13

Canada is a supported creator country, subject to individual/entity identity, same-country bank and verification requirements. Kickstarter uses all-or-nothing goals and charges a 5% platform fee if successful, with Canadian processing fees published as 3% + CAD 0.40 for standard pledges and 5% + CAD 0.10 for pledges below CAD 10. Budget estimates must model noncollection, taxes, reward production and fulfillment separately. Reconfirm the platform's current rules before launch.

Primary sources:
- https://updates.kickstarter.com/who-is-eligible-to-use-kickstarter/
- https://www.kickstarter.com/help/fees?country=CA
- https://www.kickstarter.com/how-it-works
- https://legal.kickstarter.com/

## Mandatory states

`SOURCE_DISCOVERED -> DRAFT -> COSTED -> CONTENT_VERIFIED -> OWNER_REVIEWED -> CHANNEL_PREVIEWED -> AUTHORIZED_FOR_EGRESS -> SUBMITTED -> PROVIDER_RECEIPT -> INDEPENDENTLY_VERIFIED -> APPLIED`.

UNKNOWN, missing evidence, broken link, unauthorized channel or absent adapter must fail closed. The project may export a review package while the adapter remains unavailable.

## Delivery gates

- The template is consumed by a real game using source refs, not invented media.
- Kickstarter field map, reward cost table and budget have explicit UNKNOWN until owner decisions.
- A previewed export preserves approved source identity and revision.
- At least one Articles item and one Publisher candidate round-trip through versioned BINS custody and independent readback.
- An installed, authorized channel adapter demonstrates actual provider delivery and post-delivery receipt before any claim of publication.
- No campaign goes live without owner confirmation and policy/legal/tax review.
