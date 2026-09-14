import {
  Cell,
  CellSink,
  Stream,
  StreamSink,
  Transaction,
  getTotalRegistrations
} from '../../../lib/Lib';

import { Recorder } from './Recorder';
import { Transcript } from './Transcript';

/**
 * Declares the rows of a diagram. Sinks are both driven and observed, because
 * an input row is drawn too.
 */
export interface Builder {
  sink<A>(name: string, coalesce?: (l: A, r: A) => A): StreamSink<A>;
  cellSink<A>(name: string, initial: A): CellSink<A>;
  observeStream<A>(name: string, stream: Stream<A>): void;
  observeCell<A>(name: string, cell: Cell<A>): void;
}

/**
 * One transaction's worth of input: the value to send into each named sink.
 * A row absent from the object does not fire; use `null` to send null.
 */
export interface Column {
  [row: string]: unknown;
}

type Observation = { name: string; attach: (record: (row: string, value: unknown) => void) => () => void };

const build = (declare: (b: Builder) => void, recorder: Recorder) => {
  const sinks = new Map<string, { send: (value: unknown) => void }>();
  const observations: Observation[] = [];
  const claim = (name: string) => {
    if (observations.some(o => o.name === name)) {
      throw new Error(`row '${name}' is declared twice`);
    }
  };

  const observeStream = <A>(name: string, stream: Stream<A>) => {
    claim(name);
    observations.push({
      name,
      attach: record => stream.listen(value => record(name, value))
    });
  };
  const observeCell = <A>(name: string, cell: Cell<A>) => {
    claim(name);
    observations.push({
      name,
      // Cell.listen is Operational.value, so this fires the initial value in
      // the setup transaction and thereafter reports each update in the
      // transaction that caused it. That is the update view; the sampled view
      // the diagram draws is one column later (ADR-0003).
      attach: record => cell.listen(value => record(name, value))
    });
  };

  const builder: Builder = {
    sink<A>(name: string, coalesce?: (l: A, r: A) => A): StreamSink<A> {
      const s = coalesce ? new StreamSink<A>(coalesce) : new StreamSink<A>();
      sinks.set(name, { send: value => s.send(value as A) });
      observeStream(name, s);
      return s;
    },
    cellSink<A>(name: string, initial: A): CellSink<A> {
      const c = new CellSink<A>(initial);
      sinks.set(name, { send: value => c.send(value as A) });
      observeCell(name, c);
      return c;
    },
    observeStream,
    observeCell
  };

  declare(builder);

  // Every listener subscribes in this one transaction, so every cell delivers
  // its initial value into the same tick (ADR-0003).
  const record = (row: string, value: unknown) => recorder.record(row, value);
  const kills = observations.map(o => o.attach(record));
  return { sinks, kills };
};

/**
 * Run an FRP graph against a script of transactions and return what happened.
 *
 * Owns the things every hand-written test in this repository currently does by
 * hand and sometimes gets wrong: subscribing before sending, unsubscribing
 * afterwards, and checking that the listener count came back to where it
 * started. There is no `done` callback and no event counting — absent timers a
 * Sodium graph is synchronous, so underdelivery is a failed comparison rather
 * than a timeout.
 */
export const runTranscript = (
  declare: (b: Builder) => void,
  script: ReadonlyArray<Column>
): Transcript => {
  const recorder = new Recorder();
  const registrationsBefore = getTotalRegistrations();

  const { sinks, kills } = Transaction.run(() => {
    recorder.begin('setup');
    return build(declare, recorder);
  });

  try {
    // One extra empty transaction, so a cell updated in the last scripted
    // column still has a column to be seen holding its new value in.
    const columns = script.concat([{}]);
    for (const column of columns) {
      Transaction.run(() => {
        recorder.begin('external');
        for (const row of Object.keys(column)) {
          const sink = sinks.get(row);
          if (sink === undefined) {
            throw new Error(
              `no sink named '${row}'; declare it with sink() or cellSink()`);
          }
          sink.send(column[row]);
        }
      });
    }
  } finally {
    kills.forEach(kill => kill());
  }

  const leaked = getTotalRegistrations() - registrationsBefore;
  if (leaked !== 0) {
    throw new Error(
      `${leaked} listener registration(s) leaked; the graph did not come apart ` +
      `cleanly`);
  }

  return recorder.transcript();
};
