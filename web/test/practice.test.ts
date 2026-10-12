import test from 'node:test';
import assert from 'node:assert/strict';
import {PracticeLedger} from '../src/practice.ts';
import {firstOpenColumn} from '../../pricing/src/index.ts';

const now=100000, k=firstOpenColumn(now,1000);
const bet={asset:0,k,j:14999,stake:1000000,minMult:150};
test('welcome credit is granted once, reserve moves conserve total',()=>{
  const l=new PracticeLedger();l.grant();l.grant();assert.equal(l.view().credit,100000000);
  l.withdraw(25000000);l.deposit(5000000);
  assert.equal(l.view().credit+l.view().wallet,100000000);
  assert.throws(()=>l.withdraw(NaN));assert.throws(()=>l.deposit(21000000));
});
test('duplicate, locked, oversized, and underquoted entries cannot charge credits',()=>{
  const l=new PracticeLedger();l.grant();l.place(bet,200,now);
  assert.throws(()=>l.place(bet,200,now),/HexCap/);
  assert.throws(()=>l.place({...bet,k:k-2},200,now),/Locked/);
  assert.throws(()=>l.place({...bet,stake:5100000},200,now),/StakeOutOfRange/);
  assert.throws(()=>l.place({...bet,j:15000},140,now),/BelowMinMult/);
  assert.equal(l.view().credit,99000000);assert.equal(l.view().nonceBase,1);
});
test('a hit pays stake times multiplier exactly once and history records it',()=>{
  const l=new PracticeLedger();l.grant();l.place(bet,250,now);
  const pc=(bet.j+.5*(k&1)+.5)*.01;
  for(let t=now;t<k*5000+6500;t+=100)l.tick(0,t,pc,t+100,pc);
  assert.equal(l.view().credit,101500000);assert.equal(l.view().openStake,0);
  l.tick(0,k*5000+7000,pc,k*5000+7100,pc);
  assert.equal(l.view().credit,101500000);assert.equal(l.history().stats.wins,1);
});
test('missing tape before a hit refunds instead of charging a loss',()=>{
  const l=new PracticeLedger();l.grant();l.place(bet,200,now);
  for(let t=now;t<k*5000-1100;t+=100)l.tick(0,t,151,t+100,151);
  l.tick(0,k*5000-1100,151,k*5000,151);
  l.tick(0,k*5000,151,k*5000+7000,151);
  assert.equal(l.view().credit,100000000);assert.equal(l.history().bets[0].outcome,3);
});
test('restart refunds open entries once and retains settled history',()=>{
  const l=new PracticeLedger();l.grant();l.place(bet,200,now);
  const restored=new PracticeLedger(l.state);assert.equal(restored.view().credit,100000000);
  restored.refundOpen();assert.equal(restored.view().credit,100000000);
  assert.equal(restored.history().bets[0].outcome,3);
});
