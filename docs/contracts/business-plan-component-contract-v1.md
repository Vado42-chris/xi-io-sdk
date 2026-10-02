# Business Plan Component Contract v1

Contract ID: `XIIO-BUSINESS-PLAN-TRINITY-001A`  
Owner: xi-io SDK  
Operator: `XIIO-BIZPLAN-CENSUS-20260922-01`  
State: candidate reusable contract  
Effect authority: none

## Purpose

Define portable data/state/component contracts used to render and inspect a business plan. The SDK owns reusable behavior and presentation primitives only. It does not own product facts, pricing decisions, forecasts, editorial truth, market claims, or publication authority.

Hard boundary:

`SDK_ATOM != ARTICLES_SEMANTIC != PUBLISHER_RECIPE`

## Reusable records

### ProductCurrencyRecord

Required fields:

- `product_id`
- `owner_ref`
- `observed_at`
- `generation_ref`
- `activity_window_from`
- `activity_window_to`
- `activity_count`
- `activity_count_capped`
- `evidence_state`
- `commercialization_state`
- `source_refs[]`
- `unknowns[]`

### EntitlementRecord

Required fields:

- `entitlement_id`
- `label`
- `price_class`: `FREE | FIXED_RECURRING | USAGE | LICENSE | SERVICES | UNKNOWN`
- `period`: `NONE | MONTH | YEAR | ONE_TIME | VARIABLE`
- `currency`
- `amount`
- `amount_truth_class`
- `included_capability_refs[]`
- `excluded_capability_refs[]`
- `toggle_behavior`
- `source_or_assumption_ref`

### ForecastAssumption

Required fields:

- `assumption_id`
- `label`
- `value`
- `unit`
- `truth_class`
- `scenario_scope[]`
- `source_ref`
- `rationale`
- `sensitivity_direction`

### ForecastScenario

Required fields:

- `scenario_id`: `LOW | BASE | HIGH`
- `assumption_refs[]`
- `periods[]`
- `derived_metrics`
- `calculation_ref`
- `unresolved_inputs[]`

## Truth classes

Allowed money/forecast truth classes:

`OBSERVED_COST | OBSERVED_REVENUE | OWNER_PROPOSAL | MARKET_REFERENCE | MODEL_ASSUMPTION | DERIVED_FORECAST | UNKNOWN`

SDK components must display the truth class rather than flattening all numbers into one visual treatment.

## Recommended primitive composition

Use existing SDK primitives where possible:

- `page-shell`
- `section`
- `panel`
- `grid`
- `status-badge`
- `evidence-panel`
- `context-inspector`
- `progressive-disclosure`

Business-plan-specific semantics stay outside SDK.

Candidate reusable component roles, if later justified by multiple adopters:

- `assumption-badge`
- `product-currency-matrix`
- `entitlement-matrix`
- `forecast-grid`
- `sensitivity-row`

These are candidate roles, not accepted primitives merely because this contract names them.

## Fail-closed invariants

- `MARKET_REFERENCE != XIIO_PRICE`
- `OWNER_PROPOSAL != ACCEPTED_PRICE`
- `DERIVED_FORECAST != OBSERVED_REVENUE`
- `UNKNOWN != ZERO`
- `ZERO != OMITTED`
- `PRODUCT != SKU`
- `REPOSITORY != PRODUCT`
- `ACTIVITY_COUNT != PRODUCT_VALUE`
- `SDK_RENDER != COMMERCIAL_AUTHORITY`
- `SDK_COMPONENT != PUBLISHER_RECIPE`

## Minimal portable payload

```json
{
  "schema": "xiio.sdk.business-plan-component-data/v1",
  "contract_id": "XIIO-BUSINESS-PLAN-TRINITY-001A",
  "currency": "CAD",
  "product_currency": [],
  "entitlements": [],
  "assumptions": [],
  "scenarios": [],
  "source_refs": []
}
```

## Cross-root handoff

Articles owns the meaning of sections, claims, evidence and assumptions.

Publisher owns arrangement, responsive placement, progressive disclosure and target-neutral composition.

The business-plan instance owns the actual product census and financial model.
