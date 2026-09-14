# ADR-0002: The transcript is the primitive; diagrams are a serialization

- **Status:** Draft
- **Date:** 2026-09-14
- **Related:** ADR-0001 (transaction axis), ADR-0003 (notation)

## Context

The request was for "marble diagrams", which frames the diagram as the
deliverable. I think that framing gets the dependency backwards, and it matters
because it changes the build order.

Look at what every test in `src/tests/unit` currently does:

```ts
const out: number[] = [];
const kill = s.listen(a => { out.push(a); if (out.length === 2) done(); });
s.send(8);
s.send(40);
kill();
expect([2, 48]).toEqual(out);
```

Three separate problems, none of which notation fixes:

1. **The `done()` counter turns underdelivery into a timeout.** Fewer events
   than expected means a 5s jest timeout with no diff, instead of a failure that
   says what was missing. More events than expected are silently discarded,
   because `done()` has already fired and the extras land after the assertion.
   `src/tests/unit/StreamSink.spec.ts` uses this pattern in every test.
2. **Unlisten is manual and load-bearing.** Every file re-declares the same
   `afterEach` leak check against `getTotalRegistrations()`. An early `expect`
   failure skips the `kill()` and poisons the next test in the file.
3. **Simultaneity is invisible.** `Transaction.run(() => { s1.send(7); s2.send(60); })`
   expresses it, but the recorded `out` array is flat, so the assertion cannot
   distinguish "two events in one transaction" from "two transactions".

Problem 3 is the one diagrams solve. Problems 1 and 2 are solved by having a
recorder at all, and they are the ones costing us today.

## Decision

**Record a structured transcript; treat the diagram as a serialization of it.**

```
Transcript = Tick[]              // one entry per transaction, in order
Tick       = { external: boolean, events: Map<RowId, Value> }
```

`Tick.events` maps each observed row to *at most one* value, which is sound
because a stream fires at most once per transaction (measured; see the findings
in ADR-0003). The parser and renderer are pure functions over `Transcript`, and
the assertion compares `Transcript` values, never strings.

Build order follows from this: recorder first, renderer second, parser third.
Each layer is independently useful and independently testable.

The recorder derives transaction boundaries from
`Transaction.currentTransaction` identity, and closes each tick via
`Transaction.currentTransaction.last(...)` registered from inside the listener.
Both are verified to work from within a listener callback and require **no
changes to the library**.

## Consequences

- **Failure messages become two aligned diagrams.** This is where marbles
  actually earn their keep — the diff, not the input. A flat array diff cannot
  show a column misalignment; two rendered rows can.
- **Expected diagrams can be generated from a passing run.** Approval/snapshot
  style: write the graph, run it, paste the rendered diagram as the expectation
  once you have read it and agree. This lowers the cost of the suite rewrite in
  the implementation plan considerably.
- **Arbitrary interior nodes can be traced, not just outputs.** Sodium's graph
  is introspectable (`Vertex.name`, `Vertex.rank`, `Vertex.childrn`,
  `describeAll` in `src/lib/sodium/Vertex.ts`). A trace-all mode would make
  glitch-freedom and rank ordering *visible*: `liftGlitch`
  (`src/tests/unit/CellSink.spec.ts:126-140`) currently asserts `["3 5", "6 10"]`
  and says nothing about why the intermediate `"6 5"` never appears. RxJS cannot
  do this; the graph isn't reachable.
- **Tests that don't want notation don't pay for it.** Asserting against a
  `Transcript` literal stays available and is better for table-driven cases.

## Alternatives considered

**String-first: parse expected and actual into strings and compare strings.**
Simpler to start, and it is roughly what RxJS's older `TestScheduler` API did.
Rejected: it makes the diagram grammar load-bearing for correctness, so every
notation change risks silently changing what tests assert. It also makes
"generate the expectation from a run" produce strings that were never validated
against structured data.

**Wrap jest's `expect` directly.** Rejected: it welds the helper to jest at the
core rather than at the edge. ADR-0001 scopes this as internal-first but
API-designed-for-shipping, so the assertion boundary stays a thin adapter.

## Trade-offs and conflicts

Two representations of the same information can drift. The mitigation is a
round-trip property test — `render(parse(s)) === s` for well-formed `s`, and
`parse(render(t))` equals `t` for well-formed transcripts. `jsverify` and
`fantasy-laws` are already `devDependencies` and already used by
`src/tests/unit/FantasyLand.spec.ts`, so this costs no new dependency.

The counter-argument to building the recorder first is that it delivers no
diagram, which is what was asked for, so an observer could call phase 1 a
detour. I don't think that survives contact with the failure modes above: a
diagram rendered from an unreliable recorder is a prettier way to be wrong.
Phase 1 is also what makes the suite rewrite possible at all, since it is the
part that removes `done()`.

## Open questions

- Whether `Tick` should record intra-transaction *ordering across rows* (which
  row fired first). It is observable — a `snapshot` fires before the cell's own
  listener — but it is determined by vertex rank, which is an implementation
  detail. Asserting it would make tests brittle to rank changes; not recording
  it loses information that would help debug rank bugs. Leaning toward
  recording it but not asserting it by default, and exposing it only in the
  trace-all diagnostic view.
