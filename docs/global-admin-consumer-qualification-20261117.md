# Shared admin lifecycle and tenant observation consumption

Baseline: accepted SDK `5f782fff3e278a0e909738db9911cbf9e73b163c`.

## Defect and shared repair

The entitlement producer accepted ACTIVE, PENDING, SUSPENDED, REVOKED and EXPIRED,
while the admin projection refused three of these valid states. The projection
also discarded supplied tenant identity from entitlement and usage observations.
These are display/identity conservation bugs, not evidence of a live disclosure.

`src/billing/product-entitlement.mjs` now owns the frozen
`PRODUCT_ENTITLEMENT_STATES` vocabulary. Both its existing binding producer and
`src/identity/global-admin-projection.mjs` consume it. No new authority or schema
is introduced. Legacy admin-only INACTIVE/STALE/UNREAD/REFUSED observations remain
supported. Producer states and generation hashing are unchanged.

Explicit `tenant_ref` is validated and preserved on entitlement and usage rows.
Missing tenant identity stays missing, not aggregate privilege. The authenticated
host must filter authorized principal/tenant/product scope before supplying rows;
this pure projection never establishes that authorization. All effect flags remain
false. Recursive credential and accessor rejection remains in place.

## Executed consumer evidence

- New lifecycle/tenant regressions: three failed before the fix and pass afterward.
- Admin, real entitlement producer and credential-custody tests: 29/29 pass.
- Actual mounted SAM `OrgAdminView` plus `GlobalAdminProjectionProvider`, using
  this SDK projector: 8/9 before, 9/9 after. PENDING/SUSPENDED/EXPIRED now render
  as observations rather than making administration unavailable. No action button
  appears and the existing authority/refusal/late-read checks remain passing.
- SAM source blobs: view `030ef1c1003618ddeb6e7aaa54df75da35397d48`, provider
  `685547709fb295d92181d824c683ff8efb04feda`, original regression file
  `6ab23b048943ed8ee0eeaa1fdec0c692ce4fd8eb`. One synthetic non-active lifecycle
  test was appended locally; no SAM source is changed by this SDK carrier.
- Full baseline and final candidate `npm run check`: exit 0, including all 108
  runtime-ROTFL command occurrences plus outer checks. All 377 baseline Git
  blobs and the original signed commit/tree were reconstructed exactly from
  provider bytes. Test-only cache/state locations were isolated under /tmp.
- Independent reviewer reran 29/29 shared checks, 9/9 mounted consumer tests,
  browser bundling, zero getter evaluation and legacy-state compatibility.
- Browser-platform bundling of the actual projector succeeds without Node shims.

## Affected consumption and outstanding gates

SAM's accepted UI is an affected consumer through an installed host-supplied SDK
port. It still needs a real authenticated installed reader. Its current row text
also omits tenant labels: retention here does not claim that downstream rendering
fix. Other product consumers are UNKNOWN until exact imports/adapters and their
runtime bindings are checked. The current Studio relationship graph explicitly
has `complete:false`; this bounded receiving test is not a complete portfolio census.

No credentials, real customer/legal data, admin actions, provider effects,
billing commits, installed SDK adoption, or operational product acceptance are
claimed. Shared source acceptance does not imply all consumers are upgraded.
