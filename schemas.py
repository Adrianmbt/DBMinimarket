from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime

# ==========================================
# ESQUEMAS DE CATEGORÍAS
# ==========================================
class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    sale_unit: str = "unidad"  # unidad | peso


class CategoryCreate(CategoryBase):
    pass


class CategoryResponse(CategoryBase):
    id: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# ESQUEMAS DE PRODUCTOS
# ==========================================
class ProductBase(BaseModel):
    barcode: Optional[str] = None
    name: str
    description: Optional[str] = None
    cost_price: float = Field(..., ge=0.0)
    sale_price: float = Field(..., ge=0.0)
    stock: int = Field(0, ge=0)
    min_stock: int = Field(5, ge=0)
    category_id: Optional[int] = Field(None, gt=0)
    sale_unit: str = Field("unidad", pattern="^(unidad|peso)$")


class ProductCreate(ProductBase):
    pass


class ProductResponse(ProductBase):
    id: int
    activo: bool = True
    category_name: Optional[str] = None
    category: Optional[CategoryResponse] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# ESQUEMAS DE BAJA DE STOCK (ELIMINACIÓN LÓGICA)
# ==========================================
class StockBajaCreate(BaseModel):
    cantidad: int = Field(..., gt=0)
    motivo: str = Field(..., min_length=1)


class StockBajaResponse(BaseModel):
    id: int
    cantidad: int
    motivo: str
    user_full_name: Optional[str] = None
    restaurada: bool = False
    created_at: datetime
    product: ProductResponse

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# ESQUEMAS DE DETALLE DE VENTA
# ==========================================
class SaleDetailBase(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)

class SaleDetailCreate(SaleDetailBase):
    pass

class SaleDetailResponse(SaleDetailBase):
    id: int
    price_at_sale: float
    cost_price: float
    product: ProductResponse

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# ESQUEMAS DE VENTAS
# ==========================================
class SaleBase(BaseModel):
    payment_method: str = "Efectivo"
    client_name: Optional[str] = None
    reference: Optional[str] = None

class SaleCreate(BaseModel):
    payment_method: str = "Efectivo"
    client_name: Optional[str] = None
    reference: Optional[str] = None
    # 'BS' (bolívares) o 'USD' (dólares): moneda en que se cobra la venta
    currency: str = "BS"
    # Tasa BCV (Bs por 1 USD) vista en el frontend; el backend la recalcula igualmente
    rate: Optional[float] = None
    # Cobro mixto: monto recibido en bolívares y en dólares
    received_bs: Optional[float] = None
    received_usd: Optional[float] = None
    # Cambio a devolver (en la moneda en que se cobra)
    change_bs: Optional[float] = None
    change_usd: Optional[float] = None
    # Venta a crédito (solo admin)
    is_credit: bool = False
    # Plazo de crédito en días (7, 10 o 15)
    days_term: int = Field(15, ge=7, le=15)
    items: List[SaleDetailCreate] = Field(..., min_length=1)

class SaleResponse(SaleBase):
    id: int
    created_at: datetime
    total: float
    base_amount: float = 0.0
    iva_amount: float = 0.0
    igtf_amount: float = 0.0
    rate_usd: Optional[float] = None
    received_bs: Optional[float] = None
    received_usd: Optional[float] = None
    change_bs: Optional[float] = None
    change_usd: Optional[float] = None
    is_credit: bool = False
    cuenta_id: Optional[int] = None
    details: List[SaleDetailResponse]

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# ESQUEMAS DE CUENTAS POR COBRAR (CRÉDITO)
# ==========================================
class CuentaCreditoResponse(BaseModel):
    id: int
    sale_id: int
    client_name: str
    total_usd: float
    total_bs: float
    currency: str
    rate_usd: Optional[float] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime
    paid_at: Optional[datetime] = None
    days_term: int = 15
    due_date: Optional[datetime] = None
    notified: bool = False
    sale: Optional[SaleResponse] = None

    model_config = ConfigDict(from_attributes=True)


class CreditoResumen(BaseModel):
    total_pendiente: int
    total_pagado: int
    monto_pendiente_usd: float
    monto_pendiente_bs: float
    monto_pagado_usd: float
    monto_pagado_bs: float


