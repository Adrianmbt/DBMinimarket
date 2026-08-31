from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from database import get_db
from models import Product, Sale, SaleDetail, ExchangeRate, CierreDiario, CuentaCredito
from services.bcv import DEFAULT_RATE
from services.pdf import generar_pdf_cierre, generar_pdf_factura, BS_METHODS
from schemas import (
    SaleCreate, SaleUpdate, SaleResponse, CierreStatus, ReporteResumen, MetodoResumen, CierreResponse,
)
from security import get_current_user, requiere_admin

router = APIRouter(prefix="/api/ventas", tags=["Ventas"])

# Impuestos (Venezuela). Los precios ya incluyen estos impuestos; solo se desglosan.
IVA_RATE = 0.16
IGTF_RATE = 0.03
# IGTF se aplica únicamente a pagos recibidos en moneda internacional en efectivo.
IGTF_METHODS = {"Dólares Efectivo"}


def _desglose_impuestos(total: float, payment_method: str | None, fraccion_usd: float = 0.0):
    """Dado el total final (impuestos incluidos), deriva base, IVA e IGTF.

    Base = total / (1 + IVA + IGTF); el IGTF solo aplica a métodos marcados.
    En pagos mixtos ($ efectivo + método en Bs) el IGTF aplica de forma
    proporcional a la porción pagada en dólares en efectivo (fraccion_usd).
    Verificación: base + iva + igtf == total.
    """
    metodo = payment_method or ""
    if metodo in IGTF_METHODS:
        igtf = IGTF_RATE
    elif metodo.startswith("Mixto"):
        igtf = IGTF_RATE * min(max(fraccion_usd, 0.0), 1.0)
    else:
        igtf = 0.0
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


def _validar_caja_abierta(db: Session, venta: Sale):
    """Bloquea modificar/eliminar una venta si la caja de su día ya fue cerrada (Reporte Z).

    Los timestamps se guardan en UTC; convertimos al día local para ubicar el cierre.
    """
    dia_local = venta.created_at.replace(tzinfo=timezone.utc).astimezone().date()
    if db.query(CierreDiario).filter(CierreDiario.fecha == dia_local).first():
        raise HTTPException(
            409,
            f"La caja del {dia_local.isoformat()} ya fue cerrada con el Reporte Z. "
            "No se puede modificar ni eliminar esta venta.",
        )


def _rango_dia_utc(dia):
    """Intervalo [inicio, fin) del día local `dia` expresado en UTC.

    Los timestamps se guardan en UTC (models.utcnow), pero el "día" del
    negocio es el local (Venezuela). Convertimos la medianoche local a UTC
    para que una venta de las 9:00 pm cuente en el día correcto.
    """
    inicio_local = datetime.combine(dia, datetime.min.time()).astimezone()
    fin_local = inicio_local + timedelta(days=1)
    return (
        inicio_local.astimezone(timezone.utc).replace(tzinfo=None),
        fin_local.astimezone(timezone.utc).replace(tzinfo=None),
    )


