from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database.postgresql import get_db
from services import feedback as feedback_svc

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])


class UpdateStatusRequest(BaseModel):
    status: str


@router.get("")
async def list_feedback(
    status: str | None = Query(None),
    category: str | None = Query(None),
    user_id: UUID | None = Query(None),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: asyncpg.Connection = Depends(get_db),
):
    try:
        return await feedback_svc.list_feedback(
            db,
            status=status,
            category=category,
            user_id=user_id,
            q=q,
            page=page,
            limit=limit,
        )
    except asyncpg.UndefinedTableError:
        raise HTTPException(
            status_code=503,
            detail="user_feedback 表尚未建立，請先套用 Stock-Insight-Chat V007 migration",
        )


@router.get("/{feedback_id}")
async def get_feedback(
    feedback_id: UUID,
    db: asyncpg.Connection = Depends(get_db),
):
    try:
        detail = await feedback_svc.get_feedback_detail(db, feedback_id)
    except asyncpg.UndefinedTableError:
        raise HTTPException(status_code=503, detail="user_feedback 表尚未建立")
    if not detail:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return detail


@router.patch("/{feedback_id}/status")
async def update_status(
    feedback_id: UUID,
    body: UpdateStatusRequest,
    db: asyncpg.Connection = Depends(get_db),
):
    try:
        result = await feedback_svc.update_feedback_status(
            db, feedback_id, body.status
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except asyncpg.UndefinedTableError:
        raise HTTPException(status_code=503, detail="user_feedback 表尚未建立")
    if not result:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return result
