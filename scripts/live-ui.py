"""Real exchange prices, complete paid rankings and the publisher's public links."""
from pathlib import Path
import re
p=Path('web/index.html');s=p.read_text()
s=s.replace('https://hexit-app.vercel.app','https://digitalchocolate.co/hexit/').replace('hexit-app.vercel.app','digitalchocolate.co/hexit/')
s=s.replace("+'SIMULATED PRICES';", "+HexitChain.feedLabel();")
s=s.replace('SIMULATED PRICES', 'CONNECTING TO LIVE MARKETS')
s=s.replace("?'Paused':'Virtual'", "?'Paused':'Live USD'").replace("st==='Virtual'", "st==='Live USD'")
s=s.replace('Board prices are simulated.', 'The board uses real USD last-trade prices from public Coinbase and Kraken feeds, sampled by the game server. Prices can differ between exchanges and may be delayed. If a feed stops or changes source, open entries are refunded in virtual credits and new entries pause until prices recover. This is a game, not an exchange or investment service.')
s=s.replace('v0.2.0 · Virtual play · Mainnet leaderboard fees','v0.3.1 · Live markets · Virtual credits')
s=s.replace('Global leaderboard · best paid score per wallet. Rankings use server-verified three-minute runs.', 'Global ranks · best submitted score per wallet. Every score comes from a completed run and a verified 0.01 SOL payment.')
s=s.replace("$('#staleFix').addEventListener('click',()=>{ setStale(false); SND.ok(); toast('Feed back · taps open'); });", "$('#staleFix').addEventListener('click',()=>{const ok=HexitChain.marketStatus().available;setStale(!ok);toast(ok?'Live feed connected':'Waiting for live market data',ok?'win':'err');});")
s=s.replace('/* ---- stale feed simulation ---- */','/* ---- live feed availability ---- */')
s=s.replace("const stale=Date.now()-f.at>STALE_MS;", "const stale=!HexitChain.marketStatus().available||Date.now()-f.at>STALE_MS;")
s=s.replace('<p class="seeker-note" id="leaderboardEmpty" hidden>', '<div id="lbPageNav" class="lb-page-nav"><button type="button" class="btn ghost" id="lbPrev">Previous</button><span id="lbPageLabel" aria-live="polite"></span><button type="button" class="btn ghost" id="lbNext">Next</button></div><p class="seeker-note" id="leaderboardEmpty" hidden>')
a=s.index('let lb=');b=s.index('const setHtml=',a)
s=s[:a]+r'''let lb='daily', LB=null, lbPage=1, lbRequest=0;
setInterval(()=>{if(S.screen==='leaders')renderLeaders(true);},10000);
$$('#lbTabs button').forEach(b=>b.addEventListener('click',()=>{lb=b.dataset.lb;lbPage=1;LB=null;$$('#lbTabs button').forEach(x=>x.classList.toggle('on',x===b));SND.tap();renderLeaders();}));
$('#lbPrev').addEventListener('click',()=>{if(lbPage>1){lbPage--;renderLeaders();}});
$('#lbNext').addEventListener('click',()=>{if(LB&&lbPage<LB.pages){lbPage++;renderLeaders();}});
const pnlCls=v=>v>0?'pos':v<0?'neg':'',pnlTxt=v=>(v<0?'\u2212':'+')+'VC '+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const scoreTxt=r=>'VC '+(Number(r.score)/1e6).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const rankName=r=>String(r.handle).replace(/[^0-9A-Za-z\u2026]/g,'');
async function renderLeaders(quiet){
  const want=lb,page=lbPage,request=++lbRequest;
  if(!quiet)$('#lbPageLabel').textContent='Loading ranks…';
  try{
    const d=await HexitChain.leaderboard(want,page);if(request!==lbRequest||want!==lb||page!==lbPage)return;
    if(page>d.pages){lbPage=d.pages;return renderLeaders(quiet);}
    LB=d;paintLeaders();
  }catch(e){if(request!==lbRequest)return;$('#lbPageLabel').textContent='Could not refresh ranks';if(!quiet)toast('Leaderboard unavailable','err');}
}
function paintLeaders(){
  if(!LB)return;
  const top=LB.podium||LB.rows.slice(0,3),rows=LB.rows;
  $('#leaderboardEmpty').hidden=LB.total>0;
  $('#lbPrev').disabled=lbPage<=1;$('#lbNext').disabled=lbPage>=LB.pages;
  $('#lbPrev').hidden=LB.pages<=1;$('#lbNext').hidden=LB.pages<=1;
  $('#lbPageLabel').textContent=LB.total?(LB.total+' ranked '+(LB.total===1?'player':'players')+' · Page '+lbPage+' of '+LB.pages):'No paid submissions yet';
  setHtml($('#podium'),[1,0,2].map(k=>{const r=top[k];if(!r)return '';const n=rankName(r);return `<div class="pod p${r.rank}"><span class="pav"><span class="hr">${avHtml(n,r.rank)}</span></span><b>@${n}</b><span class="num" style="font-size:13px">${scoreTxt(r)}</span><div class="stand"><span class="rk">${r.rank}</span></div></div>`;}).join(''));
  setHtml($('#lbRows'),rows.filter(r=>r.rank>3).map(r=>{const n=rankName(r);return `<div class="lrow cut"><span class="rk">${r.rank}</span>${avHtml(n,r.rank)}<b style="font-weight:600;font-size:13px">@${n}</b><span class="num">${scoreTxt(r)}</span></div>`;}).join(''));
  const me=LB.self;
  setHtml($('#yourRank'),`<span class="rk" style="color:var(--tertiary)">${me?me.rank:'—'}</span>${avHtml(S.user.handle,S.user.av)}<span><b style="font-weight:600;font-size:13px">You</b><small class="micro" style="display:block;font-size:9px">${me?'Your verified rank':'No submitted score in this period'}</small></span><span class="num">${me?scoreTxt(me):'—'}</span>`);
  if(lbEnter&&LB.rows.length){lbEnter=false;enterLeaders();}
}
''' +s[b:]
s=s.replace("delay:150+i*30", "delay:150+Math.min(i,10)*30")
s=s.replace('<h1>Your data</h1>', '<h1>Your data</h1><p>Published by Digital Chocolate. Support: <a href="https://digitalchocolate.co/contact.html">digitalchocolate@gmail.com</a>. Read the full <a href="https://digitalchocolate.co/hexit/legal/privacy.html">Hexit Privacy Policy</a>.</p>')
s=s.replace('<h1>Hexit game terms</h1>', '<h1>Hexit game terms</h1><p>Read the full <a href="https://digitalchocolate.co/hexit/legal/terms.html">Hexit Terms of Use</a>. Contact <a href="https://digitalchocolate.co/contact.html">Digital Chocolate support</a> for help.</p>')
s=s.replace('No advertising or analytics SDK is enabled.', 'The server receives public exchange prices from Coinbase and Kraken. Your guest identity is not sent to either exchange. No advertising or analytics SDK is enabled.')
s=s.replace('<style>', '<style>.lb-page-nav{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0}.lb-page-nav span{font-size:11px;color:var(--muted);text-align:center;flex:1}.lb-page-nav button{font-size:12px;padding:9px 12px}.lb-page-nav [hidden]{display:none!important}',1)
if 'vercel.app' in s or 'SIMULATED PRICES' in s:raise RuntimeError('Old website or price disclosure remains')
p.write_text(s)
print('Live market disclosures, paginated PostgreSQL ranks and Digital Chocolate links applied.')
