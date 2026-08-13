"""
Semilla de datos para MinimarketDB.
Población inicial con categorías, productos (unidad y peso), usuarios, tasa BCV,
compras y ventas de ejemplo.

Uso:
    python seed_data.py
"""

from datetime import datetime, timedelta, timezone
from database import engine, SessionLocal, Base
from models import (
    Category, Product, User, ExchangeRate,
    Purchase, PurchaseDetail, Sale, SaleDetail,
)
from security import hash_password

# ==========================================
# CATEGORÍAS (definen la modalidad de precio: unidad | peso)
# ==========================================
CATEGORIAS = [
    {"name": "Alimentos Básicos", "description": "Abarrotes y despensa", "sale_unit": "unidad"},
    {"name": "Bebidas", "description": "Bebidas y refrescos", "sale_unit": "unidad"},
    {"name": "Enlatados y Conservas", "description": "", "sale_unit": "unidad"},
    {"name": "Aseo Personal y Hogar", "description": "", "sale_unit": "unidad"},
    {"name": "Snacks y Golosinas", "description": "", "sale_unit": "unidad"},
    {"name": "Carnicería", "description": "Se vende por peso (kg)", "sale_unit": "peso"},
    {"name": "Charcutería", "description": "Embutidos, se vende por peso (kg)", "sale_unit": "peso"},
    {"name": "Frutas, Verduras y Hortalizas", "description": "Se vende por peso (kg)", "sale_unit": "peso"},
    {"name": "Otros Artículos No Especificados", "description": "Artículos varios no clasificados", "sale_unit": "unidad"},
]

