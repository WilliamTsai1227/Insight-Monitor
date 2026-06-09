from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query

from database.postgresql import get_db
from services import conversations as conv_svc

router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


@router.get("/search")
async def search_conversations(
    user_id: UUID | None = Query(None),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: asyncpg.Connection = Depends(get_db),
):
    return await conv_svc.search_conversations(
        db, user_id=user_id, q=q, page=page, limit=limit
    )


@router.get("/user/{user_id}/chats")
async def list_user_chats(
    user_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: asyncpg.Connection = Depends(get_db),
):
    return await conv_svc.list_user_chats(db, user_id, page=page, limit=limit)


@router.get("/{chat_id}")
async def get_chat(
    chat_id: UUID,
    db: asyncpg.Connection = Depends(get_db),
):
    result = await conv_svc.get_chat_messages(db, chat_id)
    if not result:
        raise HTTPException(status_code=404, detail="Chat not found")
    return result
