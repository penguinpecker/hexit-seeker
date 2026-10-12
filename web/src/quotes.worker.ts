import { quoteColumn, firstOpenColumn } from '../../pricing/src/index.ts';
import tables from './tables.json';
const cache = {get(sig:number) {
  const t=tables.reduce((a,b)=>Math.abs(a.requested-sig)<Math.abs(b.requested-sig)?a:b);
  return {...t,edges:Float64Array.from(t.edges),w:Float64Array.from(t.w)};
}};
self.onmessage = ({data}) => {
  const nowMs=data.now, k0=firstOpenColumn(nowMs,1000);
  const quotes=data.markets.map((m:any)=>({asset:m.asset,cols:Array.from({length:18},(_,i)=>{
    const col=quoteColumn({k:k0+i,nowMs,priceE8:BigInt(Math.round(m.price*1e8)),rowE8:BigInt(Math.round(m.row*1e8)),
      sigBands:0.45,cache:cache as any});
    return {k:col.k,qJ0:col.qJ0,mults:Array.from(col.mults)};
  })}));
  self.postMessage({now:nowMs,quotes});
};
