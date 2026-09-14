import { Transaction } from '../../../lib/Lib';

import { Tick, TickKind, Transcript } from './Transcript';

/**
 * Collects a Transcript by attributing each observed event to the transaction
 * it fired in.
 *
 * Transactions are identified by object identity: `Transaction.currentTransaction`
 * is a distinct object per transaction and is non-null inside listener
 * callbacks, so no change to the library is needed to see the boundaries.
 *
 * Ticks are created on first sight of a transaction and appended in that
 * order, which is the order the transactions ran. A transaction the recorder
 * was not told about is one Sodium opened itself — `Operational.defer` and
 * `split` post their work into fresh transactions that run before the external
 * one returns — so it is recorded as 'deferred'.
 */
export class Recorder {
  private readonly ticks: Tick[] = [];
  private readonly byTransaction = new Map<object, Tick>();

  /**
   * Attribute the transaction that is open right now to `kind`. Must be called
   * from inside `Transaction.run`, before anything fires in that transaction.
   */
  begin(kind: 'setup' | 'external'): void {
    this.tickFor(kind);
  }

  /** Record that `row` carried `value` in the transaction that is open now. */
  record(row: string, value: unknown): void {
    const tick = this.tickFor('deferred');
    if (tick.events.has(row)) {
      // A stream fires at most once per transaction in Sodium, so this would
      // mean either a library change or a bug here. Either way, silently
      // overwriting would make the transcript lie.
      throw new Error(
        `row '${row}' fired twice in one transaction, which Sodium's ` +
        `semantics should make impossible (had ` +
        `${JSON.stringify(tick.events.get(row))}, got ${JSON.stringify(value)})`);
    }
    tick.events.set(row, value);
  }

  transcript(): Transcript {
    return this.ticks;
  }

  private tickFor(kindIfNew: TickKind): Tick {
    const current = Transaction.currentTransaction as unknown as object;
    if (current == null) {
      throw new Error(
        'no transaction is open; the recorder can only attribute events that ' +
        'fire inside one');
    }
    const existing = this.byTransaction.get(current);
    if (existing !== undefined) {
      return existing;
    }
    const tick: Tick = { kind: kindIfNew, events: new Map<string, unknown>() };
    this.byTransaction.set(current, tick);
    this.ticks.push(tick);
    return tick;
  }
}
