import { ColumnSim, firstOpenColumn } from '../../pricing/src/index.ts';

export const markets = [
  { asset: 0, sym: 'SOL/USD', name: 'Solana', dec: 2, row: 0.01, live: true, initial: 150 },
  { asset: 1, sym: 'BTC/USD', name: 'Bitcoin', dec: 2, row: 5, live: true, initial: 90000 },
];
export interface Bet {
  asset: number; k: number; j: number; stake: number; mult: number; nonce: number;
  placedAt: number; settledAt: number | null; outcome: number | null; credited: number | null;
}
export interface Saved { version: 1; credit: number; reserve: number; nonce: number; bets: Bet[]; granted: boolean }
const fresh = (): Saved => ({ version: 1, credit: 0, reserve: 0, nonce: 0, bets: [], granted: false });
const fail = (errName: string): never => { throw Object.assign(new Error(errName), { errName }); };
const integer = (x: number) => Number.isSafeInteger(x);
/** Practice credits only. No wallet keys, RPC, tokens, or blockchain transactions. */
export class PracticeLedger {
  state: Saved;
  private columns = new Map<string, ColumnSim>();
  constructor(saved?: Saved) {
    this.state = saved && saved.version === 1 && integer(saved.credit) && saved.credit >= 0
      && integer(saved.reserve) && saved.reserve >= 0 && integer(saved.nonce) && saved.nonce >= 0
      && Array.isArray(saved.bets) && saved.bets.every(b => integer(b.stake) && b.stake > 0 && integer(b.nonce)
        && integer(b.k) && integer(b.j) && integer(b.mult) && !!markets.find(m => m.asset === b.asset))
      ? structuredClone(saved) : fresh();
    // An interrupted practice tape has no provable outcome: refund, never silently lose it.
    this.refundOpen();
  }
  grant() { if (!this.state.granted) { this.state.credit += 100_000_000; this.state.granted = true; } }
  view() {
    const bets = this.state.bets.filter(b => b.outcome === null);
    return { credit: this.state.credit, wallet: this.state.reserve, openStake: bets.reduce((a,b) => a + b.stake, 0),
      nonceBase: this.state.nonce, nonceMask: 0, bets, granted: this.state.granted };
  }
  place(a: {asset: number;k: number;j: number;stake: number;minMult: number}, mult: number, now: number) {
    const market = markets.find(m => m.asset === a.asset); if (!market) fail('MarketClosed');
    if (!integer(a.k) || a.k < firstOpenColumn(now, 1000) || a.k > firstOpenColumn(now, 1000) + 17) fail('Locked');
    if (!integer(a.j) || !integer(a.stake) || a.stake < 100000 || a.stake > 5000000) fail('StakeOutOfRange');
    if (!integer(mult) || mult < 101 || mult > 10000) fail('NotOffered');
    if (!integer(a.minMult) || mult < a.minMult) fail('BelowMinMult');
    if (Math.floor(a.stake * mult / 100) > 2500000000) fail('PayoutCap');
    if (a.stake > this.state.credit) fail('InsufficientCredit');
    const open = this.view().bets;
    if (open.length >= 32) fail('TooManyOpen');
    if (open.some(b => b.asset === a.asset && b.k === a.k && b.j === a.j)) fail('HexCap');
    if (open.filter(b => b.asset === a.asset && b.k === a.k).reduce((v,b)=>v+b.stake,0) + a.stake > 25000000) fail('ColumnCap');
    const b: Bet = {...a, mult, nonce: this.state.nonce++, placedAt: now, settledAt: null, outcome: null, credited: null};
    const key = `${a.asset}:${a.k}`;
    if (!this.columns.has(key)) this.columns.set(key, new ColumnSim(BigInt(a.k), BigInt(Math.round(market!.row * 1e8)), a.j - 128, 250));
    else {
      const sim = this.columns.get(key)!;
      if (a.j < sim.bJ0 || a.j >= sim.bJ0 + 256) { this.state.nonce--; fail('NotQuoted'); }
    }
    this.state.credit -= a.stake;
    this.state.bets.push(b);
    return { nonce: b.nonce, mult: mult / 100 };
  }
  tick(asset: number, t0: number, p0: number, t1: number, p1: number): Bet[] {
    const resolved: Bet[] = [];
    for (const [key, sim] of this.columns) {
      if (!key.startsWith(asset + ':')) continue;
      sim.apply(BigInt(t0), BigInt(Math.round(p0*1e8)), BigInt(t1), BigInt(Math.round(p1*1e8)));
      if (BigInt(t1) < sim.tHi + 500n) continue;
      for (const b of this.state.bets.filter(b => b.asset === asset && BigInt(b.k) === sim.k && b.outcome === null)) {
        const result = sim.outcome(b.j, BigInt(t1));
        if (result === 'PENDING') continue;
        this.settle(b, result === 'WIN' ? 1 : result === 'LOSS' ? 2 : 3, t1);
        resolved.push(b);
      }
      if (!this.state.bets.some(b=>b.asset === asset && BigInt(b.k) === sim.k && b.outcome === null)) this.columns.delete(key);
    }
    return resolved;
  }
  private settle(b: Bet, outcome: number, now: number) {
    if (b.outcome !== null) return;
    b.outcome = outcome; b.settledAt = now;
    b.credited = outcome === 1 ? Math.floor(b.stake*b.mult/100) : outcome === 3 ? b.stake : 0;
    this.state.credit += b.credited;
  }
  refundOpen() {
    const open = this.state.bets.filter(b=>b.outcome === null);
    for (const b of open) this.settle(b, 3, Date.now());
    this.columns.clear(); return open;
  }
  withdraw(amount: number) {
    if (!integer(amount) || amount <= 0 || amount > this.state.credit) fail('InsufficientCredit');
    this.state.credit -= amount; this.state.reserve += amount;
  }
  deposit(amount: number) {
    if (!integer(amount) || amount <= 0 || amount > this.state.reserve) fail('InsufficientCredit');
    this.state.reserve -= amount; this.state.credit += amount;
  }
  history() {
    const bets = this.state.bets, settled = bets.filter(b=>b.outcome !== null), wins = settled.filter(b=>b.outcome === 1);
    return { bets: [...bets].reverse().map(b=>({...b, stake: String(b.stake), credited: b.credited === null ? null : String(b.credited)})),
      stats: {taps:bets.length,wins:wins.length,losses:settled.filter(b=>b.outcome===2).length,
        bestMult:Math.max(0,...wins.map(b=>b.mult)),pnl:String(settled.reduce((v,b)=>v+b.credited!-b.stake,0))} };
  }
}
