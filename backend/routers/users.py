from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query

from database.postgresql import get_db
from services import users as users_svc

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("")
async def list_users(
    search: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: asyncpg.Connection = Depends(get_db),
):
    return await users_svc.list_users(
        db, search=search, status=status, page=page, limit=limit
    )


@router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    db: asyncpg.Connection = Depends(get_db),
):
    detail = await users_svc.get_user_detail(db, user_id)
    if not detail:
        raise HTTPException(status_code=404, detail="User not found")
    return detail
