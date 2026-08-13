from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from collections import OrderedDict
from datetime import datetime, timedelta
from database import get_db
from models import Product, Sale, SaleDetail, ExchangeRate, CierreDiario, CuentaCredito
from services.bcv import DEFAULT_RATE
from services.pdf import generar_pdf_cierre, generar_pdf_factura, BS_METHODS
from schemas import (
    SaleCreate, SaleResponse, CierreStatus, ReporteResumen, MetodoResumen, CierreResponse,
)
from security import get_current_user

router = APIRouter(prefix="/api/ventas", tags=["Ventas"])

# Impuestos (Venezuela). Los precios ya incluyen estos impuestos; solo se desglosan.
IVA_RATE = 0.16
IGTF_RATE = 0.03
# IGTF se aplica únicamente a pagos recibidos en moneda internacional en efectivo.
IGTF_METHODS = {"Dólares Efectivo"}


def _desglose_impuestos(total: float, payment_method: str | None):
    """Dado el total final (impuestos incluidos), deriva base, IVA e IGTF.

    Base = total / (1 + IVA + IGTF); el IGTF solo aplica a métodos marcados.
    Verificación: base + iva + igtf == total.
    """
    igtf = IGTF_RATE if (payment_method or "") in IGTF_METHODS else 0.0
    if total <= 0:
        return 0.0, 0.0, 0.0
    factor = 1 + IVA_RATE + igtf
    base = total / factor
    iva = base * IVA_RATE
    gtf = base * igtf
    return round(base, 2), round(iva, 2), round(gtf, 2)


def _parse_fecha(fecha: str | None) -> object:
    """Convierte una fecha YYYY-MM-DD a date; por defecto el día local de hoy."""
    if fecha:
        try:
            return datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(422, "Fecha inválida. Usa el formato YYYY-MM-DD.")
    return datetime.now().date()


def _default_rate(db: Session) -> float:
    db_rate = db.query(ExchangeRate).filter(ExchangeRate.currency == "USD").first()
    return db_rate.rate if db_rate and db_rate.rate else DEFAULT_RATE


def _ventas_de(db: Session, dia) -> list[Sale]:
    """Ventas de un día (fecha local), ordenadas cronológicamente."""
    return db.query(Sale).options(
        selectinload(Sale.details).selectinload(SaleDetail.product)
    ).filter(
        func.date(Sale.created_at) == dia
    ).order_by(Sale.created_at.asc()).all()


def _resumen_fecha(db: Session, dia):
    """Devuelve (ventas, total_usd, total_bs, metodos, total_iva, total_igtf)
    de un día, igual al reporte Z."""
    ventas = _ventas_de(db, dia)
    taux = _default_rate(db)
    total_usd = 0.0
    total_bs = 0.0
    total_iva = 0.0
    total_igtf = 0.0
    metodos = OrderedDict()
    for v in ventas:
        m = v.payment_method or "Sin método"
        g = metodos.setdefault(m, {"n": 0, "usd": 0.0, "bs": 0.0})
        g["n"] += 1
        g["usd"] += v.total or 0.0
        total_usd += v.total or 0.0
        total_iva += v.iva_amount or 0.0
        total_igtf += v.igtf_amount or 0.0
        rate = v.rate_usd or taux or 1.0
        if m in BS_METHODS:
            bs = (v.total or 0.0) * rate
            g["bs"] += bs
            total_bs += bs
    return ventas, total_usd, total_bs, metodos, round(total_iva, 2), round(total_igtf, 2)


def _cierre_response(cierre) -> CierreResponse | None:
    if not cierre:
        return None
    return CierreResponse(
        id=cierre.id,
        fecha=cierre.fecha.isoformat(),
        total_usd=cierre.total_usd,
        total_bs=cierre.total_bs,
        total_ventas=cierre.total_ventas,
        cerrado_por=cierre.cerrado_por,
        created_at=cierre.created_at,
    )


