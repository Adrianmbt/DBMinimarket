from fastapi import APIRouter, Depends, HTTPException, Request
from hashlib import sha256
from sqlalchemy.orm import Session
from database import get_db
from models import User
from schemas import UserCreate, UserUpdate, UserResponse, UserDeleteResponse, LoginRequest, LoginResponse
from security import hash_password, check_password, create_access_token, get_current_user, requiere_admin
from services.rate_limit import login_throttle
from config import LOGIN_MAX_ATTEMPTS

router = APIRouter(prefix="/api/usuarios", tags=["Usuarios"])


def _password_matches(user, password: str, db: Session) -> bool:
    if check_password(password, user.password):
        return True
    # Migración de contraseñas legacy guardadas con sha256 (versión previa)
    legacy = sha256(password.encode()).hexdigest()
    if legacy == user.password:
        user.password = hash_password(password)
        db.commit()
        return True
    return False


def _count_admins(db: Session) -> int:
    return db.query(User).filter(User.role == "admin").count()


def _proteger_ultimo_admin(db: Session, objetivo: User, nuevo_rol: str | None = None):
    """Evita quitar/eliminar el rol admin cuando es el último administrador."""
    if (objetivo.role or "vendedor") == "admin" and _count_admins(db) <= 1 and (nuevo_rol or "admin") != "admin":
        raise HTTPException(400, "No puedes quitar el rol de administrador al último admin del sistema")


@router.get("", response_model=list[UserResponse])
def listar_usuarios(db: Session = Depends(get_db), usuario: User = Depends(get_current_user)):
    requiere_admin(usuario)
    return db.query(User).order_by(User.id.asc()).all()


@router.get("/{id}", response_model=UserResponse)
def obtener_usuario(id: int, db: Session = Depends(get_db), usuario: User = Depends(get_current_user)):
    requiere_admin(usuario)
    objetivo = db.get(User, id)
    if not objetivo:
        raise HTTPException(404, "Usuario no encontrado")
    return objetivo


@router.post("", response_model=UserResponse)
def crear_usuario(user: UserCreate, db: Session = Depends(get_db), usuario: User = Depends(get_current_user)):
    requiere_admin(usuario)
    existe = db.query(User).filter(User.username == user.username).first()
    if existe:
        raise HTTPException(400, "El usuario ya existe")
    db_user = User(
        username=user.username,
        password=hash_password(user.password),
        full_name=user.full_name,
        role=user.role,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.put("/{id}", response_model=UserResponse)
def actualizar_usuario(
    id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    objetivo = db.get(User, id)
    if not objetivo:
        raise HTTPException(404, "Usuario no encontrado")

    if data.username and data.username != objetivo.username:
        duplicado = db.query(User).filter(User.username == data.username, User.id != id).first()
        if duplicado:
            raise HTTPException(400, "El nombre de usuario ya existe")
        objetivo.username = data.username

    if data.full_name is not None:
        objetivo.full_name = data.full_name

    if data.role is not None and data.role != (objetivo.role or "vendedor"):
        _proteger_ultimo_admin(db, objetivo, data.role)
        objetivo.role = data.role

    if data.password:
        objetivo.password = hash_password(data.password)

    db.commit()
    db.refresh(objetivo)
    return objetivo


@router.delete("/{id}", response_model=UserDeleteResponse)
def eliminar_usuario(id: int, db: Session = Depends(get_db), usuario: User = Depends(get_current_user)):
    requiere_admin(usuario)
    if usuario.id == id:
        raise HTTPException(400, "No puedes eliminar tu propio usuario")
    objetivo = db.get(User, id)
    if not objetivo:
        raise HTTPException(404, "Usuario no encontrado")
    _proteger_ultimo_admin(db, objetivo)
    db.delete(objetivo)
    db.commit()
    return UserDeleteResponse(ok=True, message="Usuario eliminado")


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"

    # Anti fuerza bruta: se bloquea tras muchos intentos fallidos por usuario+IP.
    if not login_throttle.check(ip, data.username):
        raise HTTPException(429, f"Demasiados intentos fallidos. Intenta de nuevo en unos minutos (max {LOGIN_MAX_ATTEMPTS}).")

    user = db.query(User).filter(User.username == data.username).first()
    if not user or not _password_matches(user, data.password, db):
        login_throttle.record_failure(ip, data.username)
        return LoginResponse(ok=False, message="Usuario o contraseña incorrectos")

    login_throttle.reset(ip, data.username)
    token = create_access_token(user)
    return LoginResponse(
        ok=True,
        message="Inicio de sesión exitoso",
        user=UserResponse.model_validate(user),
        token=token,
    )
