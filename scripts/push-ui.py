from pathlib import Path
p=Path('web/index.html');s=p.read_text()
s=s.replace('Push notifications<small>Not enabled in this preview</small>','Push notifications<small id="pushDetail">Ranked runs and confirmed scores</small>')
s=s.replace('data-set="push" disabled type="button"','data-set="push" type="button"')
s=s.replace("const k=t.dataset.set; S.settings[k]", "const k=t.dataset.set;if(k==='push'){toggleCloudPush(t);return;} S.settings[k]")
s=s.replace("if(id==='settings') $('#sEmail').textContent=S.user.email||S.user.via;", "if(id==='settings'){$('#sEmail').textContent=S.user.email||S.user.via;refreshCloudPush();}")
s=s.replace('No analytics, advertising SDK or social login service is enabled.', 'When you enable notifications, Firebase Cloud Messaging processes a device token and notification delivery data. Railway stores the token with your connected wallet to notify you about completed ranked runs and confirmed submissions. Turn notifications off in Settings to remove this registration. No analytics, advertising SDK or social login service is enabled.')
idx=s.rfind("show('splash'); loadConfig();")
s=s[:idx]+'''async function refreshCloudPush(){try{const p=await HexitChain.wallet.pushStatus();S.settings.push=p.enabled;syncToggles();$('#pushDetail').textContent=p.enabled?'On · ranked runs and confirmed scores':'Off · ranked runs and confirmed scores';}catch{}}
async function toggleCloudPush(button){button.disabled=true;$('#pushDetail').textContent='Updating cloud notifications…';
  try{if(S.settings.push)await HexitChain.wallet.pushDisable();else{if(!HexitChain.wallet.address()){await HexitChain.wallet.connect();updateAddress();}await HexitChain.wallet.pushEnable();}await refreshCloudPush();savePrefs();toast(S.settings.push?'Cloud notifications enabled':'Cloud notifications disabled');}
  catch(e){await refreshCloudPush();toast(e.message,'err');}finally{button.disabled=false;}
}
async function openPush(){if(!window.HexitNative)return;try{const p=await HexitChain.wallet.native('pushOpen');if(p.open){if(!HexitChain.wallet.address())return;await HexitChain.onboard();show('leaders');renderRanked();}}catch{}}
addEventListener('hexit:push-open',openPush);
addEventListener('hexit:resume',()=>{refreshCloudPush();openPush();});
setTimeout(()=>{refreshCloudPush();openPush();},2000);
'''+s[idx:]
p.write_text(s)
print('Firebase notification settings and navigation applied.')
