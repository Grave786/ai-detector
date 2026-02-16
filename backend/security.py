import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt

from backend.mongo import get_user_by_id, users_collection

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-secret-key")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
AUTH_DISABLED = os.getenv("AUTH_DISABLED", "true").strip().lower() in {"1", "true", "yes", "on"}


def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "role": role, "exp": expire}
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


def _get_fallback_user():
    admin_user = users_collection.find_one({"role": "admin"})
    if admin_user:
        return admin_user

    any_user = users_collection.find_one({})
    if any_user:
        return any_user

    raise HTTPException(status_code=503, detail="No users available")


def get_current_user(
    request: Request,
):
    if request.method == "OPTIONS":
        return None

    if AUTH_DISABLED:
        return _get_fallback_user()

    authorization: Optional[str] = request.headers.get("authorization")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Token")

    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid Token")

    user_id = payload.get("sub")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User Not Found")

    return user


def require_admin_user(current_user=Depends(get_current_user)):
    if AUTH_DISABLED:
        return current_user

    if not current_user or current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
