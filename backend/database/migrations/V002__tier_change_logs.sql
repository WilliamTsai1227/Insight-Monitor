-- Insight-Monitor 變更使用者方案的異動紀錄
-- 首次呼叫方案變更 API 時亦會自動執行（CREATE TABLE IF NOT EXISTS，見 backend/services/tiers.py）

CREATE TABLE IF NOT EXISTS tier_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_tier_id UUID,
    previous_tier_name VARCHAR(50),
    previous_monthly_token_limit BIGINT,
    new_tier_id UUID,
    new_tier_name VARCHAR(50),
    new_monthly_token_limit BIGINT,
    note TEXT,
    changed_by VARCHAR(100) DEFAULT 'monitor'
);
CREATE INDEX IF NOT EXISTS idx_tier_change_logs_user_changed_at
    ON tier_change_logs(user_id, changed_at DESC);
