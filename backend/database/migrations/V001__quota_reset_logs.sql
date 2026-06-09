-- 與 Stock-Insight-Chat init_db.sql §12-A / V006 等價
-- Insight-Monitor 首次使用配額 API 時亦會自動執行（CREATE TABLE IF NOT EXISTS）

CREATE TABLE IF NOT EXISTS quota_reset_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_period_start TIMESTAMPTZ,
    previous_used_tokens BIGINT NOT NULL DEFAULT 0,
    period_total_tokens BIGINT,
    period_total_cost_usd NUMERIC(10, 6),
    note TEXT,
    reset_by VARCHAR(100) DEFAULT 'monitor'
);
CREATE INDEX IF NOT EXISTS idx_quota_reset_logs_user_reset_at
    ON quota_reset_logs(user_id, reset_at DESC);
