// Live verification: guest gameplay and mainnet payment preparation. Never signs or sends a payment.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {Transaction,SystemInstruction} from '@solana/web3.js';
import {validateScoreTransaction} from '../web/src/solana.ts';
const deployment=JSON.parse(readFileSync('deployment.json','utf8')),base=deployment.api;
let token='';
async function call(path,body,expected=200){
  const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d;
}
const cfg=await call('/config');assert.equal(cfg.game.mode,'virtual');assert.equal(cfg.game.cashValue,false);assert.equal(cfg.game.starterMicro,100000000);
assert.equal(cfg.marketData.mode,'live');assert.equal(cfg.marketData.available,true);assert.ok(['Coinbase','Kraken'].includes(cfg.marketData.provider));
const liveMarket=await call('/markets');assert.equal(liveMarket.prices.length,2);assert.ok(liveMarket.prices.every(p=>p.price>0&&Date.now()-p.sourceTime<30000));
const ranks=await call('/leaderboard?page=1&limit=25');assert.ok(Number.isInteger(ranks.total));assert.ok(Array.isArray(ranks.podium));await call('/leaderboard?page=0',undefined,400);
assert.equal(cfg.cluster,'mainnet-beta');assert.equal(cfg.treasury,deployment.feeTreasury);assert.equal(cfg.paymentsEnabled,true);assert.equal(cfg.pushEnabled,true);assert.equal('mint' in cfg.game,false);
await call('/runs',{},401);await call('/payments/challenge',{},401);
const guest=await call('/auth/guest',{});token=guest.token;
assert.match(guest.owner,/^Player-/);assert.equal((await call('/auth/guest',{})).owner,guest.owner);
await call('/game/onboard',{},404);await call('/game/deposit/prepare',{},404);await call('/auth/challenge',{},404);
await call('/runs',{credit:999999999},400);
const run=await call('/runs',{});assert.equal(run.credit,100000000);assert.equal(run.mode,'virtual');assert.equal('depositId' in run,false);
assert.equal((await call('/runs',{})).id,run.id);
await call('/scores/intent',{runId:run.id},409);await call('/scores/intent',{runId:run.id,score:999999999999},400);
const originalToken=token;token='';const second=await call('/auth/guest',{});token=second.token;await call('/runs/'+run.id,undefined,403);token=originalToken;
const controller=new AbortController(),stream=await fetch(base+'/stream',{signal:controller.signal}),reader=stream.body.getReader();let buffer='',quote;
while(!quote){const {value}=await reader.read();buffer+=new TextDecoder().decode(value);for(const event of buffer.split('\n\n'))if(event.startsWith('event: quotes'))quote=JSON.parse(event.split('data: ')[1]);}controller.abort();
const market=quote.quotes[0],column=market.cols.find(c=>c.k*5000>Date.now()+5000),index=column.mults.findIndex(v=>v>=110&&v<5000);assert.ok(index>=0);
const bet={asset:market.asset,k:column.k,j:column.qJ0+index,stake:100000,minMult:101};
await call('/runs/'+run.id+'/bet',{...bet,stake:-1},409);await call('/runs/'+run.id+'/bet',bet);await call('/runs/'+run.id+'/bet',bet,409);
assert.equal((await call('/runs/'+run.id)).credit,99900000);
console.log(JSON.stringify({phase:'guest-game-passed',runId:run.id,endsAt:run.endsAt,credits:100,blockchainNeeded:false}));

// Proof of a distinct, empty payment wallet does not pay anything.
const key=nacl.sign.keyPair(),payer=bs58.encode(key.publicKey),challenge=await call('/payments/challenge',{});
assert.equal(challenge.cluster,'mainnet-beta');
const message=Buffer.from(`Hexit Seeker\nConnect this wallet to Hexit on Solana mainnet.\nThis signature does not authorize transfers or bets.\nNonce: ${challenge.nonce}`);
const proof={nonce:challenge.nonce,publicKey:Buffer.from(key.publicKey).toString('base64'),message:message.toString('base64'),signature:Buffer.from(nacl.sign.detached(message,key.secretKey)).toString('base64')};
await call('/payments/verify',{...proof,message:Buffer.from('forged').toString('base64')},401);
assert.equal((await call('/payments/verify',proof)).payer,payer);await call('/payments/verify',proof,401);
assert.equal((await call('/auth/guest',{})).payer,payer);
console.log('Mainnet wallet proof verified; waiting for the normal three-minute run to finish.');
while(Date.now()<run.endsAt+1000)await new Promise(r=>setTimeout(r,Math.min(10000,run.endsAt+1000-Date.now())));
const finished=await call('/runs/'+run.id);assert.equal(finished.status,'finished');
const intent=await call('/scores/intent',{runId:run.id});assert.equal(intent.lamports,10000000);assert.equal(intent.treasury,deployment.feeTreasury);assert.equal(intent.cluster,'mainnet-beta');assert.equal(Number(intent.score),finished.credit);
const wire=Buffer.from(intent.transaction,'base64');validateScoreTransaction(wire,payer,cfg.treasury,intent.blockhash,intent.id);
const parsed=Transaction.from(wire),transfer=SystemInstruction.decodeTransfer(parsed.instructions[0]);
assert.equal(transfer.fromPubkey.toBase58(),payer);assert.equal(transfer.toPubkey.toBase58(),cfg.treasury);assert.equal(Number(transfer.lamports),10000000);
assert.equal(parsed.instructions.length,2);assert.equal(parsed.instructions[1].data.toString(),`hexit:score:${intent.id}`);
assert.equal((await call('/scores/intent',{runId:run.id})).id,intent.id);
await call('/scores/confirm',{intentId:intent.id,signature:'not-a-payment'},400);
assert.ok(!(await call('/leaderboard')).rows.some(r=>r.owner===payer));
const next=await call('/runs',{});assert.notEqual(next.id,run.id);assert.equal(next.credit,100000000);
const result={ok:true,runId:run.id,finalCredits:finished.credit/1e6,feeReceiver:cfg.treasury,feeLamports:10000000,paymentCluster:'mainnet-beta',realFundsSpent:0,mainnetPaymentBroadcast:false,checks:['guest play without wallet','persistent guest session','100 free virtual credits per run','retired devnet endpoints unavailable','server rejects client balances and scores','run access isolation','duplicate entry rejection','server settlement','distinct mainnet payer proof and replay protection','live mainnet blockhash and exact transfer bytes','idempotent score intent','unpaid score excluded','fresh free run']};
writeFileSync('deliverables/virtual-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
