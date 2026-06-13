import json
from typing import Any
from uuid import UUID

import asyncpg

VALID_STATUSES = frozenset({"new", "reviewed", "in_progress", "resolved", "closed"})
VALID_CATEGORIES = frozenset({"feature", "bug", "other", "ux", "billing"})

CATEGORY_LABELS = {
    "feature": "許願功能",
    "bug": "BUG 回報",
    "other": "其他",
    "ux": "使用體驗",
    "billing": "方案與計費",
}

STATUS_LABELS = {
    "new": "新回饋",
    "reviewed": "已閱讀",
    "in_progress": "處理中",
    "resolved": "已解決",
    "closed": "已關閉",
}


async def list_feedback(
    db: asyncpg.Connection,
    *,
    status: str | None = None,
    category: str | None = None,
    user_id: UUID | None = None,
    q: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    offset = (page - 1) * limit
    conditions: list[str] = []
    params: list[Any] = []
    idx = 1

    if status:
        conditions.append(f"f.status = ${idx}")
        params.append(status)
        idx += 1

    if category:
        conditions.append(f"f.category = ${idx}")
        params.append(category)
        idx += 1

    if user_id:
        conditions.append(f"f.user_id = ${idx}")
        params.append(user_id)
        idx += 1

    if q:
        conditions.append(f"f.message ILIKE ${idx}")
        params.append(f"%{q}%")
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    total = await db.fetchval(
        f"SELECT COUNT(*) FROM user_feedback f {where}",
        *params,
    )

    rows = await db.fetch(
        f"""
        SELECT
            f.id, f.user_id, f.category, f.message, f.page_url,
            f.status, f.created_at, f.updated_at,
            u.email, u.username
        FROM user_feedback f
        JOIN users u ON u.id = f.user_id
        {where}
        ORDER BY f.created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *params,
        limit,
        offset,
    )

    summary_rows = await db.fetch(
        """
        SELECT status, COUNT(*) AS count
        FROM user_feedback
        GROUP BY status
        ORDER BY count DESC
        """
    )

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "status_summary": [_serialize(r) for r in summary_rows],
        "items": [_serialize_feedback_row(r) for r in rows],
    }


async def get_feedback_detail(
    db: asyncpg.Connection,
    feedback_id: UUID,
) -> dict | None:
    row = await db.fetchrow(
        """
        SELECT
            f.id, f.user_id, f.category, f.message, f.page_url,
            f.user_agent, f.context, f.status,
            f.created_at, f.updated_at,
            u.email, u.username, u.status AS user_status
        FROM user_feedback f
        JOIN users u ON u.id = f.user_id
        WHERE f.id = $1
        """,
        feedback_id,
    )
    if not row:
        return None
    return _serialize_feedback_row(row, include_detail=True)


async def update_feedback_status(
    db: asyncpg.Connection,
    feedback_id: UUID,
    status: str,
) -> dict | None:
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid status: {status}")

    row = await db.fetchrow(
        """
        UPDATE user_feedback
        SET status = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING id, status, updated_at
        """,
        feedback_id,
        status,
    )
    if not row:
        return None
    return _serialize(row)


def _serialize_feedback_row(
    row: asyncpg.Record,
    *,
    include_detail: bool = False,
) -> dict:
    data = _serialize(row)
    if data is None:
        return {}

    ctx = data.get("context")
    if isinstance(ctx, str):
        try:
            data["context"] = json.loads(ctx)
        except json.JSONDecodeError:
            pass

    data["category_label"] = CATEGORY_LABELS.get(data.get("category", ""), data.get("category"))
    data["status_label"] = STATUS_LABELS.get(data.get("status", ""), data.get("status"))

    if not include_detail:
        data.pop("user_agent", None)
        data.pop("context", None)

    return data


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
