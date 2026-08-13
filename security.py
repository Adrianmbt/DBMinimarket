from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from database import get_db
from models import User

bearer_scheme = HTTPBearer(auto_error=False)

# ==========================================
# CONTRASEÑAS (bcrypt)
# ==========================================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ==========================================
# JWT
# ==========================================
def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role or "vendedor",
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _extract_token(
    credentials: Optional[HTTPAuthorizationCredentials],
    authorization: Optional[str],
    x_access_token: Optional[str],
) -> str:
    """Extrae el token aceptando varios formatos para máxima compatibilidad:
    - 'Authorization: Bearer <token>'
    - 'Authorization: <token>' (sin prefijo)
    - 'X-Access-Token: <token>'
    """
    if credentials is not None and credentials.credentials:
        return credentials.credentials
    if authorization:
        value = authorization.strip()
        if value.lower().startswith("bearer "):
            value = value[7:].strip()
        if value:
            return value
    if x_access_token:
        return x_access_token
    return ""


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    authorization: Optional[str] = Header(default=None),
    x_access_token: Optional[str] = Header(default=None, alias="X-Access-Token"),
    db: Session = Depends(get_db),
) -> User:
    token = _extract_token(credentials, authorization, x_access_token)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autenticado: se requiere un token (Authorization: Bearer <token>)")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión expirada, vuelve a iniciar sesión")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido")

    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no encontrado")
    return user


def requiere_admin(usuario: User):
    """Rechaza la petición si el usuario autenticado no es administrador."""
    if (usuario.role or "vendedor") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acción restringida al administrador")