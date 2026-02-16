from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from backend.crypto import hash_password
from backend.mongo import scan_logs_collection, users_collection
from backend.security import require_admin_user

admin_router = APIRouter(prefix="/admin", tags=["Admin Panel"])


class CreateUserRequest(BaseModel):
    email: str
    password: str
    tokens: int


class UpdateTokensRequest(BaseModel):
    tokens: int


@admin_router.post("/create-user")
def create_user(data: CreateUserRequest, _admin=Depends(require_admin_user)):
    email = data.email.strip().lower()

    if data.tokens < 0:
        raise HTTPException(status_code=400, detail="Tokens must be >= 0")

    try:
        result = users_collection.insert_one(
            {
                "email": email,
                "password_hash": hash_password(data.password),
                "tokens": data.tokens,
                "role": "user",
                "created_at": datetime.utcnow(),
            }
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already exists")

    return {
        "message": "User created successfully",
        "id": str(result.inserted_id),
        "tokens": data.tokens,
    }


@admin_router.get("/users")
def list_users(_admin=Depends(require_admin_user)):
    users = users_collection.find({"role": {"$ne": "admin"}}).sort("email", 1)
    return [
        {
            "id": str(u["_id"]),
            "email": u.get("email"),
            "tokens": u.get("tokens", 0),
            "role": u.get("role", "user"),
        }
        for u in users
    ]


@admin_router.patch("/users/{user_id}/tokens")
def update_tokens(user_id: str, data: UpdateTokensRequest, _admin=Depends(require_admin_user)):
    if data.tokens < 0:
        raise HTTPException(status_code=400, detail="Tokens must be >= 0")

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    result = users_collection.update_one(
        {"_id": oid, "role": {"$ne": "admin"}},
        {"$set": {"tokens": data.tokens}},
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"message": "Tokens updated"}


@admin_router.delete("/users/{user_id}")
def delete_user(user_id: str, _admin=Depends(require_admin_user)):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    result = users_collection.delete_one({"_id": oid, "role": {"$ne": "admin"}})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    scan_logs_collection.delete_many({"uid": user_id})
    return {"message": "User deleted"}


@admin_router.get("/users/{user_id}/logs")
def get_user_logs(user_id: str, _admin=Depends(require_admin_user)):
    logs = scan_logs_collection.find({"uid": user_id}).sort("timestamp", -1)

    return [
        {
            "id": str(log["_id"]),
            "scanned_text": log.get("scanned_text", ""),
            "result": log.get("result"),
            "ai_percent": log.get("ai_percent", 0),
            "human_percent": log.get("human_percent", 0),
            "timestamp": log.get("timestamp").isoformat() if log.get("timestamp") else None,
        }
        for log in logs
    ]
