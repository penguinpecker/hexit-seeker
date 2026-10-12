/** Public, unauthenticated USD last-trade feeds. Never synthesize prices. */
export type Provider = 'Coinbase' | 'Kraken';
export type Price = {asset:number;price:number;sourceTime:number;receivedAt:number};
const assets:Record<string,number>={'SOL-USD':0,'BTC-USD':1,'SOL/USD':0,'BTC/USD':1};
export const FEED_TIMEOUT=4000, PRICE_TIMEOUT=30000;
type Source={connected:boolean;messageAt:number;prices:Map<number,Price>};

export class MarketBook {
  sources:Record<Provider,Source>={Coinbase:{connected:false,messageAt:0,prices:new Map()},Kraken:{connected:false,messageAt:0,prices:new Map()}};
  selected:Provider|null=null;
  epoch=0;
  connected(provider:Provider,on:boolean){const s=this.sources[provider];s.connected=on;s.messageAt=0;s.prices.clear();}
  ingest(provider:Provider,message:any,now=Date.now()){
    const s=this.sources[provider];
    const heartbeat=provider==='Coinbase'?message.type==='heartbeat':message.channel==='heartbeat';
    if(heartbeat){s.messageAt=now;return;}
    const rows=provider==='Coinbase'?(message.type==='ticker'?[{symbol:message.product_id,last:message.price,timestamp:message.time}]:[]):
      message.channel==='ticker'&&Array.isArray(message.data)?message.data:[];
    for(const row of rows){
      const asset=assets[row.symbol],price=Number(row.last),sourceTime=Date.parse(row.timestamp);
      if(asset===undefined||!Number.isFinite(price)||price<=0||price>1e8||!Number.isFinite(sourceTime)||now-sourceTime>PRICE_TIMEOUT||sourceTime>now+2000)continue;
      const prior=s.prices.get(asset);if(prior&&sourceTime<prior.sourceTime)continue;
      s.prices.set(asset,{asset,price,sourceTime,receivedAt:now});s.messageAt=now;
    }
  }
  healthy(provider:Provider,now:number){const s=this.sources[provider];return s.connected&&now-s.messageAt<=FEED_TIMEOUT&&[0,1].every(a=>{const p=s.prices.get(a);return p&&now-p.sourceTime<=PRICE_TIMEOUT&&now-p.receivedAt<=PRICE_TIMEOUT;});}
  sample(now=Date.now()){
    const next=this.selected&&this.healthy(this.selected,now)?this.selected:
      (['Coinbase','Kraken'] as Provider[]).find(p=>this.healthy(p,now))||null;
    if(next!==this.selected){this.selected=next;this.epoch++;}
    return next?{provider:next,epoch:this.epoch,prices:[...this.sources[next].prices.values()].sort((a,b)=>a.asset-b.asset)}:null;
  }
  status(now=Date.now()){
    const sample=this.sample(now);
    return {mode:'live',available:!!sample,provider:sample?.provider||null,epoch:this.epoch,sampledAt:now,
      priceType:'USD last trade',sampleMs:100,prices:sample?.prices||[],
      providers:(['Coinbase','Kraken'] as Provider[]).map(provider=>({provider,available:this.healthy(provider,now)}))};
  }
}

export function startMarketFeed(book=new MarketBook()){
  let stopped=false;
  const sockets=new Map<Provider,WebSocket>(),timers=new Set<ReturnType<typeof setTimeout>>();
  function connect(provider:Provider,attempt=0){
    if(stopped)return;
    const ws=new WebSocket(provider==='Coinbase'?'wss://ws-feed.exchange.coinbase.com':'wss://ws.kraken.com/v2');sockets.set(provider,ws);
    let seenAt=Date.now(),healthy=false;
    const watchdog=setInterval(()=>{if(Date.now()-seenAt>10000)ws.close();},2000);
    ws.onopen=()=>{
      book.connected(provider,true);seenAt=Date.now();
      ws.send(JSON.stringify(provider==='Coinbase'?{type:'subscribe',product_ids:['SOL-USD','BTC-USD'],channels:['ticker','heartbeat']}:
        {method:'subscribe',params:{channel:'ticker',symbol:['SOL/USD','BTC/USD'],event_trigger:'trades',snapshot:true}}));
    };
    ws.onmessage=e=>{try{const data=JSON.parse(String(e.data));book.ingest(provider,data);seenAt=Date.now();healthy=book.healthy(provider,seenAt)||healthy;}catch{}};
    ws.onerror=()=>ws.close();
    ws.onclose=()=>{
      clearInterval(watchdog);book.connected(provider,false);sockets.delete(provider);
      if(!stopped){const n=healthy?0:attempt+1;const timer=setTimeout(()=>{timers.delete(timer);connect(provider,n);},Math.min(30000,1000*2**Math.min(n,5)));timers.add(timer);}
    };
  }
  connect('Coinbase');connect('Kraken');
  return {book,close(){stopped=true;for(const timer of timers)clearTimeout(timer);for(const ws of sockets.values())ws.close();}};
}
