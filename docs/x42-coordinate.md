# X42 Compact Coordinate Projection in `@xi-io/sdk`

Canonical measurement semantics originate in `Vado42-chris/xi-io-benchmark` accepted main `d8761a082a74de8b4a640fd3f2898891b788ccc4`.

The SDK exports a portable projection parser at:

```js
import { parseX42Coordinate, qualifyX42Coordinate } from '@xi-io/sdk/projections/x42-coordinate';
```

Example:

```js
const parsed = parseX42Coordinate('<<<<<<<<<<|??????????|>>>>>>>>>>|xxxxxxxxxx|++++++++++|----------');
// reap=5, unknown=10, sow=5, blocked=10, gain=10, cost=10
```

Compact HVT example:

```text
@ibal*5[truth,source,runtime,fleet,return]<<5?2>>5x1+7-3{live=0,r1=1}!no-flatplanes%4/5
```

The SDK preserves the X42 authority boundary. Parsing punctuation never grants work, effect, provider, LIVE, money, or closure authority.

Hard:

- `SYMBOL != EVIDENCE`
- `VECTOR != WORK_AUTHORITY`
- `@ACTOR != AUTHORIZED_PRINCIPAL`
- `*WORKERS != USEFUL_CAPACITY`
- `+GAME_SCORE != MONEY`
- `$VALUE_WITHOUT_OBSERVATION != MONEY`
- `%COVERAGE != CLOSURE`
- `~SYNTHETIC != OBSERVED`
- `<< REAP != RETURN/APPLY_RETURN PROOF`
- `>> SOW != ADMITTED WORK`

The public SDK Playground includes an interactive coordinate parser so the simplest UX HVT remains visible: can a user type the shorthand, run it, and inspect the expansion?

This SDK module is a reusable projection. X42 remains the benchmark/measurement owner; downstream products such as DataForge may consume the expanded vector without cloning X42 authority.
