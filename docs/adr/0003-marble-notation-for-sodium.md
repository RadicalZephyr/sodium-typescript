# ADR-0003: Adopt Swirly grid mode as the test notation

- **Status:** Draft
- **Date:** 2026-09-14
- **Related:** ADR-0001 (transaction axis), ADR-0002 (transcript as primitive),
  ADR-0004 (packaging)

## Context

An earlier draft of this ADR designed a notation from the RxJS tradition:
single-character slots, `-` for nothing, a values map, `()` for simultaneity,
and pipe-*grouped* columns for deferred transactions. That draft is superseded.

Swirly's `grid-mode` branch already has a notation for exactly this, designed
for Sodium and used by the *Functional Reactive Programming* book. It is better
than what I drafted, and it has a second consumer — the book — which the tests
now need to agree with. `examples/gridAxis.txt` states the premise of ADR-0001
in its own words:

> Grid mode replaces the continuous marble timeline with a discrete, labelled
> axis that every row shares. [...] Sodium streams never complete, so there is
> no `|` to write.

Every problem the earlier draft solved by invention, grid mode had already
solved by design:

| Finding | Earlier draft | Grid mode |
| --- | --- | --- |
| F1 one event per stream per transaction | `-` plus single-char slots, `()` only on input rows | one slot per column; grouping never arises |
| F2 cell off-by-one | invented an "update view" and documented the hazard | `=` rows are the sampled view; `gridHold.txt` states the one-transaction lag as the thing being drawn |
| F3 deferred transactions | `\|`-grouped sub-ticks, all-or-nothing per diagram | nested column labels — `@ t \| [0] \| >[0,0] \| >[0,1] \| [1]` |
| F4 defer/split asymmetry | not expressible | expressible, because column labels are *observed transaction ordinals*, not split indices |
| alignment under grouping | invented a whitespace-padding rule | slots are trimmed; pad freely |
| multi-character values | open question, values map as fallback | slot text is verbatim, so `'a'`, `0` and `['a','b']` all just work |

## Decision

**Test diagrams are Swirly grid specifications.** No dialect, no subset with
extensions of our own; the same text renders in the book and asserts in a test.

### The setup transaction is real but is not a column

F2 forces every listener to subscribe inside one transaction, or cells deliver
their initial values into different columns. But that transaction does not need
to be *drawn*: grid mode already opens a cell's box before column 0, because a
cell always has a value. So the setup transaction is an implementation detail of
the harness, and column 0 is the first **driven** transaction.

This is strictly better than the earlier draft, which made setup column 0 and
paid for it with a leading `-` on every stream row that carried no information.

### Cell rows are the sampled view

A `=` row's slot at column *k* is the value the cell holds **during**
transaction *k* — what anything reading it in that transaction agrees on. A
stream firing at column *k* moves its `hold` at column *k+1*.

This reverses the earlier draft. Measured, for both `hold()` and `CellSink`:

```
col 0  (nothing)      stream=-   listen(cell)=-   sampled=init
col 1  sa.send('b')   stream=b   listen(cell)=b   sampled=init
col 2  (nothing)      stream=-   listen(cell)=-   sampled=b
col 3  sa.send('c')   stream=c   listen(cell)=c   sampled=b
col 4  (nothing)      stream=-   listen(cell)=-   sampled=c
```

`Cell.listen` reports the change in the same transaction as its cause; a
`snapshot` in that transaction still sees the old value. The two views differ by
a uniform +1, and the sampled one is the semantically load-bearing one:
`Cell.listen` is `Operational.value`, which the library itself documents as an
operational primitive that "breaks the property of non-detectability of cell
steps/updates". The update view is the leak; the sampled view is the semantics.

Consequence for the harness: the recorder records updates (via `listen`) and the
renderer shifts cell rows by one. A cell updated in the final driven transaction
has nowhere to show its new held value, so **the harness drives one extra empty
transaction** and the axis carries one more column than the test drove.

### Deferred transactions are nested columns

F3's five-transaction `send` is an axis, not a special form:

