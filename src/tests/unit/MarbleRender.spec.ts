import { Operational, getTotalRegistrations } from '../../lib/Lib';
import {
  formatValue,
  render,
  runTranscript,
  sampledValues
} from '../test-utils/marbles';

afterEach(() => {
  if (getTotalRegistrations() != 0) {
    throw new Error('listeners were not deregistered');
  }
});

const diagram = (...lines: string[]) => lines.join('\n\n') + '\n';

test('hold() renders as Swirly\'s canonical gridHold diagram', () => {
  const run = runTranscript(b => {
    const sa = b.sink<string>('s1');
    b.observeCell('c', sa.hold('a'));
  }, [{}, { s1: 'b' }, {}, { s1: 'c' }, {}]);

  // Slot for slot, this is examples/gridHold.txt from the Swirly fork, which
  // was written by hand to describe Sodium's semantics. Here it is recovered
  // from a recording of the real library: s1 fires 'b' in transaction 1 and c
  // starts holding it in transaction 2.
  expect(render(run)).toEqual(diagram(
    "@ t  | 0   | 1   | 2   | 3   | 4   | 5",
    "> s1 |     | 'b' |     | 'c' |     |",
    "= c  | 'a' |     | 'b' |     | 'c' |"
  ));
});

test('the cell row is the sampled view, not the update view', () => {
  // The recorded transcript says the cell changed in the same transaction as
  // its cause; the diagram says one later. Both are true of different things,
  // and the diagram draws the one every reader of the cell agrees on.
  const run = runTranscript(b => {
    const sa = b.sink<string>('s1');
    b.observeCell('c', sa.hold('a'));
  }, [{}, { s1: 'b' }]);

  const updates = run.transcript
    .filter(t => t.kind !== 'setup')
    .map(t => (t.events.has('c') ? t.events.get('c') : null));
  expect(updates).toEqual([null, 'b', null]);
  expect(sampledValues(run.transcript, 'c')).toEqual(['a', 'a', 'b']);
});

test('the sampled view matches what a snapshot in that transaction sees', () => {
  // The renderer shifts cell rows by one column. Rather than trust that, probe
  // it: snapshot the cell from a stream that fires in every transaction, and
  // compare what the probe saw against what the diagram claims was held.
  const run = runTranscript(b => {
    const sa = b.sink<string>('s1');
    const probe = b.sink<number>('p');
    const c = sa.hold('a');
    b.observeCell('c', c);
    b.observeStream('probe', probe.snapshot(c, (_, held) => held));
  }, [{ p: 0 }, { s1: 'b', p: 1 }, { p: 2 }, { s1: 'c', p: 3 }, { p: 4 }]);

  const held = sampledValues(run.transcript, 'c');
  const ticks = run.transcript.filter(t => t.kind !== 'setup');
  const compared = ticks
    .map((tick, k) => (tick.events.has('probe')
      ? { column: k, probe: tick.events.get('probe'), diagram: held[k] }
      : null))
    .filter(x => x !== null);

  expect(compared).toEqual([
    { column: 0, probe: 'a', diagram: 'a' },
    { column: 1, probe: 'a', diagram: 'a' },
    { column: 2, probe: 'b', diagram: 'b' },
    { column: 3, probe: 'b', diagram: 'b' },
    { column: 4, probe: 'c', diagram: 'c' }
  ]);
});

test('defer() renders as a nested column', () => {
  const run = runTranscript(b => {
    const s = b.sink<number>('s');
    b.observeStream('d', Operational.defer(s));
  }, [{ s: 1 }]);

  expect(render(run)).toEqual(diagram(
    "@ t | [0] | >[0,0] | [1]",
    "> s | 1   |        |",
    "> d |     | 1      |"
  ));
});

test('split() renders one nested column per posted transaction', () => {
  const run = runTranscript(b => {
    const s = b.sink<number>('s1');
    b.observeStream('s2', Operational.split(s.map(x => [x * 10, x * 10 + 1])));
  }, [{ s1: 1 }]);

  expect(render(run)).toEqual(diagram(
    "@ t  | [0] | >[0,0] | >[0,1] | [1]",
    "> s1 | 1   |        |        |",
    "> s2 |     | 10     | 11     |"
  ));
});

test('values render as their literal spelling', () => {
  expect(formatValue('a')).toBe("'a'");
  expect(formatValue(0)).toBe('0');
  expect(formatValue(null)).toBe('null');
  expect(formatValue(true)).toBe('true');
  expect(formatValue(['a', 'b'])).toBe("['a','b']");
  expect(formatValue([10, 11])).toBe('[10,11]');
});

test('every row carries exactly as many pipes as the axis', () => {
  const run = runTranscript(b => {
    const s = b.sink<number>('s');
    b.observeCell('c', s.hold(0));
    b.observeStream('d', Operational.defer(s));
  }, [{ s: 1 }, {}, { s: 2 }]);

  const pipes = (line: string) => line.split('|').length - 1;
  const lines = render(run).trim().split('\n').filter(l => l.length > 0);
  const axisPipes = pipes(lines[0]);
  expect(axisPipes).toBeGreaterThan(0);
  for (const line of lines) {
    expect({ line, pipes: pipes(line) }).toEqual({ line, pipes: axisPipes });
  }
});
