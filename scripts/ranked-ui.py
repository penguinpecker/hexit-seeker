from pathlib import Path
import json
p=Path('web/index.html');s=p.read_text()
if 'id="submitScore"' in s: raise SystemExit('Ranked UI already applied; run adapt-ui.py first')
try: api=json.loads(Path('deployment.json').read_text())['api']
except: api='http://127.0.0.1:8789'
s=s.replace("connect-src https://api.devnet.solana.com;",f"connect-src https://api.devnet.solana.com https://api.mainnet-beta.solana.com {api};")
s=s.replace('Practice ranking on this device. Global Solana rankings are not live.','Global leaderboard · best paid score per wallet. Rankings use server-verified three-minute runs.')
s=s.replace('<div class="podium" id="podium"></div>','''<div class="panel cut score-card">
<div class="micro">Your ranked run</div><div class="score-line"><strong class="num" id="rankedScore">$100.00</strong><span class="micro" id="rankedTime">3 minutes</span></div>
<p class="seeker-note" id="rankedStatus" role="status">Start with $100 play credits. Finish your run, then choose whether to publish your score.</p>
<button class="btn primary cut" type="button" id="startRanked">Start ranked run</button>
<button class="btn boom cut" type="button" id="submitScore" disabled>Submit score · 0.01 SOL</button>
<p class="seeker-note score-fee" id="scoreNetwork">Submission fee: 0.01 SOL + network fee.</p>
<button class="textlink" type="button" id="backPractice">Back to practice</button>
</div><div class="podium" id="podium"></div>''')
s=s.replace('LB={rows:d.rows, u:m, all:!d.period||d.period===\'all\'}','LB={rows:d.rows, u:m, all:false}')
s=s.replace('const me0=S.addr.toLowerCase()', 'const me0=S.addr').replace('String(r.owner).toLowerCase()', 'String(r.owner)')
s=s.replace("'Signed in with'", "'Connected with'")
s=s.replace('No token deposits or on-chain bets in this preview.','Ranked score submission is optional and costs 0.01 SOL plus network fees.')
s=s.replace('Token deposits, withdrawals and on-chain bets are not enabled in this preview.','A ranked leaderboard submission costs 0.01 SOL plus the network fee, approved in your wallet. Gameplay stakes use play credits.')
s=s.replace('Seed Vault Wallet · Solana devnet','Seed Vault Wallet · <span class="networkName">Solana</span>')
s=s.replace('Devnet SOL</span>', 'Wallet SOL</span>').replace("'Reading Solana devnet…'", "'Reading your Solana wallet…'")
s=s.replace('The connection asks you to sign a message proving control of your address. It does not authorize transfers or bets. This build does not deploy or use a Solana betting program.','Connecting signs a message proving control of your wallet. Submitting a ranked score is a separate action that requests a 0.01 SOL payment plus network fees. Check the displayed network and receiving address before approving. Gameplay uses play credits; score submission fees are not stakes and are not refundable after confirmation.')
s=s.replace('This app uses local storage for practice progress, wallet public address, the tutorial, and game preferences.','This app uses local storage for practice progress, wallet public address, an authenticated session, pending payment receipts, the tutorial, and game preferences.')
s=s.replace('No analytics, advertising SDK, social login service, or global leaderboard is enabled in this preview.','Railway PostgreSQL stores authenticated wallet addresses, ranked runs, game entries, outcomes, scores and payment signatures. Published rankings show your public wallet address, score and payment signature. No analytics, advertising SDK or social login service is enabled.')
s=s.replace('You may connect a compatible wallet on Solana devnet.','You may connect a compatible Solana wallet. The selected payment network is shown before you approve a score submission.')
s=s.replace('A public Solana devnet RPC receives your wallet address and IP address when you refresh your SOL balance.','A public Solana RPC receives your wallet address and IP address when you refresh your balance; the server checks payment signatures on the configured network.')
s=s.replace('Signed in with', 'Connected with')
s=s.replace('id="lbRows"></div>','id="lbRows"></div><p class="seeker-note" id="leaderboardEmpty" hidden>No scores yet. Finish a ranked run and be the first to submit.</p>')
s=s.replace('LB={rows:d.rows, u:m, all:false}; paintLeaders();',"LB={rows:d.rows, u:m, all:false}; $('#leaderboardEmpty').hidden=d.rows.length>0;paintLeaders();")
s=s.replace('No trades yet. Tap a tile on the board and your results land here.','No entries yet. Tap a tile on the board and your results land here.')
s=s.replace("if(id==='leaders'){ lbEnter=true;", "if(id==='leaders'){ renderRanked();lbEnter=true;")
s=s.replace('id="pDeposit"><span class="ms">add</span>Add credits</button>', 'id="pDeposit"><span class="ms">add</span>Add credits</button>')
# Add payment review using the original bottom-sheet design.
idx=s.index('<script>\n// The top-right stack')
s=s[:idx]+'''<style>
.score-card{margin:14px 0 20px}.score-line{display:flex;align-items:center;justify-content:space-between;margin-top:10px}.score-line strong{font-size:28px;color:var(--amber)}
.score-card .btn+.btn{margin-top:8px}.score-card .score-fee{font-size:10px;margin:10px 0 0}.score-card .textlink{margin-top:8px}
#sh-score{max-height:calc(100% - 24px);overflow-y:auto}#scoreRecipient{word-break:break-all;font-size:11px;line-height:1.5}
</style>
<div class="sheet" id="sh-score"><div class="grab"></div>
<h3 class="head">Make it <span class="hl-t">official.</span></h3>
<p class="sub">Publish your verified run to the global leaderboard.</p>
<div class="panel cut"><div class="kv"><span>Final score</span><b id="reviewScore">—</b></div><div class="kv"><span>Submission fee</span><b>0.01 SOL</b></div><div class="kv"><span>Network</span><b class="networkName">Solana</b></div><div class="kv"><span>Network fee</span><b>Shown in your wallet</b></div></div>
<p class="micro">Fee receiver</p><p id="scoreRecipient"></p>
<p class="seeker-note">Approve one transfer in your wallet. Your score is published after the payment finalizes. Rechecking a sent payment does not charge again.</p>
<p class="seeker-note" id="submitStatus" role="status"></p>
<button class="btn boom cut" type="button" id="confirmScore">Pay 0.01 SOL &amp; submit</button>
<button class="textlink" type="button" id="checkScore" hidden>Check existing payment</button>
<button class="textlink" type="button" id="closeScore">Back to leaderboard</button>
</div>
'''+s[idx:]
idx=s.rfind("show('splash'); loadConfig();")
s=s[:idx]+'''let submissionBusy=false, paidRun='';
const networkName=()=>HexitChain.wallet.cluster()==='devnet'?'Solana devnet · test SOL':'Solana mainnet · real SOL';
function renderRanked(){
  const r=HexitChain.ranked(),cfg=HexitChain.service();
  $$('.networkName').forEach(e=>e.textContent=networkName());
  $('#scoreNetwork').textContent='0.01 SOL + network fee · '+networkName();
  $('#rankedScore').textContent=r?money(r.credit/1e6):'$100.00';
  const remain=r?Math.max(0,Math.ceil((r.endsAt-Date.now())/1000)):180;
  $('#rankedTime').textContent=r&&r.status==='active'?Math.floor(remain/60)+':'+String(remain%60).padStart(2,'0'):r?'Run complete':'3 minutes';
  $('#startRanked').disabled=!!r&&r.status==='active';$('#startRanked').textContent=r?'Start a new ranked run':'Start ranked run';
  $('#submitScore').disabled=!r||r.status!=='finished'||!r.history.bets.length||submissionBusy||paidRun===r.id;
  $('#submitScore').textContent=r&&paidRun===r.id?'Score submitted ✓':'Submit score · 0.01 SOL';
  $('#backPractice').hidden=!r||r.status==='active';
  $('#rankedStatus').textContent=r?(r.status==='active'?'Your run is live. Tap the board to keep playing.':paidRun===r.id?'Your score is on the leaderboard.':'Your verified score is ready. Submit it for 0.01 SOL or start a new run.'):'Start with $100 play credits. Finish your run, then choose whether to publish your score.';
  const label=$('.mode-tag');if(label)label.textContent=r?'RANKED · '+(r.status==='active'?Math.floor(remain/60)+':'+String(remain%60).padStart(2,'0'):'COMPLETE')+' · SIMULATED PRICES':'PRACTICE · SIMULATED PRICES · PLAY CREDITS';
  $('#pWithdraw').disabled=!!r;$('#pDeposit').disabled=!!r;
}
function clearBoardState(){S.bets=[];S.history=[];held=[];HIST=null;P=null;for(const f of Object.values(feeds)){f.samples=[];f.p=null;}camP=null;}
$('#startRanked').addEventListener('click',async()=>{
  const b=$('#startRanked');b.disabled=true;$('#rankedStatus').textContent='Preparing your ranked run…';
  try{if(!HexitChain.wallet.address())await HexitChain.wallet.connect();updateAddress();await HexitChain.startRanked();paidRun='';show('trade');renderRanked();}
  catch(e){$('#rankedStatus').textContent=e.message;b.disabled=false;}
});
addEventListener('hexit:mode-change',clearBoardState);
$('#backPractice').addEventListener('click',()=>{try{HexitChain.practiceMode();show('trade');renderRanked();}catch(e){toast(e.message,'err');}});
$('#submitScore').addEventListener('click',()=>{const r=HexitChain.ranked();if(!r||r.status!=='finished')return;
  openSheet('score');$('#reviewScore').textContent=money(r.credit/1e6);$('#scoreRecipient').textContent=HexitChain.service()?.treasury||'Fee wallet awaiting configuration';$('#submitStatus').textContent='';$('#confirmScore').disabled=!HexitChain.service()?.paymentsEnabled;renderRanked();
});
async function confirmReceipt(receipt){
  $('#submitStatus').textContent='Payment sent. Waiting for Solana to finalize…';$('#checkScore').hidden=false;
  for(let i=0;i<30;i++){const response=await HexitChain.wallet.api('/scores/confirm',receipt);if(response.ok){paidRun=HexitChain.ranked()?.id||'';$('#submitStatus').textContent='Score published. You’re on the leaderboard.';$('#checkScore').hidden=true;$('#confirmScore').disabled=true;renderRanked();renderLeaders();return;}await new Promise(resolve=>setTimeout(resolve,2000));}
  $('#submitStatus').textContent='Still confirming. Use Check existing payment to retry without paying again.';
}
$('#confirmScore').addEventListener('click',async()=>{
  if(submissionBusy)return;submissionBusy=true;$('#confirmScore').disabled=true;$('#submitStatus').textContent='Preparing your 0.01 SOL submission…';
  try{const r=HexitChain.ranked(),intent=await HexitChain.wallet.api('/scores/intent',{runId:r.id});
    if(intent.paid){paidRun=r.id;$('#submitStatus').textContent='This score is already published.';renderRanked();renderLeaders();return;}
    const existing=await HexitChain.wallet.pendingPayment();
    const receipt=existing?.intentId===intent.id?existing:await HexitChain.wallet.payScore(intent,HexitChain.service().treasury);
    await confirmReceipt(receipt);
  }catch(e){$('#submitStatus').textContent=e.message;$('#confirmScore').disabled=false;}finally{submissionBusy=false;renderRanked();}
});
$('#checkScore').addEventListener('click',async()=>{if(submissionBusy)return;submissionBusy=true;try{const receipt=await HexitChain.wallet.pendingPayment();if(!receipt)throw new Error('No saved payment receipt yet.');await confirmReceipt(receipt);}catch(e){$('#submitStatus').textContent=e.message;}finally{submissionBusy=false;renderRanked();}});
$('#closeScore').addEventListener('click',closeSheet);
addEventListener('hexit:ranked',renderRanked);setInterval(renderRanked,1000);
'''+s[idx:]
p.write_text(s)
print('Shared leaderboard and paid score submission UI applied.')
