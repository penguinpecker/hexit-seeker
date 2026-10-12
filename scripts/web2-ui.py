"""Keep Hexit's original screens and sound engine; use virtual gameplay and mainnet score fees."""
from pathlib import Path
import re

p=Path('web/index.html');s=p.read_text()
def replace(a,b):
    global s
    if a not in s: raise RuntimeError('Missing UI anchor: '+a[:100])
    s=s.replace(a,b)

replace('connect-src https://api.devnet.solana.com https://api.mainnet-beta.solana.com', 'connect-src https://api.mainnet-beta.solana.com')
replace('Connect your Solana wallet, or jump straight into practice. Start with $100 in play credits. Simulated prices, real Hexit mechanics, no funds at risk.', 'Jump straight in with 100 virtual credits. They are for this game only and have no cash value. Publishing your score is optional and costs 0.01 real SOL.')
replace('<button class="row" type="button" id="connectWallet">', '<button class="row" type="button" id="connectWallet" hidden>')
replace('<div class="or">or jump straight in</div>', '<div class="or">Free to play · no wallet needed</div>')
replace('Play with $100 practice credits', 'Play with 100 virtual credits')
replace('Practice uses simulated prices and play credits. Ranked score submission is optional and costs 0.01 SOL plus network fees.', 'Virtual in-game currency only. No cash value, withdrawals or exchange for SOL. Optional leaderboard submission costs 0.01 real SOL on mainnet, plus the network fee.')
replace('Seed Vault Wallet · Mobile Wallet Adapter', 'Wallet needed only for leaderboard payment')
replace('The same board. A Solana wallet. Your next boom.', 'The original board. Free virtual credits. Your next boom.')
s=s.replace('PRACTICE WALLET', 'VIRTUAL CREDITS').replace('+$17.40', '+17.40 VC')
s=s.replace('Step 3 // Exit', 'Step 3 // Play free')
s=s.replace('One tap in. <span class="hl">One tap out.</span>', 'Your next run. <span class="hl">Your next boom.</span>')
s=s.replace('data-go="login">Sign in</button>', 'data-go="login">Get ready</button>')
s=s.replace('<span data-s="wallet">Wallet</span>', '<span data-s="trade">Play</span>')
replace('Practice balance · play credits', 'Virtual credits · in-game only')
s=s.replace('<span class="micro">Wallet</span>', '<span class="micro">Game balance</span>')
s=s.replace('<span class="micro">All time</span>', '<span class="micro">This run</span>')
replace('Seed Vault Wallet · Devnet', 'Optional · mainnet leaderboard payments')
replace('Instant practice taps, no wallet signature needed', 'Free play with virtual credits · no wallet needed')
replace('Wallet keys<small>Stay in Seed Vault Wallet; Hexit cannot export them</small>', 'Payment wallet<small>Only used for optional real SOL submissions</small>')
replace('v0.1.0 · Practice and wallet connection', 'v0.2.0 · Virtual play · Mainnet leaderboard fees')
replace('Reset practice<small>Use Add credits → Restart with $100</small>', 'Your play session<small>Each new run starts with 100 free virtual credits</small>')
replace('Practice history<small>View your results in Profile</small>', 'Game history<small>View your virtual-credit results in Profile</small>')
replace('Your keys and funds stay in your wallet. Practice credits are separate. A ranked leaderboard submission costs 0.01 SOL plus the network fee, approved in your wallet. Gameplay stakes use play credits.', 'This wallet is only for the optional 0.01 real SOL leaderboard fee. Gameplay uses virtual credits with no cash value. Credits cannot be exchanged for SOL.')
replace('>Solana Seeker</span></div>', '>Virtual play</span></div>')
replace('>Practice <b id="onlineN">1</b>', '>Virtual <b id="onlineN">1</b>')
s=s.replace("?'Paused':'Practice'", "?'Paused':'Virtual'").replace("st==='Practice'", "st==='Virtual'")
s=s.replace("h.href = TX_URL + hash + '?cluster=devnet';", 'h.href = TX_URL + hash;')
s=s.replace("'Seeker preview // practice ready'", "'Hexit // virtual play ready'")

