# Earn an X-axis RCP locally

RCP is a local receipt for an X-axis scan. It is evidence, not runtime authority.

## Human

```sh
xi-io x scan .
xi-io x rcp .
```

`x scan` inventories stub-like function signatures and groups structurally equivalent occurrences. `x rcp` converts that scan into a receipt with a denominator, duplicate groups, unique artifacts, and a digest.

Read it as:

- duplicate group: fix/generalize once, then reap the class;
- unique artifact: inspect as a distinct candidate;
- WAIT: unresolved stubs remain;
- PASS: this bounded scanner found no stubs.

RCP does not mean deployed, live, usable, or authorized.

## AI skill

Call the same CLI and consume JSON. Do not scrape prose:

```sh
xi-io x rcp /workspace
```

Required invariant: `SCAN != EFFECT` and `RCP != RUNTIME_AUTHORITY`.
