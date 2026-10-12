import {PracticeLedger} from '../web/src/practice.ts';

export const VIRTUAL_GAME=Object.freeze({
  enabled:true, mode:'virtual', symbol:'VC', name:'Virtual credits',
  starterMicro:100_000_000, cashValue:false, transferable:false,
  description:'Virtual in-game currency only. No cash value. Cannot be withdrawn or exchanged for SOL.',
});

export function createVirtualLedger(){
  const ledger=new PracticeLedger();
  ledger.grant();
  return ledger;
}
