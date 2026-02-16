import base64
import hashlib
import hmac
import os

PBKDF2_ITERATIONS = 390000
PBKDF2_SALT_SIZE = 16
ALGO_NAME = "pbkdf2_sha256"


def hash_password(password: str) -> str:
    salt = os.urandom(PBKDF2_SALT_SIZE)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    salt_b64 = base64.b64encode(salt).decode("ascii")
    digest_b64 = base64.b64encode(digest).decode("ascii")
    return f"{ALGO_NAME}${PBKDF2_ITERATIONS}${salt_b64}${digest_b64}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algo, iter_str, salt_b64, digest_b64 = password_hash.split("$", 3)
        if algo != ALGO_NAME:
            return False
        iterations = int(iter_str)
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(digest_b64.encode("ascii"))
    except Exception:
        return False

    actual = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(actual, expected)
