# TP$ work projection hookup (SDK candidate)

This is a source-level integration guide for Studio, Sable, @ibal and Inbox implementers. It is NOT yet in-app user help and does not install an agent connector. Existing SDK, Ward, Switchboard, BINS, CRM and AI-Mail owners retain their authority.

## Read-only usage
Import `projectTpsCycle` from `src/evaluation/tps-work-projection.mjs`. Pass an existing authenticated work identity, pinned intent ref, actor, what/where/when/why, next HOW, context (`HOME|WORK|EMPIRE`) and proficiency (`NEWBIE|MODERATE|POWER`). This returns `summary`, `detail`, and a proficiency presentation descriptor. It does not change the underlying work.

## AI-Mail lifecycle
Producer may claim `NOT_FILED` or `QUEUED` without a delivery receipt. `DELIVERED` requires a delivery ID; `CONSUMED` requires delivery ID plus consumer ACK. The SDK describes provided evidence, but cannot cryptographically verify these IDs; external Inbox/BINS verification is required before any gate promotion. NEVER use `ai_mail_filed` or `ai_mail_consumed` alone as effect authority. `qualified_effect` remains false. Pass actual measured `elapsed_ms` and `cost_amount` with `cost_currency`; missing measurements remain null.

## Studio and Sable UX hookup (not yet wired)
Use the same Work ID and immutable pinned intent for all three context projections and all proficiency modes. Show the `summary` first to a Newbie, workflow details to a Moderate user, and the complete `detail` inspection for Power users. Allow per-domain proficiency overrides. Preferences never modify Ward scopes, work history, owner authorization, or privacy classification. Sensitive source content requires Ward-filtered inputs before calling this projector.

## 5.5 hookup (not yet wired)
Existing @ibal work record -> SDK projector -> Studio user surface. Existing Inbox #491 Result + BINS independent evidence -> @ibal verification -> idempotent Apply Return. A rendered receipt is NOT proof of this loop. Missing delivery/readback must stay visibly unverified. No extra registry, database or public issue is created by this SDK module.

## Developer verification
`node scripts/check-tps-work-projection.mjs` checks eleven deterministic projections. This covers shape and negative-control behavior only, not live Inbox/Aries/Studio integration.

## Questions and learning
Newbie: explain desired outcome, expected action, and consequences in plain language. Moderate: explain decisions and dependencies. Power: show five Ws, source generation, tools, tics, evidence, red blockers. Ask only where no existing work record or machine-readable evidence can answer. For every setting, provide a short human-readable example and a way to inspect the full source.

## Visual primitives and typography
Use three roles rather than three mandatory third-party fonts: (1) tall, narrow ultra-light display headings with sensible fallbacks and large spacing; (2) legible system sans for content at accessible sizes; (3) restrained sans/monospaced system accents for terminal identifiers and console snippets. User-created vector fonts must pass glyph coverage, hinting, shaping, licensing and accessibility checks before replacing fallback stacks. Sections should be composed primarily using rhythm, alignment, spacing and typographic hierarchy; apply borders for focus, safety, separation or genuine interaction boundaries. Do not ship an unqualified custom-font binary.

## Missing production hookups
Authenticated work intake, Ward redaction, Inbox transport, verified consumer acknowledgment, independent TP$ time/cost metering, cross-device local-first persistence and Studio in-app help remain OPEN. Concierge may automate read-only discovery and safe bounded steps only through independently admitted APIs; subscription status does not grant authority.
