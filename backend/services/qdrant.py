from typing import Any

from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models

from config import QDRANT_API_KEY, QDRANT_HOST, QDRANT_PORT

DATE_PAYLOAD_KEYS = ("publishAt", "created_at", "timestamp", "date")


def _get_client() -> AsyncQdrantClient:
    kwargs: dict[str, Any] = {"host": QDRANT_HOST, "port": QDRANT_PORT}
    if QDRANT_API_KEY:
        kwargs["api_key"] = QDRANT_API_KEY
    return AsyncQdrantClient(**kwargs)


async def _find_date_range(
    client: AsyncQdrantClient,
    collection_name: str,
    date_key: str,
) -> dict[str, str | None]:
    earliest = None
    latest = None

    try:
        asc_result = await client.scroll(
            collection_name=collection_name,
            limit=1,
            order_by=models.OrderBy(key=date_key, direction=models.Direction.ASC),
            with_payload=[date_key],
        )
        points = asc_result[0]
        if points and points[0].payload:
            earliest = points[0].payload.get(date_key)

        desc_result = await client.scroll(
            collection_name=collection_name,
            limit=1,
            order_by=models.OrderBy(key=date_key, direction=models.Direction.DESC),
            with_payload=[date_key],
        )
        points = desc_result[0]
        if points and points[0].payload:
            latest = points[0].payload.get(date_key)
    except Exception:
        pass

    return {"earliest": _fmt_date(earliest), "latest": _fmt_date(latest)}


def _fmt_date(val: Any) -> str | None:
    if val is None:
        return None
    return str(val)


async def _detect_date_key(
    client: AsyncQdrantClient,
    collection_name: str,
) -> str | None:
    try:
        result = await client.scroll(
            collection_name=collection_name,
            limit=1,
            with_payload=True,
        )
        points = result[0]
        if not points:
            return None
        payload = points[0].payload or {}
        for key in DATE_PAYLOAD_KEYS:
            if key in payload:
                return key
    except Exception:
        pass
    return None


async def list_collections() -> list[dict[str, Any]]:
    client = _get_client()
    try:
        collections = await client.get_collections()
        results = []
        for col in collections.collections:
            info = await _get_collection_stats(client, col.name)
            results.append(info)
        return results
    finally:
        await client.close()


async def get_collection_detail(name: str) -> dict[str, Any] | None:
    client = _get_client()
    try:
        try:
            await client.get_collection(name)
        except Exception:
            return None
        return await _get_collection_stats(client, name)
    finally:
        await client.close()


async def _get_collection_stats(
    client: AsyncQdrantClient,
    name: str,
) -> dict[str, Any]:
    info = await client.get_collection(name)
    date_key = await _detect_date_key(client, name)
    date_range = {"earliest": None, "latest": None, "date_key": date_key}
    if date_key:
        date_range = await _find_date_range(client, name, date_key)
        date_range["date_key"] = date_key

    vectors_config = info.config.params.vectors
    vector_info: dict[str, Any] = {}
    if isinstance(vectors_config, dict):
        for vname, vcfg in vectors_config.items():
            vector_info[vname] = {
                "size": getattr(vcfg, "size", None),
                "distance": str(getattr(vcfg, "distance", "")),
            }
    elif vectors_config:
        vector_info["default"] = {
            "size": getattr(vectors_config, "size", None),
            "distance": str(getattr(vectors_config, "distance", "")),
        }

    sparse_vectors = getattr(info.config.params, "sparse_vectors", None) or {}
    sparse_info = list(sparse_vectors.keys()) if sparse_vectors else []

    payload_schema = {}
    if info.payload_schema:
        for field, schema in info.payload_schema.items():
            payload_schema[field] = str(getattr(schema, "data_type", schema))

    return {
        "name": name,
        "points_count": info.points_count or 0,
        "indexed_vectors_count": info.indexed_vectors_count or 0,
        "status": str(info.status),
        "vectors": vector_info,
        "sparse_vectors": sparse_info,
        "payload_schema": payload_schema,
        "earliest": date_range.get("earliest"),
        "latest": date_range.get("latest"),
        "date_key": date_range.get("date_key"),
    }