# Guest entry is a normal web session. No wallet is created or connected here.
a=s.index('/* ---- native Solana connection and local practice onboarding ---- */')
b=s.index('/* ---- deposit ---- */',a)
s=s[:a]+'''/* ---- guest play and separate optional payment wallet ---- */
function needAgree(){if(!$('#agree').checked){toast('Accept the game terms to continue','err');return false;}return true;}
function updateAddress(){S.addr=HexitChain.address();S.user.handle=HexitChain.wallet.playerId()?('Player-'+HexitChain.wallet.playerId().slice(7,15)):'Guest';S.user.via='Guest play session';$('#wdDest').textContent='Virtual credits only';}
async function enterVirtualGame(){
  if(!needAgree())return;const b=$('#practiceGo');b.disabled=true;b.textContent='Starting your game…';$('#connectStatus').textContent='Preparing 100 virtual credits. No wallet or payment is needed.';
  try{await HexitChain.onboard();updateAddress();startChain();await HexitChain.startRanked();show('trade');SND.ok();}
  catch(e){$('#connectStatus').textContent=e.message;SND.err();}finally{b.disabled=false;b.textContent='Play with 100 virtual credits';}
}
$('#practiceGo').addEventListener('click',enterVirtualGame);
function runWallet(){show('login');}
function resume(){updateAddress();startChain();afterSplash='leaders';}
$('#walletWatch').addEventListener('click',()=>show('login'));

'''+s[b:]

# Monetary-looking gameplay amounts become VC. Simulated market-price labels retain USD.
replace("const money = v => (v<0?'\\u2212':'')+'$'+Math.abs(v).toFixed(2);", "const money = v => (v<0?'\\u2212':'')+'VC '+Math.abs(v).toFixed(2);")
replace("const fmtStake = v => '$'+(v<1?v.toFixed(2):v);", "const fmtStake = v => (v<1?v.toFixed(2):v)+' VC';")
s=s.replace("+'$'+Math.abs(v).toLocaleString", "+'VC '+Math.abs(v).toLocaleString")
s=s.replace("txt:'+$'+b.pay.toFixed(2)", "txt:'+VC '+b.pay.toFixed(2)")
s=s.replace('Start with $100 play credits. Finish your run, then choose whether to publish your score.', 'Every run starts with 100 virtual credits. In-game only, with no cash value. Finish playing, then choose whether to publish your score.')
s=s.replace("'$100.00'", "'VC 100.00'")
s=s.replace("const networkName=()=>HexitChain.wallet.cluster()==='devnet'?'Solana devnet · test SOL':'Solana mainnet · real SOL';", "const networkName=()=>'Solana mainnet · real SOL';")
replace("if(!HexitChain.wallet.address())await HexitChain.wallet.connect();updateAddress();await HexitChain.startRanked();", "await HexitChain.onboard();updateAddress();startChain();await HexitChain.startRanked();")
replace("$('#backPractice').hidden=!r||r.status==='active';", "$('#backPractice').hidden=true;")
replace("'Your verified score is ready. Submit it for 0.01 SOL or start a new run.'", "'Run complete. Your credits are virtual and stay in the game. Submit this score for 0.01 real SOL, or play another free run.'")
replace("const label=$('.mode-tag');if(label)label.textContent=r?'RANKED · '+(r.status==='active'?Math.floor(remain/60)+':'+String(remain%60).padStart(2,'0'):'COMPLETE')+' · SIMULATED PRICES':'PRACTICE · SIMULATED PRICES · PLAY CREDITS';", "const label=$('.mode-tag');if(label)label.textContent='VIRTUAL CREDITS ONLY · NO CASH VALUE\\n'+(r?(r.status==='active'?'RUN '+Math.floor(remain/60)+':'+String(remain%60).padStart(2,'0'):'RUN COMPLETE')+' · ':'')+'SIMULATED PRICES';")
replace("try{const r=HexitChain.ranked(),intent=await", "try{if(!HexitChain.wallet.address())await HexitChain.wallet.connect();const r=HexitChain.ranked(),intent=await")
replace("if(!HexitChain.wallet.address()){await HexitChain.wallet.connect();updateAddress();}await HexitChain.wallet.pushEnable();", "await HexitChain.wallet.guestLogin();updateAddress();await HexitChain.wallet.pushEnable();")
replace("if(!HexitChain.wallet.address())return;await HexitChain.onboard();show('leaders');", "await HexitChain.onboard();updateAddress();startChain();show('leaders');")
replace('const me0=S.addr, rows', 'const me0=HexitChain.wallet.address()||S.addr, rows')
replace('Final score</span>', 'Virtual-credit score</span>')
replace('Approve one transfer in your wallet. Your score is published after the payment finalizes. Rechecking a sent payment does not charge again.', 'This spends 0.01 real SOL on mainnet, plus the network fee. It publishes your score; it does not buy or redeem virtual credits. Your wallet will ask you to approve the transfer. Rechecking a sent payment does not charge again.')
replace("Wallet balance only. Practice credits are shown in Profile.", "Real SOL balance for score submission only. Virtual credits are shown in Profile.")

