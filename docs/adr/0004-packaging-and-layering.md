# ADR-0004: Three artifacts, layered — Swirly fork, helper library, sodium-typescript

- **Status:** Draft
- **Date:** 2026-09-14
- **Related:** ADR-0002 (transcript as primitive), ADR-0003 (grid notation)

## Context

ADR-0003 makes the test notation Swirly's grid grammar. That creates a
dependency question the earlier drafts did not have: if tests are written as
grid specifications, something has to parse them, and grid mode currently exists
only on an unpublished branch of a fork.

The obvious move — vendor a parser into `src/tests/test-utils/` — was the
earlier plan, and it is wrong now. It would put a parser for someone else's
grammar inside a library that has nothing to do with diagrams, and guarantee
drift the moment the grammar moved.

`sodium-typescript` is also a constrained host: TypeScript `^3.0.3`, jest 23,
ts-jest 23, and a rollup 0.65 build emitting CJS and ESM. Swirly is ESM,
TypeScript 5, a lerna/turbo monorepo.

## Decision

**Three artifacts, each depending only on the one below it.**

1. **Swirly fork** — `grid-mode` published under a scope we control, plus the
   `!` throw sigil from ADR-0003.
2. **A new helper library** — the recorder, renderer, driver and assertions of
   ADR-0002. Depends on the published Swirly parser. This is where the diagram
   coupling lives.
3. **`sodium-typescript`** — a single devDependency on (2). No dependency on
   Swirly, direct or transitive, in anything it publishes.

The helper is a new library rather than `src/tests/test-utils/`, so
`sodium-typescript`'s dependency surface grows by exactly one devDependency and
the FRP library stays unaware that diagrams exist.

## Consequences

- **Bootstrapping is ordered.** (3) cannot migrate its suite until (2) is
  consumable, and (2) cannot parse until (1) is published. Work can start at
  either end — the recorder in (2) needs no parser at all — but the migration is
  genuinely last.
- **The helper is publishable on its own.** It is useful to any Sodium user, not
  just to this repository, which was the "both, internal first" intent from the
  start now expressed in packaging rather than in discipline.
- **ADR home.** These ADRs describe a library that will live elsewhere. They stay
  here until the repository exists, then move with the code, leaving a pointer.

## Trade-offs and conflicts

**This is the main risk in the whole plan:** (2) will be written in modern
TypeScript against an ESM dependency, and (3) consumes it with TypeScript 3 and
ts-jest 23. TypeScript 3 cannot read `.d.ts` files using syntax newer than
itself, and jest 23 has no ESM support, so a naive publish of (2) is
unconsumable by (3).

Three ways out, in the order I would try them:

1. **(2) ships CJS plus conservative typings** — target ES2017/CJS, and either
   emit TS3-compatible declarations or ship hand-written ones. Keeps (3)
   untouched. Costs care in (2)'s build.
2. **Bump (3)'s toolchain** — TypeScript 5, jest 29, ts-jest 29. Independently
   overdue and it unblocks everything, but it is a change to the host library's
   build that has nothing to do with marble diagrams, and it will churn the
   existing 61 tests.
3. **(2) exposes a CLI, (3) shells out** — no type-level coupling at all. Ugly,
   and it gives up the typed assertion API that makes the helper worth having.

I would take (1) and treat (2) as unblocked in the meantime, but this should be
settled before (2)'s build is written rather than discovered at integration.

**Publishing the fork is a commitment.** Once `@…/parser` is published and (2)
depends on it, the fork acquires consumers and a release cadence. The
alternative — reimplementing ~150 lines of grid parsing in (2) with Swirly's
`examples/grid*.txt` as a shared conformance corpus — avoids that at the cost of
two parsers that must be kept honest by a test rather than by construction. The
decision is to publish; the conformance corpus is still worth vendoring into (2)
as a regression test against the published parser.

## Open questions

- Name and repository for (2).
- Scope for the published fork.
- Which interop route above; see the trade-off.
