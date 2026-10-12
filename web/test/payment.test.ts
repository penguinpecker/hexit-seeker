import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {scoreTransaction,validateScoreTransaction} from '../src/solana.ts';
import {verifyPayment,MEMO_PROGRAM,memoFor,validSignature} from '../../server/payment.ts';
const owner=bs58.encode(new Uint8Array(32).fill(1)), treasury=bs58.encode(new Uint8Array(32).fill(2));
const id='12345678-1234-1234-1234-123456789abc',blockhash=bs58.encode(new Uint8Array(32).fill(3));
const intent={id,owner,treasury,created_at:new Date(1000000),expires_at:new Date(2000000)};
const fixture=()=>({blockTime:1100,meta:{err:null,innerInstructions:[]},transaction:{message:{accountKeys:[{pubkey:owner,signer:true}],instructions:[
  {programId:'11111111111111111111111111111111',parsed:{type:'transfer',info:{source:owner,destination:treasury,lamports:10000000}}},
  {programId:MEMO_PROGRAM,parsed:memoFor(id)}]}}});
test('payment accepts exactly 0.01 SOL to the intended recipient with the exact score memo',()=>{assert.equal(verifyPayment(fixture(),intent),true);});
test('wrong amount, recipient, sender, memo and failed transactions cannot publish scores',()=>{
  for(const change of [
    (t:any)=>t.transaction.message.instructions[0].parsed.info.lamports=1000000,
    (t:any)=>t.transaction.message.instructions[0].parsed.info.destination=owner,
    (t:any)=>t.transaction.message.accountKeys[0].signer=false,
    (t:any)=>t.transaction.message.instructions[1].parsed='hexit:score:another-run',
    (t:any)=>t.meta.err={InstructionError:[0,'InsufficientFunds']},
    (t:any)=>t.blockTime=900,
    (t:any)=>t.transaction.message.instructions.push(t.transaction.message.instructions[0]),
  ]){const t=fixture();change(t);assert.throws(()=>verifyPayment(t,intent));}
});
test('client validates the full payment bytes and refuses any modification',()=>{
  const wire=scoreTransaction(owner,treasury,blockhash,id);
  assert.equal(validateScoreTransaction(wire,owner,treasury,blockhash,id),true);
  for(const pos of [1,66,80,110,220,wire.length-1]){const tampered=wire.slice();tampered[pos]^=1;assert.throws(()=>validateScoreTransaction(tampered,owner,treasury,blockhash,id));}
  assert.equal(validSignature(bs58.encode(new Uint8Array(64).fill(3))),true);
  assert.equal(validSignature(owner),false);
});
