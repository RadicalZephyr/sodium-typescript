import { StreamSink, CellSink, Transaction, Unit } from '../../lib/Lib';

test('E9: sampled view vs update view for hold() and CellSink', () => {
  const rows: string[] = [];
  let col = 0;
  const sa = new StreamSink<string>();   // drives the cell
  const probe = new StreamSink<Unit>();  // fires every column, to sample
  let held: string, updated: string, fired: string;

  const kills = Transaction.run(() => {
    const c = sa.hold('init');
    return [
      sa.listen(v => { fired = v; }),
      c.listen(v => { updated = v; }),
      probe.snapshot(c, (_, v) => v).listen(v => { held = v; }),
    ];
  });

  const step = (label: string, f: () => void) => {
    fired = undefined; updated = undefined; held = undefined;
    Transaction.run(() => { f(); probe.send(Unit.UNIT); });
    rows.push(
      `col ${col++} ${label.padEnd(14)} stream=${String(fired).padEnd(6)}` +
      ` listen(cell)=${String(updated).padEnd(6)} sampled(cell)=${held}`);
  };

  step('(nothing)', () => {});
  step("sa.send('b')", () => sa.send('b'));
  step('(nothing)', () => {});
  step("sa.send('c')", () => sa.send('c'));
  step('(nothing)', () => {});
  kills.forEach(k => k());
  console.log('E9 hold():\n' + rows.join('\n'));
});

test('E10: same question for CellSink', () => {
  const rows: string[] = [];
  let col = 0;
  const c = new CellSink<string>('init');
  const probe = new StreamSink<Unit>();
  let held: string, updated: string;
  const kills = Transaction.run(() => [
    c.listen(v => { updated = v; }),
    probe.snapshot(c, (_, v) => v).listen(v => { held = v; }),
  ]);
  const step = (label: string, f: () => void) => {
    updated = undefined; held = undefined;
    Transaction.run(() => { f(); probe.send(Unit.UNIT); });
    rows.push(`col ${col++} ${label.padEnd(14)} listen(cell)=${String(updated).padEnd(6)} sampled(cell)=${held}`);
  };
  step('(nothing)', () => {});
  step("c.send('b')", () => c.send('b'));
  step('(nothing)', () => {});
  step("c.send('c')", () => c.send('c'));
  step('(nothing)', () => {});
  kills.forEach(k => k());
  console.log('E10 CellSink:\n' + rows.join('\n'));
});
