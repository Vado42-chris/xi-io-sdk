# SDK205 additive accepted-main source join

**Additive artifact-only publication: a minimal replay closure, not full installation source. Publishing this bundle does not apply its runtime patch. It is not a full SDK tree, accepted generation, installation or promotion receipt.**

## Exact apply specification

- Repository: `Vado42-chris/xi-io-sdk`.
- Required accepted base: `61df653e589422fc626af185f74436a8649bad65`.
- Exact donor: existing SDK PR205 head `07f1ff319e1694057fd8b502d1f96080e90306aa`.
- Patch: `patches/sdk205-current-main-join.patch`.
- Patch SHA-256: `2243ab508253a1010c7e4c8d1ace0a7e0bafb346dd9862bca10aa797290c0351`.
- Only changed upstream paths: `package.json`, `src/worker/connection.mjs`, `scripts/test-worker-connection.mjs`.

The connection and owner tests are exact existing PR205 blobs (`80a926a21b0b53fed56d90addf621b026f62330d` and `62da5d01a7ab77036a1c04afa272f6bee5ef0b8b`). Package changes add its public export/test script and append its gate without dropping any accepted gate. Accepted lifecycle `fc5dbbcc72dabd36904759cf6d910714a4bbac99` and self-drive `d81c1e65f474cecf18f8fc6700f08ff71038c17e` remain exact. This is not wholesale donor-branch adoption; no lifecycle reexport or donor documentation claiming one is introduced.

Before any owner-authorized application, inspect the existing SDK owner's current branch, PR205 head, comments and exact source. At the frozen inspection, PR205 was open/draft and no exact accepted-main join writer was observed; this is not an exclusive writer lease. On the required clean base, the owner can run `git apply --check /path/to/bundle/patches/sdk205-current-main-join.patch`, then apply only after review. If the head changed, do not force/reset it: reconcile exact source blobs with the owner and regenerate/requalify. Publishing this artifact must not apply it or change production generation pins.

## Offline replay

Unpack into a writable directory, then run from any working directory:

```sh
node /path/to/bundle/replay.mjs
```

Requirements: Node 20+ and Git; qualified here on Node v24.22.1. No dependencies, network, full checkout, caller environment setup or private user HOME access are needed. The runner verifies hashes, sets private fixture HOME/config/temp before importing source in child processes, demonstrates the missing public export on exact baseline, clean-applies the patch, verifies expected patched source, runs owner validators and removes its fixture in `finally`. It prints a receipt without rewriting the frozen payload. The unpacked directory must permit temporary fixture creation.

| Qualification | Expected |
| --- | --- |
| Baseline public worker/connection import | Expected `ERR_PACKAGE_PATH_NOT_EXPORTED` |
| Exact base/donor blobs and clean patch apply | PASS |
| Existing connection owner tests | 54/54 PASS |
| Accepted lifecycle validator | PASS; catalog denominator 15, bounded-selection cases 13, available 11 / gaps 4 |
| Accepted babysit validator | 13 cases PASS, including ten consecutive runs |
| Accepted self-drive validator | 15 cases PASS |
| Common public connection/lifecycle/babysit imports | PASS |
| No authenticated ports / unqualified worker status | `SDK_WORKER_PORTS_UNBOUND` / `SDK_LOCAL_AGENT_NOT_QUALIFIED` |

`SOURCE.json` gives the authoritative source recipe and URLs; `RECEIPT.json` is frozen replay evidence; `MANIFEST.json` records size/SHA-256/Git blob for every shipped payload except itself. `base/` is the minimal accepted module/catalog/validator closure, not a complete repository. `qualification/common-exports.mjs` is an audit helper and not an upstream patch path. No local materialized-test Git SHA is represented as upstream authority.

## Promotion remains pending

The selected source join is qualified, not the entire SDK build/archive or full CLI/Ibal/Zed consumer set. Existing owner adoption, a subsequently accepted SDK generation, full affected-consumer qualification and production pin review remain required. Authentic Ward/session/BINS/Switchboard adapter binding, independent real byte readback and installed host execution remain unproven. No authority/provider effect is granted by these fixtures.

Existing staging pins, runtime, queue, third-party applications, credentials and permissions are unchanged. Publication is artifact-only, not merge/deployment/runtime application.
