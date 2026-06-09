from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query

from database.postgresql import get_db
from services import errors as errors_svc

router = APIRouter(prefix="/api/errors", tags=["Errors"])


@router.get("/by-user")
async def errors_by_user(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: asyncpg.Connection = Depends(get_db),
):
    return await errors_svc.get_errors_by_user(db, page=page, limit=limit)


@router.get("/all")
async def all_errors(
    user_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: asyncpg.Connection = Depends(get_db),
):
    return await errors_svc.get_all_errors(
        db, user_id=user_id, page=page, limit=limit
    )
