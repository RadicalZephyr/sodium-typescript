import {
  Cell,
  StreamSink,
  Transaction,
  getTotalRegistrations
} from '../../lib/Lib';
import { Lazy } from '../../lib/sodium/Lazy';

afterEach(() => {
  if (getTotalRegistrations() != 0) {
    throw new Error('listeners were not deregistered');
  }
});

test('a cell holds null values fired by its stream', () => {
  const ss = new StreamSink<string>();
  const c = ss.hold('initial');
  const out: string[] = [];

  const kill = c.listen(a => out.push(a));
  ss.send(null);
  expect(c.sample()).toBeNull();
  ss.send('b');
  kill();

  expect(out).toEqual(['initial', null, 'b']);
});

test('sampleLazy sees an update to null made in the same transaction', () => {
  const ss = new StreamSink<string>();
  const c = ss.hold('initial');
  const kill = c.listen(() => { });

  let lazy: Lazy<string> = null;
  Transaction.run(() => {
    ss.send(null);
    lazy = c.sampleLazy();
  });
  kill();

  expect(lazy.get()).toBeNull();
});

test('a lazy initial value of null is forced only once', () => {
  let forcings = 0;
  const ss = new StreamSink<string>();
  const c = ss.holdLazy(new Lazy<string>(() => {
    forcings++;
    return null;
  }));

  const kill = c.listen(() => { });
  expect(c.sample()).toBeNull();
  expect(c.sample()).toBeNull();
  kill();

  expect(forcings).toEqual(1);
});

test('calm propagates null values', () => {
  const ss = new StreamSink<string>();
  const c = ss.hold('a').calmRefEq();
  const out: string[] = [];

  const kill = c.listen(a => out.push(a));
  ss.send(null);
  ss.send(null);
  ss.send('b');
  ss.send('b');
  ss.send(null);
  kill();

  expect(out).toEqual(['a', null, 'b', null]);
});

test('calm with an explicit eq function propagates null values', () => {
  const ss = new StreamSink<number>();
  const c = ss.hold(1).calm((a, b) => a === b);
  const out: number[] = [];

  const kill = c.listen(a => out.push(a));
  ss.send(null);
  ss.send(null);
  ss.send(2);
  kill();

  expect(out).toEqual([1, null, 2]);
});

test('a constant cell can hold null', () => {
  const c = new Cell<string>(null);
  const out: string[] = [];

  const kill = c.listen(a => out.push(a));
  kill();

  expect(c.sample()).toBeNull();
  expect(out).toEqual([null]);
});
