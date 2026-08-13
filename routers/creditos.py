from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from datetime import datetime, timezone, timedelta, date
from database import get_db
from models import CuentaCredito, Sale, SaleDetail
from schemas import CuentaCreditoResponse, CreditoResumen
from security import get_current_user, requiere_admin

router = APIRouter(prefix="/api/creditos", tags=["Crédito"])


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("/resumen", response_model=CreditoResumen)
def resumen_credito(
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Resumen de cuentas por cobrar: totales pendientes y pagados."""
    requiere_admin(user)

    pendientes = db.query(CuentaCredito).filter(CuentaCredito.status == "pendiente").all()
    pagadas = db.query(CuentaCredito).filter(CuentaCredito.status == "pagado").all()

    monto_pend_usd = sum(c.total_usd for c in pendientes)
    monto_pend_bs = sum(c.total_bs for c in pendientes)
    monto_pag_usd = sum(c.total_usd for c in pagadas)
    monto_pag_bs = sum(c.total_bs for c in pagadas)

    return CreditoResumen(
        total_pendiente=len(pendientes),
        total_pagado=len(pagadas),
        monto_pendiente_usd=round(monto_pend_usd, 2),
        monto_pendiente_bs=round(monto_pend_bs, 2),
        monto_pagado_usd=round(monto_pag_usd, 2),
        monto_pagado_bs=round(monto_pag_bs, 2),
    )


@router.get("/proximas-vencer", response_model=list[CuentaCreditoResponse])
def cuentas_proximas_vencer(
    dias: int = Query(default=3, ge=1, le=30),
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Cuentas pendientes que vencen dentro de los próximos N días (default 3)."""
    requiere_admin(user)
    hoy = date.today()
    limite = hoy + timedelta(days=dias)

    cuentas = db.query(CuentaCredito).options(
        selectinload(CuentaCredito.sale).selectinload(Sale.details).selectinload(SaleDetail.product)
    ).filter(
        CuentaCredito.status == "pendiente",
        CuentaCredito.due_date != None,
        CuentaCredito.due_date <= limite,
        CuentaCredito.due_date >= hoy,
    ).order_by(CuentaCredito.due_date.asc()).all()

    return cuentas


@router.get("", response_model=list[CuentaCreditoResponse])
def listar_cuentas(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Lista cuentas por cobrar. Opcionalmente filtra por status (pendiente|pagado)."""
    requiere_admin(user)

    q = db.query(CuentaCredito).options(
        selectinload(CuentaCredito.sale).selectinload(Sale.details).selectinload(SaleDetail.product)
    )
    if status:
        q = q.filter(CuentaCredito.status == status)
    return q.order_by(CuentaCredito.created_at.desc()).all()


@router.get("/{cuenta_id}", response_model=CuentaCreditoResponse)
def obtener_cuenta(
    cuenta_id: int,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Detalle de una cuenta por cobrar con su venta asociada."""
    requiere_admin(user)

    cuenta = db.query(CuentaCredito).options(
        selectinload(CuentaCredito.sale).selectinload(Sale.details).selectinload(SaleDetail.product)
    ).filter(CuentaCredito.id == cuenta_id).first()
    if not cuenta:
        raise HTTPException(404, "Cuenta por cobrar no encontrada")
    return cuenta


@router.post("/{cuenta_id}/pagar", response_model=CuentaCreditoResponse)
def marcar_pagada(
    cuenta_id: int,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Marca una cuenta por cobrar como pagada."""
    requiere_admin(user)

    cuenta = db.query(CuentaCredito).filter(CuentaCredito.id == cuenta_id).first()
    if not cuenta:
        raise HTTPException(404, "Cuenta por cobrar no encontrada")
    if cuenta.status == "pagado":
        raise HTTPException(400, "Esta cuenta ya fue marcada como pagada")

    cuenta.status = "pagado"
    cuenta.paid_at = _utcnow()
    db.commit()
    db.refresh(cuenta)

    # Recargar con relaciones para la respuesta
    cuenta = db.query(CuentaCredito).options(
        selectinload(CuentaCredito.sale).selectinload(Sale.details).selectinload(SaleDetail.product)
    ).filter(CuentaCredito.id == cuenta_id).first()
    return cuenta


@router.post("/marcar-notificadas")
def marcar_notificadas(
    cuenta_ids: list[int],
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Marca cuentas como notificadas (ya se les envió alerta de vencimiento)."""
    requiere_admin(user)
    db.query(CuentaCredito).filter(CuentaCredito.id.in_(cuenta_ids)).update(
        {CuentaCredito.notified: True}, synchronize_session="fetch"
    )
    db.commit()
    return {"ok": True, "marcadas": len(cuenta_ids)}
