import bs58 from 'bs58';
export const SCORE_FEE=10000000;
export const SCORE_MEMO_PROGRAM='MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const key=(value:string)=>{const bytes=bs58.decode(value);if(bytes.length!==32)throw new Error('Invalid Solana address');return bytes;};
const compact=(n:number)=>{const out=[];do{let b=n&127;n>>>=7;if(n)b|=128;out.push(b);}while(n);return out;};
/** Canonical unsigned legacy transaction: one payer, one 0.01 SOL transfer, one score memo. */
export function scoreTransaction(owner:string,treasury:string,blockhash:string,intentId:string):Uint8Array {
  if(owner===treasury||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(intentId))throw new Error('Invalid score payment');
  const transfer=new Uint8Array(12),view=new DataView(transfer.buffer);view.setUint32(0,2,true);view.setBigUint64(4,BigInt(SCORE_FEE),true);
  const memo=new TextEncoder().encode('hexit:score:'+intentId);
  const message=Uint8Array.from([
    1,0,2,4,...key(owner),...key(treasury),...key('11111111111111111111111111111111'),...key(SCORE_MEMO_PROGRAM),
    ...key(blockhash),2,
    2,2,0,1,12,...transfer,
    3,0,...compact(memo.length),...memo,
  ]);
  return Uint8Array.from([1,...new Uint8Array(64),...message]);
}
export function validateScoreTransaction(serialized:Uint8Array,owner:string,treasury:string,blockhash:string,intentId:string){
  const expected=scoreTransaction(owner,treasury,blockhash,intentId);
  if(serialized.length!==expected.length||!serialized.every((b,i)=>b===expected[i]))throw new Error('Unexpected payment transaction');
  return true;
}
