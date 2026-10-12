import http from 'node:http';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import pg from 'pg';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {scoreTransaction} from '../web/src/solana.ts';
import {PracticeLedger,markets} from '../web/src/practice.ts';
import {FEE_LAMPORTS,MEMO_PROGRAM,memoFor,validAddress,validSignature,verifyPayment} from './payment.ts';
import {notifications,pushEnabled} from './push.ts';
import {VIRTUAL_GAME,createVirtualLedger} from './virtual-game.ts';
import {startMarketFeed} from './market-feed.ts';
import {LEADERBOARD_SQL,leaderboardPage,publicScore} from './leaderboard.ts';

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:8});
const cluster='mainnet-beta';
if(process.env.SOLANA_CLUSTER&&process.env.SOLANA_CLUSTER!==cluster)throw new Error('Score payments require Solana mainnet');
const treasury=process.env.FEE_TREASURY||'';
if(treasury&&!validAddress(treasury))throw new Error('Invalid FEE_TREASURY');
const rpcUrl=process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com';
const duration=180000;
await pool.query(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
// One price tape and one writer, even during a rolling deployment overlap.
const leader=await pool.connect();
const boot=http.createServer((req,res)=>{res.writeHead(req.url==='/health'?200:503,{'content-type':'application/json'});res.end(JSON.stringify({ok:req.url==='/health',ready:false,database:'postgresql'}));});
await new Promise<void>(resolve=>boot.listen(Number(process.env.PORT||8789),'0.0.0.0',resolve));
await leader.query('SELECT pg_advisory_lock(782343229)');
await new Promise<void>(resolve=>boot.close(()=>resolve()));
const push=notifications(pool);

const unfinished=await pool.query("SELECT * FROM ranked_runs WHERE status='active'");
for(const row of unfinished.rows){const ledger=new PracticeLedger(row.state);await pool.query("UPDATE ranked_runs SET status='finished',state=$2,updated_at=now() WHERE id=$1",[row.id,ledger.state]);}

const runs=new Map<string,any>(), streams=new Set<any>(), limits=new Map<string,{n:number;at:number}>();
const prices=new Map<number,number>();
const feed=startMarketFeed();
let lastTick=0,quoteTime=0,quoteBusy=false,quotes:any[]=[],feedEpoch=-1,marketReady=false,lastStatus=0;
const worker=new Worker(new URL('./quotes-worker.ts',import.meta.url));
worker.on('message',data=>{quoteBusy=false;if(!marketReady||data.epoch!==feedEpoch||data.epoch!==feed.book.epoch)return;quoteTime=data.now;quotes=data.quotes;broadcast('quotes',data);});
worker.on('error',e=>{console.error('Quote worker failed:',e.message);process.exit(1);});
function broadcast(event:string,data:any){const payload=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;for(const res of streams){if(res.writableLength>262144){res.end();streams.delete(res);}else res.write(payload);}}
function persist(run:any){const state=JSON.stringify(run.ledger.state),status=run.status;run.saved=run.saved.then(()=>pool.query('UPDATE ranked_runs SET state=$2,status=$3,updated_at=now() WHERE id=$1',[run.id,state,status]));return run.saved;}
function runView(r:any){return {id:r.id,status:r.status,startedAt:r.startedAt,endsAt:r.endsAt,initialMicro:r.initialMicro||VIRTUAL_GAME.starterMicro,mode:r.mode,...r.ledger.view(),history:r.ledger.history()};}
function tick(){
  const now=Math.floor(Date.now()/100)*100;if(now<=lastTick)return;
  const sample=feed.book.sample(now),wasReady=marketReady;
  const gap=!!lastTick&&now-lastTick>250,changed=feedEpoch!==feed.book.epoch;
  marketReady=!!sample;feedEpoch=feed.book.epoch;
  if(gap||changed||wasReady&&!marketReady){
    quoteTime=0;quotes=[];
    for(const r of runs.values())if(r.status==='active'&&r.ledger.refundOpen().length){persist(r).catch(fatal);broadcast('run',runView(r));}
  }
  if(sample)for(const point of sample.prices){
    const previous=prices.get(point.asset);
    prices.set(point.asset,point.price);broadcast('tick',{asset:point.asset,tsMs:now,price:point.price,source:sample.provider,sourceTime:point.sourceTime});
    if(wasReady&&!gap&&!changed&&previous!==undefined)for(const r of runs.values())if(r.status==='active'){
      const settled=r.ledger.tick(point.asset,lastTick,previous,now,point.price);
      if(settled.length){persist(r).catch(fatal);broadcast('run',{id:r.id,...runView(r)});}
    }
  }
  for(const r of runs.values()){
    if(r.status==='active'&&now>=r.endsAt){r.ledger.refundOpen();r.status='finished';persist(r).then(()=>push.enqueue('run:'+r.id,r.owner,'Your Hexit run is complete','Your ranked score is ready to review.',{runId:r.id,screen:'leaders'})).catch(fatal);broadcast('run',runView(r));}
    if(r.status==='finished'&&now-r.endsAt>600000)runs.delete(r.id);
  }
  if(now-lastStatus>=1000||changed||wasReady!==marketReady){lastStatus=now;broadcast('market',feed.book.status(now));}
  lastTick=now;
}
function fatal(e:any){console.error('State persistence failed:',e.message);process.exit(1);}
setInterval(tick,50);
setInterval(()=>{if(!quoteBusy&&marketReady&&feed.book.sample()?.epoch===feedEpoch){quoteBusy=true;worker.postMessage({now:Date.now(),epoch:feedEpoch,markets:markets.map(m=>({...m,price:prices.get(m.asset)}))});}},450);
setInterval(()=>broadcast('heartbeat',{now:Date.now()}),15000);
setInterval(()=>{const t=Date.now();for(const [ip,r]of limits)if(t-r.at>60000)limits.delete(ip);
  pool.query("DELETE FROM wallet_challenges WHERE expires_at<now()-interval '1 day'; DELETE FROM wallet_sessions WHERE expires_at<now()-interval '1 day'").catch(()=>{});
},60000).unref();
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const error=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const uuid=(id:unknown)=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(id);
async function body(req:any){let text='';for await(const chunk of req){text+=chunk;if(text.length>16384)error(413,'Request too large');}try{return JSON.parse(text||'{}');}catch{error(400,'Invalid JSON');}}
async function owner(req:any){const token=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[0-9a-f]{64}$/.test(token))error(401,'Start a play session first');
  const r=await pool.query('SELECT owner FROM wallet_sessions WHERE token_hash=$1 AND expires_at>now()',[hash(token)]);if(!r.rowCount)error(401,'Your play session expired. Reopen Hexit to continue.');return r.rows[0].owner;}
