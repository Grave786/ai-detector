from datetime import datetime
import os
from pathlib import Path

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, MongoClient

from backend.crypto import hash_password


def _load_env_file() -> None:
    env_path = Path(".env")
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_env_file()

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError(
        "MONGO_URI environment variable is required. "
        "Set it in your shell or create a .env file in project root."
    )

MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "ai_checker")

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
db = client[MONGO_DB_NAME]

users_collection = db["users"]
scan_logs_collection = db["scan_logs"]


def ensure_collections_and_indexes() -> None:
    users_collection.create_index([("email", ASCENDING)], unique=True)
    scan_logs_collection.create_index([("uid", ASCENDING), ("timestamp", DESCENDING)])


def ensure_default_admin() -> None:
    admin_email = os.getenv("DEFAULT_ADMIN_EMAIL")
    admin_password = os.getenv("DEFAULT_ADMIN_PASSWORD")

    if not admin_email or not admin_password:
        return

    existing = users_collection.find_one({"email": admin_email.lower()})
    if existing:
        return

    users_collection.insert_one(
        {
            "email": admin_email.lower(),
            "password_hash": hash_password(admin_password),
            "tokens": 999999,
            "role": "admin",
            "created_at": datetime.utcnow(),
        }
    )


def get_user_by_id(user_id: str):
    try:
        oid = ObjectId(user_id)
    except Exception:
        return None
    return users_collection.find_one({"_id": oid})