# Para los productos, "cat" es el nombre de la categoría. En categorías peso,
# stock/cantidad se manejan en GRAMOS y los precios son por kilogramo.
PRODUCTOS = [
    # Alimentos básicos (unidad)
    {"barcode": "7591001001001", "cat": "Alimentos Básicos", "name": "Harina PAN (1kg)", "cost_price": 2.50, "sale_price": 4.00, "stock": 50, "min_stock": 10},
    {"barcode": "7591001002008", "cat": "Alimentos Básicos", "name": "Arroz Diana (1kg)", "cost_price": 1.80, "sale_price": 3.00, "stock": 40, "min_stock": 10},
    {"barcode": "7591001003005", "cat": "Alimentos Básicos", "name": "Azúcar Mont-C (1kg)", "cost_price": 1.60, "sale_price": 2.80, "stock": 35, "min_stock": 10},
    {"barcode": "7591001004002", "cat": "Alimentos Básicos", "name": "Pasta La Moderna (500g)", "cost_price": 1.20, "sale_price": 2.20, "stock": 45, "min_stock": 15},
    {"barcode": "7591001005009", "cat": "Alimentos Básicos", "name": "Harina de Maíz Juana (1kg)", "cost_price": 1.80, "sale_price": 3.20, "stock": 5, "min_stock": 10},
    {"barcode": "7591001006006", "cat": "Alimentos Básicos", "name": "Aceite Maíz Diana (1L)", "cost_price": 3.50, "sale_price": 5.50, "stock": 20, "min_stock": 8},
    {"barcode": "7591001007003", "cat": "Alimentos Básicos", "name": "Sal Marina (500g)", "cost_price": 0.80, "sale_price": 1.50, "stock": 30, "min_stock": 10},
    {"barcode": "7591001008000", "cat": "Alimentos Básicos", "name": "Café La Virginia (500g)", "cost_price": 4.00, "sale_price": 6.50, "stock": 15, "min_stock": 8},
    {"barcode": "7591001009007", "cat": "Alimentos Básicos", "name": "Leche Parmalat (1L)", "cost_price": 2.20, "sale_price": 3.80, "stock": 25, "min_stock": 10},
    {"barcode": "7591001010003", "cat": "Alimentos Básicos", "name": "Queso Guayanés (500g)", "cost_price": 3.00, "sale_price": 5.00, "stock": 0, "min_stock": 5},
    {"barcode": "7591001031009", "cat": "Alimentos Básicos", "name": "Huevos (cartón 30)", "cost_price": 4.50, "sale_price": 7.00, "stock": 10, "min_stock": 5},
    {"barcode": "7591001032006", "cat": "Alimentos Básicos", "name": "Pan de Molde Bimbo (500g)", "cost_price": 2.20, "sale_price": 3.80, "stock": 2, "min_stock": 6},
    {"barcode": "7591001033003", "cat": "Alimentos Básicos", "name": "Mantequilla Mavesa (250g)", "cost_price": 1.80, "sale_price": 3.20, "stock": 15, "min_stock": 6},
    {"barcode": "7591001034000", "cat": "Alimentos Básicos", "name": "Margarina Pampero (500g)", "cost_price": 1.60, "sale_price": 2.80, "stock": 12, "min_stock": 5},
    {"barcode": "7591001035007", "cat": "Alimentos Básicos", "name": "Fósforos (caja)", "cost_price": 0.30, "sale_price": 0.60, "stock": 60, "min_stock": 20},

    # Bebidas (unidad)
    {"barcode": "7591001011000", "cat": "Bebidas", "name": "Coca-Cola (2L)", "cost_price": 1.80, "sale_price": 3.00, "stock": 60, "min_stock": 20},
    {"barcode": "7591001012007", "cat": "Bebidas", "name": "Polar Ice (litro)", "cost_price": 1.20, "sale_price": 2.20, "stock": 48, "min_stock": 15},
    {"barcode": "7591001013004", "cat": "Bebidas", "name": "Maltín Polar (lata)", "cost_price": 0.90, "sale_price": 1.80, "stock": 36, "min_stock": 12},
    {"barcode": "7591001014001", "cat": "Bebidas", "name": "Jugo de Naranja Del Valle (1L)", "cost_price": 2.00, "sale_price": 3.50, "stock": 20, "min_stock": 8},
    {"barcode": "7591001015008", "cat": "Bebidas", "name": "Agua Mineral (1.5L)", "cost_price": 0.70, "sale_price": 1.30, "stock": 72, "min_stock": 24},

    # Enlatados y conservas (unidad)
    {"barcode": "7591001016005", "cat": "Enlatados y Conservas", "name": "Atún Golf (lata)", "cost_price": 1.50, "sale_price": 2.80, "stock": 30, "min_stock": 10},
    {"barcode": "7591001017002", "cat": "Enlatados y Conservas", "name": "Sardinas La Campiña (lata)", "cost_price": 1.00, "sale_price": 2.00, "stock": 25, "min_stock": 8},
    {"barcode": "7591001018009", "cat": "Enlatados y Conservas", "name": "Salsa de Tomate Pampero (500g)", "cost_price": 1.40, "sale_price": 2.50, "stock": 22, "min_stock": 8},
    {"barcode": "7591001019006", "cat": "Enlatados y Conservas", "name": "Mayonesa Mavesa (500g)", "cost_price": 2.00, "sale_price": 3.60, "stock": 18, "min_stock": 6},
    {"barcode": "7591001020002", "cat": "Enlatados y Conservas", "name": "Leche Condensada La Campiña", "cost_price": 2.50, "sale_price": 4.20, "stock": 12, "min_stock": 5},

    # Aseo personal y hogar (unidad)
    {"barcode": "7591001021009", "cat": "Aseo Personal y Hogar", "name": "Jabón de Baño Dove", "cost_price": 1.80, "sale_price": 3.20, "stock": 3, "min_stock": 8},
    {"barcode": "7591001022006", "cat": "Aseo Personal y Hogar", "name": "Papel Higiénico Scott (4 rollos)", "cost_price": 2.00, "sale_price": 3.80, "stock": 28, "min_stock": 10},
    {"barcode": "7591001023003", "cat": "Aseo Personal y Hogar", "name": "Detergente Ajax (1kg)", "cost_price": 2.80, "sale_price": 4.80, "stock": 16, "min_stock": 6},
    {"barcode": "7591001024000", "cat": "Aseo Personal y Hogar", "name": "Cloro Clorox (1L)", "cost_price": 1.20, "sale_price": 2.30, "stock": 20, "min_stock": 8},
    {"barcode": "7591001025007", "cat": "Aseo Personal y Hogar", "name": "Cepillo Dental Colgate", "cost_price": 1.50, "sale_price": 2.80, "stock": 14, "min_stock": 6},

    # Snacks y golosinas (unidad)
    {"barcode": "7591001026004", "cat": "Snacks y Golosinas", "name": "Galletas María (paquete)", "cost_price": 0.80, "sale_price": 1.60, "stock": 40, "min_stock": 15},
    {"barcode": "7591001027001", "cat": "Snacks y Golosinas", "name": "Chocolate Savoy", "cost_price": 2.00, "sale_price": 3.50, "stock": 24, "min_stock": 8},
    {"barcode": "7591001028008", "cat": "Snacks y Golosinas", "name": "Caramelos Merenguitos (100g)", "cost_price": 0.60, "sale_price": 1.20, "stock": 50, "min_stock": 20},
    {"barcode": "7591001029005", "cat": "Snacks y Golosinas", "name": "Papas Lay's (bolsa)", "cost_price": 1.00, "sale_price": 2.00, "stock": 35, "min_stock": 12},
    {"barcode": "7591001030002", "cat": "Snacks y Golosinas", "name": "Chicle Trident", "cost_price": 0.40, "sale_price": 0.80, "stock": 80, "min_stock": 30},

    # Carnicería (peso, gramos; precios por kg)
    {"barcode": "7777000000001", "cat": "Carnicería", "name": "Carne de Res (kg)", "cost_price": 7.00, "sale_price": 9.00, "stock": 20000, "min_stock": 5000},
    {"barcode": "7777000000002", "cat": "Carnicería", "name": "Pollo (kg)", "cost_price": 3.50, "sale_price": 4.80, "stock": 15000, "min_stock": 4000},
    {"barcode": "7777000000003", "cat": "Carnicería", "name": "Carne de Cerdo (kg)", "cost_price": 5.00, "sale_price": 6.80, "stock": 10000, "min_stock": 3000},

    # Charcutería (peso, gramos)
    {"barcode": "7777000000004", "cat": "Charcutería", "name": "Jamón (kg)", "cost_price": 6.00, "sale_price": 8.00, "stock": 8000, "min_stock": 2000},
    {"barcode": "7777000000005", "cat": "Charcutería", "name": "Mortadela (kg)", "cost_price": 4.00, "sale_price": 5.50, "stock": 7000, "min_stock": 2000},
    {"barcode": "7777000000006", "cat": "Charcutería", "name": "Salchichas (kg)", "cost_price": 4.50, "sale_price": 6.00, "stock": 6000, "min_stock": 2000},

    # Frutas, verduras y hortalizas (peso, gramos)
    {"barcode": "7777000000007", "cat": "Frutas, Verduras y Hortalizas", "name": "Tomate (kg)", "cost_price": 1.20, "sale_price": 2.00, "stock": 12000, "min_stock": 3000},
    {"barcode": "7777000000008", "cat": "Frutas, Verduras y Hortalizas", "name": "Cebolla (kg)", "cost_price": 1.00, "sale_price": 1.80, "stock": 14000, "min_stock": 3000},
    {"barcode": "7777000000009", "cat": "Frutas, Verduras y Hortalizas", "name": "Zanahoria (kg)", "cost_price": 0.80, "sale_price": 1.50, "stock": 10000, "min_stock": 2500},
    {"barcode": "7777000000010", "cat": "Frutas, Verduras y Hortalizas", "name": "Plátano (kg)", "cost_price": 1.10, "sale_price": 1.90, "stock": 18000, "min_stock": 4000},
]

