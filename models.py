from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


def utcnow():
    # Fecha/hora UTC sin zona horaria para compatibilidad con SQLite
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    sale_unit = Column(String, default="unidad")  # unidad | peso
    created_at = Column(DateTime, default=utcnow)

    products = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    barcode = Column(String, unique=True, index=True, nullable=True)  # Clave para el lector de barras
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    cost_price = Column(Float, nullable=False)  # Cuánto te costó a ti
    sale_price = Column(Float, nullable=False)  # A cuánto lo vendes
    stock = Column(Integer, default=0)
    min_stock = Column(Integer, default=5)  # Alerta de stock bajo
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    sale_unit = Column(String, default="unidad")  # Copia denormalizada de la categoría (unidad/peso)
    activo = Column(Boolean, default=True)       # Baja lógica: True (activo) / False (dado de baja)

    # Relaciones
    category = relationship("Category", back_populates="products")
    sale_details = relationship("SaleDetail", back_populates="product")
    bajas = relationship("StockBaja", back_populates="product", cascade="all, delete-orphan")

    @property
    def category_name(self) -> str | None:
        return self.category.name if self.category else None


class Sale(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    total = Column(Float, nullable=False, default=0.0)  # Total canónico en USD (precio final, impuestos incluidos)
    base_amount = Column(Float, default=0.0)             # Monto sin impuestos (USD)
    iva_amount = Column(Float, default=0.0)              # IVA 16% incluido (USD)
    igtf_amount = Column(Float, default=0.0)             # IGTF 3% incluido (USD; solo Dólares Efectivo)
    payment_method = Column(String, default="Efectivo")  # Bolívares Efectivo, Pago Móvil, Dólares, etc.
    client_name = Column(String, nullable=True)
    reference = Column(String, nullable=True)
    # Tasa BCV (USD→Bs) usada en el momento de la venta para reconstruir montos en Bs.
    rate_usd = Column(Float, nullable=True)
    # Cobro (soporta cobro mixto Bs + USD). El total canónico se guarda siempre en USD.
    received_bs = Column(Float, nullable=True)
    received_usd = Column(Float, nullable=True)
    change_bs = Column(Float, nullable=True)
    change_usd = Column(Float, nullable=True)
    # Venta a crédito
    is_credit = Column(Boolean, default=False)
    cuenta_id = Column(Integer, ForeignKey("cuentas_credito.id"), nullable=True)

    # Relación uno a muchos: una venta tiene muchos detalles/productos
    details = relationship("SaleDetail", back_populates="sale", cascade="all, delete-orphan")


class SaleDetail(Base):
    __tablename__ = "sale_details"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    
    quantity = Column(Integer, nullable=False)
    # Guardamos el precio del momento de la venta por si el producto sube de precio mañana
    price_at_sale = Column(Float, nullable=False)
    cost_price = Column(Float, nullable=False, default=0.0)  # Costo en el momento de la venta

    # Relaciones para acceder fácil a los objetos desde el código
    sale = relationship("Sale", back_populates="details")
    product = relationship("Product", back_populates="sale_details")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(String, default="vendedor")  # admin | vendedor


class StockBaja(Base):
    """Registro de baja lógica de stock: retiro de mercancía con justificación.

    Se usa para retirar productos vencidos, dañados o sobrantes sin borrarlos,
    restando la cantidad del stock y guardando el motivo + quién lo hizo.
    """
    __tablename__ = "stock_bajas"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    cantidad = Column(Integer, nullable=False)   # Gramos si modalidad peso, unidades si no
    motivo = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_full_name = Column(String, nullable=True)  # Cambio del stock (queda registrado)
    restaurada = Column(Boolean, default=False)      # True cuando se devolvió el stock
    created_at = Column(DateTime, default=utcnow)

    product = relationship("Product", back_populates="bajas")


class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    supplier = Column(String, nullable=True)
    total = Column(Float, default=0.0)

    details = relationship("PurchaseDetail", back_populates="purchase", cascade="all, delete-orphan")


class PurchaseDetail(Base):
    __tablename__ = "purchase_details"

    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)          # Unidades añadidas al stock (gramos si es peso)
    cost_price = Column(Float, nullable=False)           # Costo de compra en USD (por kg si es peso, por unidad si es caja)
    boxes = Column(Integer, nullable=True)              # Nº de cajas (modalidad caja)
    units_per_box = Column(Integer, nullable=True)      # Unidades por caja (modalidad caja)
    weight_kg = Column(Float, nullable=True)            # Peso en kg (modalidad peso)

    purchase = relationship("Purchase", back_populates="details")
    product = relationship("Product")


class CierreDiario(Base):
    """Cierre de caja diario (Reporte Z). Una fila por fecha.

    Cuando existe un cierre para una fecha, esa caja quedó cerrada y
    ya no se permiten más ventas para ese día.
    """
    __tablename__ = "cierres_diarios"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, unique=True, index=True, nullable=False)
    total_usd = Column(Float, default=0.0)
    total_bs = Column(Float, default=0.0)
    total_iva_usd = Column(Float, default=0.0)
    total_igtf_usd = Column(Float, default=0.0)
    total_ventas = Column(Integer, default=0)
    cerrado_por = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class CuentaCredito(Base):
    """Cuenta por cobrar: registra ventas a crédito pendientes de pago."""
    __tablename__ = "cuentas_credito"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False, unique=True)
    client_name = Column(String, nullable=False)
    total_usd = Column(Float, nullable=False)          # Total en USD
    total_bs = Column(Float, nullable=False)           # Total en Bs (tasa del momento)
    currency = Column(String, default="BS")            # BS o USD — moneda en que se cobra
    rate_usd = Column(Float, nullable=True)            # Tasa BCV al momento de la venta
    status = Column(String, default="pendiente")       # pendiente | pagado
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    paid_at = Column(DateTime, nullable=True)
    # Crédito: plazo y vencimiento
    days_term = Column(Integer, default=15)            # Días de plazo (7, 10 o 15)
    due_date = Column(Date, nullable=True)             # Fecha límite de pago (created_at + days_term)
    notified = Column(Boolean, default=False)          # True si ya se notificó que está por vencer

    sale = relationship("Sale", foreign_keys=[sale_id])


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id = Column(Integer, primary_key=True, index=True)
    currency = Column(String, default="USD", unique=True)  # USD
    rate = Column(Float, nullable=False)                  # Ej: 36.50 o el valor oficial vigente
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)