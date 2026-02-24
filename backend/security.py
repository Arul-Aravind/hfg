from datetime import datetime, timedelta
from typing import Optional

from jose import jwt
from passlib.context import CryptContext

PWD_CONTEXT = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return PWD_CONTEXT.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return PWD_CONTEXT.verify(password, password_hash)


def create_access_token(subject: str, secret_key: str, expires_minutes: int = 480, extra: Optional[dict] = None) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, secret_key, algorithm=ALGORITHM)


def decode_token(token: str, secret_key: str) -> dict:
    return jwt.decode(token, secret_key, algorithms=[ALGORITHM])
