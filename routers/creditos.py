import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from datetime import datetime, timezone, timedelta, date
from database import get_db
from models import CuentaCredito, Sale, SaleDetail, Product, PagoCredito
from schemas import CuentaCreditoResponse, CreditoResumen, CuentaCreditoUpdate, PagarCuentaRequest
from security import get_current_user, requiere_admin
from routers.ventas import _validar_caja_abierta, _default_rate

router = APIRouter(prefix="/api/creditos", tags=["Crédito"])

# Métodos electrónicos en bolívares que exigen referencia bancaria
METODOS_ELECTRONICOS_BS = ("Punto", "Pago Móvil", "Transferencia", "Biopago")


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("/resumen", response_model=CreditoResumen)
def resumen_credito(
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Resumen de cuentas por cobrar: totales pendientes y cobrados."""
    requiere_admin(user)

    cuentas = db.query(CuentaCredito).options(
        selectinload(CuentaCredito.pagos)
    ).all()

    # Pendiente real: saldo descontando abonos, convertido a la tasa del día
    tasa = _default_rate(db) or 1.0
    pendientes = [c for c in cuentas if c.status == "pendiente"]
    pagadas = [c for c in cuentas if c.status == "pagado"]
    monto_pend_usd = sum(c.saldo_usd for c in pendientes)

    # Cobrado efectivo: la suma real de los cobros registrados (con su tasa del día)
    cobros = [p for c in cuentas for p in (c.pagos or [])]

    return CreditoResumen(
        total_pendiente=len(pendientes),
        total_pagado=len(pagadas),
        monto_pendiente_usd=round(monto_pend_usd, 2),
        monto_pendiente_bs=round(monto_pend_usd * tasa, 2),
        monto_pagado_usd=round(sum(p.monto_usd for p in cobros), 2),
        monto_pagado_bs=round(sum(p.monto_bs for p in cobros), 2),
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
        selectinload(CuentaCredito.sale).selectinload(Sale.details).selectinload(SaleDetail.product),
        selectinload(CuentaCredito.pagos),
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
        selectinload(CuentaCredito.sale).selectinload(Sale.details).selectinload(SaleDetail.product),
        selectinload(CuentaCredito.pagos),
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
        selectinload(CuentaCredito.sale).selectinload(Sale.details).selectinload(SaleDetail.product),
        selectinload(CuentaCredito.pagos),
    ).filter(CuentaCredito.id == cuenta_id).first()
    if not cuenta:
        raise HTTPException(404, "Cuenta por cobrar no encontrada")
    return cuenta


@router.post("/{cuenta_id}/pagar", response_model=CuentaCreditoResponse)
def registrar_cobro(
    cuenta_id: int,
    datos: PagarCuentaRequest,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Registra un cobro sobre una cuenta por cobrar (solo administrador).

    - Sin monto_usd: cobra el saldo completo y marca la cuenta como pagada.
    - Con monto_usd menor al saldo: abono parcial; la cuenta sigue pendiente
      hasta cubrir el total.
    - La tasa aplicada es la vigente el día del pago (no la de la venta).
    - Métodos electrónicos exigen referencia bancaria; en mixto ($ + Bs) los
      montos entregados deben cubrir el monto abonado.
    """
    requiere_admin(user)

    cuenta = db.query(CuentaCredito).options(
        selectinload(CuentaCredito.pagos),
        selectinload(CuentaCredito.sale).selectinload(Sale.details).selectinload(SaleDetail.product),
    ).filter(CuentaCredito.id == cuenta_id).first()
    if not cuenta:
        raise HTTPException(404, "Cuenta por cobrar no encontrada")
    if cuenta.status == "pagado":
        raise HTTPException(400, "Esta cuenta ya fue pagada")

    metodo = (datos.payment_method or "").strip()
    if not metodo:
        raise HTTPException(400, "Selecciona el método de pago con el que cancela el cliente")

    saldo = cuenta.saldo_usd or 0.0
    if saldo <= 0.005:
        raise HTTPException(400, "Esta cuenta ya fue pagada")

    # En mixto ($ + <método Bs>) la referencia se exige según el método en bolívares
    bs_metodo = None
    m_mixto = re.match(r"^Mixto \(\$ \+ (.+)\)$", metodo)
    if m_mixto:
        bs_metodo = m_mixto.group(1).strip()
    metodo_para_ref = bs_metodo or metodo
    referencia = (datos.reference or "").strip() or None
    if metodo_para_ref in METODOS_ELECTRONICOS_BS and not referencia:
        raise HTTPException(400, f"Ingresa la referencia bancaria del pago ({metodo_para_ref})")

    received_bs = datos.received_bs or 0.0
    received_usd = datos.received_usd or 0.0

    # Tasa BCV vigente el día del pago
    tasa = _default_rate(db)
    if tasa <= 0:
        raise HTTPException(503, "No hay tasa de cambio disponible. Actualiza la tasa.")

    monto = round(datos.monto_usd, 2) if datos.monto_usd is not None else saldo
    if monto <= 0:
        raise HTTPException(400, "El monto a abonar debe ser mayor a cero")
    if monto > saldo + 0.005:
        raise HTTPException(400, f"El abono (${monto}) excede el saldo pendiente (${saldo})")

    if m_mixto:
        if received_usd <= 0 and received_bs <= 0:
            raise HTTPException(400, "Indica los montos recibidos en $ y/o Bs")
        recibido = received_usd + received_bs / tasa
        if recibido < monto - 0.005:
            raise HTTPException(400, "Los montos recibidos no cubren el monto a abonar")

    pago = PagoCredito(
        cuenta_id=cuenta.id,
        monto_usd=monto,
        monto_bs=round(monto * tasa, 2),
        rate_usd=tasa,
        payment_method=metodo,
        reference=referencia,
        received_bs=received_bs or None,
        received_usd=received_usd or None,
        registrado_por=getattr(user, "username", None),
    )
    db.add(pago)

    nuevo_saldo = round(saldo - monto, 2)
    if nuevo_saldo <= 0.005:
        cuenta.status = "pagado"
        cuenta.paid_at = _utcnow()
    cuenta.payment_method = metodo
    cuenta.reference = referencia
    db.commit()

    # Recargar con relaciones para la respuesta
    return db.query(CuentaCredito).options(
        selectinload(CuentaCredito.pagos),
        selectinload(CuentaCredito.sale).selectinload(Sale.details).selectinload(SaleDetail.product),
    ).filter(CuentaCredito.id == cuenta_id).first()


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


@router.put("/{cuenta_id}", response_model=CuentaCreditoResponse)
def actualizar_cuenta(
    cuenta_id: int,
    data: CuentaCreditoUpdate,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Actualiza una cuenta por cobrar (solo administrador).

    Campos editables: cliente, plazo de pago (recalcula el vencimiento
    conservando la fecha ancla) y notas. El cliente y las notas se mantienen
    sincronizados con la venta a crédito asociada.
    """
    requiere_admin(user)

    cuenta = db.query(CuentaCredito).filter(CuentaCredito.id == cuenta_id).first()
    if not cuenta:
        raise HTTPException(404, "Cuenta por cobrar no encontrada")

    if data.client_name is not None:
        nombre = data.client_name.strip()
        if not nombre:
            raise HTTPException(400, "El nombre del cliente no puede quedar vacío")
        cuenta.client_name = nombre
        if cuenta.sale:
            cuenta.sale.client_name = nombre

    if data.days_term is not None and data.days_term != cuenta.days_term:
        # Recalcula el vencimiento conservando el ancla actual
        ancla = cuenta.due_date or cuenta.created_at.date()
        cuenta.due_date = ancla + timedelta(days=data.days_term - (cuenta.days_term or 0))
        cuenta.days_term = data.days_term

    if data.notes is not None:
        cuenta.notes = data.notes.strip() or None
        if cuenta.sale:
            cuenta.sale.reference = cuenta.notes

    db.commit()

    return db.query(CuentaCredito).options(
        selectinload(CuentaCredito.sale).selectinload(Sale.details).selectinload(SaleDetail.product),
        selectinload(CuentaCredito.pagos),
    ).filter(CuentaCredito.id == cuenta_id).first()


@router.delete("/{cuenta_id}")
def eliminar_cuenta(
    cuenta_id: int,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Elimina una cuenta por cobrar junto con su venta a crédito (solo administrador).

    Devuelve los productos de la venta al inventario. No se permite eliminar
    cuentas de días con caja cerrada (Reporte Z).
    """
    requiere_admin(user)

    cuenta = db.query(CuentaCredito).filter(CuentaCredito.id == cuenta_id).first()
    if not cuenta:
        raise HTTPException(404, "Cuenta por cobrar no encontrada")

    venta = db.query(Sale).options(
        selectinload(Sale.details)
    ).filter(Sale.id == cuenta.sale_id).first()

    if venta:
        _validar_caja_abierta(db, venta)
        for d in venta.details:
            prod = db.get(Product, d.product_id)
            if prod:
                prod.stock = (prod.stock or 0) + d.quantity
        venta.cuenta_id = None
        db.delete(venta)

    db.delete(cuenta)
    db.commit()
    return {"ok": True, "message": f"Cuenta #{cuenta_id} eliminada junto con su venta. Stock devuelto."}
