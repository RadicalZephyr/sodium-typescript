# ADR-0003: Marble notation for Sodium

- **Status:** Draft
- **Date:** 2026-09-14
- **Related:** ADR-0001 (transaction axis), ADR-0002 (transcript as primitive)

## Context

ADR-0001 fixes the axis as transactions; ADR-0002 makes the diagram a
serialization of a recorded transcript. This ADR fixes the concrete grammar.

The design is constrained by five measured properties of the library, not by
taste. Probe scripts are in the session scratchpad; each row below was verified
against the library at `25c5984`.

| # | Property | Evidence |
|---|---|---|
| F1 | A stream fires **at most once per transaction** | Verified for a coalescing sink (`send(8); send(40)` → one `48`), `orElse` of two sinks in one transaction, and a diamond recombined via `merge`. Max firings of one stream in one transaction: 1 |
| F2 | A cell's initial value arrives in the **subscribe** transaction, and `snapshot` in transaction *k* reads the **pre-update** value | `cell=1 @T1` / `snap=x:1 @T2` / `cell=2 @T2` — the snapshot fires before the cell's own listener and sees `1` |
| F3 | One external `send` can span **many** transactions | `defer` + a 3-element `split` on one `s.send(1)` produced 5 transactions (T1–T5), all before the next `send` |
| F4 | `postQ` index 0 gives each action its **own** transaction; index ≥ 1 **shares** one | `A1p0 @T2, B1p0 @T3, A1 @T4, B1 @T5, A1p1 @T6, B1p1 @T6` |
| F5 | Transaction boundaries are observable from inside a listener | `Transaction.currentTransaction` is a distinct object per transaction, non-null in callbacks (`inCallback=1`); `.last(cb)` registered from inside a listener fires at end of that transaction |

F1 is the load-bearing one: it makes the diagram grid **single-valued**, so a
`(row, column)` position holds at most one value. RxJS needs `(ab)` grouping on
output because a frame can carry many emissions from one Observable; Sodium
cannot, because every combinator that can receive simultaneous inputs demands a
coalescing function.

## Decision

### Grammar

A diagram is a string of slots, one slot per transaction, read left to right.

- `-` — nothing in this transaction.
- any other character — a value, resolved through the diagram set's values map.
- `(xy…)` — **input rows only.** Multiple sends into this sink in one
  transaction, in written order, for the sink's coalescer to combine.
- `|` — delimits one externally-initiated transaction in the *expanded* form
  (see sub-ticks below).
- `#` — **`throws` rows only.** This transaction is expected to throw.

A values map is optional. Without one, each non-`-` character is the
single-character string itself; digits are **not** coerced to numbers. Anything
else — numbers, objects, and `null` — requires an explicit map. `null` must come
from the map because `-` already means "no event", and Sodium has a
`filterNotNull` to test.

### Whitespace is padding, and columns are as wide as their widest slot

A `(xy)` group is one transaction but four characters, so a naive grid loses
vertical alignment on exactly the rows where simultaneity matters. RxJS solves
this by making a group *consume as many frames as it has characters* — a trick
that cannot transfer here, because there is no sense in which a coalesced send
occupies four transactions.

Instead: **space is ignorable padding**, and a column's rendered width is the
widest slot in that column across all rows of the set. The renderer pads; the
parser skips spaces.

```
s:   '-a(bc)'
out: '-a  d '
```

The same rule already governs the expanded form's `|`-groups, so it is one
mechanism, not two.

### Column 0 is the setup transaction

The harness builds the graph, registers every listener, and drives column 0
inside a single `Transaction.run`. This is forced by F2: a cell delivers its
initial value in whatever transaction `listen` was called in, so unless all
listeners share one transaction, cells would have initial values scattered
across different columns.

Consequently every row's first slot is the setup transaction. Stream rows
conventionally start with `-`. Cell rows **must** carry a value there — it is
the initial value.

### Cell rows use the update view

A cell row has the same grammar as a stream row. `-` means "no update in this
transaction". Note that a cell set to a value equal to its current one still
fires, so that is written as the value again, not `-`.

> **The rule, stated once:** a cell row shows the value the cell holds at the
> **end** of transaction *k*. Code sampling that cell **during** transaction *k*
> sees the most recent value at or before column *k−1*.

