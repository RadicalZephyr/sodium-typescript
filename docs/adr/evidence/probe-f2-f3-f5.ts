import {
  StreamSink, CellSink, Cell, Stream, Transaction, Operational, Unit,
  getTotalRegistrations
} from '../../lib/Lib';

// ---- transaction identity helper -------------------------------------------
let txnIds = new Map<any, number>();
let nextTxn = 1;
function txnId(): string {
  const t = Transaction.currentTransaction;
  if (t === null) return 'none';
  if (!txnIds.has(t)) txnIds.set(t, nextTxn++);
  return 'T' + txnIds.get(t);
}
beforeEach(() => { txnIds = new Map(); nextTxn = 1; });

test('E1/E2: currentTransaction identity + last() from inside a listener', () => {
  const log: string[] = [];
  const s = new StreamSink<number>();
  const seen = new Set<any>();
  const kill = s.listen(a => {
    const t = Transaction.currentTransaction;
    log.push(`ev ${a} @${txnId()} inCallback=${t ? t.inCallback : -1}`);
    if (!seen.has(t)) {
      seen.add(t);
      const id = txnId();
      t.last(() => log.push(`  last @${id}`));
    }
  });
  s.send(1);
  s.send(2);
  Transaction.run(() => { s.send(3); });
  kill();
  console.log('E1/E2:\n' + log.join('\n'));
});

test('E3: snapshot vs cell update inside ONE transaction', () => {
  const log: string[] = [];
  const c = new CellSink<number>(1);
  const s = new StreamSink<string>();
  const kills = [
    c.listen(v => log.push(`cell=${v} @${txnId()}`)),
    s.snapshot(c, (a, b) => `${a}:${b}`).listen(v => log.push(`snap=${v} @${txnId()}`)),
  ];
  Transaction.run(() => { c.send(2); s.send('x'); });
  Transaction.run(() => { s.send('y'); c.send(3); });
  kills.forEach(k => k());
  console.log('E3:\n' + log.join('\n'));
});

test('E4: Cell.listen initial value vs Operational.updates at subscribe time', () => {
  const log: string[] = [];
  const c = new CellSink<number>(7);
  const kills = Transaction.run(() => [
    c.listen(v => log.push(`value=${v} @${txnId()}`)),
    Operational.updates(c).listen(v => log.push(`updates=${v} @${txnId()}`)),
  ]);
  log.push('--- after subscribe txn ---');
  c.send(8);
  kills.forEach(k => k());
  console.log('E4:\n' + log.join('\n'));
});

test('E5: defer / split transaction placement', () => {
  const log: string[] = [];
  const s = new StreamSink<number>();
  const d = Operational.defer(s);
  const sp = Operational.split(s.map(a => [a * 10, a * 10 + 1, a * 10 + 2]));
  const kills = [
    s.listen(a => log.push(`s=${a} @${txnId()}`)),
    d.listen(a => log.push(`  defer=${a} @${txnId()}`)),
    sp.listen(a => log.push(`  split=${a} @${txnId()}`)),
  ];
  log.push('-- send 1 --');
  s.send(1);
  log.push('-- send 2 --');
  s.send(2);
  kills.forEach(k => k());
  console.log('E5:\n' + log.join('\n'));
});

test('E6: empty external transaction + registration balance', () => {
  const before = getTotalRegistrations();
  const s = new StreamSink<number>();
  const kill = s.listen(a => {});
  const during = getTotalRegistrations();
  Transaction.run(() => {});
  kill();
  console.log(`E6: regs before=${before} during=${during} after=${getTotalRegistrations()}`);
});
