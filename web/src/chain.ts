import * as seams from './seams.ts';
import * as wallet from './wallet.ts';
import {firstOpenColumn} from '../../pricing/src/index.ts';
import {PracticeLedger, markets, type Saved, type Bet} from './practice.ts';
declare const __HEXIT_API__:string;

const STORE='hexit.seeker.practice.v1';
let saved:Saved|undefined;
try { saved=JSON.parse(localStorage.getItem(STORE)||'null')||undefined; } catch {}
const ledger=new PracticeLedger(saved);
let guest=localStorage.getItem('hexit.seeker.player');
if (!guest) {guest='Practice-'+crypto.randomUUID().slice(0,8);localStorage.setItem('hexit.seeker.player',guest);}
let H:any=null, begun=false, suspended=false, quoteTime=0, marketAt=0;
let quotes=new Map<number,Map<number,seams.QuotedColumn>>();
let ranked:any=null, service:any=null, marketData:any=null, stream:EventSource|null=null, rankedPoll:ReturnType<typeof setInterval>|null=null;
const settledIds=new Set<number>();
function receiveQuotes(data:any){quoteTime=data.now;quotes=new Map(data.quotes.map((m:any)=>[m.asset,new Map(m.cols.map((c:any)=>[c.k,c]))]));}
function save() {localStorage.setItem(STORE,JSON.stringify(ledger.state));}
function update(){save();H?.onPlayer(ranked||ledger.view());}
function connectStream(){
  if(stream)return;stream=new EventSource(__HEXIT_API__+'/stream');
  stream.addEventListener('tick',e=>{const d=JSON.parse((e as MessageEvent).data);if(!suspended)H?.onTick(d.asset,d.tsMs,d.price);});
  stream.addEventListener('market',e=>{marketData=JSON.parse((e as MessageEvent).data);marketAt=Date.now();if(!marketData.available){quoteTime=0;quotes.clear();}dispatchEvent(new Event('hexit:market'));});
  stream.addEventListener('quotes',e=>receiveQuotes(JSON.parse((e as MessageEvent).data)));
  stream.addEventListener('run',e=>receiveRun(JSON.parse((e as MessageEvent).data)));
  stream.onerror=()=>{quoteTime=0;marketAt=0;dispatchEvent(new Event('hexit:market'));};
}
function start(h:any){
  H=h; update();
  if(begun)return;begun=true;
  connectStream();
  const previous=localStorage.getItem('hexit.seeker.run');if(previous&&wallet.playerId())startRanked(previous).catch(()=>{localStorage.removeItem('hexit.seeker.run');});
}
function pause(){if(suspended)return;suspended=true;quoteTime=0;save();}
function resume(){suspended=false;connectStream();if(ranked)refreshRanked().catch(()=>{});}
async function refreshService(){service=await wallet.api('/config');if(service.game?.mode!=='virtual')throw new Error('The virtual game service is updating. Please retry.');wallet.setCluster(service.cluster);dispatchEvent(new Event('hexit:ranked'));}
addEventListener('hexit:pause',pause);addEventListener('hexit:resume',()=>{resume();refreshService().catch(()=>{});});addEventListener('online',()=>refreshService().catch(()=>{}));
addEventListener('pagehide',pause);
document.addEventListener('visibilitychange',()=>document.hidden?pause():resume());
const live=()=>!suspended&&marketData?.available&&Date.now()-marketAt<4000;
const currentQuote=(asset:number,k:number)=>live()&&Date.now()-quoteTime<2500?quotes.get(asset)?.get(k):undefined;
const addr=()=>wallet.playerId()||guest!;
function receiveRun(data:any){
  if(!ranked||data.id!==ranked.id)return;ranked=data;
  for(const b of data.history.bets){if(b.outcome!==null&&!settledIds.has(b.nonce)){settledIds.add(b.nonce);H?.onEvent('BetSettled',b);}}
  H?.onPlayer(data);dispatchEvent(new Event('hexit:ranked'));
}
async function refreshRanked(){if(ranked)receiveRun(await wallet.api('/runs/'+ranked.id));}
async function startRanked(restoreId?:string){
  await wallet.guestLogin();
  const data=restoreId?await wallet.api('/runs/'+restoreId):await wallet.api('/runs',{});
  if(data.mode!=='virtual')throw new Error('Start a fresh virtual-credit run.');
  dispatchEvent(new Event('hexit:mode-change'));
  ranked=data;localStorage.setItem('hexit.seeker.run',data.id);settledIds.clear();
  for(const b of data.history.bets)if(b.outcome!==null)settledIds.add(b.nonce);
  connectStream();
  if(rankedPoll)clearInterval(rankedPoll);rankedPoll=setInterval(()=>refreshRanked().catch(()=>{}),3000);
  H?.onPlayer(data);dispatchEvent(new Event('hexit:ranked'));return data;
}
function practiceMode(){if(ranked?.status==='active')throw new Error('Your run is still active.');dispatchEvent(new Event('hexit:mode-change'));if(rankedPoll)clearInterval(rankedPoll);rankedPoll=null;ranked=null;localStorage.removeItem('hexit.seeker.run');update();dispatchEvent(new Event('hexit:ranked'));}
const chain={
  ...seams,
  init:async()=>{await refreshService();return{usdc:'',chainId:'solana:'+wallet.cluster(),maxPayout:2500,markets};},
  address:addr,
  onboard:async()=>{await wallet.guestLogin();ledger.grant();update();},
  returning:async()=>{if(!wallet.playerId())return false;await wallet.guestLogin();return true;},
  start,watch:start,
  player:async()=>ranked||ledger.view(),
  history:async()=>ranked?.history||ledger.history(),
  walletMicro:async()=>ledger.state.reserve,
  requestWithdraw:async(amount:number)=>{if(ranked)throw new Error('Ranked credits cannot be moved');ledger.withdraw(amount);update();},
  fund:async(amount:number)=>{if(ranked)throw new Error('Ranked credits cannot be topped up');ledger.deposit(amount);update();},
  refill:()=>{if(ranked)throw new Error('Switch to practice before resetting credits.');if(ledger.view().bets.length)throw new Error('Let your open tiles settle first.');ledger.state.credit=100000000;ledger.state.reserve=0;ledger.state.bets=[];update();},
  leaderboard:(period:string,page=1)=>wallet.api('/leaderboard?'+new URLSearchParams({period,page:String(page),limit:'25',...(wallet.address()?{owner:wallet.address()}: {})})),
  firstOpenCol:(nowS:number)=>firstOpenColumn(nowS*1000,1000),
  jOf:(asset:number,c:number,L:number)=>seams.jOf(c,L,markets.find(m=>m.asset===asset)!.row),
  multAt:(asset:number,c:number,L:number)=>seams.multAt(currentQuote(asset,c),c,L,markets.find(m=>m.asset===asset)!.row),
  hasQuotes:(asset:number)=>live()&&Date.now()-quoteTime<2500&&!!quotes.get(asset)?.size,
  marketStatus:()=>({...marketData,available:!!live()}),
  feedLabel:()=>live()?marketData.provider.toUpperCase()+' · LIVE USD':'MARKET FEED PAUSED',
  overPayout:(stake:number,mult:number)=>seams.overPayout(Math.round(stake*1e6),Math.round(mult*100),2500000000),
  placeBet:async(a:any)=>{
    if(!ranked)throw new Error('Start a virtual-credit run first.');
    if(!live())throw new Error('Live market feed paused. Please wait.');
    const r=await wallet.api('/runs/'+ranked.id+'/bet',a);setTimeout(()=>{Object.assign(ranked,r.player);H?.onPlayer(ranked);},0);return r;
  },
  wallet,
  ranked:()=>ranked,
  service:()=>service,
  startRanked,practiceMode,refreshRanked,
};
(window as any).HexitChain=chain;
