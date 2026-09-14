# Evidence for ADR-0001..0003

These are the probe scripts behind the findings table in ADR-0003, kept so the
claims stay reproducible. They are **not** tests — they assert nothing, they
print. That is deliberate: a file full of `console.log` masquerading as a
passing test is the pattern ADR-0002 criticises.

They are named without `.spec`/`.test` so jest does not collect them, and they
live outside `src` so `tsc` (which compiles only `src/lib/Lib.ts`) ignores them.

To reproduce against the current tree:

```sh
cp docs/adr/evidence/probe-f1-f4.ts src/tests/unit/__probe.spec.ts
npx jest --runInBand src/tests/unit/__probe.spec.ts
rm src/tests/unit/__probe.spec.ts
```

Findings, and which probe shows each:

| Finding | Probe | What to look for |
|---|---|---|
| F1 — one firing per stream per transaction | `probe-f1-f4.ts` (E7) | `E7 VERDICT: max firings ... = 1` |
| F2 — cell initial value in the subscribe transaction; `snapshot` reads pre-update | `probe-f2-f3-f5.ts` (E3, E4) | `cell=1 @T1` / `snap=x:1 @T2` / `cell=2 @T2` |
| F3 — one `send` spans many transactions | `probe-f2-f3-f5.ts` (E5) | five transactions T1–T5 for a single `s.send(1)` |
| F4 — `postQ` index 0 does not share a transaction, index ≥ 1 does | `probe-f1-f4.ts` (E8) | `A1 @T4`, `B1 @T5` (separate) vs `A1p1 @T6`, `B1p1 @T6` (shared) |
| F5 — transaction boundaries observable from a listener | `probe-f2-f3-f5.ts` (E1/E2) | `inCallback=1`, and `last @Tn` after each event |
| Cell sampled view lags the update view by exactly +1 | `probe-cell-views.ts` (E9, E10) | `listen(cell)=b` at col 1 vs `sampled(cell)=b` at col 2, for both `hold()` and `CellSink` |

The last row is the measurement behind ADR-0003's reversal to the sampled view.
E9 also demonstrates the probe technique the plan reuses as a property test for
the renderer's +1 shift: snapshot the cell from a stream that fires in every
transaction, and you record what the diagram draws.

Phase 5 of the implementation plan replaces the F4 probe with a real
characterisation test that asserts the current behaviour.
