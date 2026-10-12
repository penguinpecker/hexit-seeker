import bs58 from 'bs58';
export const FEE_LAMPORTS=10000000;
export const MEMO_PROGRAM='MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const memoFor=(id:string)=>'hexit:score:'+id;
const system='11111111111111111111111111111111';
export function validAddress(value:unknown):value is string {
  try{return typeof value==='string'&&bs58.decode(value).length===32;}catch{return false;}
}
export function validSignature(value:unknown):value is string {
  try{return typeof value==='string'&&bs58.decode(value).length===64;}catch{return false;}
}
export function verifyPayment(tx:any,intent:any){
  const payer=intent.payer||intent.owner;
  if(!tx?.meta||tx.meta.err!==null)throw new Error('Payment failed or is not finalized yet');
  const message=tx.transaction?.message;
  if(message?.accountKeys?.[0]?.pubkey!==payer||!message.accountKeys[0].signer)throw new Error('Wrong paying wallet');
  const instructions=message.instructions||[];
  const transfers=instructions.filter((i:any)=>i.programId===system&&i.parsed?.type==='transfer');
  if(transfers.length!==1)throw new Error('Expected one score payment');
  const transfer=transfers[0].parsed.info;
  if(transfer.source!==payer||transfer.destination!==intent.treasury||transfer.lamports!==FEE_LAMPORTS)throw new Error('Incorrect submission fee or recipient');
  const memos=instructions.filter((i:any)=>i.programId===MEMO_PROGRAM);
  const memo=memos[0]?.parsed??(memos[0]?.data?new TextDecoder().decode(bs58.decode(memos[0].data)):'');
  if(memos.length!==1||memo!==memoFor(intent.id))throw new Error('Payment is not bound to this score');
  if(instructions.some((i:any)=>![system,MEMO_PROGRAM,'ComputeBudget111111111111111111111111111111'].includes(i.programId)))throw new Error('Unexpected payment instruction');
  if(tx.meta.innerInstructions?.some((i:any)=>i.instructions?.length))throw new Error('Unexpected inner instructions');
  if(!tx.blockTime||tx.blockTime*1000<new Date(intent.created_at).getTime()-60000
      ||tx.blockTime*1000>new Date(intent.expires_at).getTime()+60000)throw new Error('Payment is outside this submission window');
  return true;
}
