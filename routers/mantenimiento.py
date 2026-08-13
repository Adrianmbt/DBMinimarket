from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Category,
    Product,
    Sale,
    SaleDetail,
    Purchase,
    PurchaseDetail,
    StockBaja,
    CierreDiario,
    ExchangeRate,
)
from security import get_current_user, requiere_admin

router = APIRouter(prefix="/api/admin", tags=["Mantenimiento"])

# Clave provisional para el test del sistema frente al cliente.
# Vive SOLO en el código: no se guarda en la base de datos ni en archivos.
LIMPIAR_DATOS_CLAVE = "19674244"


class LimpiarDatosRequest(BaseModel):
    clave: str


@router.post("/limpiar-datos")
def limpiar_datos(
    body: LimpiarDatosRequest,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Borra todos los datos operativos (ventas, compras, inventario, cierres,
    tasas) conservando las categorías y los usuarios. Requiere rol admin + clave."""
    requiere_admin(user)
    if body.clave != LIMPIAR_DATOS_CLAVE:
        raise HTTPException(403, "Clave incorrecta")

    # Orden respeta las claves foráneas: hijos antes que los padres.
    # Se conservan las categorías (Category) para que no haya que
    # recrearlas a mano tras limpiar los datos.
    tablas = [
        SaleDetail, PurchaseDetail, StockBaja, Sale, Purchase,
        CierreDiario, Product, ExchangeRate,
    ]
    eliminados = {}
    for modelo in tablas:
        eliminados[modelo.__tablename__] = db.query(modelo).delete()

    # Reinicia los contadores autoincrementales de las tablas vaciadas.
    try:
        nombres = ", ".join(f"'{m.__tablename__}'" for m in tablas)
        db.execute(text(f"DELETE FROM sqlite_sequence WHERE name IN ({nombres})"))
    except Exception:
        pass

    db.commit()
    return {
        "ok": True,
        "mensaje": "Base de datos limpiada correctamente (las categorías y los usuarios se conservan).",
        "eliminados": eliminados,
    }