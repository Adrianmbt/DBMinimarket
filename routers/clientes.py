from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Cliente, CuentaCredito
from schemas import ClienteCreate, ClienteUpdate, ClienteResponse
from security import get_current_user, requiere_admin
from textutils import normalize_name_key

router = APIRouter(prefix="/api/clientes", tags=["Clientes"])


def get_or_create_cliente(db: Session, nombre: str) -> Cliente | None:
    """Devuelve el cliente del directorio con ese nombre (normalizado), creándolo
    si no existe. Usado como respaldo cuando una venta a crédito envía solo el
    nombre en lugar de un cliente_id."""
    nombre = (nombre or "").strip()
    if not nombre:
        return None
    clave = normalize_name_key(nombre)
    cliente = db.query(Cliente).filter(Cliente.name_key == clave).first()
    if cliente:
        return cliente
    cliente = Cliente(name=nombre, name_key=clave)
    db.add(cliente)
    db.flush()
    return cliente


@router.get("", response_model=list[ClienteResponse])
def listar_clientes(
    q: str | None = Query(None, description="Búsqueda por nombre"),
    incluir_inactivos: bool = False,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Lista el directorio de clientes (solo administrador)."""
    requiere_admin(user)
    query = db.query(Cliente)
    if not incluir_inactivos:
        query = query.filter(Cliente.activo.is_(True))
    if q and q.strip():
        clave = normalize_name_key(q)
        query = query.filter(Cliente.name_key.like(f"%{clave}%"))
    return query.order_by(Cliente.name.asc()).all()


@router.post("", response_model=ClienteResponse, status_code=201)
def crear_cliente(
    data: ClienteCreate,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Crea un cliente en el directorio (solo administrador)."""
    requiere_admin(user)
    nombre = (data.name or "").strip()
    if not nombre:
        raise HTTPException(400, "El nombre del cliente es obligatorio")
    clave = normalize_name_key(nombre)
    if db.query(Cliente).filter(Cliente.name_key == clave).first():
        raise HTTPException(409, "Ya existe un cliente con ese nombre")
    cliente = Cliente(
        name=nombre,
        name_key=clave,
        phone=(data.phone or "").strip() or None,
        notes=(data.notes or "").strip() or None,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.put("/{cliente_id}", response_model=ClienteResponse)
def actualizar_cliente(
    cliente_id: int,
    data: ClienteUpdate,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Actualiza un cliente del directorio (solo administrador).

    Al renombrar, se propaga el nombre a las cuentas por cobrar y ventas
    a crédito asociadas para mantener todo consistente.
    """
    requiere_admin(user)
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")

    if data.name is not None:
        nombre = data.name.strip()
        if not nombre:
            raise HTTPException(400, "El nombre del cliente no puede quedar vacío")
        clave = normalize_name_key(nombre)
        dup = db.query(Cliente).filter(
            Cliente.name_key == clave, Cliente.id != cliente_id
        ).first()
        if dup:
            raise HTTPException(409, "Ya existe otro cliente con ese nombre")
        cliente.name = nombre
        cliente.name_key = clave
        for cuenta in db.query(CuentaCredito).filter(CuentaCredito.cliente_id == cliente_id).all():
            cuenta.client_name = nombre
            if cuenta.sale:
                cuenta.sale.client_name = nombre

    if data.phone is not None:
        cliente.phone = data.phone.strip() or None
    if data.notes is not None:
        cliente.notes = data.notes.strip() or None
    if data.activo is not None:
        cliente.activo = data.activo

    db.commit()
    db.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}")
def desactivar_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Desactiva (baja lógica) un cliente del directorio (solo administrador)."""
    requiere_admin(user)
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")
    cliente.activo = False
    db.commit()
    return {"ok": True, "message": f"Cliente '{cliente.name}' desactivado"}
