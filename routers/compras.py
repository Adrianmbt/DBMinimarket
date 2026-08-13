from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from database import get_db
from models import Category, Product, Purchase, PurchaseDetail, User
from schemas import PurchaseCreate, PurchaseDetailCreate, PurchaseResponse
from security import get_current_user, requiere_admin
from services.pdf import generar_pdf_compra

router = APIRouter(prefix="/api/compras", tags=["Compras"])


@router.get("", response_model=list[PurchaseResponse])
def listar_compras(db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    return db.query(Purchase).options(
        selectinload(Purchase.details).selectinload(PurchaseDetail.product)
    ).order_by(Purchase.created_at.desc()).all()


@router.get("/{id}", response_model=PurchaseResponse)
def obtener_compra(id: int, db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    compra = db.query(Purchase).options(
        selectinload(Purchase.details).selectinload(PurchaseDetail.product)
    ).filter(Purchase.id == id).first()
    if not compra:
        raise HTTPException(404, "Compra no encontrada")
    return compra


def _find_or_create_producto(item: PurchaseDetailCreate, db: Session) -> Product:
    """Busca el producto por nombre o código de barras; si no existe, lo crea."""
    if item.product_id:
        producto = db.get(Product, item.product_id)
        if not producto:
            raise HTTPException(404, f"Producto {item.product_id} no encontrado")
        return producto

    producto = None
    if item.name:
        producto = db.query(Product).filter(func.lower(Product.name) == item.name.strip().lower()).first()
    if not producto and item.barcode:
        producto = db.query(Product).filter(Product.barcode == item.barcode).first()
    if not producto:
        if not item.name:
            raise HTTPException(422, "Debes indicar el nombre del producto o su product_id")
        nombre = item.name.strip()
        if not nombre:
            raise HTTPException(422, "El nombre y presentación del producto es obligatorio")
        producto = Product(
            name=nombre,
            barcode=item.barcode,
            description=item.description,
            cost_price=item.cost_price,
            sale_price=item.sale_price or 0.0,
            stock=0,
            min_stock=item.min_stock,
            sale_unit="unidad",
        )
        db.add(producto)
        db.flush()
    return producto


def _aplicar_categoria(producto: Product, item: PurchaseDetailCreate, db: Session):
    """Aplica la categoría (e indica el sale_unit) al producto."""
    categoria = None
    if item.category_id:
        categoria = db.get(Category, item.category_id)
        if not categoria:
            raise HTTPException(400, "La categoría indicada no existe")
    elif producto.category_id:
        categoria = db.get(Category, producto.category_id)

    if categoria:
        producto.category_id = categoria.id
        producto.sale_unit = categoria.sale_unit
    if not producto.sale_unit:
        producto.sale_unit = "unidad"
    return producto.sale_unit


@router.post("", response_model=PurchaseResponse)
def crear_compra(
    compra_data: PurchaseCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    detalles = []
    total = 0.0

    for item in compra_data.items:
        producto = _find_or_create_producto(item, db)
        modalidad = _aplicar_categoria(producto, item, db)

        stock_previo = producto.stock or 0

        if modalidad == "peso":
            # Compra por kilogramos; el stock se lleva en gramos.
            kg = item.weight_kg
            if not kg:
                raise HTTPException(422, f"Indicar el peso en kg para '{producto.name}' (categoría peso)")
            gramos = round(kg * 1000.0)
            producto.stock = stock_previo + gramos
            subtotal = item.cost_price * kg
            detalle = PurchaseDetail(
                product_id=producto.id,
                quantity=gramos,
                cost_price=item.cost_price,
                weight_kg=kg,
            )
        else:
            # Modalidad caja: costeo por unidad, stock = cajas x unidades por caja.
            if not item.boxes or not item.units_per_box:
                raise HTTPException(422, f"Indica cajas y unidades por caja para '{producto.name}' (categoría unidad)")
            unidades = item.boxes * item.units_per_box
            producto.stock = stock_previo + unidades
            subtotal = item.cost_price * unidades
            detalle = PurchaseDetail(
                product_id=producto.id,
                quantity=unidades,
                cost_price=item.cost_price,
                boxes=item.boxes,
                units_per_box=item.units_per_box,
            )

        producto.cost_price = item.cost_price
        if item.sale_price is not None:
            producto.sale_price = item.sale_price
        if item.min_stock is not None:
            producto.min_stock = item.min_stock
        if item.description is not None:
            producto.description = item.description
        
        # Al ingresar stock por compra, nos aseguramos de reactivar el producto
        producto.activo = True

        total += subtotal
        detalles.append(detalle)

    compra = Purchase(supplier=compra_data.supplier, total=total, details=detalles)
    db.add(compra)
    db.commit()
    db.refresh(compra)
    return compra


@router.get("/{compra_id}/pdf")
def descargar_pdf_compra(
    compra_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    compra = db.get(Purchase, compra_id)
    if not compra:
        raise HTTPException(404, "Compra no encontrada")
    buf = generar_pdf_compra(compra)
    filename = f"compra_{compra_id}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )