import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent


def _load_env_files() -> None:
    """載入 backend/.env；若存在專案根 .env 則覆寫。"""
    backend_env = BACKEND_DIR / ".env"
    root_env = PROJECT_ROOT / ".env"

    if backend_env.is_file():
        load_dotenv(backend_env, override=False)
    if root_env.is_file():
        load_dotenv(root_env, override=True)


_load_env_files()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password123@localhost:5432/Insight",
)
DATABASE_SSL = os.getenv("DATABASE_SSL", "")

QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY") or None

MONITOR_PORT = int(os.getenv("MONITOR_PORT", "8001"))

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:8080,http://localhost:8001",
    ).split(",")
    if origin.strip()
]
