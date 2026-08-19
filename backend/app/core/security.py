from typing import Optional
from datetime import datetime, timedelta, timezone
import hmac

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import httpx

from app.core.config import settings

security = HTTPBearer(auto_error=False)

CLERK_JWKS_CACHE: Optional[dict] = None

SIMPLE_TOKEN_EXPIRES = 60 * 60 * 24  # 24 hours


def create_simple_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(seconds=SIMPLE_TOKEN_EXPIRES),
    }
    return jwt.encode(payload, settings.AUTH_SECRET, algorithm="HS256")


def verify_simple_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.AUTH_SECRET, algorithms=["HS256"])
        user_id = payload.get("sub")
        return user_id if user_id else None
    except jwt.InvalidTokenError:
        return None


async def get_clerk_jwks() -> dict:
    global CLERK_JWKS_CACHE
    if CLERK_JWKS_CACHE is None:
        if not settings.CLERK_ISSUER:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Clerk not configured",
            )
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{settings.CLERK_ISSUER}/.well-known/jwks.json")
            response.raise_for_status()
            CLERK_JWKS_CACHE = response.json()
    return CLERK_JWKS_CACHE


async def verify_clerk_token(token: str) -> dict:
    jwks = await get_clerk_jwks()
    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            audience=settings.CLERK_PUBLISHABLE_KEY,
            issuer=settings.CLERK_ISSUER,
        )
        return payload
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    if credentials:
        user_id = verify_simple_token(credentials.credentials)
        if user_id:
            return user_id
        if not settings.CLERK_SECRET_KEY:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            payload = await verify_clerk_token(credentials.credentials)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
            )
        return user_id

    if settings.ENVIRONMENT == "development":
        return "dev-user"
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


class CurrentUser:
    def __init__(self, user_id: str):
        self.user_id = user_id

    @property
    def is_authenticated(self) -> bool:
        return bool(self.user_id)


async def get_current_user(
    user_id: str = Depends(get_current_user_id),
) -> CurrentUser:
    return CurrentUser(user_id)