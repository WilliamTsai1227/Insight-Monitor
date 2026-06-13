# Insight-Monitor

Insight 基礎設施監控平台 — 監控 [Stock-Insight-Chat](../Stock-Insight-Chat) 的 PostgreSQL 與 Qdrant。

與主產品分離的獨立專案，共用相同的 `.env` 資料庫連線設定。

## 目錄

```
Insight-Monitor/
├── backend/     # FastAPI 監控 API
├── frontend/    # 純 HTML / CSS / JS Dashboard
└── deploy/      # Docker 部署
```

## 功能頁面

| 頁面 | 路徑 | 說明 |
|------|------|------|
| 總覽 | `/` | 系統概況、模型用量、Qdrant 摘要 |
| 使用者 | `/html/users.html` | 註冊使用者清單與詳細資訊 |
| 問答紀錄 | `/html/conversations.html` | 搜尋使用者問答、查看完整對話 |
| Token 用量 | `/html/tokens.html` | 各使用者/模型 Token 與花費 |
| 配額重置 | `/html/quota-reset.html` | 重置使用者當期配額，保留花費流水 |
| 使用者回饋 | `/html/feedback.html` | 檢視 `user_feedback` 完整回饋與工單狀態 |
| 系統報錯 | `/html/errors.html` | 依使用者分組與全部錯誤列表 |
| 聊天 Log | `/html/logs.html` | Tool 呼叫、Query Rewrite、關鍵字 |
| Qdrant | `/html/qdrant.html` | Collection 筆數與時間範圍 |

## 環境變數

在 `backend/.env` 設定連線資訊（可複製 `backend/.env.example`）：

```env
DATABASE_URL=postgresql://postgres:password123@localhost:5432/Insight
DATABASE_SSL=
QDRANT_HOST=localhost
QDRANT_PORT=6333
MONITOR_PORT=8001
```

與 Stock-Insight-Chat 使用相同變數名稱，可指向同一套 PostgreSQL / Qdrant。

## 配額重置（quota_reset_logs）

Monitor 與 Stock-Insight-Chat **共用同一 PostgreSQL**（`DATABASE_URL`）。配額重置相關表如下：

| 表 | 用途 | 重置時 |
|----|------|--------|
| `user_usage_quotas` | 當期配額計數（`used_tokens`、`current_period_start`） | **`used_tokens` 歸零**，`current_period_start` 更新為 NOW() |
| `token_usage_logs` | 永久 append-only 花費／用量流水 | **不動** |
| `quota_reset_logs` | 每次重置前的區間摘要 | **寫入一筆**紀錄 |

### Table Schema（`quota_reset_logs`）

定義於 [Stock-Insight-Chat `init_db.sql` §12-A](../Stock-Insight-Chat/app/backend/database/init_db.sql) 與 migration [`V006__quota_reset_logs.sql`](../Stock-Insight-Chat/app/backend/database/migrations/V006__quota_reset_logs.sql)：

```sql
CREATE TABLE IF NOT EXISTS quota_reset_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_period_start TIMESTAMPTZ,          -- 被結束的週期起點
    previous_used_tokens BIGINT NOT NULL DEFAULT 0,  -- 重置前配額計數
    period_total_tokens BIGINT,                 -- 該區間 token_usage_logs 加總
    period_total_cost_usd NUMERIC(10, 6),       -- 該區間花費加總
    note TEXT,                                  -- 可選備註
    reset_by VARCHAR(100) DEFAULT 'monitor'
);
CREATE INDEX IF NOT EXISTS idx_quota_reset_logs_user_reset_at
    ON quota_reset_logs(user_id, reset_at DESC);
```

### SQL 建置（既有 RDS／非 init_db 新庫）

在 psql 或任何 SQL 客戶端，對 **Insight 資料庫** 執行：

```bash
# 方式 A：執行 migration 檔
psql "$DATABASE_URL" -f ../Stock-Insight-Chat/app/backend/database/migrations/V006__quota_reset_logs.sql

# 方式 B：Monitor 首次呼叫配額 API 時也會 CREATE TABLE IF NOT EXISTS（backend/services/quota.py）
```

本專案亦有一份等價 SQL：`backend/database/migrations/V001__quota_reset_logs.sql`。

### 重置流程（Monitor 後端實作）

程式位置：`backend/services/quota.py` → `reset_user_quota()`；API：`POST /api/quota/user/{uuid}/reset`。

單一 transaction 內依序：

1. 若無 `user_usage_quotas` 列則補建（`ON CONFLICT DO NOTHING`）
2. `SELECT … FOR UPDATE` 讀取目前 `used_tokens`、`current_period_start`
3. 從 `token_usage_logs` 彙總該區間 `SUM(total_tokens)`、`SUM(cost_usd)`（`created_at >= previous_period_start AND created_at < NOW()`）
4. `INSERT INTO quota_reset_logs` 寫入區間摘要與備註
5. `UPDATE user_usage_quotas SET used_tokens = 0, current_period_start = NOW()`  
6. **不** `DELETE`／`UPDATE` `token_usage_logs`

### 手動重置 SQL（psql）