async function ownedRun(id:string,who:string){if(!uuid(id))error(400,'Invalid run');
  const live=runs.get(id);if(live){if(live.owner!==who)error(403,'This run belongs to another player');return live;}
  const result=await pool.query('SELECT * FROM ranked_runs WHERE id=$1 AND owner=$2',[id,who]);if(!result.rowCount)error(404,'Run not found');
  const row=result.rows[0];return{id:row.id,owner:who,startedAt:+new Date(row.started_at),endsAt:+new Date(row.ends_at),initialMicro:Number(row.initial_micro),mode:row.mode,status:row.status,ledger:new PracticeLedger(row.state),saved:Promise.resolve()};}
async function rawRpc(method:string,params:any[]){const response=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok||data.error)error(503,'Solana RPC unavailable. Your payment can be checked again.');return data.result;}

const server=http.createServer(async(req,res)=>{
  const origin=String(req.headers.origin||'');
  const allowed=['https://appassets.androidplatform.net','http://127.0.0.1:4198','http://localhost:4198'];
  if(allowed.includes(origin))res.setHeader('access-control-allow-origin',origin);
  res.setHeader('vary','Origin');res.setHeader('access-control-allow-headers','content-type,authorization');res.setHeader('access-control-allow-methods','GET,POST,OPTIONS');
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  const json=(status:number,value:any)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
  try{
    const url=new URL(req.url||'/','http://localhost'),path=url.pathname;
    if(path==='/.well-known/assetlinks.json'){json(200,JSON.parse(readFileSync(new URL('./assetlinks.json',import.meta.url),'utf8')));return;}
    if(path==='/icons/icon-192.png'){res.writeHead(200,{'content-type':'image/png','cache-control':'public,max-age=3600'});res.end(readFileSync(new URL('./icon-192.png',import.meta.url)));return;}
    const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0];
    let limit=limits.get(ip);if(!limit||Date.now()-limit.at>60000){limit={n:0,at:Date.now()};limits.set(ip,limit);}if(++limit.n>600)error(429,'Too many requests. Please wait a minute.');
    if(path==='/health'){await pool.query('SELECT 1');json(200,{ok:true,database:'postgresql',gameMode:'virtual',cluster,feeLamports:FEE_LAMPORTS,paymentsEnabled:!!treasury,runs:runs.size,quoteAgeMs:quoteTime?Date.now()-quoteTime:null,marketData:feed.book.status()});return;}
    if(path==='/config'){json(200,{cluster,treasury,feeLamports:FEE_LAMPORTS,paymentsEnabled:!!treasury,pushEnabled,game:VIRTUAL_GAME,durationMs:duration,marketData:feed.book.status(),markets:markets.map(m=>({...m,initial:prices.get(m.asset)??null}))});return;}
    if(path==='/markets'&&req.method==='GET'){json(200,feed.book.status());return;}
    if(path==='/push/register'&&req.method==='POST'){
      const who=await owner(req),b=await body(req);if(!pushEnabled)error(503,'Notifications are not configured');
      if(!uuid(b.deviceId)||typeof b.token!=='string'||b.token.length<80||b.token.length>4096||!/^[A-Za-z0-9_:.-]+$/.test(b.token))error(400,'Invalid notification registration');
      await pool.query('INSERT INTO push_devices(id,owner,token) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET owner=$2,token=$3,updated_at=now()',[b.deviceId,who,b.token]);json(200,{ok:true});return;
    }
    if(path==='/push/unregister'&&req.method==='POST'){
      const who=await owner(req),b=await body(req);if(!uuid(b.deviceId))error(400,'Invalid device');await pool.query('DELETE FROM push_devices WHERE id=$1 AND owner=$2',[b.deviceId,who]);json(200,{ok:true});return;
    }
    if(path==='/push/test'&&req.method==='POST'){
      const who=await owner(req);if(!pushEnabled)error(503,'Notifications are not configured');
      const devices=await pool.query('SELECT id FROM push_devices WHERE owner=$1',[who]);if(!devices.rowCount)error(409,'Enable notifications on your device first');
      await push.enqueue('test:'+who+':'+Math.floor(Date.now()/60000),who,'Hexit notifications are on','You’ll hear when your ranked run finishes and your score is published.',{screen:'leaders'});json(200,{ok:true});return;
    }
    if(path==='/auth/logout'&&req.method==='POST'){
      await owner(req);const token=String(req.headers.authorization).replace(/^Bearer /,'');await pool.query('DELETE FROM wallet_sessions WHERE token_hash=$1',[hash(token)]);json(200,{ok:true});return;
    }
    if(path==='/stream'&&req.method==='GET'){
      if(streams.size>=500)error(503,'The game is busy. Try again shortly.');
      res.writeHead(200,{'content-type':'text/event-stream','connection':'keep-alive','x-accel-buffering':'no'});streams.add(res);
      res.write(`event: market\ndata: ${JSON.stringify(feed.book.status())}\n\n`);
      res.write(`event: quotes\ndata: ${JSON.stringify({now:quoteTime,quotes})}\n\n`);req.on('close',()=>streams.delete(res));return;
    }
    if(path==='/leaderboard'&&req.method==='GET'){
      const period=['daily','weekly','all'].includes(url.searchParams.get('period')||'')?url.searchParams.get('period')!:'all';
      const cutoff=period==='daily'?new Date(Date.now()-864e5):period==='weekly'?new Date(Date.now()-6048e5):new Date(0);
      let page=1,limit=25;try{({page,limit}=leaderboardPage(url.searchParams));}catch(e:any){error(400,e.message);}
      const me=url.searchParams.get('owner')||'';if(me&&!validAddress(me))error(400,'Invalid leaderboard wallet');
      const result=await pool.query(LEADERBOARD_SQL,[cluster,cutoff,limit,(page-1)*limit,me]),data=result.rows[0];
      json(200,{period,cluster,page,limit,total:data.total,pages:Math.max(1,Math.ceil(data.total/limit)),rows:data.rows.map(publicScore),podium:data.podium.map(publicScore),self:publicScore(data.self)});return;
    }
    if(path==='/auth/guest'&&req.method==='POST'){
      const previous=String(req.headers.authorization||'').replace(/^Bearer /,'');
      if(/^[a-f0-9]{64}$/.test(previous)){
        const existing=await pool.query("UPDATE wallet_sessions SET expires_at=now()+interval '90 days' WHERE token_hash=$1 AND expires_at>now() AND owner LIKE 'Player-%' RETURNING owner,payer",[hash(previous)]);
        if(existing.rowCount){json(200,{token:previous,owner:existing.rows[0].owner,payer:existing.rows[0].payer||'',game:VIRTUAL_GAME});return;}
      }
      const who='Player-'+randomUUID(),token=randomBytes(32).toString('hex');
      await pool.query("INSERT INTO wallet_sessions(token_hash,owner,expires_at) VALUES($1,$2,now()+interval '90 days')",[hash(token),who]);
      json(200,{token,owner:who,payer:'',game:VIRTUAL_GAME});return;
    }
    if(path==='/payments/challenge'&&req.method==='POST'){
      const who=await owner(req),nonce=randomBytes(16).toString('hex');await pool.query("INSERT INTO wallet_challenges(nonce,owner,purpose,expires_at) VALUES($1,$2,'payment',now()+interval '5 minutes')",[nonce,who]);json(200,{nonce,cluster});return;
    }
    if(path==='/payments/verify'&&req.method==='POST'){
      const who=await owner(req),b=await body(req),key=Buffer.from(b.publicKey||'','base64'),sig=Buffer.from(b.signature||'','base64'),message=Buffer.from(b.message||'','base64');
      const expected=`Hexit Seeker\nConnect this wallet to Hexit on Solana mainnet.\nThis signature does not authorize transfers or bets.\nNonce: ${b.nonce}`;
      if(key.length!==32||sig.length!==64||message.toString()!==expected||!nacl.sign.detached.verify(message,sig,key))error(401,'Invalid payment wallet signature');
      const used=await pool.query("UPDATE wallet_challenges SET consumed=true WHERE nonce=$1 AND owner=$2 AND purpose='payment' AND consumed=false AND expires_at>now() RETURNING nonce",[b.nonce,who]);if(!used.rowCount)error(401,'Payment wallet challenge expired');
      const payer=bs58.encode(key),token=String(req.headers.authorization).replace(/^Bearer /,'');await pool.query('UPDATE wallet_sessions SET payer=$2 WHERE token_hash=$1',[hash(token),payer]);json(200,{payer});return;
    }
    if(path==='/runs'&&req.method==='POST'){
      const who=await owner(req),b=await body(req);
      if(!who.startsWith('Player-'))error(409,'Update Hexit to start a virtual-credit run');
      if(Object.keys(b).length)error(400,'Run balances and scores are set by the server');
      const existing=await pool.query("SELECT id FROM ranked_runs WHERE owner=$1 AND status='active'",[who]);if(existing.rowCount){json(200,runView(await ownedRun(existing.rows[0].id,who)));return;}
      if(!marketReady||feed.book.sample()?.epoch!==feedEpoch||Date.now()-quoteTime>2500)error(503,'Waiting for the live market feed. Please retry.');
      const initialMicro=VIRTUAL_GAME.starterMicro,ledger=createVirtualLedger();
      const startedAt=Date.now(),id=randomUUID(),endsAt=startedAt+duration;
      const run={id,owner:who,startedAt,endsAt,initialMicro,mode:'virtual',status:'active',ledger,saved:Promise.resolve()};
      try{await pool.query('INSERT INTO ranked_runs(id,owner,started_at,ends_at,status,state,initial_micro,mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,who,new Date(startedAt),new Date(endsAt),'active',ledger.state,initialMicro,'virtual']);}
      catch(e:any){if(e.code==='23505')error(409,'A run is already active');throw e;}
      runs.set(run.id,run);json(200,runView(run));return;
    }
    if(path.startsWith('/runs/')&&req.method==='GET'){
      const who=await owner(req),id=path.split('/')[2];json(200,runView(await ownedRun(id,who)));return;
    }
    if(path.endsWith('/bet')&&path.startsWith('/runs/')&&req.method==='POST'){
      const who=await owner(req),run=await ownedRun(path.split('/')[2],who),b=await body(req);
      if(run.status!=='active'||Date.now()>=run.endsAt)error(409,'The ranked run has ended');
      if(b.k*5000+6500>run.endsAt)error(409,'Choose a tile that settles before the run ends');
      if(!marketReady||feed.book.sample()?.epoch!==feedEpoch||Date.now()-quoteTime>2500)error(503,'Live market feed paused. Please wait for it to reconnect.');
      const q=quotes.find(m=>m.asset===b.asset)?.cols.find((c:any)=>c.k===b.k),mult=q?.mults[b.j-q.qJ0];
      if(!mult)error(409,'Tile not quoted');
      const result=run.ledger.place(b,mult,Date.now());await persist(run);json(200,{...result,player:run.ledger.view()});return;
    }
    if(path==='/scores/intent'&&req.method==='POST'){
      const who=await owner(req),b=await body(req);if(Object.keys(b).some(k=>k!=='runId'))error(400,'Scores are calculated by the server');const run=await ownedRun(b.runId,who);
      if(run.mode!=='virtual')error(409,'Start a new virtual-credit run in the updated app');
      if(run.status!=='finished')error(409,'Finish your ranked run first');
      if(!run.ledger.state.bets.length)error(409,'Play at least one tile before submitting a score');
      if(!treasury)error(503,'The fee receiver is not configured yet');
      const session=await pool.query('SELECT payer FROM wallet_sessions WHERE token_hash=$1',[hash(String(req.headers.authorization).replace(/^Bearer /,''))]);
      const payer=session.rows[0]?.payer;if(!payer)error(409,'Connect your mainnet payment wallet first');
      if(treasury===payer)error(400,'The fee receiver cannot submit scores');
      await run.saved;
      const id=randomUUID(),score=run.ledger.state.credit,pnl=score-(run.initialMicro||100000000);
      const result=await pool.query(`INSERT INTO score_intents(id,run_id,owner,treasury,cluster,lamports,score_micro,pnl_micro,payer,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '30 minutes') ON CONFLICT(run_id) DO UPDATE SET expires_at=CASE WHEN score_intents.paid_at IS NULL THEN now()+interval '30 minutes' ELSE score_intents.expires_at END RETURNING *`,[id,run.id,who,treasury,cluster,FEE_LAMPORTS,score,pnl,payer]);
      const intent=result.rows[0];
      // A paid run never asks for a second payment.
      if(intent.paid_at){json(200,{id:intent.id,paid:true,signature:intent.tx_signature});return;}
      const {value:block}=await rawRpc('getLatestBlockhash',[{commitment:'confirmed'}]);
      if(intent.payer!==payer)error(409,'Reconnect the payment wallet originally used for this submission');
      const transaction=scoreTransaction(payer,intent.treasury,block.blockhash,intent.id);
      json(200,{id:intent.id,cluster:intent.cluster,treasury:intent.treasury,lamports:FEE_LAMPORTS,score:intent.score_micro,pnl:intent.pnl_micro,memo:memoFor(intent.id),
        transaction:Buffer.from(transaction).toString('base64'),blockhash:block.blockhash,lastValidBlockHeight:block.lastValidBlockHeight});return;
    }
    if(path==='/scores/confirm'&&req.method==='POST'){
      const who=await owner(req),b=await body(req);if(!uuid(b.intentId)||!validSignature(b.signature))error(400,'Invalid payment receipt');
      const result=await pool.query('SELECT * FROM score_intents WHERE id=$1 AND owner=$2',[b.intentId,who]);if(!result.rowCount)error(404,'Submission not found');const intent=result.rows[0];
      if(intent.paid_at){json(200,{ok:true,signature:intent.tx_signature});return;}
      const tx=await rawRpc('getTransaction',[b.signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}]);
      if(!tx){json(202,{pending:true});return;}
      try{verifyPayment(tx,intent);}catch(e:any){error(400,e.message);}
      const client=await pool.connect();try{
        await client.query('BEGIN');
        const locked=await client.query('SELECT paid_at FROM score_intents WHERE id=$1 FOR UPDATE',[intent.id]);
        if(!locked.rows[0].paid_at){
          await client.query('UPDATE score_intents SET tx_signature=$2,paid_at=now() WHERE id=$1',[intent.id,b.signature]);
          await client.query('INSERT INTO leaderboard_scores(id,run_id,owner,score_micro,pnl_micro,tx_signature,cluster) VALUES($1,$2,$3,$4,$5,$6,$7)',[intent.id,intent.run_id,intent.payer||who,intent.score_micro,intent.pnl_micro,b.signature,intent.cluster]);
        }
        await client.query('COMMIT');
      }catch(e:any){await client.query('ROLLBACK');if(e.code==='23505')error(409,'Payment already used');throw e;}finally{client.release();}
      await push.enqueue('score:'+intent.id,who,'Your score is on the leaderboard','Your 0.01 SOL submission is confirmed. See where you rank.',{runId:intent.run_id,screen:'leaders'});
      json(200,{ok:true,signature:b.signature});return;
    }
    error(404,'Not found');
  }catch(e:any){json(e.status||e.errName?e.status||409:500,{error:e.status||e.errName?e.message:'Service unavailable',errName:e.errName});if(!e.status&&!e.errName)console.error('Request failed:',e.message);}
});
server.listen(Number(process.env.PORT||8789),'0.0.0.0',()=>console.log(JSON.stringify({service:'hexit-seeker',cluster,paymentsEnabled:!!treasury,database:'postgresql'})));
process.on('SIGTERM',()=>{server.close();for(const r of streams)r.end();leader.release();pool.end().finally(()=>process.exit(0));});