# ==========================================
# ESQUEMAS DE COMPRAS
# ==========================================
class PurchaseDetailCreate(BaseModel):
    """Ítem de compra. Crea el producto si no existe o lo actualiza si ya existe.

    La categoría define la modalidad:
      - peso (Frutas/Verduras/Hortalizas, Carnicería, Charcutería): se compra por kg.
      - unidad (resto): se compra al mayor por cajas (boxes x units_per_box).
    """
    product_id: Optional[int] = Field(None, gt=0)          # si ya existe
    barcode: Optional[str] = None                          # opcional
    name: Optional[str] = None                             # nombre + presentación (obligatorio si no hay product_id)
    description: Optional[str] = None
    category_id: Optional[int] = Field(None, gt=0)         # obligatorio al crear; define peso/caja
    min_stock: int = Field(5, ge=0)
    cost_price: float = Field(..., ge=0.0)                 # USD por kg (peso) o por unidad (caja)
    sale_price: Optional[float] = Field(None, ge=0.0)       # USD (por kg o por unidad)
    # Modalidad peso
    weight_kg: Optional[float] = Field(None, gt=0.0)
    # Modalidad caja
    boxes: Optional[int] = Field(None, gt=0)
    units_per_box: Optional[int] = Field(None, gt=0)

class PurchaseDetailResponse(BaseModel):
    id: int
    quantity: int
    cost_price: float
    boxes: Optional[int] = None
    units_per_box: Optional[int] = None
    weight_kg: Optional[float] = None
    product: ProductResponse

    model_config = ConfigDict(from_attributes=True)

class PurchaseCreate(BaseModel):
    supplier: Optional[str] = None
    items: List[PurchaseDetailCreate] = Field(..., min_length=1)

class PurchaseResponse(BaseModel):
    id: int
    created_at: datetime
    supplier: Optional[str] = None
    total: float
    details: List[PurchaseDetailResponse]

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# ESQUEMAS DE USUARIOS
# ==========================================
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)
    full_name: Optional[str] = None
    role: str = Field("vendedor", pattern="^(admin|vendedor)$")

class UserUpdate(BaseModel):
    """Actualización de usuario: todos los campos opcionales.

    password vacío o ausente = la contraseña no cambia.
    """
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    full_name: Optional[str] = None
    role: Optional[str] = Field(None, pattern="^(admin|vendedor)$")
    password: Optional[str] = Field(None, min_length=6, max_length=128)

class UserResponse(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: str = "vendedor"

    model_config = ConfigDict(from_attributes=True)

class UserDeleteResponse(BaseModel):
    ok: bool
    message: str

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    ok: bool
    message: str
    user: Optional[UserResponse] = None
    token: Optional[str] = None


# ==========================================
# ESQUEMA DEL DASHBOARD
# ==========================================
class SerieDia(BaseModel):
    d: str          # Etiqueta del día (ej. "Lun 24")
    usd: float      # Ventas del día (USD)
    n: int          # N° de ventas


class TopItem(BaseModel):
    nombre: str
    cantidad: float
    usd: float


class MetodoItem(BaseModel):
    metodo: str
    n: int
    usd: float


class DashboardResponse(BaseModel):
    ventas_hoy: float
    ventas_hoy_bs: float
    ventas_mes: float
    transacciones_hoy: int
    ticket_promedio: float
    ventas_hoy_vs_ayer: float     # % de variación (positivo = subió)
    ganancia_dia: float
    ganancia_periodo: float
    producto_mas_vendido: Optional[str] = None
    stock_bajo: List[ProductResponse]
    stock_bajo_count: int
    stock_total: int              # unidades/gramos totales en inventario
    valor_inventario: float
    valor_inventario_bs: float
    tasa_bcv: Optional[float] = None
    serie_ventas7: List[SerieDia]
    categorias: List[MetodoItem]  # reutilizado: nombre -> "metodo", usd
    top_productos: List[TopItem]
    metodos_pago: List[MetodoItem]


class ExchangeRateResponse(BaseModel):
    currency: str
    rate: float
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# ESQUEMAS DE CIERRE DE CAJA (REPORTE Z)
# ==========================================
class CierreResponse(BaseModel):
    id: int
    fecha: str
    total_usd: float
    total_bs: float
    total_ventas: int
    total_iva_usd: float = 0.0
    total_igtf_usd: float = 0.0
    cerrado_por: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MetodoResumen(BaseModel):
    metodo: str
    n: int
    usd: float
    bs: float


class ReporteResumen(BaseModel):
    fecha: str
    total_ventas: int
    total_usd: float
    total_bs: float
    total_iva_usd: float = 0.0
    total_igtf_usd: float = 0.0
    cerrado: bool
    cierre: Optional[CierreResponse] = None
    metodos: List[MetodoResumen]


class CierreStatus(BaseModel):
    fecha: str
    cerrado: bool
    cierre: Optional[CierreResponse] = None
    total_ventas_hoy: int
    total_usd_hoy: float
    total_bs_hoy: float