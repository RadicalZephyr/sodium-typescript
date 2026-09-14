# Implementation plan: transaction marble testing for Sodium

- **Status:** Draft
- **Date:** 2026-09-14
- **Decisions this implements:** ADR-0001, ADR-0002, ADR-0003

## Baseline

Library at `25c5984`. Suite: **61 tests, 14 suites, green, 14.4s** — of which
`Timer.spec.ts` is 10.9s and asserts nothing about timers (all its assertions
are commented out; it checks `typeof ticker === 'function'`).

Any phase that leaves the suite red is not done. The baseline number is the
regression gate.

## Target API

Shape to react to before I build it, not a commitment:

```ts
import { marbleTest } from '../test-utils/marbles';

marbleTest('coalesce', ({ sink, observe }) => {
  const s = sink<number>('s', (a, b) => a + b);
  observe('out', s);
  return {
    values: { a: 2, b: 8, c: 40, d: 48 },
    drive:  { s: '-a(bc)' },
    expect: { out: '-a  d ' },
  };
});
```

The builder callback runs inside the setup transaction. `sink` and `cellSink`
register named input rows; `observe` registers named output rows and attaches a
recorder listener. The harness owns unlisten and asserts registration balance.
No `done`, no manual `kill()`, no `out` array.

Three properties this has to keep:

1. Underdelivery fails with a diff, never a timeout.
2. Overdelivery fails — extra events cannot be silently dropped.
3. A leaked listener fails the test that leaked it, not the next one.

## Phases

Each phase is independently useful and leaves the suite green.

### Phase 1 — Recorder core (no notation)

`src/tests/test-utils/marbles/` — `Transcript`, `Recorder`, `marbleTest`
harness. Assertions against `Transcript` literals only.

Boundary detection per F5: key ticks on `Transaction.currentTransaction`
identity; close each tick with a `.last()` callback registered from inside the
listener, once per transaction. Record `external: boolean` per tick so Phase 3
can reject a compact expectation for a deferred transcript.

**Exit:** `coalesce`, `mergeSimultaneous`, and `snapshot` rewritten against
transcript literals; those three contain no `done()` and no manual `kill()`;
full suite green.

### Phase 2 — Renderer (`Transcript` → diagram)

Compact and expanded forms; column-width padding; `renderSampled()` for the
cell diagnostic view.

**Exit:** every Phase-1 transcript renders; a deliberate mismatch prints two
aligned diagrams; golden tests over the renderer.

### Phase 3 — Parser (diagram → expected `Transcript`) and driver

Parser, values-map resolution, the `throws` row, and the driver that turns
`drive` rows into sends inside `Transaction.run` per column.

**Exit:** round-trip property tests under `jsverify` (already a devDependency,
already used by `FantasyLand.spec.ts`) — `render(parse(s)) === s` and
`parse(render(t))` ≡ `t`. A compact expectation against a transcript containing
non-external ticks **errors**, naming the expanded form (ADR-0003 trade-offs).

### Phase 4 — Assertion adapter

Thin jest matcher `toMatchMarbles` over the Phase 2/3 primitives. Keeps jest at
the edge per ADR-0002.

**Exit:** the three Phase-1 specs use the matcher and read as diagrams.

### Phase 5 — Migrate the suite, pin F4

Rewrite the unit specs that benefit. Add a characterisation test pinning the
**current** F4 behaviour (index-0 post actions get separate transactions,
index ≥ 1 share one) so a future fix is a deliberate, visible change. File the
upstream issue.

**Exit:** test count ≥ 61; no net loss of coverage; F4 pinned; issue filed.

### Phase 6 — Deferred, not in scope

Virtual timer (`TimerSystemImpl` seam, ADR-0001) and the trace-all-vertices view
(ADR-0002). Each needs its own ADR.

## TODO

**Phase 0 — decisions**
- [x] ADR-0001 transaction axis
- [x] ADR-0002 transcript as primitive
- [x] ADR-0003 notation
- [x] This plan
- [ ] Review pass — resolve the three open questions below

**Phase 1 — recorder**
- [ ] `marbles/Transcript.ts` — types + equality
- [ ] `marbles/Recorder.ts` — transaction keying, `last()` tick close, `external` flag
- [ ] `marbles/harness.ts` — `marbleTest`, setup transaction, auto-unlisten, registration balance
- [ ] Rewrite `coalesce`, `mergeSimultaneous`, `snapshot` against transcript literals
- [ ] Suite green

**Phase 2 — renderer**
- [ ] `marbles/render.ts` — compact, expanded, column padding
- [ ] `renderSampled()`
- [ ] Aligned two-diagram failure message
- [ ] Golden tests

**Phase 3 — parser + driver**
- [ ] `marbles/parse.ts` — slots, groups, values map, `throws` row
- [ ] `marbles/drive.ts` — column → `Transaction.run`
- [ ] Compact-vs-deferred rejection error
- [ ] `jsverify` round-trip properties

**Phase 4 — matcher**
- [ ] `toMatchMarbles`
- [ ] Convert the three specs to it

**Phase 5 — migration**
- [ ] Migrate remaining unit specs worth migrating
- [ ] Characterisation test pinning F4
- [ ] Add the three currently-vacuous throw tests as real `throws`-row tests
      (`StreamSink.spec.ts:35`, `:44`, `CellSink.spec.ts:69`)
- [ ] File upstream issue for F4
- [ ] Final count ≥ 61, green

## Risks

- **Transaction identity as a tick key.** Holding `Transaction` objects in a
  `Map` keeps them alive; use a `WeakMap` or clear per test. Low risk, easy to
  get wrong silently.
- **`last()` re-entrancy.** `Transaction.close()` clears `lastQ` after draining
  (`Transaction.ts:151`), and re-reads `.length` each iteration, so a `last`
  registered from a `last` still runs. The recorder should not rely on that;
  register exactly once per tick.
- **Notation drift from transcript.** Mitigated by the Phase 3 round-trip
  properties. This is the main reason the parser comes after the renderer.
- **Scope creep into the library.** F4 is a library bug. Pin it, report it, do
  not fix it here.

## Open questions carried from the ADRs

1. **Construction-time sends** (ADR-0003). `liftFromSimultaneous`
   (`CellSink.spec.ts:143`) sends into a `CellSink` *before* any listener
   exists. Our setup transaction is build → listen → drive, so column 0 sends
   land after registration. Needs a builder-phase escape hatch or an explicit
   "cannot express". Affects one known test.
2. **Intra-transaction cross-row ordering** (ADR-0002). Observable but
   rank-determined. Record it, don't assert it by default?
3. **Multi-character value tokens** (ADR-0003). Defer until the migration shows
   whether the single-char values map is actually annoying.
