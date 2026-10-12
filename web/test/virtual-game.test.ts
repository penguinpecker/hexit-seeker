import test from 'node:test';
import assert from 'node:assert/strict';
import {createVirtualLedger,VIRTUAL_GAME} from '../../server/virtual-game.ts';
import {verifyPayment} from '../../server/payment.ts';

test('every free run has an isolated 100-credit balance with no redeemable assets',()=>{
  const first=createVirtualLedger();first.state.credit=0;
  const next=createVirtualLedger();
  assert.equal(next.view().credit,100_000_000);
  assert.equal(next.view().wallet,0);
  assert.equal(VIRTUAL_GAME.mode,'virtual');
  assert.equal(VIRTUAL_GAME.cashValue,false);
  assert.equal(VIRTUAL_GAME.transferable,false);
  assert.equal('mint' in VIRTUAL_GAME,false);
});

test('guest score publication verifies the linked payment wallet, never the guest ID',()=>{
  const payer='6zuPtQg1rygxNgzZmjn13YB3bqMGiMLbPAWbrbvwJykg';
  const receiver='11111111111111111111111111111111';
  const intent={id:'submission',owner:'Player-guest',payer,treasury:receiver,created_at:1000000,expires_at:2000000};
  const tx={blockTime:1100,meta:{err:null,innerInstructions:[]},transaction:{message:{accountKeys:[{pubkey:payer,signer:true}],instructions:[
    {programId:'11111111111111111111111111111111',parsed:{type:'transfer',info:{source:payer,destination:receiver,lamports:10000000}}},
    {programId:'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',parsed:'hexit:score:submission'},
  ]}}};
  assert.equal(verifyPayment(tx,intent),true);
  assert.throws(()=>verifyPayment(tx,{...intent,payer:receiver}));
});
