# Product operation admission binding

This SDK contract removes caller booleans from the boundary between product entitlement, operation access and metered provider attempts.

The chain is deliberately exact:

```text
API declaration generation
→ product entitlement generation
→ AccessGrant generation
→ billing admission generation
→ bounded provider attempt
```

`admin` and `superadmin` are roles, not entitlements, AccessGrants, billing admissions or effect authorities. A matching role is required when an AccessGrant is resolved, but it cannot substitute for the grant.

A billing admission binds the exact principal, tenant, product, API declaration generation, capability, operation, entitlement, AccessGrant, rate card, budget reservation, meter unit and maximum quantity. It may allow a bounded provider attempt. It does not commit money and grants no provider or effect authority.

Live currentness objects are module-private branded results of exact source/readback generation comparison. Cloned, serialized and request-shaped currentness records are refused. Installed consumers must reopen their authority stores and create currentness locally rather than accepting these records from an HTTP request body.

Hard boundaries:

```text
ROLE_ELIGIBLE != ACCESS_GRANTED
ADMIN != ENTITLEMENT
SUPERADMIN != ENTITLEMENT
ACCESS_GRANT != BILLING_ADMISSION
BILLING_ADMISSION != PROVIDER_ATTEMPT
PROVIDER_ATTEMPT != BILLING_COMMIT
METER_EVENT != MONEY
ACTION_ALLOWED != EFFECT_AUTHORIZED
```