USUARIOS = [
    {"username": "admin", "password": "admin123", "full_name": "Administrador", "role": "admin"},
    {"username": "cajero1", "password": "cajero123", "full_name": "María López", "role": "vendedor"},
    {"username": "cajero2", "password": "cajero123", "full_name": "Carlos Pérez", "role": "vendedor"},
]

COMPRAS = [
    {"supplier": "Distribuidora Polar", "dias_atras": 30, "items": [
        {"producto": "Harina PAN (1kg)", "quantity": 24, "cost_price": 2.50},
        {"producto": "Polar Ice (litro)", "quantity": 48, "cost_price": 1.20},
        {"producto": "Maltín Polar (lata)", "quantity": 36, "cost_price": 0.90},
    ]},
    {"supplier": "Distribuidora Diana", "dias_atras": 25, "items": [
        {"producto": "Arroz Diana (1kg)", "quantity": 40, "cost_price": 1.80},
        {"producto": "Aceite Maíz Diana (1L)", "quantity": 20, "cost_price": 3.50},
        {"producto": "Azúcar Mont-C (1kg)", "quantity": 30, "cost_price": 1.60},
    ]},
    {"supplier": "Coca-Cola Femsa", "dias_atras": 20, "items": [
        {"producto": "Coca-Cola (2L)", "quantity": 60, "cost_price": 1.80},
        {"producto": "Jugo de Naranja Del Valle (1L)", "quantity": 20, "cost_price": 2.00},
        {"producto": "Agua Mineral (1.5L)", "quantity": 72, "cost_price": 0.70},
    ]},
    {"supplier": "Distribuidora La Campiña", "dias_atras": 18, "items": [
        {"producto": "Atún Golf (lata)", "quantity": 30, "cost_price": 1.50},
        {"producto": "Sardinas La Campiña (lata)", "quantity": 25, "cost_price": 1.00},
        {"producto": "Leche Condensada La Campiña", "quantity": 12, "cost_price": 2.50},
    ]},
    {"supplier": "Alimentos Pampero", "dias_atras": 14, "items": [
        {"producto": "Salsa de Tomate Pampero (500g)", "quantity": 20, "cost_price": 1.40},
        {"producto": "Mayonesa Mavesa (500g)", "quantity": 18, "cost_price": 2.00},
        {"producto": "Margarina Pampero (500g)", "quantity": 12, "cost_price": 1.60},
    ]},
    {"supplier": "Empresas Savoy", "dias_atras": 10, "items": [
        {"producto": "Galletas María (paquete)", "quantity": 40, "cost_price": 0.80},
        {"producto": "Chocolate Savoy", "quantity": 24, "cost_price": 2.00},
        {"producto": "Harina PAN (1kg)", "quantity": 30, "cost_price": 2.50},
    ]},
    {"supplier": "Distribuidora Scott", "dias_atras": 7, "items": [
        {"producto": "Papel Higiénico Scott (4 rollos)", "quantity": 24, "cost_price": 2.00},
        {"producto": "Detergente Ajax (1kg)", "quantity": 16, "cost_price": 2.80},
        {"producto": "Cloro Clorox (1L)", "quantity": 20, "cost_price": 1.20},
    ]},
    {"supplier": "Granja El Corral", "dias_atras": 5, "items": [
        {"producto": "Huevos (cartón 30)", "quantity": 10, "cost_price": 4.50},
        {"producto": "Queso Guyanáb (500g)", "quantity": 8, "cost_price": 3.00},
        {"producto": "Mantequilla Mavesa (250g)", "quantity": 15, "cost_price": 1.80},
    ]},
    {"supplier": "Panadería La Espiga", "dias_atras": 3, "items": [
        {"producto": "Pan de Molde Bimbo (500g)", "quantity": 12, "cost_price": 2.20},
        {"producto": "Harina PAN (1kg)", "quantity": 24, "cost_price": 2.50},
        {"producto": "Café La Virginia (500g)", "quantity": 15, "cost_price": 4.00},
    ]},
    {"supplier": "Carlos Matadero (Carne)", "dias_atras": 2, "items": [
        {"producto": "Carne de Res (kg)", "quantity": 20000, "cost_price": 7.00},
        {"producto": "Pollo (kg)", "quantity": 15000, "cost_price": 3.50},
    ]},
]

