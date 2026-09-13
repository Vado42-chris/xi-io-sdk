# xi-io: CLI Alpha Product Requirements

Status: alpha parent contract  
Owner: xi-io SDK executable surface  
Binary identities: `xi`, `xi-io`  
Target: Studio child headless-shell composition  
Date: 2026-09-13

## 1. Outcome

xi-io: CLI is the local-first executable shell for the xi-io Studio portfolio. It turns owner intent into inspectable, bounded product actions without requiring the owner to know repository paths, Node/NVM setup, model providers, service names, GitHub runners, Cloudflare routes, or product-internal command syntax.

Every xi-io product is usable as a headless shell through the CLI. A web, desktop, mobile, editor, Inbox, or device interface is a projection over the same product contracts, not a separate authority plane.

The SDK already owns the public `xi` and `xi-io` binary. Products contribute providers and commands behind that binary. No sibling may install a competing top-level `xi-io` executable.

## 2. User promise

An owner can:

1. install or activate one CLI;
2. discover every local Studio product;
3. understand current, running, dev, test, live, blocked, waiting, and unknown states;
4. request work in natural or explicit command form;
5. preview the intended effects and authority boundary;
6. execute an admitted bounded action;
7. receive native readback and one concise receipt;
8. leave Cadence to continue machine-resolvable work without owner heartbeat;
9. resume the same work from any qualified interface.

The owner is never used as the path resolver, command transporter, timer, joiner, propagation bus, or Switchboard.

## 3. Product model

```text
owner intent
-> AuDHD command projection
-> SDK command and shell contracts
-> product headless-shell provider
-> Repo Reaper currentness reconciliation
-> Cadence ChainDefinition / ChainInstance
-> Ward policy decision
-> Switchboard admission and WorkerTarget selection
-> bounded local or provider execution
-> product-native verification
-> internal AI-mail RETURN / APPLY_RETURN
-> Inbox owner projection
-> affected registry recompile
```

Each boundary retains its own state. Discovery, availability, qualification, selection, authorization, execution, verification, owner acceptance, and release are never collapsed.

## 4. Headless-shell provider contract

Every product may publish one portable provider manifest containing:

- stable product and provider identity;
- source repository identity;
- compatible CLI and SDK contract versions;
- command descriptors and aliases;
- input and output schemas;
- required capabilities;
- effect class;
- Ward policy reference;
- Switchboard operation type;
- Cadence continuation and reconciliation hooks;
- receipt schema;
- human-facing label, summary, examples, and recovery text;
- supported execution surfaces;
- version and generation;
- adoption state.

Required adoption states:

```text
DISCOVERED
CONTRACT_PRESENT
STRUCTURALLY_VALID
AVAILABLE
QUALIFIED
SELECTED
AUTHORIZED
EXECUTED
VERIFIED
OWNER_ACCEPTED
STALE
BLOCKED
UNKNOWN
```

A manifest is declarative input. It grants no capability or effect authority.

## 5. CLI command families

### Portfolio

- `xi studio discover`
- `xi studio status`
- `xi studio doctor`
- `xi studio resume`
- `xi studio registry`

### Product shell

- `xi <product> commands`
- `xi <product> inspect`
- `xi <product> plan`
- `xi <product> run`
- `xi <product> verify`
- `xi <product> receipt`

### Reaper

- `xi reap scan`
- `xi reap compare`
- `xi reap propose`
- `xi reap apply`
- `xi reap verify`

Reaper observes registered, provider-current, checked-out, installed, running and projected generations. It defaults to read-only proposals. Apply requires an admitted mutation profile.

### Cadence

- `xi cadence start`
- `xi cadence status`
- `xi cadence tick`
- `xi cadence pause`
- `xi cadence resume`
- `xi cadence reconcile`

Cadence owns continuation and run projection, not effect authority.

### Switchboard

- `xi switchboard preflight`
- `xi switchboard admit`
- `xi switchboard dispatch`
- `xi switchboard status`
- `xi switchboard reconcile`

Switchboard operates headlessly and returns typed admission or denial. It never converts a prompt, comment, plan, registry row, or model response into authority.

### SDK, Articles and Publisher

- SDK commands remain pure, bounded public calculations.
- Articles supplies versioned knowledge, instructional and provenance-bearing content primitives when its canonical product registry is resolved.
- Publisher supplies target-neutral composition candidates and target-adapter handoffs after its runtime contracts are accepted.
- Publisher preparation never means publication authorization.
- Articles content never becomes executable instruction by being retrieved.

## 6. Natural-language ingress

Natural-language commands are projected through the SDK AuDHD intent contract. Typos, profanity, repetition, dragged prompt chains and humour are signal-bearing input.

