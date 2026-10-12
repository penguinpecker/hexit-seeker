import {parentPort} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {quoteColumn,firstOpenColumn} from '../pricing/src/index.ts';
const tables=JSON.parse(readFileSync(new URL('../web/src/tables.json',import.meta.url),'utf8'));
const cache={get(sig:number){return tables.reduce((a:any,b:any)=>Math.abs(a.requested-sig)<Math.abs(b.requested-sig)?a:b);}};
parentPort!.on('message',({now,markets,epoch})=>{
  const start=firstOpenColumn(now,1000);
  parentPort!.postMessage({now,epoch,quotes:markets.map((m:any)=>({asset:m.asset,cols:Array.from({length:18},(_,i)=>{
    const q=quoteColumn({k:start+i,nowMs:now,priceE8:BigInt(Math.round(m.price*1e8)),rowE8:BigInt(Math.round(m.row*1e8)),sigBands:.45,cache:cache as any});
    return {k:q.k,qJ0:q.qJ0,mults:[...q.mults]};
  })}))});
});