@router.get("/cierre/estado", response_model=CierreStatus)
def estado_cierre(db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    """Estado de la caja de hoy: ¿ya se hizo el cierre Z? ¿cuánto lleva vendido?"""
    dia = datetime.now().date()
    cierre = db.query(CierreDiario).filter(CierreDiario.fecha == dia).first()
    _, total_usd, total_bs, metodos, _, _ = _resumen_fecha(db, dia)
    n = sum(g["n"] for g in metodos.values())
    return CierreStatus(
        fecha=dia.isoformat(),
        cerrado=cierre is not None,
        cierre=_cierre_response(cierre),
        total_ventas_hoy=int(n),
        total_usd_hoy=round(total_usd, 2),
        total_bs_hoy=round(total_bs, 2),
    )


@router.get("/resumen", response_model=ReporteResumen)
def resumen_dia(fecha: str | None = None, db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    """Resumen estilo reporte Z de un día específico (listado + desglose por método)."""
    dia = _parse_fecha(fecha)
    _, total_usd, total_bs, metodos, total_iva, total_igtf = _resumen_fecha(db, dia)
    cierre = db.query(CierreDiario).filter(CierreDiario.fecha == dia).first()
    return ReporteResumen(
        fecha=dia.isoformat(),
        total_ventas=int(sum(g["n"] for g in metodos.values())),
        total_usd=round(total_usd, 2),
        total_bs=round(total_bs, 2),
        total_iva_usd=total_iva,
        total_igtf_usd=total_igtf,
        cerrado=cierre is not None,
        cierre=_cierre_response(cierre),
        metodos=[
            MetodoResumen(metodo=m, n=int(g["n"]), usd=round(g["usd"], 2), bs=round(g["bs"], 2))
            for m, g in metodos.items()
        ],
    )


@router.post("/cierre")
def realizar_cierre(
    fecha: str | None = None,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Realiza el cierre Z de un día (por defecto hoy).

    Genera el PDF del reporte Z y registra el cierre en la base de datos.
    Una vez cerrado, NO se permiten más ventas para esa fecha.
    """
    dia = _parse_fecha(fecha)
    existente = db.query(CierreDiario).filter(CierreDiario.fecha == dia).first()
    if existente:
        raise HTTPException(409, f"La caja del {dia.isoformat()} ya fue cerrada. No se permiten más ventas para ese día.")

    ventas, total_usd, total_bs, metodos, total_iva, total_igtf = _resumen_fecha(db, dia)
    n_ventas = int(sum(g["n"] for g in metodos.values()))

    cierre = CierreDiario(
        fecha=dia,
        total_usd=round(total_usd, 2),
        total_bs=round(total_bs, 2),
        total_iva_usd=total_iva,
        total_igtf_usd=total_igtf,
        total_ventas=n_ventas,
        cerrado_por=user.full_name or user.username,
    )
    db.add(cierre)
    db.commit()

    buf = generar_pdf_cierre(ventas, dia, _default_rate(db))
    filename = f"reporte_z_{dia.strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/cierre/pdf")
def descargar_reporte_z(
    fecha: str | None = None,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Re-descarga el reporte Z (cierre diario de caja) del día indicado (YYYY-MM-DD)."""
    dia = _parse_fecha(fecha)
    ventas = _ventas_de(db, dia)

    buf = generar_pdf_cierre(ventas, dia, _default_rate(db))
    filename = f"reporte_z_{dia.strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("", response_model=list[SaleResponse])
def listar_ventas(
    fecha: str | None = None,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Lista ventas. Con ?fecha=YYYY-MM-DD filtra las de ese día."""
    q = db.query(Sale).options(
        selectinload(Sale.details).selectinload(SaleDetail.product)
    )
    if fecha:
        dia = _parse_fecha(fecha)
        q = q.filter(func.date(Sale.created_at) == dia)
    return q.order_by(Sale.created_at.desc()).all()


@router.get("/{id}", response_model=SaleResponse)
def obtener_venta(id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    venta = db.query(Sale).options(
        selectinload(Sale.details).selectinload(SaleDetail.product)
    ).filter(Sale.id == id).first()
    if not venta:
        raise HTTPException(404, "Venta no encontrada")
    return venta


@router.get("/{id}/factura")
def descargar_factura_venta(
    id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Genera la factura PDF de una venta con el desglose de IVA 16% e IGTF."""
    venta = db.query(Sale).options(
        selectinload(Sale.details).selectinload(SaleDetail.product)
    ).filter(Sale.id == id).first()
    if not venta:
        raise HTTPException(404, "Venta no encontrada")

    buf = generar_pdf_factura(venta, _default_rate(db))
    filename = f"factura_{id}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=SaleResponse)
def crear_venta(
    venta_data: SaleCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    dia = datetime.now().date()
    if db.query(CierreDiario).filter(CierreDiario.fecha == dia).first():
        raise HTTPException(
            409,
            f"La caja del {dia.isoformat()} ya fue cerrada con el Reporte Z. "
            "No se permiten más ventas hasta mañana.",
        )

    detalles = []
    total = 0.0

    for item in venta_data.items:
        producto = db.get(Product, item.product_id)
        if not producto:
            raise HTTPException(404, f"Producto {item.product_id} no encontrado")
        if producto.stock is None or producto.stock < item.quantity:
            raise HTTPException(400, f"Stock insuficiente para {producto.name}")

        if producto.sale_unit == "peso":
            # quantity viene en gramos y sale_price es por kilogramo
            subtotal = producto.sale_price * (item.quantity / 1000.0)
        else:
            subtotal = producto.sale_price * item.quantity

        total += subtotal

        detalles.append(SaleDetail(
            product_id=item.product_id,
            quantity=item.quantity,
            price_at_sale=producto.sale_price,
            cost_price=producto.cost_price,
        ))

        producto.stock -= item.quantity

    # Tasa BCV vigente para convertir a bolívares y registrar el cobro.
    db_rate = db.query(ExchangeRate).filter(ExchangeRate.currency == "USD").first()
    rate = db_rate.rate if db_rate and db_rate.rate else DEFAULT_RATE
    currency = (venta_data.currency or "USD").upper()

    is_credit = venta_data.is_credit

    # Venta a crédito: solo admin puede crear. No se valida cobro.
    if is_credit:
        if not venta_data.client_name or not venta_data.client_name.strip():
            raise HTTPException(400, "El nombre del cliente es obligatorio para ventas a crédito")
        received_bs = 0.0
        received_usd = 0.0
        change_bs = None
        change_usd = None
    else:
        received_bs = venta_data.received_bs or 0.0
        received_usd = venta_data.received_usd or 0.0

        # Validamos el cobro y calculamos el cambio (en la moneda del método).
        change_bs = venta_data.change_bs
        change_usd = venta_data.change_usd
        if currency == "BS":
            if received_usd > 0 or received_bs > 0:
                expected_bs = total * rate
                received_total_bs = received_bs + received_usd * rate
                if received_total_bs < expected_bs - 0.005:
                    raise HTTPException(400, "El monto recibido es menor al total a cobrar")
                change_bs = round(received_total_bs - expected_bs, 2)
        else:
            if received_usd > 0 or received_bs > 0:
                expected_usd = total
                received_total_usd = received_usd + received_bs / rate
                if received_total_usd < expected_usd - 0.005:
                    raise HTTPException(400, "El monto recibido es menor al total a cobrar")
                change_usd = round(received_total_usd - expected_usd, 2)

    venta = Sale(
        total=total,
        base_amount=_desglose_impuestos(total, venta_data.payment_method)[0],
        iva_amount=_desglose_impuestos(total, venta_data.payment_method)[1],
        igtf_amount=_desglose_impuestos(total, venta_data.payment_method)[2],
        payment_method=venta_data.payment_method,
        client_name=venta_data.client_name,
        reference=venta_data.reference,
        rate_usd=rate,
        received_bs=received_bs if received_bs else None,
        received_usd=received_usd if received_usd else None,
        change_bs=change_bs,
        change_usd=change_usd,
        is_credit=is_credit,
        details=detalles,
    )
    db.add(venta)
    db.flush()  # Para obtener el venta.id antes de crear la cuenta

    # Crear cuenta por cobrar si es venta a crédito
    if is_credit:
        total_bs_calc = total * rate
        days = venta_data.days_term if venta_data.days_term in (7, 10, 15) else 15
        due = datetime.now().date() + timedelta(days=days)
        cuenta = CuentaCredito(
            sale_id=venta.id,
            client_name=venta_data.client_name.strip(),
            total_usd=round(total, 2),
            total_bs=round(total_bs_calc, 2),
            currency=currency,
            rate_usd=rate,
            status="pendiente",
            notes=venta_data.reference,
            days_term=days,
            due_date=due,
            notified=False,
        )
        db.add(cuenta)
        db.flush()
        venta.cuenta_id = cuenta.id

    db.commit()
    db.refresh(venta)
    return venta