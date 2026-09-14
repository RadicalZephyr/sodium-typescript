import { Operational, StreamSink, Transaction, getTotalRegistrations } from '../../lib/Lib';
import { plain, Recorder, runTranscript } from '../test-utils/marbles';

afterEach(() => {
  if (getTotalRegistrations() != 0) {
    throw new Error('listeners were not deregistered');
  }
});

test('records a mapped stream, one column per transaction', () => {
  const transcript = runTranscript(b => {
    const s = b.sink<number>('s');
    b.observeStream('out', s.map(a => a + 1));
  }, [{ s: 7 }, {}, { s: 9 }]);

  expect(plain(transcript)).toEqual([
    { kind: 'setup', events: {} },
    { kind: 'external', events: { s: 7, out: 8 } },
    { kind: 'external', events: {} },
    { kind: 'external', events: { s: 9, out: 10 } },
    { kind: 'external', events: {} }
  ]);
});

test("hold(): the cell's initial value lands in the setup transaction", () => {
  const transcript = runTranscript(b => {
    const sa = b.sink<string>('s1');
    b.observeCell('c', sa.hold('a'));
  }, [{}, { s1: 'b' }, {}, { s1: 'c' }, {}]);

  // This is the update view: the cell reports its change in the same
  // transaction as the stream that caused it. The sampled view the diagram
  // draws is this shifted one column later (ADR-0003).
  expect(plain(transcript)).toEqual([
    { kind: 'setup', events: { c: 'a' } },
    { kind: 'external', events: {} },
    { kind: 'external', events: { s1: 'b', c: 'b' } },
    { kind: 'external', events: {} },
    { kind: 'external', events: { s1: 'c', c: 'c' } },
    { kind: 'external', events: {} },
    { kind: 'external', events: {} }
  ]);
});

test('snapshot() reads the value the cell held before this transaction', () => {
  const transcript = runTranscript(b => {
    const c = b.cellSink<number>('c', 0);
    const s = b.sink<number>('s');
    b.observeStream('snap', s.snapshot(c, (x, y) => x + ' ' + y));
  }, [{ s: 100 }, { c: 2 }, { s: 200 }]);

  expect(plain(transcript)).toEqual([
    { kind: 'setup', events: { c: 0 } },
    { kind: 'external', events: { s: 100, snap: '100 0' } },
    { kind: 'external', events: { c: 2 } },
    // 200 is snapshotted against 2, which the cell took in the column before.
    { kind: 'external', events: { s: 200, snap: '200 2' } },
    { kind: 'external', events: {} }
  ]);
});

test('defer() lands in its own transaction, inside the column that caused it', () => {
  const transcript = runTranscript(b => {
    const s = b.sink<number>('s');
    b.observeStream('d', Operational.defer(s));
  }, [{ s: 1 }, { s: 2 }]);

  expect(plain(transcript)).toEqual([
    { kind: 'setup', events: {} },
    { kind: 'external', events: { s: 1 } },
    { kind: 'deferred', events: { d: 1 } },
    { kind: 'external', events: { s: 2 } },
    { kind: 'deferred', events: { d: 2 } },
    { kind: 'external', events: {} }
  ]);
});

test('a leaked listener fails the test that leaked it', () => {
  let stray: () => void = null;
  expect(() => runTranscript(b => {
    const s = b.sink<number>('s');
    stray = s.map(a => a).listen(() => {});
  }, [{ s: 1 }])).toThrow(/leaked/);
  stray();
});

test('recording one row twice in a transaction is refused', () => {
  const recorder = new Recorder();
  expect(() => Transaction.run(() => {
    recorder.begin('external');
    recorder.record('s', 1);
    recorder.record('s', 2);
  })).toThrow(/fired twice in one transaction/);
});

test('sending to an undeclared row is refused', () => {
  expect(() => runTranscript(b => {
    b.sink<number>('s');
  }, [{ nope: 1 }])).toThrow(/no sink named 'nope'/);
});
