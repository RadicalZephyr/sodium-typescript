/**
 * The recorded result of running an FRP graph: one entry per transaction, in
 * the order the transactions happened.
 *
 * This is the primitive (ADR-0002). Grid diagrams are a serialization of it,
 * not the other way round, so nothing here knows about notation.
 */

export type TickKind =
  /** The transaction the graph was built and subscribed in. Not a column: a
   *  cell delivers its initial value here, which is why every listener has to
   *  subscribe in one transaction (ADR-0003). */
  | 'setup'
  /** A transaction the test opened deliberately. One column. */
  | 'external'
  /** A transaction Sodium opened on its own, via Operational.defer or split.
   *  Rendered as a nested column. */
  | 'deferred';

export interface Tick {
  readonly kind: TickKind;
  /**
   * Row name to the value that row carried in this transaction.
   *
   * At most one value per row, because a Sodium stream fires at most once per
   * transaction — measured, not assumed. Insertion order is firing order,
   * which is recorded but deliberately not asserted: it follows vertex rank,
   * which is an implementation detail.
   */
  readonly events: Map<string, unknown>;
}

export type Transcript = ReadonlyArray<Tick>;

/** A Tick with its events as a plain object, for readable assertions. */
export interface PlainTick {
  kind: TickKind;
  events: { [row: string]: unknown };
}

const plainTick = (tick: Tick): PlainTick => {
  const events: { [row: string]: unknown } = {};
  tick.events.forEach((value, row) => { events[row] = value; });
  return { kind: tick.kind, events };
};

/**
 * Render a transcript as plain data, so a test can compare it with `toEqual`
 * and get a structural diff. Drops firing order, which is what we want:
 * recorded, not asserted.
 */
export const plain = (transcript: Transcript): PlainTick[] =>
  transcript.map(plainTick);

/** The transactions that are columns — everything but the setup transaction. */
export const columns = (transcript: Transcript): Transcript =>
  transcript.filter(tick => tick.kind !== 'setup');

/** The transaction the graph was subscribed in, if it was recorded. */
export const setupTick = (transcript: Transcript): Tick | undefined =>
  transcript.filter(tick => tick.kind === 'setup')[0];
