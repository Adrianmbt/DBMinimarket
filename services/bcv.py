import threading
import time
import requests
from sqlalchemy.orm import Session
from database import SessionLocal
from models import ExchangeRate
from datetime import datetime, timezone

BCV_API_URL = "https://ve.dolarapi.com/v1/dolares/oficial"

DEFAULT_RATE = 730.00

# Timeout corto para no bloquear el arranque ni las peticiones.
BCV_TIMEOUT = 4

# No consultar la API externa más de una vez cada N segundos.
BCV_REFRESH_INTERVAL_SECONDS = 30 * 60

_refresh_lock = threading.Lock()
_last_refresh_ts = 0.0


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fetch_rate() -> float | None:
    """Consulta la API externa y devuelve el USD oficial (o None si falla)."""
    try:
        response = requests.get(BCV_API_URL, timeout=BCV_TIMEOUT)
        if response.status_code == 200:
            data = response.json()
            # La API devuelve {"moneda": "USD", "fuente": "oficial", "promedio": 732.48, ...}
            return float(data.get("promedio"))
    except Exception as e:
        print(f"Error al extraer la tasa del BCV: {e}")
    return None


def fetch_and_update_bcv_rate(db: Session):
    """Consulta la API externa y guarda la tasa USD en la BD (usa la sesión dada)."""
    bcv_rate = _fetch_rate()

    db_rate = db.query(ExchangeRate).filter(ExchangeRate.currency == "USD").first()
    if db_rate is None:
        db_rate = ExchangeRate(currency="USD", rate=bcv_rate or DEFAULT_RATE)
        db.add(db_rate)

    if bcv_rate is not None:
        db_rate.rate = bcv_rate
    db_rate.updated_at = _utcnow()

    try:
        db.commit()
        db.refresh(db_rate)
    except Exception as db_err:
        db.rollback()
        db_rate = db.query(ExchangeRate).filter(ExchangeRate.currency == "USD").first()
        print(f"Error al guardar la tasa en la BD: {db_err}")
        if db_rate is None:
            db_rate = ExchangeRate(currency="USD", rate=DEFAULT_RATE, updated_at=_utcnow())

    return db_rate


def refresh_bcv_in_background():
    """Actualiza la tasa en un hilo separado para no bloquear el arranque.

    Cada proceso abre su propia sesión de BD (la de la petición ya se cerró).
    """
    def _worker():
        with SessionLocal() as db:
            try:
                fetch_and_update_bcv_rate(db)
            except Exception as e:
                print(f"Error actualizando la tasa BCV en segundo plano: {e}")

    threading.Thread(target=_worker, daemon=True).start()


def should_refresh_bcv() -> bool:
    """True solo si han pasado al menos BCV_REFRESH_INTERVAL_SECONDS desde el último refresh.

    Evita golpear la API externa en cada petición a /api/tasa.
    """
    global _last_refresh_ts
    with _refresh_lock:
        now = time.monotonic()
        if now - _last_refresh_ts >= BCV_REFRESH_INTERVAL_SECONDS:
            _last_refresh_ts = now
            return True
        return False
