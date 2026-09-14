# Implementation plan: transaction marble testing for Sodium

- **Status:** Draft
- **Date:** 2026-09-14
- **Decisions this implements:** ADR-0001, ADR-0002, ADR-0003, ADR-0004

## Baseline

`sodium-typescript` at `25c5984`. Suite: **61 tests, 14 suites, green, 14.4s** —
of which `Timer.spec.ts` is 10.9s and asserts nothing about timers.

Any phase that leaves the suite red is not done. The baseline is the gate.

## Shape

Three artifacts (ADR-0004), each depending only on the one below:

```
swirly fork (grid-mode, published)   <-  helper library  <-  sodium-typescript
       Phase A                            Phase B               Phase C
```

## Target API

Shape to react to before I build it, not a commitment. Diagrams are Swirly grid
specifications verbatim (ADR-0003):

```ts
marbleTest('hold', ({ sink, cell, stream }) => {
  const sa = sink<string>('s1');
  cell('c', sa.hold('a'));
  stream('s1', sa);
  return `
    @ t | 0 | 1 | 2 | 3 | 4 | 5

    = c | 'a' |  | 'b' |  | 'c' |

    > s1 |  | 'b' |  | 'c' |  |
  `;
});
```

The builder runs inside the setup transaction, which is *not* a column. `sink`
declares a driven row; `stream`/`cell` declare observed rows. The harness owns
unlisten and asserts registration balance. No `done`, no `kill()`, no `out`
array. Three properties it has to keep:

1. Underdelivery fails with a diff, never a timeout.
2. Overdelivery fails — extras cannot be silently dropped.
3. A leaked listener fails the test that leaked it, not the next one.

## Phase C0 — toolchain bump (first, not last)

Decided in ADR-0004: `sodium-typescript` moves to TypeScript 5, jest 29 and
ts-jest 29 before the helper is built, so the helper is never shaped around a
TypeScript 3 constraint.

Done in two stages, each gated on the measured baseline:

1. **Test toolchain** — typescript, jest, ts-jest, `@types/*`. Gate: 61 tests
   green.
2. **Build toolchain** — rollup and its plugins; `rollup-plugin-typescript2`
   0.17 cannot drive TypeScript 5. Gate: `npm run build` exits 0 and still emits
   CJS, ESM, UMD and typings.

**Exit:** both gates met, with the prototype not yet started. **Done** — 61
tests green on TypeScript 5.9 / jest 29 with no source changes, and the build
emits CJS, ESM, UMD and typings, each smoke-tested rather than merely present.

Two things the bump turned up. `rollup-plugin-typescript2` is unusable here: it
cannot resolve extensionless TS imports under rollup 4, and when
`@rollup/plugin-node-resolve` resolved them instead, rpt2 silently declined to
transform those files, so rollup parsed raw TypeScript. Replaced with
`@rollup/plugin-typescript`. And the UMD output was never minified — the uglify
plugin has been commented out for years while the file kept the `.min.js` name.
That behaviour is preserved rather than fixed, since changing it is a change to
a published artifact and unrelated to this work.

## Phase A — Swirly fork

- Add the `!` throw row: a new `rowKind` on `BaseGridRow`, a parser ahead of
  `streamParser`, and a rendering.
- Publish `grid-mode` under a scope we control.

**Exit:** `@…/parser` installable and parsing all of `examples/grid*.txt` plus a
`!` row.

## Phase B — helper library

Decided in ADR-0004: built inside `sodium-typescript` under
`src/tests/test-utils/marbles/`, structured so extraction is a move — imports
from `src/lib/Lib` only, nothing else under `src/tests/`.

**B1 Recorder** — no parser needed, so this is unblocked by A and can start now.
`Transcript`, `Recorder`, the `marbleTest` harness, setup transaction,
auto-unlisten, registration balance. Boundary detection per F5: key ticks on
`Transaction.currentTransaction` identity, close each with a `.last()`
registered from inside the listener. Record `external: boolean` per tick so
nested columns can be labelled. Drive one trailing empty transaction (ADR-0003).

*Exit:* assertions against `Transcript` literals pass for `map`, `hold` and
`snapshot`; no `done()`, no manual `kill()`. **Done** — 7 tests in
`MarbleRecorder.spec.ts`, suite at 68.

`last()` turned out to be unnecessary. Keying ticks on
`Transaction.currentTransaction` identity and appending on first sight already
yields the transactions in order, so the recorder never needs to know when one
ends. F5 still matters — it is what makes the identity readable from inside a
listener — but the tick-close hook it suggested is not needed.

Two invariants are enforced rather than assumed: a row firing twice in one
transaction is refused outright (F1 says it cannot happen, so silence would
make the transcript lie), and a leaked listener fails the test that leaked it
rather than the next one.

**B2 Renderer** — `Transcript` → grid specification. Cell rows shifted +1 into
the sampled view; nested column labels for non-external ticks; value formatting
back to literal spelling.