```
@ t | [0] | >[0,0] | >[0,1] | [1] | >[1,0]

> s1 | ['a','b'] |  |  | ['c'] |

> s2 |  | 'a' | 'b' |  | 'c'
```

Column labels name **observed transactions in order**, not `postQ` indices. That
distinction is what lets F4 be drawn at all: two `defer`s that Sodium puts in
separate transactions get separate columns, and two `split` outputs at index ≥ 1
share one. If labels were split indices, the notation would assert a
simultaneity that does not hold.

### Slot text is the value's literal spelling

`gridStreams.txt` writes bare `0`, `10`, `20`; `gridCell.txt` writes `'a'`;
`gridNested.txt` writes `['a','b']`. That is JavaScript literal syntax already,
so the helper parses a slot as a literal and formats a recorded value back to
the same spelling. Round-tripping that pair is a Phase-3 property test.

This retires the values map entirely.

### Throws get a new sigil, `!`

Sodium throws on double-send without a coalescer, on `send` inside a callback,
and on send-before-listen — three behaviours the current suite only pretends to
check, because `StreamSink.spec.ts:35`, `:44` and `CellSink.spec.ts:69` put
their assertions inside a `catch` and therefore pass if nothing throws.

```
! s |  | 'send() called more than once per transaction' |
```

`!` is free: the parsers match `[`, `@`, `>`, `=`, `.` and then fall through to
marble streams, which grid mode rejects anyway. `BaseGridRow` is already a label
plus one slot per column shared across row kinds, so a throw row is a new
`rowKind`, not a new shape. This requires a change to the Swirly fork before any
test can use it — see ADR-0004.

### Simultaneous sends are out of the notation

Two sends into one sink in one transaction, for the coalescer to combine, has no
spelling. Sodium opens a transaction per `send`, so this only arises under an
explicit `Transaction.run`, which is rare outside tests of the denotational
semantics themselves. Those stay hand-written.

Revisit if users ask for it. The cost of guessing wrong now is a notation
concept nobody needed; the cost of adding it later is one slot grammar.

### References come for free

A slot naming another row resolves to a reference, which is how `gridSwitch.txt`
draws a cell holding a cell. Sodium has `Cell.switchC` and `Cell.switchS`, so
higher-order tests are expressible without any further work.

## Consequences

- Test diagrams render in the book, and book diagrams can be executed as tests.
  That is the whole point, and it is only true because the grammar is shared
  rather than merely similar.
- `Operational.updates` vs `Operational.value` is still visible in the notation,
  now as whether the stream row fires in column 0.
- Annotation rows (`.`) are available for commentary on generated figures.

## Trade-offs and conflicts

**The notation is no longer ours to change unilaterally.** Adopting grid mode
means a change wanted by the tests goes through Swirly and affects the book.
That is a genuine loss of local autonomy, and it is also exactly the property
that makes the diagrams trustworthy — a dialect that drifted would be worse than
having designed our own from the start. The `!` sigil is the first instance of
this cost, and it is worth paying because a transaction that threw is a
diagram-worthy fact in any FRP library, not a Sodium peculiarity.

**Reversing the cell-row decision costs ADR-0002 a principle.** ADR-0002 argued
for the diagram as a faithful serialization with no transform. Cell rows now
carry a +1 shift. The principle was in service of trustworthiness, and here the
transform *increases* it: the untransformed view is the one that disagrees with
Sodium's semantics and with every figure in the book. ADR-0002 is amended rather
than quietly contradicted.

**Grid mode is unpublished.** It lives on a branch. See ADR-0004.

## Open questions

- **Slot literal grammar.** Needs to cover strings, numbers, `null`, and arrays
  at minimum. JSON5-ish is the obvious answer; full JS literal syntax is more
  than we need and harder to round-trip.
- **How to spell `Unit`.** Sodium's `Unit.UNIT` has no natural literal. `()`?
- **`!` row rendering** in the fork.
- **`liftFromSimultaneous`** stays hand-written (decided): it sends into a
  `CellSink` before any listener exists, which the build → listen → drive
  harness cannot reproduce.