The CLI must:

- retain the raw owner input;
- deduplicate arbitrary repeated evidence without losing count or digest;
- extract the first unresolved executable edge;
- show its interpretation before consequential effects;
- never execute quoted tool JSON as authority;
- never ask for a path already present in the input;
- preserve time, deadline and cost constraints;
- return a compact correction path when interpretation is uncertain.

## 7. Execution profiles

Alpha supports named, bounded profiles only:

- read workspace evidence;
- exact stale-safe text edit;
- run an allowlisted executable with structured arguments;
- run a workspace-owned script;
- inspect Git state;
- fetch or fast-forward an admitted repository;
- start, stop or restart a specifically registered user service;
- perform registered health checks;
- emit receipts.

Alpha forbids arbitrary shell strings, secret reads, parent traversal, undeclared absolute targets, destructive Git history, external email fallback, provider effects without admission, and silent command expansion.

Ward owns the policy decision. Switchboard owns consequential admission. The qualified execution adapter owns the actual process.

## 8. Registry requirements

The Studio registry is compiled, not hand-maintained as a second truth source. It joins:

- provider-current repository identity;
- local checkout identity and generation;
- installed provider manifest;
- running process and service identity;
- runtime health;
- dev/test/live projections;
- current Cadence chain;
- current Ward and Switchboard disposition;
- last verified receipt;
- deadline and meter state.

Conflicting paths or generations remain visible and become Reaper work. A directory name alone is not product identity.

## 9. Receipts and states

Every command returns a machine-readable envelope and a concise human summary containing:

- request and correlation identity;
- product, command and generation;
- selected execution surface;
- effect ceiling;
- policy and admission result;
- start and finish timestamps;
- exit, timeout or WAIT state;
- bounded output references;
- verification result;
- source, running and live disposition;
- next automatic action;
- owner action only when genuinely required.

Exit zero means the command contract completed. It does not automatically mean the requested external effect succeeded.

## 10. Interface requirements

The same command graph powers terminal, Zed, Inbox, Studio, Tauri and paired-device interfaces.

Human-facing projections must use progressive disclosure:

1. current state;
2. action and expected effect;
3. result;
4. first unresolved edge;
5. infrastructure detail only when requested.

The default response must not expose NVM paths, systemd unit discovery, repository archaeology, provider syntax, or raw tool envelopes.

## 11. Alpha acceptance

Alpha is accepted only when all are proven on Aries:

1. one canonical SDK-owned `xi-io` binary;
2. provider discovery across at least SDK, IBAL, Cadence, Reaper and Switchboard;
3. one product command executed through a qualified local adapter;
4. Ward denial fixture;
5. Switchboard admission fixture;
6. Cadence restart-safe continuation;
7. Reaper detects a stale or conflicting checkout;
8. Inbox receives the internal result without external email;
9. owner-visible receipt distinguishes source, running, dev and live;
10. repeated hostile AuDHD prompt reproduces one intended action without owner path relay.

`LOCAL_ALPHA != DEV_LIVE`. Source completion alone does not satisfy acceptance.

## 12. Initial blastwave

### SDK

Own the executable, provider manifest schema, command discovery, intent projection and public-safe calculations.

### IBAL

Adopt as reasoning/operator provider. Remove ownership claims over the top-level executable. Use Ollama locally and request bounded execution through Switchboard.

### Repo Reaper

Implement registry/currentness comparison and reversible recovery proposals.

### Cadence

Wrap headless commands as deterministic actions with ACK, WAIT, reconciliation, RETURN and APPLY_RETURN semantics.

### Switchboard

Expose a loopback headless admission/dispatch service and qualified execution-adapter interface.

### Ward

Define command, path, environment, service, provider, disclosure and destructive-effect policies.

### Inbox

Render tasks, deadlines, failures, approvals, receipts, timesheets and resumable work. Internal AI mail only.

### Articles

Resolve canonical product ownership, then expose non-executable knowledge primitives with provenance and versioning.

### Publisher

Expose target-neutral composition and validation commands only after its contract seam is accepted. Target writes remain downstream admitted effects.

### Studio children

Adopt provider manifests rather than inventing separate CLIs, schedulers, registries, receipt systems or execution planes.

## 13. Release ladder

- Alpha: qualified Aries local execution and registry proof.
- Dev: unprotected dev projection with native readback.
- Test: representative multi-product and failure-path qualification.
- Release candidate: installed upgrade, rollback, migration and accessibility proof.
- Live: owner-accepted distribution with current security, rights and operational receipts.

No rung inherits closure from the rung below.