# No cash deposit or withdrawal controls remain in the product flow.
s=s.replace('<button class="btn ghost" type="button" id="pWithdraw">', '<button class="btn ghost" type="button" id="pWithdraw" hidden>')
s=s.replace('<button class="btn primary" type="button" id="pDeposit">', '<button class="btn primary" type="button" id="pDeposit" hidden>')
s=s.replace("$('#pWithdraw').disabled=!!r;$('#pDeposit').disabled=!!r;", "$('#pWithdraw').hidden=true;$('#pDeposit').hidden=true;")
replace('<div class="acts"><button class="btn ghost"', '<p class="seeker-note virtual-note">Virtual in-game currency only. No cash value. Cannot be withdrawn or exchanged for SOL.</p><div class="acts"><button class="btn ghost"')

# Keep the original procedural sound effects, background music and stored levels.
s=s.replace("function audio(){ if(!ac){", "function audio(){ if(document.hidden)return ac; if(!ac){")
s=s.replace("} return ac; }", "} if(ac&&ac.state==='suspended')ac.resume().catch(()=>{});return ac; }")
s=s.replace("$('#musVol').addEventListener('input',updateMusic);", "$('#musVol').addEventListener('input',()=>{localStorage.setItem('hexit.music',String($('#musVol').value));updateMusic();});")
s=s.replace("sfx=+e.target.value/100;", "sfx=+e.target.value/100;localStorage.setItem('hexit.sfx',String(e.target.value));")
s=s.replace("addEventListener('hexit:resume',()=>{if(ac&&S.screen==='trade')ac.resume();});", "addEventListener('hexit:resume',()=>{if(ac&&!document.hidden)ac.resume().catch(()=>{});});")
idx=s.rfind("show('splash'); loadConfig();")
s=s[:idx]+'''$('#sfxVol').value=localStorage.getItem('hexit.sfx')??'70';sfx=+$('#sfxVol').value/100;
$('#musVol').value=localStorage.getItem('hexit.music')??'18';
document.addEventListener('pointerdown',()=>{audio();updateMusic();},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!ac)return;if(document.hidden)ac.suspend();else ac.resume().catch(()=>{});});
'''+s[idx:]

