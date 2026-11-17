# SDK worker runtime payload

`scripts/build-worker-runtime-package.mjs` is the SDK-owned producer for the
existing worker connection and its relative account-binding import. It emits
an existing strict Installer product manifest and a separate
`xiio.installer-dependency-descriptor/v1`, not a new receipt schema.

```
node scripts/build-worker-runtime-package.mjs <accepted-40-character-generation>
```

The release owner must authenticate that generation and source. The builder
validates its syntax, inventories the two real files, and records SHA-256,
size, mode and generation-scoped destinations. It does not prove Git provenance,
installation, permissions, service readiness or provider authority.

## Installation and consumption

1. Pass `manifest`, source root and `descriptor` to the existing Installer
   dependency binding operation. Installer owns materialization and the persisted
   private BOUND receipt.
2. Before loading any code, use the accepted owner verifier to reopen the receipt
   for `sdk-worker-runtime`, `Vado42-chris/xi-io-sdk` and the expected generation.
   Both `worker_connection_module` and `account_binding_module` must be verified.
3. Only then import the worker connection export. Verifying only the root module,
   or checking a checkout's Git HEAD, does not verify executable dependencies.

The candidate Plugins #50 loader is not qualified by this producer. Its Git-HEAD
check must be replaced through that existing owner; no user Zed settings are
changed by these SDK scripts. SDK #308's Installer verifier client is an existing
consumer option, not a second authority.

## Executable qualification

`npm run check` includes `check:worker-runtime-package`: exact source inventory,
relative-import closure and isolated import, generation separation, invalid
source/generation refusal. The test guards the current static closure; a future
relative or dynamic import must extend the declared closure and qualification.

`npm run check:worker-runtime-installed` requires these explicit test inputs:

- `XIIO_TEST_INSTALLER_PYTHONPATH`: accepted Installer Python package parent.
- `XIIO_TEST_FRAMEWORK_BINDING_READER`: accepted Framework dependency reader file.
- `XIIO_TEST_SDK_GENERATION`: the release generation under test.

Missing inputs fail rather than skip. Supply owner-qualified source, not mock
verifiers. The test uses disposable XDG roots, actual Installer bind/install,
persisted receipt, Framework reopen and SDK import. It refuses post-install
changes to either executable export before import and refuses a wrong generation.
This separate cross-owner gate must be executed when claiming installed custody;
the default source check alone cannot claim it. It neither grants Ward admission
nor tests a user's installed Zed, Ollama, MCP effects, BINS or RETURN.

## Affected consumers and unknowns

Studio current registry inspected at `94c49141a132ed00cdd72d0457911fc40523794f`:
denominator G2 blob `4d35947148ec03c765105da31366e3b5263081fc`, relationship
G1 blob `94816acdce4f7baf6550a4a6a1394b27f453a6d4`, `complete:false`.
SDK is AFFECTED (new package producer and executable tests). Plugins #47/#50 are
the identified downstream adapter owners; this does not mark them adopted.
CLI, @ibal and Desktop are potential receiving roots, with adoption UNKNOWN.
All other canonical members and the seven unknown-membership entries remain
UNKNOWN for adoption. No complete affected-set or portfolio release claim is made.
The existing registry remains canonical; this document is source usage guidance,
not another product registry or authorization record.

### Pinned cross-owner replay

The executable owner join checks `test/worker-runtime-owner-provenance.json`
before loading its reader or starting Python: exact Framework reader Git blob
and every file in the accepted Installer package inventory. Replay sources are
Framework `8aac1718ccac3b8ee44714056979a9db813c21b5` and Installer #43
`49848b4abc08fcd51e2e7ace9222d08b8ed1f68f`, consumed without changes in Cube
`72f74bcf3d1c85c98647a93dfeb927d60d33dbb6`. These are qualification source pins,
not a promise those generations remain latest or permission to install them on
user machines. A source upgrade requires deliberate pin reconciliation.
