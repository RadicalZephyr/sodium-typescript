import { Run } from './harness';
import { RowInfo, Tick, Transcript } from './Transcript';

/**
 * Serializes a recorded run as a Swirly grid diagram.
 *
 * The notation is Swirly's, not ours (ADR-0003): the same text renders in the
 * FRP book and asserts in a test. Two things happen here rather than in the
 * recorder, because they are presentation:
 *
 *  - cell rows are shifted into the sampled view, so a row shows what the cell
 *    held *during* each transaction rather than when it changed;
 *  - transactions Sodium opened itself become nested columns.
 */

/** A value as its literal spelling, which is what a slot carries. */
export const formatValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(formatValue).join(',')}]`;
  return JSON.stringify(value);
};

/**
 * The value a cell holds during each column — the sampled view.
 *
 * A cell reports an update in the transaction that caused it, but everything
 * reading the cell in that transaction still sees the old value, so the held
 * value changes one column later. Measured, uniformly, for both hold() and
 * CellSink.
 */
export const sampledValues = (
  transcript: Transcript,
  row: string
): unknown[] => {
  const setup = transcript.filter(t => t.kind === 'setup')[0];
  let held = setup !== undefined ? setup.events.get(row) : undefined;
  const during: unknown[] = [];
  for (const tick of transcript) {
    if (tick.kind === 'setup') continue;
    during.push(held);
    if (tick.events.has(row)) held = tick.events.get(row);
  }
  return during;
};

const columnLabels = (ticks: ReadonlyArray<Tick>): string[] => {
  const nested = ticks.some(t => t.kind === 'deferred');
  if (!nested) return ticks.map((_, i) => String(i));

  const labels: string[] = [];
  let external = -1;
  let sub = 0;
  for (const tick of ticks) {
    if (tick.kind === 'deferred') {
      labels.push(`>[${external},${sub}]`);
      sub += 1;
    } else {
      external += 1;
      sub = 0;
      labels.push(`[${external}]`);
    }
  }
  return labels;
};

const slotsFor = (
  row: RowInfo,
  transcript: Transcript,
  ticks: ReadonlyArray<Tick>
): string[] => {
  if (row.kind === 'stream') {
    return ticks.map(t => (t.events.has(row.name) ? formatValue(t.events.get(row.name)) : ''));
  }
  // A cell's slot carries a value only where the held value changes; a blank
  // extends the run before it, and the box divider is derived from that.
  const during = sampledValues(transcript, row.name);
  return during.map((value, k) =>
    k === 0 || value !== during[k - 1] ? formatValue(value) : '');
};

const line = (head: string, slots: ReadonlyArray<string>, widths: ReadonlyArray<number>): string => {
  let out = head;
  slots.forEach((slot, i) => { out += ' | ' + slot.padEnd(widths[i]); });
  return out.replace(/\s+$/, '');
};

export interface RenderOptions {
  /** Gutter label for the axis row. */
  axis?: string;
}

export const render = (run: Run, options: RenderOptions = {}): string => {
  const ticks = run.transcript.filter(t => t.kind !== 'setup');
  const labels = columnLabels(ticks);
  const axis = options.axis === undefined ? 't' : options.axis;

  const rows = run.rows.map(row => ({
    head: `${row.kind === 'cell' ? '=' : '>'} ${row.name}`,
    slots: slotsFor(row, run.transcript, ticks)
  }));

  const headWidth = Math.max(
    `@ ${axis}`.length,
    ...rows.map(r => r.head.length));
  const widths = labels.map((label, i) =>
    Math.max(label.length, ...rows.map(r => r.slots[i].length)));

  const blocks = [line(`@ ${axis}`.padEnd(headWidth), labels, widths)];
  for (const row of rows) {
    blocks.push(line(row.head.padEnd(headWidth), row.slots, widths));
  }
  return blocks.join('\n\n') + '\n';
};

/** Two diagrams, aligned, for a failure message. */
export const formatMismatch = (expected: string, actual: string): string =>
  `expected:\n\n${expected}\nactual:\n\n${actual}`;
