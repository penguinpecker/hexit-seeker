from pathlib import Path
import re, json, os
p=Path('web/index.html')
original=os.environ.get('HEXIT_ORIGINAL_APP')
if not original: raise SystemExit('Set HEXIT_ORIGINAL_APP to the original Hexit app directory to regenerate the UI. Normal builds use the checked-in web/index.html.')
s=(Path(original)/'index.html').read_text()
def once(a,b):
 global s
 if a not in s: raise Exception('Missing replacement: '+a[:90])
 s=s.replace(a,b,1)
s=s.replace('Monad testnet','Solana Seeker').replace('Monad','Solana')
once('<title>Play · Hexit</title>','<title>Hexit · Solana Seeker</title>')
s=re.sub(r'<meta name="description"[^>]+>', '<meta name="description" content="The original Hexit experience for Solana Seeker. Practice with simulated prices and connect your Solana wallet.">',s)
once('<meta name="theme-color"', '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; font-src \'self\'; connect-src https://api.devnet.solana.com; worker-src \'self\'; object-src \'none\'; frame-src \'none\'; base-uri \'none\'; form-action \'none\'">\n<meta name="theme-color"')
once('Sign in with email, Google or X. A built-in Solana Seeker wallet signs each tap on this device, so there are no popups. Withdraw whenever you like.','Connect your Solana wallet, or jump straight into practice. Start with $100 in play credits. Simulated prices, real Hexit mechanics, no funds at risk.')
s=s.replace('TEST WALLET','PRACTICE WALLET').replace('CASH OUT</text>','PLAY AGAIN</text>')
# Preserve the original auth layout while replacing nonfunctional social login with real native wallet connection.
a=s.index('        <h3>Log in or sign up</h3>'); b=s.index('\n      </div>\n    </section>',a)
s=s[:a]+'''        <h3>Your next move.</h3>
        <div class="anytime"><span class="ms fill">bolt</span><span><b>Hexit. Now on Seeker.</b> The same board. A Solana wallet. Your next boom.</span></div>
        <button class="row" type="button" id="connectWallet"><span class="ico"><svg width="22" height="22"><use href="#sol"/></svg></span>Connect Solana wallet</button>
        <div class="or">or jump straight in</div>
        <button class="btn primary cut" type="button" id="practiceGo">Play with $100 practice credits</button>
        <p id="connectStatus" role="status" class="seeker-note">Practice uses simulated prices and play credits. No token deposits or on-chain bets in this preview.</p>
        <div class="terms"><input type="checkbox" id="agree" checked aria-labelledby="agreeTxt"><span id="agreeTxt">I accept the <button type="button" data-legal="terms">Preview terms</button> and <button type="button" data-legal="privacy">Privacy information</button>.</span></div>
        <div class="foot"><span class="ms" style="font-size:14px">lock</span>Seed Vault Wallet · Mobile Wallet Adapter</div>'''+s[b:]