This is the off-by-one F2 forces. We take the update view because it is what
`listen` records, so the diagram is a faithful serialization with no transform
between recorded data and rendered row (ADR-0002). A `renderSampled()`
diagnostic view shifts by one for reasoning about `snapshot` and `lift`.

### Sub-ticks: expanded form, pipe-grouped

F3 means a column can contain several transactions. A diagram is in one of two
forms, distinguished by whether `|` appears anywhere in it:

- **Compact** (no `|`): one slot per external transaction. Requires that nothing
  in the graph defers.
- **Expanded** (`|`-delimited): each external transaction is a `|`-delimited
  group of one or more slots, one slot per actual transaction.

```
compact:   s: '-a-b-'
expanded:  s: '-|a---|-|b|-'     one send spanning 4 transactions in column 1
           d: '-|-x--|-|-x|-'    a defer landing in sub-tick 1
```

All rows in a diagram set must agree on form, and in expanded form the slot
count of each `|`-group must match across rows. That keeps vertical alignment
exact, which is the entire reason to draw a diagram. Selective per-column
expansion is deliberately **not** in v1 — the all-or-nothing rule makes the
parser unambiguous and the alignment invariant trivial to check.

### `throws` is a dedicated row

`#` does not share a row with values, because a throwing transaction still has a
value being sent into it, and `a#` in one slot would break the one-value-per-slot
rule that F1 buys us:

```
s:      '-(ab)'      two sends into a sink with no coalescer
throws: '-#'         ... which throws
```

This makes testable, for the first time, three behaviours the current suite only
pretends to check — `StreamSink.spec.ts:35`, `:44`, and `CellSink.spec.ts:69`
put their assertions inside a `catch` block, so all three pass if nothing throws
at all.

## Consequences

- `Operational.updates` vs `Operational.value` differ in the notation by exactly
  one slot: whether column 0 is populated. The notation makes the distinction
  visible rather than requiring prose.
- `merge`/`orElse` priority tests become readable: the interleaved-coalescing
  case at `StreamSink.spec.ts:143-157` is four input rows and one output row.
- F4 becomes visible rather than folklore. Rendering the E8 case in expanded
  form shows `A1` and `B1` in different sub-ticks while `A1p1` and `B1p1` share
  one, which is the inconsistency stated plainly.

## Trade-offs and conflicts

**`|` collides with RxJS's "complete".** An RxJS user reading a Sodium diagram
may read `|` as termination. The character is genuinely free — Sodium streams
never complete — so the alternatives were a non-ASCII delimiter (rejected:
hostile to type in source) or a two-character delimiter (rejected: breaks
one-column-one-slot). Accepted with documentation, and the compact form, which
most diagrams will use, contains no `|` at all.

**The leading setup slot is a wart.** Every stream row opens with a `-` that
carries no information. The alternative — index driven columns from 0 and hide
setup — was rejected because it puts cell initial values *outside* the diagram,
and cells would then have no slot for the one value they always have. Making
setup visible is the lesser evil, and it is where sends belong for the
construct-time-simultaneity case.

**Compact form is a trap for graphs that defer.** A graph using `defer` or
`split` will silently produce more transactions than a compact diagram has
slots. Mitigation: the recorder knows whether any tick was non-external, so the
harness must **reject** a compact expectation for a transcript containing
deferred ticks, with an error naming the expanded form. This has to be an error,
not a truncation, or the notation lies exactly where ADR-0001 says it must not.

## Open questions

- **Sends before `listen` in the construction transaction.**
  `CellSink.spec.ts:143-152` (`liftFromSimultaneous`) constructs two `CellSink`s
  and sends into one *before any listener exists*, then subscribes. Our setup
  transaction is build → listen → drive, so a column-0 send happens after
  listeners register, which is not the same graph state. This needs either a
  separate builder-phase escape hatch or an explicit "cannot express" note.
  Unresolved; it affects one known test.
- **Multi-character value tokens.** Single-char slots keep alignment free but
  cap a diagram at ~60 distinct values and force a map lookup to read any test.
  A quoted-token form (`'a "foo" b'`) would read better at the cost of alignment
  arithmetic. Deferred until the suite rewrite shows whether the map is
  actually annoying in practice.
