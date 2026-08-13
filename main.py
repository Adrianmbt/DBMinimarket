from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import engine, Base, get_db, SessionLocal, habilitar_columnas
from services.bcv import fetch_and_update_bcv_rate, refresh_bcv_in_background, should_refresh_bcv, DEFAULT_RATE
from models import ExchangeRate, User
from security import hash_password
from schemas import ExchangeRateResponse
from routers import productos, ventas, compras, usuarios, dashboard, categorias, mantenimiento, creditos
from config import CORS_ORIGINS
from frontend_static import montar_frontend


class SecurityHeaders:
    """Agrega cabeceras de seguridad básicas a todas las respuestas HTTP.

    Implementado como middleware ASGI puro para no envolver el stream de la
    respuesta (necesario para las descargas de PDF sin bufferizar)."""

    _EXTRA_HEADERS = [
        (b"X-Content-Type-Options", b"nosniff"),
        (b"X-Frame-Options", b"DENY"),
        (b"Referrer-Policy", b"no-referrer"),
        # CSP permitido: misma origen + estilos/fuentes de Google + datos (logo).
        (b"Content-Security-Policy", (
            b"default-src 'self'; "
            b"script-src 'self'; "
            b"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            b"font-src 'self' https://fonts.gstatic.com; "
            b"img-src 'self' data:; "
            b"connect-src 'self'; "
            b"object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
        )),
    ]

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = message.get("headers", []) + self._EXTRA_HEADERS
                message = dict(message, headers=headers)
            await send(message)

        await self.app(scope, receive, send_wrapper)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crear las tablas en SQLite al iniciar.
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        habilitar_columnas(db)
        # Primer arranque: si no hay usuarios, crear el administrador inicial
        # (admin / admin123) para poder ingresar en una instalación limpia.
        if db.query(User).count() == 0:
            db.add(User(
                username="admin",
                password=hash_password("admin123"),
                full_name="Administrador",
                role="admin",
            ))
        db.commit()
    print("Iniciando sistema... Tasa BCV se actualizará en segundo plano.")
    # No bloqueamos el arranque con la API externa: la actualización corre en un hilo.
    refresh_bcv_in_background()
    yield


app = FastAPI(title="Minimarket API Venezolana", lifespan=lifespan)

# Configuración de CORS (en producción define MINIMARKET_ORIGINS con las URLs reales)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cabeceras de seguridad a todas las respuestas.
app.add_middleware(SecurityHeaders)


@app.get("/api/tasa", response_model=ExchangeRateResponse)
def get_tasa(db: Session = Depends(get_db)):
    """Devuelve la tasa guardada localmente. Refresca en segundo plano como
    máximo cada BCV_REFRESH_INTERVAL_SECONDS (no en cada petición)."""
    if should_refresh_bcv():
        refresh_bcv_in_background()

    tasa_local = db.query(ExchangeRate).filter(ExchangeRate.currency == "USD").first()
    if tasa_local and tasa_local.rate:
        return tasa_local

    # No hay tasa local: fuerza la actualización de forma síncrona (primera vez).
    tasa = fetch_and_update_bcv_rate(db)
    return ExchangeRateResponse(
        currency=tasa.currency,
        rate=tasa.rate or DEFAULT_RATE,
        updated_at=tasa.updated_at,
    )


@app.post("/api/tasa/actualizar", response_model=ExchangeRateResponse)
def force_update_tasa(db: Session = Depends(get_db)):
    """Botón manual de 'Actualizar Tasa' en el frontend."""
    tasa = fetch_and_update_bcv_rate(db)
    return ExchangeRateResponse(
        currency=tasa.currency,
        rate=tasa.rate or DEFAULT_RATE,
        updated_at=tasa.updated_at,
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(categorias.router)
app.include_router(productos.router)
app.include_router(ventas.router)
app.include_router(compras.router)
app.include_router(usuarios.router)
app.include_router(dashboard.router)
app.include_router(mantenimiento.router)
app.include_router(creditos.router)

# Servir la interfaz compilada (frontend/dist) cuando exista. Si está en modo
# solo API (sin build), esto no hace nada.
montar_frontend(app)