// Uses the existing Firebase CLI account. Never prints account credentials or private keys.
const {writeFileSync,existsSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const auth=require('/opt/homebrew/lib/node_modules/firebase-tools/lib/auth.js');
(async()=>{
  const account=auth.getGlobalDefaultAccount();
  const {access_token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  async function call(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+access_token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(d.error?.message||r.status);return d;}
  const project='hexit-seeker',email='hexit-push@'+project+'.iam.gserviceaccount.com';
  for(const service of ['iam.googleapis.com','fcm.googleapis.com','firebaseinstallations.googleapis.com'])await call(`https://serviceusage.googleapis.com/v1/projects/${project}/services/${service}:enable`,{});
  let sa;try{sa=await call(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${email}`);}catch{sa=await call(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`,{accountId:'hexit-push',serviceAccount:{displayName:'Hexit notification sender'}});}
  const policy=await call(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`,{});
  const role='roles/firebasecloudmessaging.admin',member='serviceAccount:'+email;
  let binding=policy.bindings.find(b=>b.role===role);if(!binding){binding={role,members:[]};policy.bindings.push(binding);}if(!binding.members.includes(member))binding.members.push(member);
  await call(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:setIamPolicy`,{policy});
  const file='keys/firebase-service-account.json';
  if(!existsSync(file)){const key=await call(`https://iam.googleapis.com/v1/${sa.name}/keys`,{privateKeyType:'TYPE_GOOGLE_CREDENTIALS_FILE'});writeFileSync(file,Buffer.from(key.privateKeyData,'base64'),{mode:0o600});}
  const r=spawnSync('railway',['variable','set','--service','hexit-leaderboard','--environment','production','--stdin','FCM_SERVICE_ACCOUNT_JSON'],{input:require('node:fs').readFileSync(file),encoding:'utf8'});
  if(r.status!==0)throw new Error('Railway secret update failed: '+r.stderr);
  console.log('Dedicated FCM sender configured; credential saved privately and installed in Railway.');
})().catch(e=>{console.error(e.message);process.exit(1);});