將 `YOUR_USER_UUID` 換成使用者 UUID（可在 Monitor「使用者」頁複製）：

```sql
BEGIN;

-- 確保有配額列
INSERT INTO user_usage_quotas (user_id, current_period_start, used_tokens)
VALUES (
    'YOUR_USER_UUID'::uuid,
    date_trunc('month', NOW() AT TIME ZONE 'UTC'),
    0
)
ON CONFLICT (user_id) DO NOTHING;

-- 鎖定並讀取目前配額
SELECT used_tokens, current_period_start
FROM user_usage_quotas
WHERE user_id = 'YOUR_USER_UUID'::uuid
FOR UPDATE;

-- 寫入重置紀錄（含該區間流水統計）
INSERT INTO quota_reset_logs (
    user_id,
    previous_period_start,
    previous_used_tokens,
    period_total_tokens,
    period_total_cost_usd,
    note,
    reset_by
)
SELECT
    q.user_id,
    q.current_period_start,
    q.used_tokens,
    COALESCE(SUM(t.total_tokens), 0),
    COALESCE(SUM(t.cost_usd), 0),
    'manual reset via psql',
    'psql'
FROM user_usage_quotas q
LEFT JOIN token_usage_logs t
    ON t.user_id = q.user_id
   AND t.created_at >= q.current_period_start
   AND t.created_at < NOW()
WHERE q.user_id = 'YOUR_USER_UUID'::uuid
GROUP BY q.user_id, q.current_period_start, q.used_tokens;

-- 歸零配額計數、開始新週期
UPDATE user_usage_quotas
SET
    used_tokens = 0,
    current_period_start = NOW(),
    updated_at = NOW()
WHERE user_id = 'YOUR_USER_UUID'::uuid;

COMMIT;
```

### 查詢各重置區間用量

```sql
-- 某使用者所有重置紀錄
SELECT
    reset_at,
    previous_period_start,
    previous_used_tokens,
    period_total_tokens,
    period_total_cost_usd,
    note
FROM quota_reset_logs
WHERE user_id = 'YOUR_USER_UUID'::uuid
ORDER BY reset_at DESC;

-- 當期（自 current_period_start 起）流水統計
SELECT
    SUM(total_tokens) AS total_tokens,
    SUM(cost_usd) AS total_cost_usd
FROM token_usage_logs
WHERE user_id = 'YOUR_USER_UUID'::uuid
  AND created_at >= (
      SELECT current_period_start FROM user_usage_quotas WHERE user_id = 'YOUR_USER_UUID'::uuid
  );

-- 累計花費（永不重置）
SELECT SUM(cost_usd) AS all_time_cost_usd
FROM token_usage_logs
WHERE user_id = 'YOUR_USER_UUID'::uuid;
```

### Monitor UI

- 頁面：`/html/quota-reset.html`（側欄「配額重置」）
- 可帶 query：`/html/quota-reset.html?user_id={uuid}`
- `GET /api/quota/user/{uuid}` — 配額狀態＋區間歷史
- `POST /api/quota/user/{uuid}/reset` — body 可選 `{ "note": "原因" }`

## 本機開發

```bash
cd Insight-Monitor/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 編輯 backend/.env 連線資訊
uvicorn app:app --host 0.0.0.0 --port 8001 --reload
```

開啟 http://localhost:8001

## Docker 部署

```bash
cd Insight-Monitor
cp backend/.env.example backend/.env   # 編輯連線資訊
docker compose -f deploy/docker-compose.yml up --build -d
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/health` | 健康檢查 |
| GET | `/api/users` | 使用者列表 |
| GET | `/api/users/{id}` | 使用者詳情 |
| GET | `/api/conversations/search` | 搜尋問答 |
| GET | `/api/conversations/user/{id}/chats` | 使用者對話列表 |
| GET | `/api/conversations/{chat_id}` | 對話訊息 |
| GET | `/api/tokens/summary` | Token 總覽 |
| GET | `/api/tokens/by-user` | 各使用者用量 |
| GET | `/api/tokens/user/{id}` | 單一使用者用量 |
| GET | `/api/quota/user/{id}` | 配額狀態與各區間用量 |
| POST | `/api/quota/user/{id}/reset` | 重置配額計數（保留花費流水） |
| GET | `/api/feedback` | 使用者回饋列表（可篩 status/category/user） |
| GET | `/api/feedback/{id}` | 回饋詳情（含 context、user_agent） |
| PATCH | `/api/feedback/{id}/status` | 更新工單狀態 |
| GET | `/api/errors/by-user` | 錯誤依使用者分組 |
| GET | `/api/errors/all` | 全部錯誤 |
| GET | `/api/logs` | 聊天 Log 列表 |
| GET | `/api/logs/{message_id}` | Log 詳情 |
| GET | `/api/qdrant/collections` | Qdrant 概覽 |
| GET | `/api/qdrant/collections/{name}` | Collection 詳情 |

## 監控對象

| 服務 | 狀態 |
|------|------|
| PostgreSQL | 已實作 |
| Qdrant | 已實作 |
| MongoDB | 待實作 |