docs={
 'terms':'<h1>Hexit game terms</h1><p>Hexit is free to play. Every three-minute run starts with 100 virtual credits (VC). Virtual credits are in-game currency only, have no cash value, cannot be transferred, and cannot be withdrawn or exchanged for SOL or other money. Board prices are simulated.</p><h2>Playing</h2><p>A guest session lets you play without connecting or creating a wallet. The game service records entries, outcomes and scores. A fresh run resets its virtual balance to 100 VC. Open entries are refunded in virtual credits if a run is interrupted by the service.</p><h2>Optional leaderboard fee</h2><p>Publishing a completed score costs 0.01 real SOL on Solana mainnet, plus the network fee. This is a score-publication fee, not an in-game stake, credit purchase, cash-out or prize. Your external wallet must approve the transfer to the receiving address displayed before payment. The score is published only after payment is finalized and verified. Confirmed submission fees are non-refundable. Retrying verification of the same payment does not create another charge.</p>',
 'privacy':'<h1>Your data</h1><p>Hexit stores a random guest-session token, your player ID, game preferences and the latest run ID on this device. Clearing app data removes access to that guest session. Hexit does not generate a blockchain game wallet and does not ask for a wallet private key or seed phrase.</p><h2>Game records and payments</h2><p>Railway PostgreSQL stores guest sessions, game entries, results and scores. If you choose to publish a score, it also stores your connected public Solana address and verified payment receipt. Published leaderboard entries show your public wallet address, virtual-credit score and payment signature. Mobile Wallet Adapter asks your external wallet for connection and payment approval. Solana RPC services receive public wallet and transaction data for payment checks.</p><h2>Notifications</h2><p>With your permission, Firebase Cloud Messaging processes a notification token. Railway associates it with your guest session to deliver run-completion and score-publication notifications. You can turn notifications off in Settings. No advertising or analytics SDK is enabled.</p>',
 'cookies':'<h1>Device storage</h1><p>Hexit saves your guest session, player ID, preferences, current run, tutorial progress and pending public payment receipts locally. It does not use advertising cookies. Clearing app data removes this guest-session access but does not affect your external Solana wallet.</p>'
}
for key,body in docs.items(): s=re.sub(r'<template id="doc-'+key+r'">[\s\S]*?</template>', '<template id="doc-'+key+'">'+body+'</template>',s)

# Rewrite static tutorial currency and any retained, inaccessible practice-screen labels.
s=s.replace('$100', '100 VC').replace('$0.10', '0.10 VC').replace('$0.50','0.50 VC')
for value in ['25','50','10','5','1','0']:
    s=s.replace('>$'+value+'<','>'+value+' VC<')
s=s.replace('100 VC.00','100.00 VC').replace('play credits','virtual credits').replace('Practice balance','Virtual balance')
s=s.replace('Practice wallet // on this device','Guest session // virtual play').replace('Preview terms','Game terms')
s=s.replace('Your practice balance and results are saved on this device. Connected wallet keys stay in your Solana wallet.', 'Your guest session is saved on this device. Virtual credits are in-game only and have no cash value.')
s=s.replace('Practice taps are instant. No wallet approvals and no network fees. Your Solana wallet balance is separate.', 'Play instantly with virtual credits. Your external wallet is only used if you choose to pay to publish a score.')
s=s.replace('Preparing your board','Preparing your game')
s=s.replace('Seeker preview','Hexit Seeker')
s=s.replace('<meta name="description" content="The original Hexit experience for Solana Seeker. Practice with simulated prices and connect your Solana wallet.">', '<meta name="description" content="Play Hexit with free virtual in-game credits. Optional leaderboard submission costs 0.01 real SOL on mainnet.">')
style='''<style>
.mode-tag{white-space:pre-line;line-height:1.5;color:#c3abd9;font-size:9px;letter-spacing:.035em;top:12px}
.virtual-note{flex-basis:100%;margin:10px 0 0;line-height:1.5}
#pWithdraw,#pDeposit,#connectWallet{display:none!important}
#practiceGo{font-size:19px;white-space:normal;line-height:1.2;padding:16px 12px}
#balPill .num{font-size:22px}#stakePill .num{font-size:22px}
@media(min-width:761px){.mode-tag{top:84px;left:28px}}
</style>'''
replace('<script>\n// The top-right stack',style+'\n<script>\n// The top-right stack')
if re.search(r'devnet|devUSD|gameDeposit|gameConnect|game-wallet',s,re.I):
    raise RuntimeError('Retired devnet flow survived UI adaptation')
p.write_text(s)
print('Virtual guest gameplay, explicit virtual currency, mainnet fee review and sounds applied.')