*Exit:* renders every B1 transcript; a mismatch prints two aligned diagrams;
the +1 shift is verified by a property test against a probe-sampled recording of
the same graph (the E9 technique).

**B3 Parser adapter and driver** — consume `@…/parser`, map
`GridRowSpecification` to expected transcripts, parse slot literals, drive
`sink` rows one `Transaction.run` per column.

*Exit:* round-trip properties under a generator — `format(parse(slot))` is
identity, and `parse(render(t))` ≡ `t`. Swirly's `examples/grid*.txt` vendored
as a conformance corpus.

**B4 Assertions** — framework-agnostic core plus a thin jest matcher.

*Exit:* the B1 tests read as diagrams.

## Phase C — sodium-typescript

- devDependency on the helper; resolve the interop route (ADR-0004 trade-offs).
- Migrate the specs that benefit. Good exemplars: `map`, `hold`, `snapshot`,
  `lift`, `liftGlitch`, `switchC`. **Not** `coalesce` or `mergeSimultaneous` —
  simultaneous sends are deliberately outside the notation, so those stay
  hand-written, as does `liftFromSimultaneous`.
- Characterisation test pinning F4's **current** behaviour so a future fix is
  deliberate and visible.
- Real tests for the three vacuous throw tests (`StreamSink.spec.ts:35`, `:44`,
  `CellSink.spec.ts:69`) using `!` rows.
- File the F4 issue upstream.

**Exit:** test count ≥ 61, green, no net loss of coverage.

## Deferred

Virtual timer (ADR-0001's `TimerSystemImpl` seam) and trace-all-vertices
(ADR-0002). Each needs its own ADR.

## TODO

**Phase 0 — decisions**
- [x] ADR-0001 transaction axis
- [x] ADR-0002 transcript as primitive
- [x] ADR-0003 grid notation (rewritten to adopt Swirly grid mode)
- [x] ADR-0004 packaging and layering
- [ ] Name and create the helper repository
- [ ] Settle the TS3/jest23 interop route

**Phase C0 — toolchain bump**
- [x] typescript 5, jest 29, ts-jest 29, `@types/*` — 61 tests green
- [x] rollup and plugins — `npm run build` exits 0, all four outputs emitted

**Phase A — swirly fork**
- [ ] `!` throw row: type, parser, renderer
- [ ] Publish `grid-mode`

**Phase B — helper library**
- [x] `Transcript` types and equality
- [x] `Recorder` — transaction keying, tick kinds (setup/external/deferred)
- [x] `runTranscript` harness — setup transaction, auto-unlisten, registration balance
- [x] Trailing empty transaction
- [ ] Renderer, incl. +1 cell shift and nested column labels
- [ ] Aligned two-diagram failure message
- [ ] Probe-sampled property test for the shift
- [ ] Parser adapter over `@…/parser`
- [ ] Slot literal parse/format round-trip
- [ ] Driver
- [ ] Conformance corpus from `examples/grid*.txt`
- [ ] Assertion core + jest matcher

**Phase C — sodium-typescript**
- [ ] devDependency and interop
- [ ] Migrate `map`, `hold`, `snapshot`, `lift`, `liftGlitch`, `switchC`
- [ ] Characterisation test pinning F4
- [ ] Real throw tests via `!` rows
- [ ] File F4 upstream
- [ ] Final count ≥ 61, green

## Risks

- **The toolchain bump is now the first risk, not a deferred one.** It touches
  the build of a published library for reasons unrelated to marble diagrams, and
  it churns all 61 tests before the helper exists to justify it. Mitigated by
  doing it in two separately-gated stages against a measured baseline.
- **Extraction leak.** The prototype lives inside `sodium-typescript` by
  decision; if it reaches into other test helpers it stops being extractable.
  Enforced by the import rule in ADR-0004.
- **Transaction identity as a tick key.** Holding `Transaction` objects in a
  `Map` keeps them alive; use a `WeakMap` or clear per test.
- **`last()` re-entrancy.** `Transaction.close()` clears `lastQ` after draining
  (`Transaction.ts:151`) but re-reads `.length` each iteration. Don't rely on
  that; register exactly once per tick.
- **Notation drift.** Mitigated by consuming Swirly's parser rather than
  reimplementing, plus the vendored conformance corpus.
- **Scope creep into the library.** F4 is a bug in `sodium-typescript`. Pin it,
  report it, do not fix it here.

## Open questions

1. **Repository and name for the helper** — no longer blocking, since the
   prototype lives in this repository until extraction.
2. **Slot literal grammar** — JSON5-ish subset; must cover strings, numbers,
   `null`, arrays.
3. **How to spell `Unit`** in a slot.
4. **`!` row rendering** in the fork.
5. **Intra-transaction cross-row ordering** — decided: record it, do not assert
   it by default.
