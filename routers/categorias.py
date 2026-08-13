from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Category, Product, User
from schemas import CategoryCreate, CategoryResponse
from security import get_current_user, requiere_admin

router = APIRouter(prefix="/api/categorias", tags=["Categorías"])


@router.get("", response_model=list[CategoryResponse])
def listar_categorias(db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    return db.query(Category).order_by(Category.name).all()


@router.post("", response_model=CategoryResponse)
def crear_categoria(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    existe = db.query(Category).filter(Category.name == data.name).first()
    if existe:
        raise HTTPException(400, "La categoría ya existe")
    categoria = Category(**data.model_dump())
    db.add(categoria)
    db.commit()
    db.refresh(categoria)
    return categoria


@router.put("/{id}", response_model=CategoryResponse)
def actualizar_categoria(
    id: int,
    data: CategoryCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    categoria = db.get(Category, id)
    if not categoria:
        raise HTTPException(404, "Categoría no encontrada")
    duplicado = db.query(Category).filter(Category.name == data.name, Category.id != id).first()
    if duplicado:
        raise HTTPException(400, "La categoría ya existe")
    for key, value in data.model_dump().items():
        setattr(categoria, key, value)
    db.commit()
    db.refresh(categoria)
    return categoria


@router.delete("/{id}")
def eliminar_categoria(
    id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
):
    requiere_admin(usuario)
    categoria = db.get(Category, id)
    if not categoria:
        raise HTTPException(404, "Categoría no encontrada")
    if db.query(Product).filter(Product.category_id == id).count() > 0:
        raise HTTPException(400, "No se puede eliminar una categoría con productos asociados")
    db.delete(categoria)
    db.commit()
    return {"ok": True}