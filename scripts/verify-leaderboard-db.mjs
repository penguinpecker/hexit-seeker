// Run inside the Railway service. All fixtures live in connection-local TEMP tables.
import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {LEADERBOARD_SQL} from '../server/leaderboard.ts';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
try{
  const before=(await db.query('SELECT count(*)::int n FROM public.leaderboard_scores')).rows[0].n;
  await db.query('BEGIN');
  await db.query('CREATE TEMP TABLE ranked_runs (id uuid,mode text) ON COMMIT DROP');
  await db.query('CREATE TEMP TABLE leaderboard_scores (id uuid,run_id uuid,owner text,score_micro bigint,pnl_micro bigint,tx_signature text,cluster text,created_at timestamptz) ON COMMIT DROP');
  const date=new Date(),cutoff=new Date(Date.now()-86400000);
  async function insert(owner,score,mode='virtual',cluster='mainnet-beta',at=date){const id=randomUUID(),run=randomUUID();await db.query('INSERT INTO ranked_runs VALUES($1,$2)',[run,mode]);await db.query('INSERT INTO leaderboard_scores VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,run,owner,score,score-100000000,id,cluster,at]);}
  for(let i=1;i<=65;i++)await insert('TestWallet'+String(i).padStart(3,'0'),200000000-i*100000);
  await insert('TestWallet001',100000000); // Worse repeat must not duplicate a wallet.
  await insert('LegacyWallet',999000000,'legacy');await insert('WrongNetwork',999000000,'virtual','devnet');
  await insert('OldWallet',999000000,'virtual','mainnet-beta',new Date(Date.now()-172800000));
  const read=async(offset=0,owner='TestWallet063')=>(await db.query(LEADERBOARD_SQL,['mainnet-beta',cutoff,25,offset,owner])).rows[0];
  const first=await read();assert.equal(first.total,65);assert.equal(first.rows.length,25);assert.equal(first.rows[0].rank,1);assert.equal(first.rows[0].owner,'TestWallet001');assert.equal(first.podium.length,3);assert.equal(first.self.rank,63);
  const second=await read(25);assert.equal(second.rows[0].rank,26);assert.equal(second.rows.at(-1).rank,50);
  const third=await read(50);assert.equal(third.rows.length,15);assert.equal(third.rows.at(-1).rank,65);
  assert.equal((await read(0,'Unsubmitted')).self,null);
  assert.equal(new Set([...first.rows,...second.rows,...third.rows].map(r=>r.owner)).size,65);
  await db.query('ROLLBACK');
  const after=(await db.query('SELECT count(*)::int n FROM public.leaderboard_scores')).rows[0].n;assert.equal(after,before);
  console.log(JSON.stringify({ok:true,fixtures:'connection-local temporary tables rolled back',eligiblePlayers:65,pages:3,selfRank:63,productionScores:after,checks:['best score per wallet','ranks after top ten and top fifty','complete pagination','self rank outside current page','period/network/legacy filtering','no fabricated production scores']}));
}finally{await db.query('ROLLBACK').catch(()=>{});await db.end();}