a=s.index('    <!-- OTP -->');b=s.index('    <!-- WALLET CREATING',a);s=s[:a]+s[b:]
a=s.index('/* ---- login ---- */');b=s.index('/* ---- deposit ---- */',a)
s=s[:a]+'''/* ---- native Solana connection and local practice onboarding ---- */
function needAgree(){if(!$('#agree').checked){toast('Accept the preview terms to continue','err');return false;}return true;}
function updateAddress(){S.addr=HexitChain.address();S.user.handle=short(S.addr);S.user.via=HexitChain.wallet.address()?'Solana wallet':'Practice on this device';$('#wdDest').textContent='Practice reserve';}
$('#practiceGo').addEventListener('click',()=>{if(needAgree())show('wallet');});
$('#connectWallet').addEventListener('click',async()=>{
  if(!needAgree())return; const b=$('#connectWallet'); b.disabled=true; $('#connectStatus').textContent='Approve the connection and sign-in message in your wallet…';
  try{await HexitChain.wallet.connect();updateAddress();$('#connectStatus').textContent='Wallet verified. Your funds stay in your wallet.';show('wallet');}
  catch(e){$('#connectStatus').textContent=e.message;SND.err();}finally{b.disabled=false;}
});
async function runWallet(){
  $('#walletBusy').hidden=false;$('#walletDone').hidden=true;updateAddress();
  $('#wSigned').textContent=S.user.via;$('#wAddr').textContent=HexitChain.wallet.address()?short(S.addr):'On this device';
  try{await HexitChain.onboard();startChain();$('#walletBusy').hidden=true;$('#walletDone').hidden=false;SND.ok();buzz(20);}
  catch(e){$('#walletBusy .micro').textContent=e.message;}
}
function resume(){updateAddress();startChain();afterSplash='trade';}
$('#walletWatch').addEventListener('click',()=>startChain());

'''+s[b:]
s=s.replace('Creating your wallet','Preparing your board')
s=s.replace('Test wallet saved in this browser only. A private window, clearing site data, or another browser or device starts a new one.','Your practice balance and results are saved on this device. Connected wallet keys stay in your Solana wallet.')
s=s.replace('Your wallet signs each tap and each cash-out silently on this device. No popups, no gas.','Practice taps are instant. No wallet approvals and no network fees. Your Solana wallet balance is separate.')
s=s.replace('<span>Network fees</span><b>Paid by Hexit</b>','<span>Practice balance</span><b>$100 play credits</b>')
s=s.replace('Wallet <span class="hl">ready.</span>','You’re <span class="hl">ready.</span>')
s=s.replace("S.installDismissed=matchMedia('(display-mode: standalone)').matches;",'S.installDismissed=true;')
s=s.replace("const ASSETS = {}, ICONS = {BTC:'#btc', MON:'#mon'};","const ASSETS = {}, ICONS = {BTC:'#btc', SOL:'#sol'};")
s=s.replace('screen:null, asset:1,','screen:null, asset:0,')
s=s.replace("const FINE = matchMedia('(hover:hover) and (pointer:fine)').matches","const FINE = !window.HexitNative && matchMedia('(hover:hover) and (pointer:fine)').matches")
s=s.replace("navigator.vibrate && navigator.vibrate(p);","if(window.HexitNative) HexitChain.wallet.native('haptic').catch(()=>{}); else navigator.vibrate && navigator.vibrate(p);")
s=s.replace("TX_URL = 'https://testnet.monadvision.com/tx/', HASH = /^0x[0-9a-fA-F]{64}$/", "TX_URL = 'https://explorer.solana.com/tx/', HASH = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/")
s=s.replace('h.href = TX_URL + hash;',"h.href = TX_URL + hash + '?cluster=devnet';")
s=s.replace('0x[0-9a-fA-F]{64}', '[1-9A-HJ-NP-Za-km-z]{64,88}')
s=s.replace('Balance · USDC','Practice balance · play credits')
s=s.replace('Add <span class="hl">USDC.</span>','Add <span class="hl">credits.</span>')
s=s.replace('Test USDC on the Solana Seeker, no real money. Stakes start at $0.10, and you can withdraw anytime.','Play credits have no cash value. Move credits from your practice reserve or start over with $100. Your Solana wallet is separate.')
s=s.replace('Test USDC you withdrew goes back into play','Move saved practice credits back into play')
s=s.replace('From your wallet','From practice reserve')
s=s.replace('Send tUSDC on Solana Seeker','Restart with $100')
s=s.replace('From any Solana Seeker wallet','Reset this device’s practice balance and results')
s=s.replace('<span class="micro">Pay with</span>','<span class="micro">Practice credits</span>')
s=s.replace('>Withdraw</button>','>To reserve</button>').replace('>Add funds</button>','>Add credits</button>')
s=s.replace('Cash out</h3>','Move to reserve</h3>').replace('>My Solana wallet<','>Practice reserve<')
s=s.replace('Another Solana address','Practice credits only').replace('Paste or scan','No token transfers in this preview')
s=s.replace('Your Solana Seeker wallet signs it, no popup.','Move play credits between your board and practice reserve.')
s=s.replace('One tap. Your Solana Seeker wallet signs it, no popup.','Save play credits in your practice reserve.')
s=s.replace('No test USDC in your wallet','No practice credits in reserve')
s=s.replace("+' USDC is in your balance.'","+' in practice credits is ready to play.'")
s=s.replace("toast(`Sent ${money(v)} · signed silently`,'win')","toast(`Moved ${money(v)} to practice reserve`,'win')")
s=s.replace("if(b.dataset.dep==='transfer'){ prepSheet('transfer'); openSheet('transfer'); } else addFunds();","if(b.dataset.dep==='transfer'){ try{HexitChain.refill();S.bets=[];S.history=[];held=[];HIST=null;loadHist();syncBal();toast('Practice restarted · $100 play credits');show('trade');}catch(e){toast(e.message,'err');} } else addFunds();")
s=s.replace("text:'ethereum:'+CFG.usdc+'@'+CFG.chainId+'/transfer?address='+S.addr","text:'solana:'+S.addr")
s=s.replace("$('#refLink').textContent=location.host;","$('#refLink').textContent='hexit-app.vercel.app';")
s=s.replace("copy(location.origin+'/')","copy('https://hexit-app.vercel.app')")
s=s.replace("copy('https://testnet.monadvision.com/address/'+S.addr)","openWalletSheet()")
s=s.replace("$('#onlinePill').addEventListener('click',()=>{", "$('#onlinePill').addEventListener('click',()=>{")
# Add the actual wallet as a separate card, without conflating it with play credits.
once('        <div class="section">\n          <span class="micro">All time</span>', '''        <button class="method cut seeker-wallet-card" type="button" id="profileWallet"><svg width="24" height="24"><use href="#sol"/></svg><span><b>Solana wallet</b><small>Seed Vault Wallet · Devnet</small></span><span class="ms go">chevron_right</span></button>
        <div class="section">
          <span class="micro">All time</span>''')
