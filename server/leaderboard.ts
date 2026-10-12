/** One verified best score per payment wallet; ranks cover the complete eligible set. */
export const LEADERBOARD_SQL=`WITH best AS (
  SELECT DISTINCT ON(s.owner) s.owner,s.score_micro,s.pnl_micro,s.tx_signature,s.created_at
  FROM leaderboard_scores s JOIN ranked_runs r ON r.id=s.run_id
  WHERE s.cluster=$1 AND s.created_at >= $2 AND r.mode='virtual'
  ORDER BY s.owner,s.score_micro DESC,s.created_at ASC,s.id ASC
), ranked AS (
  SELECT *,row_number() OVER(ORDER BY score_micro DESC,created_at ASC,owner ASC)::int AS rank FROM best
)
SELECT (SELECT count(*)::int FROM ranked) AS total,
  coalesce((SELECT jsonb_agg(t ORDER BY t.rank) FROM (SELECT * FROM ranked ORDER BY rank LIMIT $3 OFFSET $4) t),'[]'::jsonb) AS rows,
  coalesce((SELECT jsonb_agg(t ORDER BY t.rank) FROM (SELECT * FROM ranked ORDER BY rank LIMIT 3) t),'[]'::jsonb) AS podium,
  (SELECT to_jsonb(t) FROM ranked t WHERE owner=$5) AS self`;

export function leaderboardPage(search:URLSearchParams){
  const number=(name:string,fallback:number,max:number)=>{const raw=search.get(name);if(raw===null)return fallback;if(!/^[1-9]\d*$/.test(raw))throw new Error('Invalid '+name);const n=Number(raw);if(!Number.isSafeInteger(n)||n>max)throw new Error('Invalid '+name);return n;};
  return {page:number('page',1,1000000),limit:number('limit',25,100)};
}
export function publicScore(r:any){return r?{owner:r.owner,handle:r.owner.slice(0,6)+'…'+r.owner.slice(-4),rank:r.rank,score:String(r.score_micro),pnl:String(r.pnl_micro),signature:r.tx_signature,createdAt:r.created_at}:null;}
