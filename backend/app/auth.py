import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException

SECRET = os.getenv("JWT_SECRET") or secrets.token_hex(32)
EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+", re.ASCII)

def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return f"{salt}${digest}"

def password_matches(password, stored):
    return hmac.compare_digest(password_hash(password, stored.split("$", 1)[0]), stored)

def issue(subject):
    return jwt.encode({"sub": str(subject), "iss": "verdictra", "exp": datetime.now(timezone.utc)+timedelta(hours=12)},
                      SECRET, algorithm="HS256")

def identity(header):
    if not header:
        return None
    try:
        scheme, token = header.split(" ", 1)
        if scheme.lower() != "bearer":
            raise ValueError()
        return int(jwt.decode(token, SECRET, algorithms=["HS256"], issuer="verdictra", options={"require": ["exp", "sub"]})["sub"])
    except (ValueError, jwt.PyJWTError) as error:
        raise HTTPException(401, "Session expired or invalid. Sign in again.") from error
