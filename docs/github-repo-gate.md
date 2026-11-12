# Standard GitHub gate for xi-io repositories

**Problem it fixes:** each repository carried its own hand-written workflow, most of them on GitHub-hosted runners (`ubuntu-latest`). Private repos on the owner's account are refused before any step runs ("recent account payments have failed or your spending limit needs to be increased"), so those checks never ran, and a red X said nothing about the code.

**Standard:** one reusable workflow in this public SDK, `.github/workflows/xiio-repo-gate.yml`. Each repo adds the ~20-line caller from `templates/github/xiio-repo-gate.caller.yml`.

| Repo visibility | `runner` input | Billing |
|---|---|---|
| Private | `'["self-hosted","linux","x64"]'` (owner's xi-io runner on Aries) | none |
| Public | `'"ubuntu-latest"'` | free for public repos |

**Pin, don't track:** callers reference the reusable workflow by a full SDK commit SHA, not `@main`. A moving SDK must not silently change every consumer's gate. Each repo bumps its pin after the new generation is qualified for it: current SDK main → exported primitive → consumer pin → actual caller → qualification → adoption → affected return.

**Gate of record:** `gate_command`, or the first existing package script of `check`, `verify`, `test`. Install uses the lockfile that is present (bun, pnpm, npm). Every run writes the artifact `xiio-gate-receipt-<sha>`: repository, head SHA, event, runner, command and outcome. That gives Ollama workers and the Reaper census one machine-readable result per head instead of a log to scrape.

**Runner offline:** a job waits as *queued*, it does not fail. Recover with `xi-io runner recover --repo <owner/repo>` (`src/recovery/aries-runner.mjs`). Attaching the Aries runner to a new private repo needs a registration token, so it is an owner-approved step.

Hard: `QUEUED != PASS` · `HOSTED_EMPTY_STEPS != SOURCE_FAIL` · `GATE_PASS != LIVE` · `RECEIPT != OWNER_ACCEPTANCE`.

First adopter: `Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026`.

**Visual product consumers:** For a game or other sprite-driven product, `gate_command` must build the deployable artifact and run browser acceptance against that *built artifact* (for Vite, `vite preview` after `vite build`), not only a Vite dev server or asset-manifest/unit tests. The browser check must fail on missing/undecodable registered artwork in every supported camera/view, and preserve screenshot evidence tied to the tested commit. A source-art receipt, passing development server, or queued workflow cannot satisfy the installed/Preview acceptance boundary. The product's existing manifest determines required sprites and views, never a duplicate hard-coded SDK product list. A pipeline with no Preview deployment job must explicitly report `NOT_DEPLOYED`, never `LIVE` or `RESTORED`.
