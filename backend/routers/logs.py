from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query

from database.postgresql import get_db
from services import logs as logs_svc

router = APIRouter(prefix="/api/logs", tags=["Logs"])


@router.get("")
async def list_logs(
    user_id: UUID | None = Query(None),
    chat_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: asyncpg.Connection = Depends(get_db),
):
    return await logs_svc.list_chat_logs(
        db, user_id=user_id, chat_id=chat_id, page=page, limit=limit
    )


@router.get("/{message_id}")
async def log_detail(
    message_id: UUID,
    db: asyncpg.Connection = Depends(get_db),
):
    detail = await logs_svc.get_log_detail(db, message_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Log not found")
    return detail
