from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query

from database.postgresql import get_db
from services import tokens as tokens_svc

router = APIRouter(prefix="/api/tokens", tags=["Tokens"])


@router.get("/summary")
async def overall_summary(db: asyncpg.Connection = Depends(get_db)):
    by_model = await tokens_svc.get_by_model(db)
    by_caller = await tokens_svc.get_by_caller(db)
    overall = await tokens_svc.get_overall_summary(db)
    return {
        "overall": overall,
        "by_model": by_model,
        "by_caller": by_caller,
    }


@router.get("/by-user")
async def by_user(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: asyncpg.Connection = Depends(get_db),
):
    return await tokens_svc.get_by_user(db, page=page, limit=limit)


@router.get("/user/{user_id}")
async def user_tokens(
    user_id: UUID,
    db: asyncpg.Connection = Depends(get_db),
):
    return await tokens_svc.get_user_tokens(db, user_id)
