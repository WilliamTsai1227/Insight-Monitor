import json
from typing import Any
from uuid import UUID

import asyncpg


def _extract_trace(metadata: dict | None) -> dict[str, Any]:
    """從 messages.metadata 解析 tool calls 與 query rewrite。"""
    if not metadata or not isinstance(metadata, dict):
        return {"steps": [], "tool_calls": [], "query_rewrites": [], "error": None}

    steps = metadata.get("steps") or []
    tool_calls: list[dict] = []
    query_rewrites: list[dict] = []

    for step in steps:
        if not isinstance(step, dict):
            continue
        node = step.get("node", "unknown")
        for tc in step.get("tool_calls") or []:
            if isinstance(tc, dict):
                tool_calls.append({
                    "node": node,
                    "name": tc.get("name"),
                    "query": tc.get("query"),
                    "start_date": tc.get("start_date"),
                    "end_date": tc.get("end_date"),
                    "raw_args": tc.get("raw_args"),
                })

        extras = step.get("extras") or {}
        for key in ("flash_query_rewrite", "general_query_rewrite"):
            rewrite = extras.get(key)
            if isinstance(rewrite, dict):
                query_rewrites.append({
                    "node": node,
                    "type": key,
                    "pattern": rewrite.get("pattern"),
                    "rewritten_query": rewrite.get("rewritten_query"),
                    "original_query": rewrite.get("original_query"),
                })

    return {
        "steps": steps,
        "tool_calls": tool_calls,
        "query_rewrites": query_rewrites,
        "error": metadata.get("error"),
        "response_mode": metadata.get("response_mode"),
        "total_execution_time": metadata.get("total_execution_time"),
    }


async def list_chat_logs(
    db: asyncpg.Connection,
    *,
    user_id: UUID | None = None,
    chat_id: UUID | None = None,
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    offset = (page - 1) * limit
    conditions = ["m.role = 'assistant'", "m.metadata IS NOT NULL"]
    params: list[Any] = []
    idx = 1

    if user_id:
        conditions.append(f"c.user_id = ${idx}")
        params.append(user_id)
        idx += 1

    if chat_id:
        conditions.append(f"m.chat_id = ${idx}")
        params.append(chat_id)
        idx += 1

    where = " AND ".join(conditions)

    total = await db.fetchval(
        f"""
        SELECT COUNT(*)
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        WHERE {where}
        """,
        *params,
    )

    rows = await db.fetch(
        f"""
        SELECT
            m.id AS message_id, m.chat_id, m.content,
            m.metadata, m.created_at,
            c.title AS chat_title, c.user_id,
            u.email, u.username
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        JOIN users u ON u.id = c.user_id
        WHERE {where}
        ORDER BY m.created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *params,
        limit,
        offset,
    )

    items = []
    for row in rows:
        data = _serialize(row)
        meta = data.pop("metadata", None)
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except json.JSONDecodeError:
                meta = None
        trace = _extract_trace(meta)
        data["trace"] = trace
        data["tool_count"] = len(trace["tool_calls"])
        data["rewrite_count"] = len(trace["query_rewrites"])
        items.append(data)

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": items,
    }


async def get_log_detail(
    db: asyncpg.Connection,
    message_id: UUID,
) -> dict | None:
    row = await db.fetchrow(
        """
        SELECT
            m.id AS message_id, m.chat_id, m.parent_id,
            m.role, m.content, m.tokens, m.context_refs,
            m.metadata, m.created_at,
            c.title AS chat_title, c.user_id,
            u.email, u.username
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        JOIN users u ON u.id = c.user_id
        WHERE m.id = $1
        """,
        message_id,
    )
    if not row:
        return None

    data = _serialize(row)
    for field in ("tokens", "context_refs", "metadata"):
        val = data.get(field)
        if isinstance(val, str):
            try:
                data[field] = json.loads(val)
            except json.JSONDecodeError:
                pass

    meta = data.get("metadata")
    data["trace"] = _extract_trace(meta if isinstance(meta, dict) else None)

    token_logs = await db.fetch(
        """
        SELECT id, caller, model_name, prompt_tokens, completion_tokens,
               total_tokens, cost_usd, created_at
        FROM token_usage_logs
        WHERE message_id = $1
        ORDER BY created_at ASC
        """,
        message_id,
    )
    data["token_logs"] = [_serialize(r) for r in token_logs]

    return data


def _serialize(row: asyncpg.Record) -> dict:
    result: dict[str, Any] = {}
    for key, val in dict(row).items():
        if isinstance(val, UUID):
            result[key] = str(val)
        elif hasattr(val, "isoformat"):
            result[key] = val.isoformat()
        else:
            result[key] = float(val) if hasattr(val, "as_tuple") else val
    return result
