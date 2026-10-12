import {createSign} from 'node:crypto';
const credential=process.env.FCM_SERVICE_ACCOUNT_JSON?JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON):null;
export const pushEnabled=!!credential?.private_key&&!!credential?.project_id;
let access='',expires=0;
async function accessToken(){
  if(access&&Date.now()<expires)return access;
  const now=Math.floor(Date.now()/1000),b64=(o:any)=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:credential.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const assertion=unsigned+'.'+createSign('RSA-SHA256').update(unsigned).sign(credential.private_key,'base64url');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
  const d=await r.json();if(!r.ok)throw new Error('FCM authorization failed');access=d.access_token;expires=Date.now()+(d.expires_in-120)*1000;return access;
}
export function notifications(pool:any){
  let busy=false;
  async function enqueue(event:string,owner:string,title:string,body:string,data:Record<string,string>){
    if(!pushEnabled)return;
    await pool.query(`INSERT INTO push_jobs(event,device,title,body,data) SELECT $1,id,$3,$4,$5 FROM push_devices WHERE owner=$2 ON CONFLICT(event,device) DO NOTHING`,[event,owner,title,body,data]);
  }
  async function drain(){
    if(!pushEnabled||busy)return;busy=true;
    try{
      const jobs=await pool.query(`SELECT j.*,d.token FROM push_jobs j JOIN push_devices d ON d.id=j.device WHERE j.sent_at IS NULL AND j.attempts<8 AND j.next_attempt<=now() AND j.created_at>now()-interval '1 day' ORDER BY j.id LIMIT 20`);
      for(const j of jobs.rows){try{
        const r=await fetch(`https://fcm.googleapis.com/v1/projects/${credential.project_id}/messages:send`,{method:'POST',headers:{authorization:'Bearer '+await accessToken(),'content-type':'application/json'},body:JSON.stringify({message:{token:j.token,notification:{title:j.title,body:j.body},data:{...j.data,event:j.event},android:{priority:'HIGH',ttl:'86400s',notification:{channel_id:'hexit_ranked',tag:j.event,icon:'ic_notification',click_action:'com.hexit.seeker.OPEN_LEADERBOARD'}}}}),signal:AbortSignal.timeout(15000)});
        if(!r.ok){const d=await r.json();const code=d.error?.details?.find((e:any)=>e.errorCode)?.errorCode;if(code==='UNREGISTERED'){await pool.query('DELETE FROM push_devices WHERE id=$1',[j.device]);continue;}if(r.status===401){access='';expires=0;}throw new Error('FCM '+r.status);}
        await pool.query('UPDATE push_jobs SET sent_at=now(),attempts=attempts+1 WHERE id=$1',[j.id]);
      }catch(e:any){console.error('Notification delivery retry:',e.message);await pool.query("UPDATE push_jobs SET attempts=attempts+1,next_attempt=now()+($2 * interval '1 second') WHERE id=$1",[j.id,Math.min(3600,30*2**j.attempts)]);}}
    }catch(e:any){console.error('Notification queue unavailable:',e.message);}finally{busy=false;}
  }
  setInterval(drain,5000).unref();
  setInterval(()=>pool.query("DELETE FROM push_jobs WHERE created_at<now()-interval '7 days'; DELETE FROM push_devices WHERE updated_at<now()-interval '90 days'").catch(()=>{}),3600000).unref();
  return{enqueue};
}
