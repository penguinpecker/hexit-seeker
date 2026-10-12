import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {validateScoreTransaction} from './solana.ts';
declare const __HEXIT_API__:string;
let network='mainnet-beta';
let authToken=localStorage.getItem('hexit.seeker.guest-session')||'';
let player=localStorage.getItem('hexit.seeker.guest-player')||'';
export const playerId=()=>player;
export const cluster=()=>network;
export const setCluster=(value:string)=>{if(value!=='mainnet-beta')throw new Error('Unsupported Solana network');network=value;};
export async function api(path:string,body?:unknown){
  const response=await fetch(__HEXIT_API__+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(authToken?{authorization:'Bearer '+authToken}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Server unavailable'),{status:response.status,errName:data.errName});return data;
}

declare global {
  interface Window {
    HexitNative?: { postMessage(message: string): void };
    __hexitNativeReply?: (reply: {id:string; data:any; error?:string})=>void;
  }
}
const pending = new Map<string,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
let seq = 0;
window.__hexitNativeReply = reply => {
  const p = pending.get(reply.id); if (!p) return;
  pending.delete(reply.id); clearTimeout(p.timer);
  if (reply.error) p.reject(new Error(reply.error)); else p.resolve(reply.data);
};
export function native(action:string, args:Record<string,unknown> = {}) {
  return new Promise<any>((resolve,reject)=>{
    if (!window.HexitNative) return reject(new Error('Install the Seeker APK to connect a Solana wallet. You can play here with virtual credits.'));
    const id = `request_${++seq}`;
    const timer = setTimeout(()=>{pending.delete(id);reject(new Error('Wallet request timed out. Please try again.'));},230000);
    pending.set(id,{resolve,reject,timer});
    window.HexitNative.postMessage(JSON.stringify({id,action,...args}));
  });
}
const bytes = (b64:string) => Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
export function verifyProof(proof:{publicKey:string;message:string;signature:string}, challenge:string) {
  const key=bytes(proof.publicKey), message=bytes(proof.message), signature=bytes(proof.signature);
  const expected = `Hexit Seeker\nConnect this wallet to Hexit on Solana mainnet.\nThis signature does not authorize transfers or bets.\nNonce: ${challenge}`;
  if (key.length !== 32 || signature.length !== 64 || new TextDecoder().decode(message) !== expected
      || !nacl.sign.detached.verify(message,signature,key)) throw new Error('Wallet signature could not be verified.');
  return bs58.encode(key);
}
let connected = '';
// The payer is restored only from the authenticated guest session, never from an unverified local address.
export const address = () => connected;
export async function connect() {
  await guestLogin();
  const {nonce:challenge,cluster}=await api('/payments/challenge',{});setCluster(cluster);
  const proof=await native('connect',{challenge,cluster});
  const address=verifyProof(proof,challenge);
  const session=await api('/payments/verify',{...proof,nonce:challenge});
  if(session.payer!==address)throw new Error('Wallet authentication mismatch');
  connected=address;
  localStorage.setItem('hexit.seeker.wallet',connected);
  if(window.HexitNative)native('pushSession',{session:authToken}).catch(()=>{});
  return connected;
}
export async function disconnect() {
  // A failed revocation is reported, rather than pretending the wallet revoked access.
  if (window.HexitNative) await native('disconnect');
  connected=''; localStorage.removeItem('hexit.seeker.wallet');
}
let loginPromise:Promise<string>|null=null,authenticatedAt=0;
export function guestLogin():Promise<string>{
  if(authToken&&authenticatedAt&&Date.now()-authenticatedAt<3600000)return Promise.resolve(player);
  if(loginPromise)return loginPromise;
  loginPromise=(async()=>{
    const session=await api('/auth/guest',{});
    if(!/^[a-f0-9]{64}$/.test(session.token)||!/^Player-[a-f0-9-]{36}$/.test(session.owner))throw new Error('Invalid play session');
    if(player!==session.owner)localStorage.removeItem('hexit.seeker.run');
    authToken=session.token;player=session.owner;authenticatedAt=Date.now();connected=session.payer||'';
    localStorage.setItem('hexit.seeker.guest-session',authToken);localStorage.setItem('hexit.seeker.guest-player',player);
    if(window.HexitNative)native('pushSession',{session:authToken}).catch(()=>{});
    return player;
  })().finally(()=>{loginPromise=null;});return loginPromise;
}
export async function pushStatus(){return window.HexitNative?native('pushStatus'):{enabled:false,permission:false,optedIn:false};}
export async function pushEnable(){await guestLogin();return native('pushEnable',{session:authToken});}
export const pushDisable=()=>native('pushDisable');
export const pushTest=()=>api('/push/test',{});
export async function solBalance() {
  if (!connected) throw new Error('Connect a wallet first.');
  const response = await fetch('https://api.mainnet-beta.solana.com', {method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getBalance',params:[connected,{commitment:'confirmed'}]}),signal:AbortSignal.timeout(12000)});
  const json = await response.json();
  if (!response.ok || json.error || !Number.isSafeInteger(json.result?.value)) throw new Error('Solana mainnet is unavailable. Tap refresh to try again.');
  return json.result.value / 1e9;
}
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
export async function payScore(intent:any,treasury:string){
  if(intent.cluster!==network||intent.treasury!==treasury||intent.lamports!==10000000||intent.memo!=='hexit:score:'+intent.id)throw new Error('Unexpected score payment configuration');
  validateScoreTransaction(bytes(intent.transaction),connected,treasury,intent.blockhash,intent.id);
  const result=await native('payScore',{intentId:intent.id,transaction:intent.transaction,publicKey:b64(bs58.decode(connected)),cluster:network});
  const receipt={intentId:intent.id,signature:bs58.encode(bytes(result.signature))};
  localStorage.setItem('hexit.seeker.payment',JSON.stringify(receipt));return receipt;
}
export async function pendingPayment(){
  if(window.HexitNative){const r=await native('pendingPayment');if(r.intentId&&r.signature)return{intentId:r.intentId,signature:bs58.encode(bytes(r.signature))};}
  try{return JSON.parse(localStorage.getItem('hexit.seeker.payment')||'null');}catch{return null;}
}
