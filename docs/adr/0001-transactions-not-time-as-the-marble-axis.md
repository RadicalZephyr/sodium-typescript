# ADR-0001: Transactions, not time, are the marble axis

- **Status:** Draft
- **Date:** 2026-09-14
- **Supersedes:** none
- **Related:** ADR-0002 (transcript as primitive), ADR-0003 (notation)

## Context

We want a testing helper for Sodium in the spirit of RxJS marble diagrams. The
obvious move is to port the RxJS design directly. That design does not
transfer, and it's worth being precise about why.

RxJS marbles work because Observables are scheduler-driven. `TestScheduler`
swaps in a virtual clock, and each character in a diagram is a *frame* (10ms by
default). Time is the axis because time is the thing the scheduler controls.

Sodium has no scheduler and no clock. `StreamSink.send()` opens a transaction,
delivers, and closes it, all synchronously (`src/lib/sodium/StreamSink.ts:29`).
The only ordering primitive in the library is the transaction. Every semantic
we actually want to pin down in a test — coalescing, `orElse`/`merge` priority,
`snapshot` reading the pre-update cell value, glitch-freedom in `lift` — is a
statement about what happens *within one transaction* or *across transaction
boundaries*. None of it is a statement about elapsed time.

There is exactly one clock seam in the library: `TimerSystemImpl` with its
`setTimer`/`now` pair (`src/lib/sodium/TimerSystem.ts:13-23`), which
`MillisecondsTimerSystem` and `SecondsTimerSystem` implement against
`Date.now()`.

## Decision

**A column in a Sodium marble diagram is one externally-initiated transaction.**

There is no virtual clock in v1. Diagrams index transactions, and the harness
advances the axis by opening and closing transactions, not by advancing a time
value.

Virtual time is explicitly out of scope for v1. `TimerSystemImpl` is named here
as the seam through which it would later arrive, and ADR-0003's notation must
not foreclose a second axis.

## Consequences

- **Marble tests become synchronous.** Absent timers, a Sodium graph is fully
  deterministic and driven by synchronous `send` calls. No `done` callback, no
  fake clock, no async at all. This is a bigger win than the notation: see
  ADR-0002 on what the current `done()`-counting pattern costs.
- **`cold` / `hot` have no analogue.** Sodium sinks are inherently hot. The
  replay-on-subscribe behaviour that `BehaviorSubject` provides is `Cell`, which
  is a distinct *type*, not a subscription mode — so it gets distinct notation
  (ADR-0003) rather than a constructor flag.
- **`|` and `#` lose their RxJS meanings.** Sodium streams never complete, and
  errors are not stream events — they are exceptions thrown out of `send`
  (`StreamSink.ts:32`, `:38`). ADR-0003 adopts Swirly's grid grammar, where `|`
  is the column separator and a throw gets its own `!` row.

This conclusion was reached independently by Swirly's `grid-mode` branch, whose
`examples/gridAxis.txt` says the same thing in its own words — "Grid mode
replaces the continuous marble timeline with a discrete, labelled axis that
every row shares [...] Sodium streams never complete, so there is no `|` to
write." Two independent derivations of the same axis is the strongest evidence
available that it is the right one.
- **"Column = one `send`" is still false,** because of deferred transactions.
  See the sub-tick handling in ADR-0003. Measured: one `s.send(1)` with a
  `defer` and a 3-element `split` attached spans five transactions.
- **Timer-driven code keeps its hand-rolled tests.** `src/tests/unit/Timer.spec.ts`
  stays as it is.

## Alternatives considered

**Virtual clock via a `TimerSystemImpl` whose `now()` the harness drives.**
Rejected for v1, not on effort but on semantics: `TimerSystem`'s `onStart` hook
fires each due alarm inside its own `Transaction.run`
(`src/lib/sodium/TimerSystem.ts:56`), so advancing the clock injects a variable
number of transactions per tick. Columns and transactions would stop being 1:1
precisely where the notation needs to be trustworthy. Getting the
transaction axis right first, then layering time onto it, is the right order.

**Wall-clock time as the axis, with real `setTimeout`.** Rejected: this is what
the current `Timer.spec.ts` does, and it is the worst test in the suite.

## Trade-offs and conflicts

Deferring timers leaves a known hole. `Timer.spec.ts` accounts for 10.9s of the
suite's 14.4s runtime and *every one of its assertions is commented out* — it
asserts only `typeof ticker === 'function'`. So the slowest test in the
repository currently verifies nothing about timers. This ADR does not fix that,
and the gap should not be quietly forgotten; it is the strongest argument for a
follow-up ADR adding the virtual-time axis, and the reason the seam is named
above rather than left implicit.

## Open questions

- Whether a second axis should be a second dimension in the same diagram or a
  separate diagram type. Deferred until there is a virtual timer to test.
