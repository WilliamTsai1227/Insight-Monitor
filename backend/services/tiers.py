"""訂閱方案：列表、新增，以及變更使用者方案（寫入 tier_change_logs）。

Stock-Insight-Chat 每次請求都即時 JOIN subscription_tiers 取 monthly_token_limit，
因此變更 users.tier_id 會立即生效；used_tokens 不會被動到。
"""

from typing import Any
from uuid import UUID

import asyncpg

ENSURE_TABLE_SQL = """
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
"""

# 與 Stock-Insight-Chat usage_quota.DEFAULT_FALLBACK_MONTHLY_LIMIT 一致（tier_id 為 NULL 時）
DEFAULT_FALLBACK_MONTHLY_LIMIT = 200_000


class TierError(ValueError):
    """業務錯誤；status_code 供 router 轉成 HTTP 回應。"""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


async def ensure_tier_change_table(db: asyncpg.Connection) -> None:
    await db.execute(ENSURE_TABLE_SQL)


async def list_tiers(db: asyncpg.Connection) -> list[dict[str, Any]]:
    rows = await db.fetch(
        """
        SELECT st.id, st.name, st.monthly_token_limit, st.max_projects,
               st.features, st.created_at,
               (SELECT COUNT(*) FROM users u WHERE u.tier_id = st.id) AS user_count
        FROM subscription_tiers st
        ORDER BY st.monthly_token_limit ASC, st.name ASC
        """
    )
    return [_serialize(r) for r in rows]


async def create_tier(
    db: asyncpg.Connection,
    *,
    name: str,
    monthly_token_limit: int,
    max_projects: int,
) -> dict[str, Any]:
    try:
        row = await db.fetchrow(
            """
            INSERT INTO subscription_tiers (name, monthly_token_limit, max_projects)
            VALUES ($1, $2, $3)
            RETURNING id, name, monthly_token_limit, max_projects, features, created_at
            """,
            name,
            monthly_token_limit,
            max_projects,
        )
    except asyncpg.UniqueViolationError:
        raise TierError(f"方案名稱已存在：{name}", status_code=409)
    data = _serialize(row)
    data["user_count"] = 0
    return data


async def change_user_tier(
    db: asyncpg.Connection,
    user_id: UUID,
    tier_id: UUID,
    *,
    note: str | None = None,
) -> dict[str, Any]:
    async with db.transaction():
        user = await db.fetchrow(
            """
            SELECT u.id, u.email, u.username, u.tier_id,
                   st.name AS tier_name, st.monthly_token_limit
            FROM users u
            LEFT JOIN subscription_tiers st ON st.id = u.tier_id
            WHERE u.id = $1
            FOR UPDATE OF u
            """,
            user_id,
        )
        if not user:
            raise TierError("User not found", status_code=404)

        tier = await db.fetchrow(
            "SELECT id, name, monthly_token_limit FROM subscription_tiers WHERE id = $1",
            tier_id,
        )
        if not tier:
            raise TierError("Tier not found", status_code=404)

        if user["tier_id"] == tier["id"]:
            raise TierError(f"使用者已是 {tier['name']} 方案", status_code=409)

        prev_limit = (
            user["monthly_token_limit"]
            if user["tier_id"] is not None
            else DEFAULT_FALLBACK_MONTHLY_LIMIT
        )

        await db.execute(
            "UPDATE users SET tier_id = $2, updated_at = NOW() WHERE id = $1",
            user_id,
            tier_id,
        )
        await db.execute(
            """
            INSERT INTO tier_change_logs (
                user_id, previous_tier_id, previous_tier_name, previous_monthly_token_limit,
                new_tier_id, new_tier_name, new_monthly_token_limit, note
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
            user_id,
            user["tier_id"],
            user["tier_name"],
            prev_limit,
            tier["id"],
            tier["name"],
            tier["monthly_token_limit"],
            note,
        )

    return {
        "user_id": str(user_id),
        "email": user["email"],
        "username": user["username"],
        "previous_tier_name": user["tier_name"],
        "previous_monthly_token_limit": int(prev_limit),
        "new_tier_name": tier["name"],
        "new_monthly_token_limit": int(tier["monthly_token_limit"]),
        "message": f"方案已變更為 {tier['name']}；當期已用量未變動。",
    }


async def list_tier_changes(
    db: asyncpg.Connection,
    user_id: UUID,
    limit: int = 50,
) -> list[dict[str, Any]]:
    rows = await db.fetch(
        """
        SELECT id, changed_at, previous_tier_name, previous_monthly_token_limit,
               new_tier_name, new_monthly_token_limit, note, changed_by
        FROM tier_change_logs
        WHERE user_id = $1
        ORDER BY changed_at DESC
        LIMIT $2
        """,
        user_id,
        limit,
    )
    return [_serialize(r) for r in rows]


def _serialize(row: asyncpg.Record | None) -> dict | None:
    if row is None:
        return None
    result: dict[str, Any] = {}
    for key, val in dict(row).items():
        if isinstance(val, UUID):
            result[key] = str(val)
        elif hasattr(val, "isoformat"):
            result[key] = val.isoformat()
        elif isinstance(val, (dict, list)):
            result[key] = val
        else:
            result[key] = float(val) if hasattr(val, "as_tuple") else val
    return result
