from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database.postgresql import get_db
from services import tiers as tiers_svc

router = APIRouter(tags=["Tiers"])

# JS Number.MAX_SAFE_INTEGER：前端顯示不失真，也遠低於 BIGINT 上限，避免累加溢位
MAX_TOKEN_LIMIT = 9_007_199_254_740_991


class CreateTierRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    monthly_token_limit: int = Field(..., ge=0, le=MAX_TOKEN_LIMIT)
    max_projects: int = Field(10, ge=0, le=2_147_483_647)


class ChangeTierRequest(BaseModel):
    tier_id: UUID
    note: str | None = None


@router.get("/api/tiers")
async def list_tiers(db: asyncpg.Connection = Depends(get_db)):
    return {"items": await tiers_svc.list_tiers(db)}


@router.post("/api/tiers", status_code=201)
async def create_tier(
    body: CreateTierRequest,
    db: asyncpg.Connection = Depends(get_db),
):
    try:
        return await tiers_svc.create_tier(
            db,
            name=body.name.strip(),
            monthly_token_limit=body.monthly_token_limit,
            max_projects=body.max_projects,
        )
    except tiers_svc.TierError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@router.get("/api/users/{user_id}/tier-changes")
async def list_tier_changes(
    user_id: UUID,
    db: asyncpg.Connection = Depends(get_db),
):
    await tiers_svc.ensure_tier_change_table(db)
    return {"items": await tiers_svc.list_tier_changes(db, user_id)}


@router.put("/api/users/{user_id}/tier")
async def change_user_tier(
    user_id: UUID,
    body: ChangeTierRequest,
    db: asyncpg.Connection = Depends(get_db),
):
    await tiers_svc.ensure_tier_change_table(db)
    try:
        return await tiers_svc.change_user_tier(
            db, user_id, body.tier_id, note=body.note
        )
    except tiers_svc.TierError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