def _ventas_de(db: Session, dia) -> list[Sale]:
    """Ventas de un día (fecha local), ordenadas cronológicamente."""
    desde, hasta = _rango_dia_utc(dia)
    return db.query(Sale).options(
        selectinload(Sale.details).selectinload(SaleDetail.product)
    ).filter(
        Sale.created_at >= desde,
        Sale.created_at < hasta,
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
        if (v.payment_method or "").startswith("Mixto"):
            # Mixto ($ + Bs): a bolívares entra exactamente lo recibido en Bs.
            bs = v.received_bs or 0.0
            g["bs"] += bs
            total_bs += bs
        elif m in BS_METHODS:
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


@router.delete("/cierre")
def abrir_caja(
    fecha: str | None = None,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Reabre la caja de un día (por defecto hoy) eliminando su cierre Z.

    Pensado para recuperarse de un cierre accidental o de un fallo de fecha
    (p.ej. la caja quedó cerrada por cambio de fecha a medianoche). Requiere
    rol de administrador. Al eliminarse el cierre, las ventas que tuviera el
    día vuelven a contabilizarse dentro de ese mismo día (que queda abierto),
    y se sumarán al total del próximo cierre. Si el cierre era real, deberá
    rehacerse al final del día.
    """
    requiere_admin(user)
    dia = _parse_fecha(fecha)
    existente = db.query(CierreDiario).filter(CierreDiario.fecha == dia).first()
    if not existente:
        raise HTTPException(404, f"La caja del {dia.isoformat()} no está cerrada. No hay nada que abrir.")
    db.delete(existente)
    db.commit()
    return {"fecha": dia.isoformat(), "abierta": True}


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
        desde, hasta = _rango_dia_utc(dia)
        q = q.filter(Sale.created_at >= desde, Sale.created_at < hasta)
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

    # Desglose de impuestos. En pagos mixtos el IGTF aplica proporcional
    # a la porción cubierta con dólares en efectivo.
    fraccion_usd = (received_usd / total) if total > 0 else 0.0
    base_v, iva_v, igtf_v = _desglose_impuestos(total, venta_data.payment_method, fraccion_usd)

    venta = Sale(
        total=total,
        base_amount=base_v,
        iva_amount=iva_v,
        igtf_amount=igtf_v,
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
            # La deuda queda denominada en dólares: el método de pago se
            # define al cobrar, convirtiendo a Bs con la tasa de ese día.
            currency="USD",
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


def _cuenta_de(db: Session, venta: Sale) -> CuentaCredito | None:
    """Ubica la cuenta por cobrar asociada a una venta a crédito."""
    if venta.cuenta_id:
        cuenta = db.query(CuentaCredito).filter(CuentaCredito.id == venta.cuenta_id).first()
        if cuenta:
            return cuenta
    return db.query(CuentaCredito).filter(CuentaCredito.sale_id == venta.id).first()


@router.put("/{id}", response_model=SaleResponse)
def actualizar_venta(
    id: int,
    venta_data: SaleUpdate,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Actualiza una venta existente (solo administrador).

    Campos editables: método de pago, cliente, referencia e items.
    Si cambian los items, el stock original se devuelve al inventario y el
    nuevo detalle se valida y descuenta; total e impuestos se recalculan.
    En ventas a crédito también se actualiza su cuenta por cobrar.
    No se permite editar ventas de días con caja cerrada (Reporte Z).
    """
    requiere_admin(user)

    venta = db.query(Sale).options(
        selectinload(Sale.details).selectinload(SaleDetail.product)
    ).filter(Sale.id == id).first()
    if not venta:
        raise HTTPException(404, "Venta no encontrada")

    _validar_caja_abierta(db, venta)

    # ── Items: reemplazo del detalle (devuelve stock y vuelve a descontar) ──
    if venta_data.items is not None:
        for d in list(venta.details):
            prod = db.get(Product, d.product_id)
            if prod:
                prod.stock = (prod.stock or 0) + d.quantity
        db.flush()

        # Agregar cantidades por producto (un mismo producto no puede venir dos veces)
        cantidades: dict[int, int] = {}
        for item in venta_data.items:
            cantidades[item.product_id] = cantidades.get(item.product_id, 0) + item.quantity

        productos_nuevos: dict[int, Product] = {}
        for pid, qty in cantidades.items():
            prod = db.get(Product, pid)
            if not prod:
                raise HTTPException(404, f"Producto {pid} no encontrado")
            if prod.stock is None or prod.stock < qty:
                raise HTTPException(400, f"Stock insuficiente para {prod.name}")
            productos_nuevos[pid] = prod

        # Conservar el precio congelado de la venta original cuando el producto ya estaba
        precios_previos = {d.product_id: (d.price_at_sale, d.cost_price) for d in venta.details}
        nuevos_detalles = []
        total = 0.0
        for pid, qty in cantidades.items():
            prod = productos_nuevos[pid]
            precio, costo = precios_previos.get(pid, (prod.sale_price, prod.cost_price))
            if prod.sale_unit == "peso":
                subtotal = precio * (qty / 1000.0)
            else:
                subtotal = precio * qty
            total += subtotal
            nuevos_detalles.append(SaleDetail(
                product_id=pid,
                quantity=qty,
                price_at_sale=precio,
                cost_price=costo,
            ))
            prod.stock -= qty

        venta.details = nuevos_detalles
        venta.total = round(total, 2)

        # Mantener sincronizada la cuenta por cobrar de una venta a crédito
        if venta.is_credit:
            cuenta = _cuenta_de(db, venta)
            if cuenta:
                cuenta.total_usd = round(venta.total, 2)
                tasa = venta.rate_usd or _default_rate(db) or 1.0
                cuenta.total_bs = round(venta.total * tasa, 2)

    # ── Método de pago ──
    if venta_data.payment_method is not None:
        metodo = venta_data.payment_method.strip()
        if not metodo:
            raise HTTPException(400, "El método de pago no puede quedar vacío")
        if venta.is_credit and metodo != "Crédito":
            raise HTTPException(400, "Una venta a crédito no puede cambiar de método de pago")
        if not venta.is_credit and metodo == "Crédito":
            raise HTTPException(400, "Las ventas a crédito se registran desde el módulo de Créditos")
        venta.payment_method = metodo

    # ── Cliente ──
    if venta_data.client_name is not None:
        nombre = venta_data.client_name.strip() or None
        if venta.is_credit and not nombre:
            raise HTTPException(400, "El cliente es obligatorio en ventas a crédito")
        venta.client_name = nombre
        if venta.is_credit:
            cuenta = _cuenta_de(db, venta)
            if cuenta:
                cuenta.client_name = nombre or ""

    # ── Referencia / nota ──
    if venta_data.reference is not None:
        ref = venta_data.reference.strip() or None
        venta.reference = ref
        if venta.is_credit:
            cuenta = _cuenta_de(db, venta)
            if cuenta:
                cuenta.notes = ref

    # ── Cobro recibido (solo ventas normales): valida y recalcula el cambio ──
    if not venta.is_credit and (venta_data.received_bs is not None or venta_data.received_usd is not None):
        received_bs = venta_data.received_bs or 0.0
        received_usd = venta_data.received_usd or 0.0
        tasa = venta.rate_usd or _default_rate(db) or 1.0
        metodo = venta.payment_method or ""
        moneda_usd = metodo.startswith("Mixto") or metodo == "Dólares Efectivo"
        change_bs = change_usd = None

        if received_bs > 0 or received_usd > 0:
            if moneda_usd:
                recibido = received_usd + (received_bs / tasa if tasa else 0.0)
                if recibido < venta.total - 0.005:
                    raise HTTPException(400, "El monto recibido es menor al total a cobrar")
                change_usd = round(recibido - venta.total, 2)
            else:
                esperado_bs = venta.total * tasa
                recibido = received_bs + received_usd * tasa
                if recibido < esperado_bs - 0.005:
                    raise HTTPException(400, "El monto recibido es menor al total a cobrar")
                change_bs = round(recibido - esperado_bs, 2)

        venta.received_bs = received_bs or None
        venta.received_usd = received_usd or None
        venta.change_bs = change_bs
        venta.change_usd = change_usd

    # ── Recalcular impuestos con el estado final (total, método y cobro) ──
    fraccion_usd = ((venta.received_usd or 0.0) / venta.total) if venta.total > 0 else 0.0
    base_v, iva_v, igtf_v = _desglose_impuestos(venta.total, venta.payment_method, fraccion_usd)
    venta.base_amount = base_v
    venta.iva_amount = iva_v
    venta.igtf_amount = igtf_v

    db.commit()
    return db.query(Sale).options(
        selectinload(Sale.details).selectinload(SaleDetail.product)
    ).filter(Sale.id == id).first()


@router.delete("/{id}")
def eliminar_venta(
    id: int,
    db: Session = Depends(get_db),
    user: object = Depends(get_current_user),
):
    """Elimina una venta (solo administrador).

    Devuelve los productos al inventario y, si era venta a crédito, elimina
    también su cuenta por cobrar. No se permite eliminar ventas de días con
    caja cerrada (Reporte Z).
    """
    requiere_admin(user)

    venta = db.query(Sale).options(
        selectinload(Sale.details)
    ).filter(Sale.id == id).first()
    if not venta:
        raise HTTPException(404, "Venta no encontrada")

    _validar_caja_abierta(db, venta)

    # Devolver el stock reservado por cada detalle
    for d in venta.details:
        prod = db.get(Product, d.product_id)
        if prod:
            prod.stock = (prod.stock or 0) + d.quantity

    # Eliminar la cuenta por cobrar asociada si existe
    cuenta = _cuenta_de(db, venta)
    if cuenta:
        db.delete(cuenta)
        venta.cuenta_id = None

    db.delete(venta)  # el cascade elimina los detalles
    db.commit()
    return {"ok": True, "message": f"Venta #{id} eliminada. El stock fue devuelto al inventario."}
