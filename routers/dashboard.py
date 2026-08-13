from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from database import get_db
from models import Product, Sale, SaleDetail, Category, ExchangeRate
from schemas import DashboardResponse, SerieDia, TopItem, MetodoItem
from services.bcv import DEFAULT_RATE
from security import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _conversion():
    # Cantidad en gramos (productos peso) -> kg para costeo/pricing por kg.
    return case((Product.sale_unit == "peso", 0.001), else_=1.0)


_DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]


@router.get("", response_model=DashboardResponse)
def get_dashboard(db: Session = Depends(get_db), user: object = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, "Acceso restringido a administradores")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now.date()
    hoy_inicio = datetime.combine(today, datetime.min.time())
    ayer_inicio = hoy_inicio - timedelta(days=1)
    inicio_mes = datetime.combine(today.replace(day=1), datetime.min.time())
    inicio_semana = datetime.combine(today - timedelta(days=6), datetime.min.time())

    # ---- Totales del día (USD canónico) ----
    ventas_hoy = db.query(func.coalesce(func.sum(Sale.total), 0)).filter(
        Sale.created_at >= hoy_inicio
    ).scalar() or 0.0

    transacciones_hoy = db.query(func.count(Sale.id)).filter(
        Sale.created_at >= hoy_inicio
    ).scalar() or 0

    # ---- Ventas de ayer (para % de variación) ----
    ventas_ayer = db.query(func.coalesce(func.sum(Sale.total), 0)).filter(
        Sale.created_at >= ayer_inicio,
        Sale.created_at < hoy_inicio,
    ).scalar() or 0.0

    # ---- Ventas del mes corriente ----
    ventas_mes = db.query(func.coalesce(func.sum(Sale.total), 0)).filter(
        Sale.created_at >= inicio_mes
    ).scalar() or 0.0

    # ---- Ganancia del día: (precio - costo) * cantidad * conversión ----
    def _ganancia(desde):
        return db.query(
            func.coalesce(
                func.sum((SaleDetail.price_at_sale - SaleDetail.cost_price)
                         * SaleDetail.quantity * _conversion()),
                0,
            )
        ).join(Sale, SaleDetail.sale_id == Sale.id
        ).join(Product, SaleDetail.product_id == Product.id
        ).filter(Sale.created_at >= desde).scalar() or 0.0

    ganancia_dia = _ganancia(hoy_inicio)
    ganancia_periodo = _ganancia(inicio_semana)

    # ---- Stock e inventario ----
    stock_total = db.query(func.coalesce(func.sum(Product.stock), 0)).scalar() or 0
    stock_bajo = db.query(Product).filter(
        Product.stock < Product.min_stock, Product.activo == True  # noqa: E712
    ).all()
    valor_inventario = db.query(
        func.coalesce(func.sum(Product.cost_price * Product.stock * _conversion()), 0)
    ).scalar() or 0.0

    # ---- Serie de los últimos 7 días ----
    serie_ventas7 = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        d0 = datetime.combine(d, datetime.min.time())
        d1 = d0 + timedelta(days=1)
        venta = db.query(func.coalesce(func.sum(Sale.total), 0)).filter(
            Sale.created_at >= d0, Sale.created_at < d1
        ).scalar() or 0.0
        n = db.query(func.count(Sale.id)).filter(
            Sale.created_at >= d0, Sale.created_at < d1
        ).scalar() or 0
        serie_ventas7.append(SerieDia(
            d=f"{_DIAS[d.weekday()]} {d.day}",
            usd=float(venta),
            n=int(n),
        ))

    # ---- Top productos por facturación (últimos 7 días) ----
    top_q = db.query(
        Product.name,
        func.coalesce(func.sum(SaleDetail.quantity * _conversion()), 0).label("cantidad"),
        func.coalesce(func.sum(SaleDetail.price_at_sale * SaleDetail.quantity * _conversion()), 0).label("usd"),
    ).join(SaleDetail, Product.id == SaleDetail.product_id
    ).join(Sale, SaleDetail.sale_id == Sale.id
    ).filter(Sale.created_at >= inicio_semana
    ).group_by(Product.id, Product.name
    ).order_by(
        func.sum(SaleDetail.price_at_sale * SaleDetail.quantity * _conversion()).desc()
    ).limit(5).all()
    top_productos = [
        TopItem(nombre=r[0], cantidad=float(r[1]), usd=float(r[2]))
        for r in top_q
    ]

    # ---- Ventas por categoría (USD, últimos 7 días) ----
    cat_q = db.query(
        func.coalesce(Category.name, "Sin categoría"),
        func.coalesce(
            func.sum(SaleDetail.price_at_sale * SaleDetail.quantity * _conversion()), 0
        ),
    ).select_from(SaleDetail
    ).join(Product, Product.id == SaleDetail.product_id
    ).join(Sale, Sale.id == SaleDetail.sale_id
    ).outerjoin(Category, Category.id == Product.category_id
    ).filter(Sale.created_at >= inicio_semana
    ).group_by(Category.id
    ).all()
    categorias = [
        MetodoItem(metodo=nombre or "Sin categoría", n=0, usd=float(usd))
        for nombre, usd in cat_q
    ]

    # ---- Métodos de pago (hoy) ----
    met_q = db.query(
        Sale.payment_method,
        func.count(Sale.id),
        func.coalesce(func.sum(Sale.total), 0),
    ).filter(Sale.created_at >= hoy_inicio
    ).group_by(Sale.payment_method).all()
    metodos_pago = [
        MetodoItem(metodo=m0 or "Sin método", n=int(m1), usd=float(m2))
        for m0, m1, m2 in met_q
    ]

    # ---- Tasa BCV ----
    db_rate = db.query(ExchangeRate).filter(ExchangeRate.currency == "USD").first()
    tasa = db_rate.rate if db_rate and db_rate.rate else DEFAULT_RATE

    # ---- Métricas derivadas ----
    ticket_promedio = (ventas_hoy / transacciones_hoy) if transacciones_hoy else 0.0
    if ventas_ayer:
        ventas_hoy_vs_ayer = ((ventas_hoy - ventas_ayer) / ventas_ayer) * 100
    else:
        ventas_hoy_vs_ayer = 100.0 if ventas_hoy else 0.0

    producto_mas_vendido = db.query(
        Product.name,
        func.coalesce(func.sum(SaleDetail.quantity * _conversion()), 0).label("q"),
    ).join(SaleDetail, Product.id == SaleDetail.product_id
    ).join(Sale, SaleDetail.sale_id == Sale.id
    ).filter(Sale.created_at >= inicio_mes
    ).group_by(Product.id, Product.name
    ).order_by(func.sum(SaleDetail.quantity * _conversion()).desc()).first()

    return DashboardResponse(
        ventas_hoy=float(ventas_hoy),
        ventas_hoy_bs=float(ventas_hoy * tasa),
        ventas_mes=float(ventas_mes),
        transacciones_hoy=int(transacciones_hoy),
        ticket_promedio=float(ticket_promedio),
        ventas_hoy_vs_ayer=float(ventas_hoy_vs_ayer),
        ganancia_dia=float(ganancia_dia),
        ganancia_periodo=float(ganancia_periodo),
        producto_mas_vendido=producto_mas_vendido[0] if producto_mas_vendido else None,
        stock_bajo=stock_bajo,
        stock_bajo_count=len(stock_bajo),
        stock_total=int(stock_total),
        valor_inventario=float(valor_inventario),
        valor_inventario_bs=float(valor_inventario * tasa),
        tasa_bcv=float(tasa),
        serie_ventas7=serie_ventas7,
        categorias=categorias,
        top_productos=top_productos,
        metodos_pago=metodos_pago,
    )