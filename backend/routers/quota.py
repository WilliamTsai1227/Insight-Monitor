from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database.postgresql import get_db
from services import quota as quota_svc

router = APIRouter(prefix="/api/quota", tags=["Quota"])


class ResetRequest(BaseModel):
    note: str | None = None


@router.get("/user/{user_id}")
async def get_quota(
    user_id: UUID,
    db: asyncpg.Connection = Depends(get_db),
):
    await quota_svc.ensure_quota_reset_table(db)
    info = await quota_svc.get_user_quota_info(db, user_id)
    if not info:
        raise HTTPException(status_code=404, detail="User not found")
    return info


@router.post("/user/{user_id}/reset")
async def reset_quota(
    user_id: UUID,
    body: ResetRequest | None = None,
    db: asyncpg.Connection = Depends(get_db),
):
    await quota_svc.ensure_quota_reset_table(db)
    try:
        return await quota_svc.reset_user_quota(
            db, user_id, note=body.note if body else None
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