once('<div class="podium" id="podium"></div>','<p class="seeker-note">Practice ranking on this device. Global Solana rankings are not live.</p><div class="podium" id="podium"></div>')
s=s.replace('Always on: your test wallet signs on this device','Instant practice taps, no wallet signature needed')
s=s.replace('<div>Export wallet key<small>Solana Seeker wallet</small></div>','<div>Wallet keys<small>Stay in Seed Vault Wallet; Hexit cannot export them</small></div>')
s=s.replace('<div>Wallet history</div>','<div>Practice history<small>View your results in Profile</small></div>')
s=s.replace('<div>X · Telegram · Discord</div>','<div>Seeker preview<small>v0.1.0 · Practice and wallet connection</small></div>')
s=s.replace('<div>Delete account</div>','<div>Reset practice<small>Use Add credits → Restart with $100</small></div>')
s=s.replace('<div>Push notifications<small>Big wins and deposits</small></div>','<div>Push notifications<small>Not enabled in this preview</small></div>')
s=s.replace('data-set="push" type="button"','data-set="push" disabled type="button"')
s=s.replace('oneTap:true,push:true','oneTap:true,push:false')
s=s.replace('href="/"','href="https://hexit-app.vercel.app"')
s=s.replace('<div>Install Hexit</div>','<div>About this Seeker build</div>')
s=s.replace("$('#installBtn').addEventListener('click',()=>openSheet('install'));","$('#installBtn').addEventListener('click',()=>openWalletSheet());")
s=s.replace("toast('Logged out'); show('login');","HexitChain.wallet.disconnect().then(()=>{updateAddress();toast('Wallet disconnected');show('login');},e=>toast(e.message,'err'));")
s=s.replace("'System online // Solana Seeker'","'Seeker preview // practice ready'")
s=s.replace("'Already armed · no cancel on chain'","'Already armed · wait for the window'")
s=s.replace("'Settled · the chain saw no hit'","'Settled · the practice tape saw no hit'")
s=s.replace('>Online <b id="onlineN">1</b>', '>Practice <b id="onlineN">1</b>')
s=s.replace("$('#onlinePill').addEventListener('click',()=>{ SND.tap(); prepSheet('online'); openSheet('online'); setNotes('sheet:online'); });", "$('#onlinePill').addEventListener('click',()=>{SND.tap();openSheet('how');});")
s=s.replace("?'Stale':'Live'", "?'Paused':'Practice'").replace("st==='Live'", "st==='Practice'")
s=s.replace('Amount · USDC','Amount · play credits').replace('Test wallet // Solana Seeker','Practice wallet // on this device')
s=s.replace("confirmed:'Confirmed'", "confirmed:'Saved'")
s=s.replace('Send tUSDC</h3>', 'Practice credits</h3>').replace('Send only tUSDC on the <b>Solana Seeker</b> to this address. It shows up after one confirmation.','Practice credits stay on this device and cannot be sent to a blockchain address.')
s=s.replace('Your bet fills half a second later at the live quote, as long as it is within your slippage setting.','Your practice entry fills at the current multiplier, within your slippage setting.')
s=s.replace('Already playing? <b>Log in</b>','Already playing? <b>Continue</b>')
s=s.replace("let ac=null, sfx=0.7, musicGain=null, musicOsc=null;", "let ac=null, sfx=0.7, musicGain=null, musicOsc=null;")
s=s.replace("$('#logout').addEventListener", "$('#logout').addEventListener")
# Existing inline SVG artwork is preserved. Only add the Solana market symbol.
once('<svg ', '<svg ')
idx=s.index('<symbol ')
s=s[:idx]+'''<symbol id="sol" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#120b22"/><path d="M8 9l3-3h15l-3 3zm0 5h15l3 3H11zm0 11l3-3h15l-3 3z" fill="#a4c9ff"/></symbol>'''+s[idx:]
# Native context and wallet sheet; old transfer sheet remains inaccessible from any action.
idx=s.index('<script>\n// The top-right stack')
s=s[:idx]+'''<style>
.seeker-note{font-size:12px;line-height:1.55;color:var(--on-var);margin:14px 0}
.seeker-wallet-card{width:100%;gap:12px;margin-top:18px;text-align:left}
.mode-tag{position:absolute;z-index:5;left:18px;top:103px;font:9px var(--f-mono);letter-spacing:.07em;color:var(--outline);pointer-events:none}
.online .stack,.online .dot,#onlineN{display:none!important}\n#sh-solana{max-height:calc(100% - 30px);overflow-y:auto}
#solAddress{word-break:break-all;font-size:12px;line-height:1.6;color:var(--primary)}
#solStatus{min-height:2.8em}
#sh-solana .wallet-actions{display:flex;gap:8px;margin-top:12px}
#sh-solana .wallet-actions button{flex:1}
@media(min-width:761px){.mode-tag{top:83px;left:28px}}
</style>
<div class="sheet" id="sh-solana"><div class="grab"></div>
<h3 class="head">Your <span class="hl">Solana wallet.</span></h3>
<p class="sub">Seed Vault Wallet · Solana devnet</p>
<div class="panel cut"><div class="micro">Connected account</div><p id="solAddress">No wallet connected</p><div class="kv"><span>Devnet SOL</span><b id="solBalance">—</b></div></div>
<p class="seeker-note">Your keys and funds stay in your wallet. Practice credits are separate. Token deposits, withdrawals and on-chain bets are not enabled in this preview.</p>
<p class="seeker-note" id="solStatus" role="status"></p>
<button class="btn primary cut" type="button" id="solConnect">Connect wallet</button>
<div class="wallet-actions"><button class="btn line cut" type="button" id="solRefresh">Refresh</button><button class="btn line cut" type="button" id="solCopy">Copy address</button></div>
<button class="textlink" type="button" id="solDisconnect">Disconnect wallet</button>
<button class="textlink" type="button" id="solClose">Back to Hexit</button>
</div>
'''+s[idx:]
once('<canvas id="board"', '<div class="mode-tag">PRACTICE · SIMULATED PRICES · PLAY CREDITS</div><canvas id="board"')
# Accurate in-app information instead of carrying over Monad service claims.
docs={
 'terms': '<h1>Seeker preview</h1><p>This Hexit build is a practice game. All prices on the board are simulated and all balances shown in gameplay are play credits with no cash value.</p><h2>Practice</h2><p>Credits cannot be redeemed or transferred on-chain. Your balance and results are saved on this device. Clearing app data removes this progress. Open tiles are refunded if the game is interrupted.</p><h2>Solana wallet</h2><p>You may connect a compatible wallet on Solana devnet. The connection asks you to sign a message proving control of your address. It does not authorize transfers or bets. This build does not deploy or use a Solana betting program.</p>',
 'privacy':'<h1>Your data</h1><p>Your practice balance, history, preferences, and connected public wallet address are saved locally in this app. Hexit does not request or store a wallet seed phrase or private key.</p><h2>Wallet connection</h2><p>Mobile Wallet Adapter exchanges an authorization token and a signed connection message with the wallet you approve. The authorization token stays in app memory for the session. A public Solana devnet RPC receives your wallet address and IP address when you refresh your SOL balance.</p><h2>Local data</h2><p>No analytics, advertising SDK, social login service, or global leaderboard is enabled in this preview. Clear app storage in Android settings to remove all locally saved data. Disconnect in the wallet screen to revoke the current connection.</p>',
 'cookies':'<h1>Device storage</h1><p>This app uses local storage for practice progress, wallet public address, the tutorial, and game preferences. It does not use advertising cookies.</p><p>Clearing Android app data deletes this information. Your external Solana wallet and its keys are not deleted.</p>'}
