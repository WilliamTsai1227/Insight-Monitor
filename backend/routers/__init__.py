from fastapi import APIRouter

from routers import conversations, errors, feedback, logs, qdrant, quota, tokens, users

api_router = APIRouter()
api_router.include_router(users.router)
api_router.include_router(conversations.router)
api_router.include_router(tokens.router)
api_router.include_router(quota.router)
api_router.include_router(feedback.router)
api_router.include_router(errors.router)
api_router.include_router(logs.router)
api_router.include_router(qdrant.router)
