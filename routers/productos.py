from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Category, Product, StockBaja, User
from schemas import ProductCreate, ProductResponse, StockBajaCreate, StockBajaResponse
from security import get_current_user, requiere_admin

router = APIRouter(prefix="/api/productos", tags=["Productos"])


def _sync_sale_unit(producto: Product, db: Session):
    """El sale_unit lo define la categoría (unidad/peso)."""
    if producto.category_id:
        categoria = db.get(Category, producto.category_id)
        if categoria:
            producto.sale_unit = categoria.sale_unit
    else:
        producto.sale_unit = "unidad"


def _validar_barcode_unico(barcode, db: Session, excluir_id: int | None = None):
    """Evita duplicados de código de barras (unicidad en la BD)."""
    if not barcode:
        return
    q = db.query(Product).filter(Product.barcode == barcode)
    if excluir_id is not None:
        q = q.filter(Product.id != excluir_id)
    if q.first():
        raise HTTPException(400, "Ya existe un producto con ese código de barras")


@router.get("", response_model=list[ProductResponse])
def listar_productos(
    incluir_inactivos: bool = False,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    query = db.query(Product)
    if not incluir_inactivos:
        query = query.filter(Product.activo == True)  # noqa: E712
    return query.all()


@router.get("/barcode/{barcode}", response_model=ProductResponse)
def obtener_producto_por_codigo_de_barras(barcode: str, db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    producto = db.query(Product).filter(Product.barcode == barcode).first()
    if not producto:
        raise HTTPException(404, "Producto no encontrado por código de barras")
    return producto


@router.get("/bajas", response_model=list[StockBajaResponse])
def listar_bajas(
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    return db.query(StockBaja).order_by(StockBaja.created_at.desc()).all()


@router.get("/{id}", response_model=ProductResponse)
def obtener_producto(id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    producto = db.get(Product, id)
    if not producto:
        raise HTTPException(404, "Producto no encontrado")
    return producto


@router.post("", response_model=ProductResponse)
def crear_producto(
    producto: ProductCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    _validar_barcode_unico(producto.barcode, db)
    if producto.category_id and not db.get(Category, producto.category_id):
        raise HTTPException(400, "La categoría indicada no existe")
    db_producto = Product(**producto.model_dump())
    _sync_sale_unit(db_producto, db)
    db.add(db_producto)
    db.commit()
    db.refresh(db_producto)
    return db_producto


@router.put("/{id}", response_model=ProductResponse)
def actualizar_producto(
    id: int,
    producto: ProductCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    db_producto = db.get(Product, id)
    if not db_producto:
        raise HTTPException(404, "Producto no encontrado")
    _validar_barcode_unico(producto.barcode, db, excluir_id=id)
    if producto.category_id and not db.get(Category, producto.category_id):
        raise HTTPException(400, "La categoría indicada no existe")
    for key, value in producto.model_dump().items():
        setattr(db_producto, key, value)
    _sync_sale_unit(db_producto, db)
    db.commit()
    db.refresh(db_producto)
    return db_producto


@router.delete("/{id}")
def eliminar_producto(
    id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    db_producto = db.get(Product, id)
    if not db_producto:
        raise HTTPException(404, "Producto no encontrado")
    db.delete(db_producto)
    db.commit()
    return {"ok": True}


# ==========================================
# BAJA DE STOCK (eliminación lógica con justificación)
# ==========================================
@router.post("/{id}/baja", response_model=StockBajaResponse)
def registrar_baja(
    id: int,
    data: StockBajaCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    db_producto = db.get(Product, id)
    if not db_producto:
        raise HTTPException(404, "Producto no encontrado")
    if (db_producto.stock or 0) <= 0:
        raise HTTPException(400, "El producto no tiene stock para dar de baja")
    if data.cantidad > (db_producto.stock or 0):
        raise HTTPException(400, "La cantidad supera el stock disponible")
    if data.cantidad <= 0:
        raise HTTPException(400, "La cantidad debe ser mayor a cero")

    db_producto.stock = max(0, (db_producto.stock or 0) - data.cantidad)
    if db_producto.stock == 0:
        db_producto.activo = False

    nuevo = StockBaja(
        product_id=db_producto.id,
        cantidad=data.cantidad,
        motivo=data.motivo,
        user_id=usuario.id,
        user_full_name=usuario.full_name or usuario.username,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.post("/{id}/reactivar", response_model=ProductResponse)
def reactivar_producto(
    id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    db_producto = db.get(Product, id)
    if not db_producto:
        raise HTTPException(404, "Producto no encontrado")
    db_producto.activo = True
    db.commit()
    db.refresh(db_producto)
    return db_producto


@router.post("/bajas/{baja_id}/restaurar", response_model=StockBajaResponse)
def restaurar_baja(
    baja_id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    baja = db.get(StockBaja, baja_id)
    if not baja:
        raise HTTPException(404, "Registro de baja no encontrado")
    if baja.restaurada:
        raise HTTPException(400, "Esta baja ya fue restaurada")
    producto = db.get(Product, baja.product_id)
    producto.stock = (producto.stock or 0) + baja.cantidad
    producto.activo = True
    baja.restaurada = True
    db.commit()
    db.refresh(baja)
    return baja