for key,body in docs.items():
 s=re.sub(r'<template id="doc-'+key+r'">[\s\S]*?</template>','<template id="doc-'+key+'">'+body+'</template>',s)
# Functions share the original UI state; wallet changes cannot touch practice balances.
idx=s.rfind('show(\'splash\'); loadConfig();')
s=s[:idx]+'''async function refreshSol(){
  $('#solAddress').textContent=HexitChain.wallet.address()||'No wallet connected';
  const on=!!HexitChain.wallet.address();$('#solConnect').hidden=on;$('#solDisconnect').hidden=!on;$('#solCopy').disabled=!on;$('#solRefresh').disabled=!on;
  $('#solBalance').textContent='—';if(!on)return;
  $('#solStatus').textContent='Reading Solana devnet…';
  try{const amount=await HexitChain.wallet.solBalance();$('#solBalance').textContent=amount.toFixed(4)+' SOL';$('#solStatus').textContent='Wallet balance only. Practice credits are shown in Profile.';}
  catch(e){$('#solStatus').textContent=e.message;}
}
function openWalletSheet(){openSheet('solana');$('#solStatus').textContent='';refreshSol();}
$('#profileWallet').addEventListener('click',openWalletSheet);
$('#solClose').addEventListener('click',closeSheet);
$('#solRefresh').addEventListener('click',refreshSol);
$('#solCopy').addEventListener('click',()=>copy(HexitChain.wallet.address()));
$('#solConnect').addEventListener('click',async()=>{const b=$('#solConnect');b.disabled=true;$('#solStatus').textContent='Approve the sign-in message in your Solana wallet…';try{await HexitChain.wallet.connect();updateAddress();renderProfile();await refreshSol();}catch(e){$('#solStatus').textContent=e.message;}finally{b.disabled=false;}});
$('#solDisconnect').addEventListener('click',async()=>{const b=$('#solDisconnect');b.disabled=true;try{await HexitChain.wallet.disconnect();updateAddress();$('#solStatus').textContent='Disconnected';renderProfile();await refreshSol();}catch(e){$('#solStatus').textContent=e.message;}finally{b.disabled=false;}});
window.HexitApp={back(){if($('#backdrop').classList.contains('on')){closeSheet();return true;}if(S.screen==='legal'){show(legalFrom);return true;}if(['profile','leaders','settings','deposit'].includes(S.screen)){show('trade');return true;}if(S.screen==='login'){show('intro');return true;}return false;},state:()=>({screen:S.screen,asset:S.asset,balance:S.balance,bets:S.bets.map(b=>({c:b.c,j:b.j,state:b.state,stake:b.stake})),settings:S.settings}),show};
addEventListener('hexit:pause',()=>{if(ac)ac.suspend();});
addEventListener('hexit:resume',()=>{if(ac&&S.screen==='trade')ac.resume();});
'''+s[idx:]
# Keep native clipboard reliable in WebView.
once("function copy(text){ try{", "function copy(text){ if(window.HexitNative){HexitChain.wallet.native('copy',{text}).then(()=>toast('Copied'),()=>toast('Could not copy','err'));return;} try{")
s=s.replace("try{ S.coachShown=", "try{const pref=JSON.parse(localStorage.getItem('hexit.seeker.settings')||'null');if(pref){for(const k of ['doubleTap','hilo','haptics'])if(typeof pref[k]==='boolean')S.settings[k]=pref[k];if(Number.isFinite(pref.slip))S.slip=Math.max(0,Math.min(60,pref.slip));}}catch{}\nfunction savePrefs(){localStorage.setItem('hexit.seeker.settings',JSON.stringify({...S.settings,slip:S.slip}));}\ntry{ S.coachShown=")
s=s.replace("S.settings[k]=!S.settings[k]; syncToggles();", "S.settings[k]=!S.settings[k];savePrefs(); syncToggles();")
s=s.replace("$('#slipV').textContent=S.slip+'%'; SND.tap();", "$('#slipV').textContent=S.slip+'%';savePrefs(); SND.tap();")
s=s.replace("requote(); syncToggles(); syncHud(); loadAvatars();", "requote(); syncToggles();$('#slipV').textContent=S.slip+'%'; syncHud(); loadAvatars();")
p.write_text(s)
Path('web/manifest.webmanifest').write_text(json.dumps({'name':'Hexit','short_name':'Hexit','start_url':'./index.html','display':'standalone','background_color':'#1b0639','theme_color':'#1b0639','icons':[{'src':'icons/icon-512.png','sizes':'512x512','type':'image/png'}]},indent=2))
print('Adapted original Hexit screens for Seeker.')
