import { StreamSink, CellSink, Transaction, Operational } from '../../lib/Lib';

let txnIds = new Map<any, number>();
let nextTxn = 1;
function txnId(): string {
  const t = Transaction.currentTransaction;
  if (t === null) return 'none';
  if (!txnIds.has(t)) txnIds.set(t, nextTxn++);
  return 'T' + txnIds.get(t);
}
beforeEach(() => { txnIds = new Map(); nextTxn = 1; });

test('E7: can ANY stream fire more than once in a single transaction?', () => {
  const log: string[] = [];
  const counts = new Map<string, Map<any, number>>();
  const note = (tag: string, v: any) => {
    const t = Transaction.currentTransaction;
    if (!counts.has(tag)) counts.set(tag, new Map());
    const m = counts.get(tag);
    m.set(t, (m.get(t) || 0) + 1);
    log.push(`${tag}=${v} @${txnId()} (#${m.get(t)} in this txn)`);
  };

  // sink with coalescer, two sends in one txn
  const s = new StreamSink<number>((a, b) => a + b);
  // two sinks merged
  const s1 = new StreamSink<number>(), s2 = new StreamSink<number>();
  // a diamond: one source, two paths, recombined via merge
  const diamond = s1.map(x => x * 2).merge(s1.map(x => x * 3), (a, b) => a + b);
  const kills = [
    s.listen(a => note('coalesced', a)),
    s2.orElse(s1).listen(a => note('orElse', a)),
    diamond.listen(a => note('diamond', a)),
  ];
  Transaction.run(() => { s.send(8); s.send(40); });
  Transaction.run(() => { s1.send(1); s2.send(2); });
  Transaction.run(() => { s1.send(5); });
  kills.forEach(k => k());
  console.log('E7:\n' + log.join('\n'));
  let maxPerTxn = 0;
  counts.forEach(m => m.forEach(n => { maxPerTxn = Math.max(maxPerTxn, n); }));
  console.log(`E7 VERDICT: max firings of one stream in one transaction = ${maxPerTxn}`);
});

test('E8: do two independent defer/split invocations share a post-transaction?', () => {
  const log: string[] = [];
  const s = new StreamSink<number>();
  const dA = Operational.defer(s.map(x => 'A' + x));
  const dB = Operational.defer(s.map(x => 'B' + x));
  const spA = Operational.split(s.map(x => ['A' + x + 'p0', 'A' + x + 'p1']));
  const spB = Operational.split(s.map(x => ['B' + x + 'p0', 'B' + x + 'p1']));
  const kills = [
    s.listen(a => log.push(`s=${a} @${txnId()}`)),
    dA.listen(a => log.push(`  ${a} @${txnId()}`)),
    dB.listen(a => log.push(`  ${a} @${txnId()}`)),
    spA.listen(a => log.push(`  ${a} @${txnId()}`)),
    spB.listen(a => log.push(`  ${a} @${txnId()}`)),
  ];
  s.send(1);
  kills.forEach(k => k());
  console.log('E8:\n' + log.join('\n'));
  console.log('E8: same @Tn => simultaneous (as documented); different @Tn => NOT simultaneous');
});
