CREATE TABLE IF NOT EXISTS wallet_challenges (
  nonce text PRIMARY KEY, expires_at timestamptz NOT NULL, consumed boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS wallet_sessions (
  token_hash text PRIMARY KEY, owner text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ranked_runs (
  id uuid PRIMARY KEY, owner text NOT NULL, started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL, status text NOT NULL CHECK(status IN ('active','finished')),
  state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_run_per_owner ON ranked_runs(owner) WHERE status='active';
CREATE TABLE IF NOT EXISTS score_intents (
  id uuid PRIMARY KEY, run_id uuid NOT NULL UNIQUE REFERENCES ranked_runs(id), owner text NOT NULL,
  treasury text NOT NULL, cluster text NOT NULL, lamports bigint NOT NULL CHECK(lamports=10000000),
  score_micro bigint NOT NULL, pnl_micro bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  tx_signature text UNIQUE, paid_at timestamptz
);
CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id uuid PRIMARY KEY REFERENCES score_intents(id), run_id uuid NOT NULL UNIQUE REFERENCES ranked_runs(id),
  owner text NOT NULL, score_micro bigint NOT NULL, pnl_micro bigint NOT NULL,
  tx_signature text NOT NULL UNIQUE, cluster text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leaderboard_scores_period ON leaderboard_scores(cluster,created_at,score_micro DESC);
CREATE TABLE IF NOT EXISTS push_devices (
  id uuid PRIMARY KEY, owner text NOT NULL, token text NOT NULL UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_jobs (
  id bigserial PRIMARY KEY, event text NOT NULL, device uuid NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
  title text NOT NULL, body text NOT NULL, data jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event,device)
);
ALTER TABLE wallet_sessions ADD COLUMN IF NOT EXISTS payer text;
ALTER TABLE wallet_challenges ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE wallet_challenges ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'legacy';
ALTER TABLE score_intents ADD COLUMN IF NOT EXISTS payer text;
ALTER TABLE ranked_runs ADD COLUMN IF NOT EXISTS deposit_id uuid;
ALTER TABLE ranked_runs ADD COLUMN IF NOT EXISTS initial_micro bigint NOT NULL DEFAULT 100000000;
ALTER TABLE ranked_runs ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'legacy';
