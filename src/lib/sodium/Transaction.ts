import {Vertex} from './Vertex';
import * as Collections from 'typescript-collections';
import { IntrusiveIndexedPriorityQueue } from "./IntrusiveIndexedPriorityQueue";

export class Entry
{
  constructor(rank: Vertex, action: () => void)
  {
    this.rank = rank;
    this.action = action;
    this.seq = Entry.nextSeq++;
    this.pqRank = rank.rank;
    this.inPq = false;
    this.pqNext = null;
    this.pqPrev = null;
    rank.entries.push(this);
  }

  private static nextSeq: number = 0;
  rank: Vertex;
  action: () => void;
  seq: number;
  pqRank: number;
  inPq: boolean;
  pqNext: Entry | null;
  pqPrev: Entry | null;

  dispose() {
    for (let i = 0; i < this.rank.entries.length; ++i) {
      if (this.rank.entries[i] === this) {
        this.rank.entries.splice(i, 1);
        break;
      }
    }
  }

  toString(): string
  {
    return this.seq.toString();
  }
}

export class Transaction
{
  public static currentTransaction: Transaction = null;
  private static onStartHooks: (() => void)[] = [];
  private static runningOnStartHooks: boolean = false;

  constructor() {}

  inCallback: number = 0;
  rerankEntriesSet = new Set<Entry>();

  private static prioritizedQ = new IntrusiveIndexedPriorityQueue<Entry>();

  private sampleQ: Array<() => void> = [];
  private lastQ: Array<() => void> = [];
  private postQ: Array<() => void> = null;
  private static collectCyclesAtEnd: boolean = false;

  prioritized(target: Vertex, action: () => void): void
  {
    const e = new Entry(target, action);
    Transaction.prioritizedQ.enqueue(e);
  }

  sample(h: () => void): void
  {
    this.sampleQ.push(h);
  }

  last(h: () => void): void
  {
    this.lastQ.push(h);
  }

  public static _collectCyclesAtEnd(): void
  {
    Transaction.run(() => Transaction.collectCyclesAtEnd = true);
  }

  /**
   * Add an action to run after all last() actions.
   */
  post(childIx: number, action: () => void): void
  {
    if (this.postQ == null)
      this.postQ = [];
    // If an entry exists already, combine the old one with the new one.
    while (this.postQ.length <= childIx)
      this.postQ.push(null);
    const existing = this.postQ[childIx],
      neu =
        existing === null ? action
          : () =>
        {
          existing();
          action();
        };
    this.postQ[childIx] = neu;
  }

  // If the priority queue has entries in it when we modify any of the nodes'
  // ranks, then we need to re-generate it to make sure it's up-to-date.
  private checkRegen(): void
  {
    for (let entry of this.rerankEntriesSet) {
      Transaction.prioritizedQ.changeRank(entry, entry.rank.rank);
    }
    this.rerankEntriesSet.clear();
  }

  public isActive() : boolean
  {
    return Transaction.currentTransaction ? true : false;
  }

  close(): void
  {
    while(true)
    {
      while (true)
      {
        this.checkRegen();
        if (Transaction.prioritizedQ.isEmpty()) break;
        const e = Transaction.prioritizedQ.dequeue();
        e.action();
        e.dispose();
      }

      const sq = this.sampleQ;
      this.sampleQ = [];
      for (let i = 0; i < sq.length; i++)
        sq[i]();

      if(Transaction.prioritizedQ.isEmpty() && this.sampleQ.length < 1) break;
    }

    for (let i = 0; i < this.lastQ.length; i++)
      this.lastQ[i]();
    this.lastQ = [];
    if (this.postQ != null)
    {
      for (let i = 0; i < this.postQ.length; i++)
      {
        if (this.postQ[i] != null)
        {
          const parent = Transaction.currentTransaction;
          try
          {
            if (i > 0)
            {
              Transaction.currentTransaction = new Transaction();
              try
              {
                this.postQ[i]();
                Transaction.currentTransaction.close();
              }
              catch (err)
              {
                Transaction.currentTransaction.close();
                throw err;
              }
            }
            else
            {
              Transaction.currentTransaction = null;
              this.postQ[i]();
            }
            Transaction.currentTransaction = parent;
          }
          catch (err)
          {
            Transaction.currentTransaction = parent;
            throw err;
          }
        }
      }
      this.postQ = null;
    }
  }

  /**
   * Add a runnable that will be executed whenever a transaction is started.
   * That runnable may start transactions itself, which will not cause the
   * hooks to be run recursively.
   *
   * The main use case of this is the implementation of a time/alarm system.
   */
  static onStart(r: () => void): void
  {
    Transaction.onStartHooks.push(r);
  }

  public static run<A>(f: () => A): A
  {
    const transWas: Transaction = Transaction.currentTransaction;
    if (transWas === null)
    {
      if (!Transaction.runningOnStartHooks)
      {
        Transaction.runningOnStartHooks = true;
        try
        {
          for (let i = 0; i < Transaction.onStartHooks.length; i++)
            Transaction.onStartHooks[i]();
        }
        finally
        {
          Transaction.runningOnStartHooks = false;
        }
      }
      Transaction.currentTransaction = new Transaction();
    }
    try
    {
      const a: A = f();
      if (transWas === null)
      {
        Transaction.currentTransaction.close();
        Transaction.currentTransaction = null;
        if (Transaction.collectCyclesAtEnd) {
          Vertex.collectCycles();
          Transaction.collectCyclesAtEnd = false;
        }
      }
      return a;
    }
    catch (err)
    {
      if (transWas === null)
      {
        Transaction.currentTransaction.close();
        Transaction.currentTransaction = null;
      }
      throw err;
    }
  }
}