VENTAS = [
    {"dias_atras": 2, "payment_method": "Efectivo", "client_name": None, "reference": None, "items": [
        {"producto": "Harina PAN (1kg)", "quantity": 3},
        {"producto": "Coca-Cola (2L)", "quantity": 2},
        {"producto": "Papas Lay's (bolsa)", "quantity": 5},
    ]},
    {"dias_atras": 1, "payment_method": "Punto", "client_name": "María Rodríguez", "reference": "Venta-657284", "items": [
        {"producto": "Arroz Diana (1kg)", "quantity": 2},
        {"producto": "Aceite Maíz Diana (1L)", "quantity": 1},
        {"producto": "Leche Parmalat (1L)", "quantity": 3},
        {"producto": "Pan de Molde Bimbo (500g)", "quantity": 2},
    ]},
    {"dias_atras": 1, "payment_method": "Efectivo", "client_name": "Pedro Gómez", "reference": None, "items": [
        {"producto": "Café La Virginia (500g)", "quantity": 1},
        {"producto": "Azúcar Mont-C (1kg)", "quantity": 2},
        {"producto": "Leche Condensada La Campiña", "quantity": 1},
    ]},
    {"dias_atras": 0, "payment_method": "Pago Móvil", "client_name": "Ana Martínez", "reference": "0412-3456789", "items": [
        {"producto": "Polar Ice (litro)", "quantity": 6},
        {"producto": "Maltín Polar (lata)", "quantity": 4},
        {"producto": "Chocolate Savoy", "quantity": 3},
    ]},
    {"dias_atras": 0, "payment_method": "Efectivo", "client_name": None, "reference": None, "items": [
        {"producto": "Huevos (cartón 30)", "quantity": 1},
        {"producto": "Mantequilla Mavesa (250g)", "quantity": 2},
        {"producto": "Pan de Molde Bimbo (500g)", "quantity": 1},
        {"producto": "Galletas María (paquete)", "quantity": 3},
    ]},
    {"dias_atras": 0, "payment_method": "Biopago", "client_name": "Carlos Mendoza", "reference": "BIO-982374", "items": [
        {"producto": "Detergente Ajax (1kg)", "quantity": 2},
        {"producto": "Cloro Clorox (1L)", "quantity": 3},
        {"producto": "Jabón de Baño Dove", "quantity": 4},
    ]},
    {"dias_atras": 0, "payment_method": "Efectivo", "client_name": None, "reference": None, "items": [
        {"producto": "Carne de Res (kg)", "quantity": 750},   # 0.750 kg -> 6.75
        {"producto": "Tomate (kg)", "quantity": 1500},        # 1.5 kg  -> 3.00
        {"producto": "Jamón (kg)", "quantity": 250},          # 0.25 kg -> 2.00
    ]},
]


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _unit_of(cat_name):
    for c in CATEGORIAS:
        if c["name"] == cat_name:
            return c["sale_unit"]
    return "unidad"


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # --- CATEGORÍAS ---
        if db.query(Category).count() == 0:
            print("Creando categorías...")
            for c in CATEGORIAS:
                db.add(Category(**c))
            db.commit()
        cat_map = {c.name: c for c in db.query(Category).all()}
        print(f"  [OK] {len(cat_map)} categorías")

        # --- USUARIOS (bcrypt) ---
        if db.query(User).count() == 0:
            print("Creando usuarios...")
            for u in USUARIOS:
                db.add(User(
                    username=u["username"],
                    password=hash_password(u["password"]),
                    full_name=u["full_name"],
                    role=u.get("role", "vendedor"),
                ))
            db.commit()
            print("  [OK] usuarios creados")
        else:
            print("  [-] Usuarios ya existen, saltando")

        # --- TASA BCV ---
        if db.query(ExchangeRate).count() == 0:
            print("Creando tasa BCV...")
            db.add(ExchangeRate(currency="USD", rate=42.50))
            db.commit()
            print("  [OK] tasa BCV creada")
        else:
            print("  [-] Tasa BCV ya existe, saltando")

        # --- PRODUCTOS ---
        if db.query(Product).count() == 0:
            print("Creando productos...")
            for p in PRODUCTOS:
                cat_name = p.pop("cat")
                categoria = cat_map.get(cat_name)
                db.add(Product(**p, category_id=categoria.id if categoria else None))
            db.commit()
            print(f"  [OK] {len(PRODUCTOS)} productos creados")
        else:
            print("  [-] Productos ya existen, saltando")

        # --- COMPRAS ---
        if db.query(Purchase).count() == 0:
            print("Creando compras de ejemplo...")
            prod_map = {p.name: p for p in db.query(Product).all()}
            for c in COMPRAS:
                detalles = []
                total = 0.0
                for it in c["items"]:
                    prod = prod_map.get(it["producto"])
                    if not prod:
                        print(f"  [!] Producto '{it['producto']}' no encontrado, saltando")
                        continue
                    prod.stock = (prod.stock or 0) + it["quantity"]
                    prod.cost_price = it["cost_price"]
                    total += it["cost_price"] * it["quantity"]
                    detalles.append(PurchaseDetail(
                        product_id=prod.id, quantity=it["quantity"], cost_price=it["cost_price"],
                    ))
                fecha = _utcnow() - timedelta(days=c["dias_atras"])
                db.add(Purchase(supplier=c["supplier"], total=total, created_at=fecha, details=detalles))
            db.commit()
            print(f"  [OK] {len(COMPRAS)} compras registradas")
        else:
            print("  [-] Compras ya existen, saltando")

        # --- VENTAS ---
        if db.query(Sale).count() == 0:
            print("Creando ventas de ejemplo...")
            prod_map = {p.name: p for p in db.query(Product).all()}
            for v in VENTAS:
                detalles = []
                total = 0.0
                for it in v["items"]:
                    prod = prod_map.get(it["producto"])
                    if not prod:
                        print(f"  [!] Producto '{it['producto']}' no encontrado, saltando")
                        continue
                    if prod.sale_unit == "peso":
                        subtotal = prod.sale_price * (it["quantity"] / 1000.0)
                    else:
                        subtotal = prod.sale_price * it["quantity"]
                    total += subtotal
                    detalles.append(SaleDetail(
                        product_id=prod.id, quantity=it["quantity"],
                        price_at_sale=prod.sale_price, cost_price=prod.cost_price,
                    ))
                    if prod.stock is not None:
                        prod.stock = max(0, prod.stock - it["quantity"])
                fecha = _utcnow() - timedelta(days=v["dias_atras"], hours=2)
                db.add(Sale(
                    total=total, payment_method=v["payment_method"],
                    client_name=v.get("client_name"), reference=v.get("reference"),
                    created_at=fecha, details=detalles,
                ))
            db.commit()
            print(f"  [OK] {len(VENTAS)} ventas registradas")
        else:
            print("  [-] Ventas ya existen, saltando")

        # --- BACKFILL: asignar categoría/sale_unit a productos legacy sin categoría ---
        # Mapeo por NOMBRE EXACTO contra la semilla (evita falsos positivos del tipo
        # "Salsa de Tomate" -> Frutas por contener "tomate").
        nombre_a_cat = {p["name"]: p.get("cat") for p in PRODUCTOS}
        sin_cat = [p for p in db.query(Product).all() if not p.category_id]
        cambios = 0
        for p in sin_cat:
            cat_name = nombre_a_cat.get(p.name)
            if cat_name is None:
                continue
            categoria = cat_map.get(cat_name)
            if categoria:
                p.category_id = categoria.id
                p.sale_unit = categoria.sale_unit
                cambios += 1
        if cambios:
            db.commit()
            print(f"  [OK] {cambios} productos existentes categorizados")

        print("\n[OK] Seed completado exitosamente")

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Error durante el seed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()