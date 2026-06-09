from fastapi import APIRouter, HTTPException

from services import qdrant as qdrant_svc

router = APIRouter(prefix="/api/qdrant", tags=["Qdrant"])


@router.get("/collections")
async def list_collections():
    try:
        return {"items": await qdrant_svc.list_collections()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Qdrant unavailable: {e}")


@router.get("/collections/{name}")
async def collection_detail(name: str):
    try:
        detail = await qdrant_svc.get_collection_detail(name)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Qdrant unavailable: {e}")
    if not detail:
        raise HTTPException(status_code=404, detail="Collection not found")
    return detail
