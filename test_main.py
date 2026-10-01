import pytest
from datetime import datetime, timezone
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from database import Base, get_db
from main import app
from models import Category, Product, ExchangeRate, Sale, SaleDetail, User
from security import hash_password
from time_ve import dia_de_utc_naive

# Base de datos en memoria con StaticPool para preservar las tablas
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def _crear_usuario_db(username, password, full_name="Admin", role="admin"):
    """Crea un usuario directamente en la BD (el CRUD de usuarios es solo admin)."""
    with TestingSessionLocal() as db:
        db.add(User(username=username, password=hash_password(password), full_name=full_name, role=role))
        db.commit()


def _login(username="admin", password="admin123", role="admin"):
    _crear_usuario_db(username, password, role=role)
    resp = client.post("/api/usuarios/login", json={"username": username, "password": password})
    return resp.json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_health():
    assert client.get("/api/health").status_code == 200


def test_auth_requerido():
    # Sin token, los endpoints protegidos deben devolver 401
    assert client.get("/api/productos").status_code == 401
    assert client.get("/api/categorias").status_code == 401
    assert client.get("/api/dashboard").status_code == 401


def test_login():
    token = _login()
    assert token
    # Token inválido
    assert client.get("/api/productos", headers=_auth("token-falso")).status_code == 401


def test_tasa_bcv():
    response = client.get("/api/tasa")
    assert response.status_code == 200
    data = response.json()
    assert data["currency"] == "USD"
    assert data["rate"] > 0


def test_usuarios():
    token = _login()
    h = _auth(token)

    resp = client.post("/api/usuarios", json={
        "username": "adrian", "password": "mysecretpassword", "full_name": "Adrian Bello",
    }, headers=h)
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "adrian"
    assert "id" in data

    # Duplicado
    assert client.post("/api/usuarios", json={
        "username": "adrian", "password": "otraclave123", "full_name": "x",
    }, headers=h).status_code == 400

    # Login correcto e incorrecto
    ok = client.post("/api/usuarios/login", json={"username": "adrian", "password": "mysecretpassword"}).json()
    assert ok["ok"] is True and ok["token"]
    bad = client.post("/api/usuarios/login", json={"username": "adrian", "password": "wrong"}).json()
    assert bad["ok"] is False


def test_crud_usuarios_solo_admin():
    """El CRUD de usuarios solo está disponible para administradores."""
    token = _login()
    h = _auth(token)

    # Crear vendedor
    r = client.post("/api/usuarios", json={
        "username": "cajero", "password": "cajero123", "full_name": "María", "role": "vendedor",
    }, headers=h)
    assert r.status_code == 200
    uid = r.json()["id"]

    # Duplicado
    assert client.post("/api/usuarios", json={"username": "cajero", "password": "x12345", "role": "vendedor"}, headers=h).status_code == 400

    # Listar y consultar por id
    lista = client.get("/api/usuarios", headers=h).json()
    assert len(lista) == 2
    assert client.get(f"/api/usuarios/{uid}", headers=h).json()["username"] == "cajero"

    # Un vendedor NO puede gestionar usuarios (403)
    vtoken = client.post("/api/usuarios/login", json={"username": "cajero", "password": "cajero123"}).json()["token"]
    vh = _auth(vtoken)
    assert client.get("/api/usuarios", headers=vh).status_code == 403
    assert client.post("/api/usuarios", json={"username": "nuevox", "password": "123456"}, headers=vh).status_code == 403

    # Actualizar datos y rol
    upd = client.put(f"/api/usuarios/{uid}", json={"full_name": "María López", "role": "vendedor"}, headers=h).json()
    assert upd["full_name"] == "María López"

    # Contraseña demasiado corta -> 422
    assert client.put(f"/api/usuarios/{uid}", json={"password": "ab"}, headers=h).status_code == 422

    # No puedes eliminarte a ti mismo ni degradar al último admin
    admin_id = client.get("/api/usuarios", headers=h).json()[0]["id"]
    assert client.delete(f"/api/usuarios/{admin_id}", headers=h).status_code == 400
    assert client.put(f"/api/usuarios/{admin_id}", json={"role": "vendedor"}, headers=h).status_code == 400

    # Eliminar al vendedor
    assert client.delete(f"/api/usuarios/{uid}", headers=h).status_code == 200
    assert client.get(f"/api/usuarios/{uid}", headers=h).status_code == 404


def test_categorias():
    token = _login()
    h = _auth(token)

    # Crear categoría peso
    resp = client.post("/api/categorias", json={
        "name": "Carnicería", "description": "venta por kg", "sale_unit": "peso",
    }, headers=h)
    assert resp.status_code == 200
    cat = resp.json()
    assert cat["sale_unit"] == "peso"

    # Duplicado
    assert client.post("/api/categorias", json={"name": "Carnicería"}, headers=h).status_code == 400

    # Listar
    cats = client.get("/api/categorias", headers=h).json()
    assert any(c["name"] == "Carnicería" for c in cats)

    # Eliminar vacía OK; con productos no
    assert client.delete(f"/api/categorias/{cat['id']}", headers=h).status_code == 200


def test_productos_con_categoria():
    token = _login()
    h = _auth(token)

    # Crear categoría peso
    cat = client.post("/api/categorias", json={"name": "Charcutería", "sale_unit": "peso"}, headers=h).json()
    cat_id = cat["id"]

    # El sale_unit lo define la categoría automáticamente
    prod = client.post("/api/productos", json={
        "barcode": "7501000123456", "name": "Jamón", "cost_price": 5.0, "sale_price": 8.0,
        "stock": 5000, "min_stock": 1000, "category_id": cat_id,
    }, headers=h).json()
    assert prod["sale_unit"] == "peso"
    assert prod["category_name"] == "Charcutería"

    # Consultar por barcode e id
    assert client.get(f"/api/productos/{prod['id']}", headers=h).status_code == 200
    assert client.get(f"/api/productos/barcode/7501000123456", headers=h).status_code == 200
    assert client.get("/api/productos/barcode/999", headers=h).status_code == 404

    # Precios negativos no permitidos
    bad = {"name": "X", "cost_price": 1.0, "sale_price": -1.0}
    assert client.post("/api/productos", json=bad, headers=h).status_code == 422

    # Categoría inexistente
    err = client.post("/api/productos", json={
        "name": "Y", "cost_price": 1, "sale_price": 2, "category_id": 9999,
    }, headers=h)
    assert err.status_code == 400


def test_compras_y_ventas():
    token = _login()
    h = _auth(token)

    cat_un = client.post("/api/categorias", json={"name": "Abarrotes", "sale_unit": "unidad"}, headers=h).json()
    prod = client.post("/api/productos", json={
        "barcode": "1111", "name": "Harina Pan", "cost_price": 0.80, "sale_price": 1.20,
        "stock": 5, "min_stock": 2, "category_id": cat_un["id"],
    }, headers=h).json()
    prod_id = prod["id"]

    # Venta vacía y con cantidad negativa
    assert client.post("/api/ventas", json={"items": []}, headers=h).status_code == 422
    assert client.post("/api/ventas", json={"items": [{"product_id": prod_id, "quantity": -2}]}, headers=h).status_code == 422

    # Venta válida
    sale = client.post("/api/ventas", json={"items": [{"product_id": prod_id, "quantity": 2}]}, headers=h).json()
    assert sale["total"] == 2.40
    assert len(sale["details"]) == 1
    assert client.get(f"/api/productos/{prod_id}", headers=h).json()["stock"] == 3

    # Stock insuficiente
    resp = client.post("/api/ventas", json={"items": [{"product_id": prod_id, "quantity": 4}]}, headers=h)
    assert resp.status_code == 400
    assert "Stock insuficiente" in resp.json()["detail"]

    # Compra (modalidad caja: 2 cajas x 5 unidades = 10 uds)
    purchase = client.post("/api/compras", json={
        "supplier": "Distribuidora Polar",
        "items": [{"product_id": prod_id, "boxes": 2, "units_per_box": 5, "cost_price": 0.85}],
    }, headers=h).json()
    assert purchase["total"] == 8.50
    p = client.get(f"/api/productos/{prod_id}", headers=h).json()
    assert p["stock"] == 13 and p["cost_price"] == 0.85


def test_compra_crea_producto_peso_y_caja():
    """La compra crea/actualiza el producto: peso por kg (stock en gramos) y caja por unidades."""
    token = _login()
    h = _auth(token)
    cat_peso = client.post("/api/categorias", json={"name": "Carnicería", "sale_unit": "peso"}, headers=h).json()
    cat_caja = client.post("/api/categorias", json={"name": "Alimentos", "sale_unit": "unidad"}, headers=h).json()

    # Producto peso: 10 kg de carne a 2.00 USD/kg -> 5.000 g de stock
    compra = client.post("/api/compras", json={
        "supplier": "Matadero El Corral",
        "items": [{
            "name": "Carne de Res (kg)", "category_id": cat_peso["id"],
            "cost_price": 2.00, "sale_price": 3.50, "weight_kg": 5.0,
        }],
    }, headers=h).json()
    assert compra["total"] == 10.00
    det = compra["details"][0]
    assert det["quantity"] == 5000 and det["weight_kg"] == 5.0
    prod = client.get(f"/api/productos/{det['product']['id']}", headers=h).json()
    assert prod["sale_unit"] == "peso" and prod["stock"] == 5000 and prod["sale_price"] == 3.50

    # Producto caja: 3 cajas x 4 uds = 12 unidades de Harina
    compra2 = client.post("/api/compras", json={
        "supplier": "Distribuidora Polar",
        "items": [{
            "name": "Harina PAN (1kg)", "category_name": None,
            "category_id": cat_caja["id"],
            "cost_price": 1.00, "sale_price": 1.80, "boxes": 3, "units_per_box": 4,
        }],
    }, headers=h).json()
    det2 = compra2["details"][0]
    assert det2["quantity"] == 12 and det2["boxes"] == 3 and det2["units_per_box"] == 4
    prod2 = client.get(f"/api/productos/{det2['product']['id']}", headers=h).json()
    assert prod2["sale_unit"] == "unidad" and prod2["stock"] == 12


def test_descargar_pdf_compra():
    """El endpoint /{id}/pdf devuelve un PDF válido con el detalle de la compra."""
    token = _login()
    h = _auth(token)
    cat_caja = client.post("/api/categorias", json={"name": "Alimentos", "sale_unit": "unidad"}, headers=h).json()
    compra = client.post("/api/compras", json={
        "supplier": "Distribuidora",
        "items": [{
            "name": "Harina PAN (1kg)", "category_id": cat_caja["id"],
            "cost_price": 1.00, "sale_price": 1.80, "boxes": 2, "units_per_box": 12,
        }],
    }, headers=h).json()
    cid = compra["id"]

    resp = client.get(f"/api/compras/{cid}/pdf", headers=h)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")


def test_venta_peso():
    """Un producto de categoría peso se cobra por kilogramo (cantidad en gramos)."""
    token = _login()
    h = _auth(token)
    cat = client.post("/api/categorias", json={"name": "Frutas", "sale_unit": "peso"}, headers=h).json()
    prod = client.post("/api/productos", json={
        "barcode": "P1", "name": "Tomate", "cost_price": 1.20, "sale_price": 2.00,
        "stock": 5000, "min_stock": 1000, "category_id": cat["id"],
    }, headers=h).json()

    sale = client.post("/api/ventas", json={"items": [{"product_id": prod["id"], "quantity": 1500}]}, headers=h).json()
    # 1500 g = 1.5 kg * 2.00 = 3.00
    assert sale["total"] == 3.00
    assert client.get(f"/api/productos/{prod['id']}", headers=h).json()["stock"] == 3500


def test_dashboard_dia_negocio_es_venezuela_no_utc():
    """El día de negocio debe cambiar a medianoche de Venezuela, no a las 20:00.

    Una venta registrada a las 21:30 hora de Venezuela se guarda como 01:30 UTC
    del día siguiente. Si el corte del día fuera UTC (medianoche UTC = 20:00
    Venezuela), el sistema "cambiaría de día" a las 8pm y dejaría de contar las
    ventas de la tarde-noche. Este test congela el reloj para esa franja.
    """
    token = _login()
    h = _auth(token)
    cat = client.post("/api/categorias", json={"name": "Nocturno", "sale_unit": "unidad"}, headers=h).json()
    prod = client.post("/api/productos", json={
        "barcode": "N1", "name": "Refresco", "cost_price": 1.0, "sale_price": 2.0,
        "stock": 50, "min_stock": 5, "category_id": cat["id"],
    }, headers=h).json()

    # 21:30 hora de Venezuela  ->  01:30 UTC del día siguiente
    with TestingSessionLocal() as db:
        db.add(Sale(
            total=2.0, iva_amount=0.28, igtf_amount=0.0, rate_usd=400.0,
            payment_method="Punto", created_at=datetime(2026, 9, 30, 1, 30),
            details=[SaleDetail(product_id=prod["id"], quantity=1, price_at_sale=2.0, cost_price=1.0)],
        ))
        db.commit()

    # Con el reloj congelado en 21:40 Venezuela (01:40 UTC), el día es 29/09.
    with patch("routers.dashboard._ahora_ve", return_value=datetime(2026, 9, 29, 21, 40)):
        d = client.get("/api/dashboard", headers=h).json()
    assert d["ventas_hoy"] == 2.0, "la venta de las 21:30 debe contar como HOY"
    assert d["transacciones_hoy"] == 1
    # Al día siguiente (30/09) la venta ya no es de hoy. Con el corte en UTC
    # seguía contándose porque su created_at cae dentro del "día" UTC.
    with patch("routers.dashboard._ahora_ve", return_value=datetime(2026, 9, 30, 15, 0)):
        manana = client.get("/api/dashboard", headers=h).json()
    assert manana["ventas_hoy"] == 0.0
    assert manana["transacciones_hoy"] == 0


def test_dashboard():
    token = _login()
    h = _auth(token)
    cat_u = client.post("/api/categorias", json={"name": "Aseo", "sale_unit": "unidad"}, headers=h).json()
    cat_p = client.post("/api/categorias", json={"name": "Frutas", "sale_unit": "peso"}, headers=h).json()

    p1 = client.post("/api/productos", json={
        "barcode": "D1", "name": "Arroz 1kg", "cost_price": 0.90, "sale_price": 1.50,
        "stock": 10, "min_stock": 5, "category_id": cat_u["id"],
    }, headers=h).json()
    prod2 = client.post("/api/productos", json={
        "barcode": "D2", "name": "Leche 1L", "cost_price": 1.50, "sale_price": 2.50,
        "stock": 2, "min_stock": 5, "category_id": cat_u["id"],
    }, headers=h).json()
    tp = client.post("/api/productos", json={
        "barcode": "D3", "name": "Tomate", "cost_price": 1.00, "sale_price": 2.00,
        "stock": 3000, "min_stock": 1000, "category_id": cat_p["id"],
    }, headers=h).json()

    client.post("/api/ventas", json={"items": [
        {"product_id": p1["id"], "quantity": 2},
        {"product_id": prod2["id"], "quantity": 1},
        {"product_id": tp["id"], "quantity": 1000},   # 1 kg -> 2.00, ganancia (2-1)*1=1
    ]}, headers=h)

    d = client.get("/api/dashboard", headers=h).json()
    assert d["ventas_hoy"] == 7.50   # 3.00 + 2.50 + 2.00
    assert d["transacciones_hoy"] == 1
    assert d["ganancia_dia"] == 3.20  # 1.20 + 1.00 + 1.00
    assert len(d["stock_bajo"]) == 1
    assert d["stock_bajo"][0]["name"] == "Leche 1L"
    assert d["valor_inventario"] == 10.70  # 8*0.90 + 1*1.50 + 2.0*0.001*... = 7.2+1.5+2 = 10.7


def test_baja_reactivar_restaurar():
    """Baja lógica: resta stock con motivo, inactiva al llegar a 0, reactiva y restaura."""
    token = _login()
    h = _auth(token)
    cat = client.post("/api/categorias", json={"name": "Frutas", "sale_unit": "peso"}, headers=h).json()
    prod = client.post("/api/productos", json={
        "name": "Papa (kg)", "cost_price": 1.00, "sale_price": 1.50,
        "stock": 5000, "min_stock": 1000, "category_id": cat["id"],
    }, headers=h).json()

    # Baja de 1 kg (1000 g) -> stock 4000, sigue activa
    r = client.post(f"/api/productos/{prod['id']}/baja", json={"cantidad": 1000, "motivo": "vencido"}, headers=h).json()
    assert r["cantidad"] == 1000 and r["motivo"] == "vencido" and r["restaurada"] is False
    assert client.get(f"/api/productos/{prod['id']}", headers=h).json()["stock"] == 4000

    # Dar de baja hasta agotar stock -> inactiva
    client.post(f"/api/productos/{prod['id']}/baja", json={"cantidad": 4000, "motivo": "merma"}, headers=h)
    p = client.get(f"/api/productos/{prod['id']}", headers=h).json()
    assert p["stock"] == 0 and p["activo"] is False

    # Aparece en listado de inactivos y no en el activo
    assert client.get("/api/productos", headers=h).json() == []
    assert len(client.get("/api/productos?incluir_inactivos=true", headers=h).json()) == 1

    # Reactivar manualmente el producto
    client.post(f"/api/productos/{prod['id']}/reactivar", headers=h)
    assert client.get(f"/api/productos/{prod['id']}", headers=h).json()["activo"] is True

    # Baja sin stock debe fallar
    resp = client.post(f"/api/productos/{prod['id']}/baja", json={"cantidad": 1, "motivo": "x"}, headers=h)
    assert resp.status_code == 400

    # Restaurar la primera baja (1000) repone esa cantidad y se marca como restaurada
    bajas = client.get("/api/productos/bajas", headers=h).json()
    assert len(bajas) == 2
    client.post(f"/api/productos/bajas/{bajas[1]['id']}/restaurar", headers=h)
    assert client.get(f"/api/productos/{prod['id']}", headers=h).json()["stock"] == 1000
    rest = client.get("/api/productos/bajas", headers=h).json()
    assert any(b["id"] == bajas[1]["id"] and b["restaurada"] for b in rest)

    # Doble restauración debe fallarse
    resp = client.post(f"/api/productos/bajas/{bajas[1]['id']}/restaurar", headers=h)
    assert resp.status_code == 400


def test_bajas_solo_admin():
    """La lista/restauración de bajas exige rol admin."""
    token = _login()
    h = _auth(token)
    client.post("/api/usuarios", json={"username": "cajero", "password": "caj456", "full_name": "Cajero", "role": "vendedor"}, headers=h)
    vt = client.post("/api/usuarios/login", json={"username": "cajero", "password": "caj456"}).json()["token"]
    vh = _auth(vt)
    assert client.get("/api/productos/bajas", headers=vh).status_code == 403


def test_compra_reactiva_producto_inactivo():
    """Al comprar un producto que estaba inactivo, este debe reactivarse automáticamente."""
    token = _login()
    h = _auth(token)
    cat_un = client.post("/api/categorias", json={"name": "Abarrotes", "sale_unit": "unidad"}, headers=h).json()
    
    # Crear producto activo con stock = 5
    prod = client.post("/api/productos", json={
        "barcode": "5555", "name": "Refresco", "cost_price": 1.0, "sale_price": 1.5,
        "stock": 5, "min_stock": 2, "category_id": cat_un["id"],
    }, headers=h).json()
    prod_id = prod["id"]
    assert prod["activo"] is True

    # Dar de baja el stock completo (5 unidades) -> queda inactivo
    client.post(f"/api/productos/{prod_id}/baja", json={"cantidad": 5, "motivo": "dañado"}, headers=h)
    
    p_inactivo = client.get(f"/api/productos/{prod_id}", headers=h).json()
    assert p_inactivo["stock"] == 0 and p_inactivo["activo"] is False

    # Comprar stock para el producto (1 caja x 10 uds = 10 uds)
    client.post("/api/compras", json={
        "supplier": "Proveedor Refrescos",
        "items": [{"product_id": prod_id, "boxes": 1, "units_per_box": 10, "cost_price": 0.90}],
    }, headers=h)

    # Verificar que el producto se haya reactivado y tenga stock = 10
    p_reactivado = client.get(f"/api/productos/{prod_id}", headers=h).json()
    assert p_reactivado["stock"] == 10 and p_reactivado["activo"] is True


def _crear_venta(h, cat_name="Abarrotes", barcode="9999", name="Pasta", precio=2.00, cantidad=2):
    """Helper: crea categoría + producto + una venta, devuelve (producto, venta)."""
    cat = client.post("/api/categorias", json={"name": cat_name, "sale_unit": "unidad"}, headers=h).json()
    prod = client.post("/api/productos", json={
        "barcode": barcode, "name": name, "cost_price": 1.0, "sale_price": precio,
        "stock": 50, "min_stock": 5, "category_id": cat["id"],
    }, headers=h).json()
    venta = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": cantidad}],
        "payment_method": "Pago Móvil",
    }, headers=h).json()
    return prod, venta


def test_cierre_z_bloquea_ventas():
    """Cierre Z: bloquea nuevas ventas del día y registra el cierre."""
    token = _login()
    h = _auth(token)
    prod, venta = _crear_venta(h, barcode="C1", name="Azúcar", precio=2.00, cantidad=2)  # total 4.00

    # Estado inicial: caja abierta con la venta del día contabilizada
    est = client.get("/api/ventas/cierre/estado", headers=h).json()
    assert est["cerrado"] is False
    assert est["total_ventas_hoy"] == 1
    assert est["total_usd_hoy"] == 4.00

    # Aún se puede vender antes del cierre
    assert client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 1}],
    }, headers=h).status_code == 200

    # Realizar el cierre Z: genera PDF y queda registrado
    resp = client.post("/api/ventas/cierre", headers=h)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")

    est = client.get("/api/ventas/cierre/estado", headers=h).json()
    assert est["cerrado"] is True
    assert est["cierre"]["total_ventas"] == 2

    # No se permiten más ventas del día
    resp = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 1}],
    }, headers=h)
    assert resp.status_code == 409
    assert "cerrada" in resp.json()["detail"]

    # Doble cierre rechazado
    resp = client.post("/api/ventas/cierre", headers=h)
    assert resp.status_code == 409

    # Stock no debe haberse descontado en la venta rechazada
    assert client.get(f"/api/productos/{prod['id']}", headers=h).json()["stock"] == 47


def test_abrir_caja_reabre_con_ventas_y_sin_ventas():
    """Reabrir caja elimina el cierre del día (con o sin ventas) y vuelve a contar todo."""
    token = _login()
    h = _auth(token)
    prod, venta = _crear_venta(h, barcode="C9", name="Atún", precio=3.00, cantidad=1)

    hoy = (dia_de_utc_naive(datetime.fromisoformat(venta["created_at"])).isoformat())

    # Con ventas: el cierre se registra y al abrir vuelve a contarse en el día
    assert client.post("/api/ventas/cierre", headers=h).status_code == 200
    est = client.get("/api/ventas/cierre/estado", headers=h).json()
    assert est["cerrado"] is True

    resp = client.delete("/api/ventas/cierre", headers=h)
    assert resp.status_code == 200
    assert resp.json()["abierta"] is True

    # La caja quedó abierta y la venta se sigue contando dentro de hoy
    est = client.get("/api/ventas/cierre/estado", headers=h).json()
    assert est["cerrado"] is False
    assert est["total_ventas_hoy"] == 1
    assert est["total_usd_hoy"] == 3.00

    # No-admin no puede abrir una caja (403)
    h3 = _auth(_login("vendedor1", "admin123", role="vendedor"))
    assert client.delete("/api/ventas/cierre", headers=h3).status_code == 403

    # Abrir un día que no está cerrado devuelve 404
    assert client.delete(f"/api/ventas/cierre?fecha=2020-01-01", headers=h).status_code == 404


def test_consultar_ventas_y_resumen_por_fecha():
    """Consulta de ventas y resumen estilo reporte Z para una fecha específica."""
    token = _login()
    h = _auth(token)
    prod, venta = _crear_venta(h, barcode="C2", name="Harina", precio=1.50, cantidad=3)  # total 4.50

    # created_at viene en UTC; el día de negocio es el local (Venezuela, UTC-4)
    hoy = (dia_de_utc_naive(datetime.fromisoformat(venta["created_at"])).isoformat())

    # Listado filtrado por fecha
    lista = client.get(f"/api/ventas?fecha={hoy}", headers=h).json()
    assert len(lista) == 1
    assert lista[0]["id"] == venta["id"]

    # Sin fecha devuelve todo
    assert len(client.get("/api/ventas", headers=h).json()) == 1

    # Resumen estilo reporte Z
    res = client.get(f"/api/ventas/resumen?fecha={hoy}", headers=h).json()
    assert res["total_ventas"] == 1
    assert res["total_usd"] == 4.50
    assert res["cerrado"] is False
    met = {m["metodo"]: m for m in res["metodos"]}
    assert "Pago Móvil" in met
    assert met["Pago Móvil"]["n"] == 1
    assert met["Pago Móvil"]["usd"] == 4.50

    # Re-descarga del PDF del día
    pdf = client.get(f"/api/ventas/cierre/pdf?fecha={hoy}", headers=h)
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")

    # Fecha inválida da 422
    assert client.get("/api/ventas?fecha=no-es-fecha", headers=h).status_code == 422


def test_pdf_ventas_no_cierra_la_caja_y_es_pdf_de_previsualizacion():
    """Consultar el PDF del día NO debe cerrar la caja (regresión del cierre accidental).

    Este es el escenario que reportaba el cliente: el propietario cerraba el día
    solo para ver cuántas ventas llevaba.
    """
    token = _login()
    h = _auth(token)
    prod, venta = _crear_venta(h, barcode="C3", name="Azúcar Pan", precio=2.00, cantidad=2)

    hoy = (dia_de_utc_naive(datetime.fromisoformat(venta["created_at"])).isoformat())

    # El PDF de consulta se descarga, con nombre propio y sin tocar la base
    pdf = client.get(f"/api/ventas/cierre/pdf?fecha={hoy}", headers=h)
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
    assert "ventas_" in pdf.headers["content-disposition"]
    assert "reporte_z_" not in pdf.headers["content-disposition"]

    # La caja sigue abierta: no se registró ningún cierre
    est = client.get("/api/ventas/cierre/estado", headers=h).json()
    assert est["cerrado"] is False
    assert est["cierre"] is None
    assert est["total_ventas_hoy"] == 1

    # Y se pueden seguir registrando ventas (lo que el cierre previo impedía)
    resp = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 1}],
    }, headers=h)
    assert resp.status_code == 200

    # El PDF funciona igual con el día ya cerrado (solo lectura)
    assert client.post("/api/ventas/cierre", headers=h).status_code == 200
    assert client.get(f"/api/ventas/cierre/pdf?fecha={hoy}", headers=h).status_code == 200


def test_cierre_z_requiere_admin():
    """Cerrar la caja bloquea el día, así que solo un administrador puede hacerlo."""
    h_admin = _auth(_login())
    h_vendedor = _auth(_login("vendedor_cierre", "admin123", role="vendedor"))

    # El admin crea el catálogo; el vendedor sí puede registrar ventas...
    prod, _venta = _crear_venta(h_admin, barcode="C4", name="Leche", precio=2.50, cantidad=1)

    # ...pero no cerrar la caja
    resp = client.post("/api/ventas/cierre", headers=h_vendedor)
    assert resp.status_code == 403

    # El intento fallido no dejó el día cerrado
    est = client.get("/api/ventas/cierre/estado", headers=h_admin).json()
    assert est["cerrado"] is False
    assert est["total_ventas_hoy"] == 1

    # El admin sí puede cerrarla
    assert client.post("/api/ventas/cierre", headers=h_admin).status_code == 200
    assert client.get("/api/ventas/cierre/estado", headers=h_admin).json()["cerrado"] is True
    assert prod["id"]


def test_pago_mixto_metodo_bs_referencia_igtf_parcial():
    """Pago mixto ($ efectivo + Pago Móvil en Bs): guarda método compuesto y
    referencia; el IGTF aplica proporcional a la porción en dólares."""
    h = _auth(_login())
    cat = client.post("/api/categorias", json={"name": "Mixtos", "sale_unit": "unidad"}, headers=h).json()
    prod = client.post("/api/productos", json={
        "barcode": "MIXT1", "name": "Refresco 2L", "cost_price": 0.5, "sale_price": 2.00,
        "stock": 50, "min_stock": 5, "category_id": cat["id"],
    }, headers=h).json()

    tasa = client.get("/api/tasa", headers=h).json()["rate"]
    # Total: 4 und x $2.00 = $8. La mitad ($4) en efectivo y la mitad en Bs por Pago Móvil.
    rec_usd = 4.0
    rec_bs = round(4.0 * tasa, 2)
    r = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 4}],
        "payment_method": "Mixto ($ + Pago Móvil)",
        "reference": "00845123",
        "currency": "USD",
        "received_usd": rec_usd,
        "received_bs": rec_bs,
    }, headers=h)
    assert r.status_code == 200
    venta = r.json()
    assert venta["payment_method"] == "Mixto ($ + Pago Móvil)"
    assert venta["reference"] == "00845123"

    # IGTF parcial (fracción 50% en $): ~0.10 USD, menos que el 3% completo (~0.20)
    assert venta["igtf_amount"] is not None
    assert 0 < venta["igtf_amount"] < 0.15

    # El resumen desglosa el mixto por pata (alias '$' -> Dólares Efectivo)
    res = client.get("/api/ventas/resumen", headers=h).json()
    met = {m["metodo"]: m for m in res["metodos"]}
    assert "Mixto ($ + Pago Móvil)" not in met
    assert abs(met["Dólares Efectivo"]["usd"] - rec_usd) < 0.05
    assert abs(met["Pago Móvil"]["bs"] - rec_bs) < 0.05

    # Factura y reporte Z se generan sin errores con método mixto
    assert client.get(f"/api/ventas/{venta['id']}/factura", headers=h).status_code == 200
    assert client.get("/api/ventas/cierre/pdf", headers=h).status_code == 200


def test_pago_mixto_dos_metodos_bs_desglose_por_metodo():
    """Cobro mixto con DOS métodos en Bs (Biopago + Pago Móvil): sin IGTF,
    guarda la segunda pata (método, monto y referencia) y el reporte Z
    desglosa el monto recibido por cada método."""
    h = _auth(_login())
    cat = client.post("/api/categorias", json={"name": "Mixtos2", "sale_unit": "unidad"}, headers=h).json()
    prod = client.post("/api/productos", json={
        "barcode": "MIXT2", "name": "Jugo 1L", "cost_price": 0.5, "sale_price": 2.00,
        "stock": 50, "min_stock": 5, "category_id": cat["id"],
    }, headers=h).json()

    tasa = client.get("/api/tasa", headers=h).json()["rate"]
    # Total: 4 x $2.00 = $8 -> Bs 8*tasa, mitad por cada método en Bs.
    bs1 = round(4.0 * tasa, 2)   # Biopago
    bs2 = round(4.0 * tasa, 2)   # Pago Móvil
    r = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 4}],
        "payment_method": "Mixto (Biopago + Pago Móvil)",
        "currency": "BS",
        "received_bs": round(bs1 + bs2, 2),
        "method_2": "Pago Móvil",
        "received_2": bs2,
        "reference": "BIO-111",
        "reference_2": "PM-222",
    }, headers=h)
    assert r.status_code == 200
    venta = r.json()
    assert venta["payment_method"] == "Mixto (Biopago + Pago Móvil)"
    assert venta.get("method_2") == "Pago Móvil"
    assert venta.get("received_2") == bs2
    assert venta.get("reference_2") == "PM-222"

    # Dos métodos en Bs -> no aplica IGTF
    assert venta["igtf_amount"] == 0

    # El resumen desglosa por método, no en un grupo "Mixto (...)"
    res = client.get("/api/ventas/resumen", headers=h).json()
    met = {m["metodo"]: m for m in res["metodos"]}
    assert "Mixto (Biopago + Pago Móvil)" not in met
    assert abs(met["Biopago"]["bs"] - bs1) < 0.05
    assert abs(met["Pago Móvil"]["bs"] - bs2) < 0.05

    assert client.get("/api/ventas/cierre/pdf", headers=h).status_code == 200


def test_pago_mixto_usd_digital_referencia_por_pata():
    """Cobro mixto $ efectivo + Biopago: IGTF proporcional a la porción en
    dólares y referencia independiente por cada pata."""
    h = _auth(_login())
    cat = client.post("/api/categorias", json={"name": "Mixtos3", "sale_unit": "unidad"}, headers=h).json()
    prod = client.post("/api/productos", json={
        "barcode": "MIXT3", "name": "Agua 1.5L", "cost_price": 0.5, "sale_price": 2.00,
        "stock": 50, "min_stock": 5, "category_id": cat["id"],
    }, headers=h).json()

    tasa = client.get("/api/tasa", headers=h).json()["rate"]
    rec_usd = 4.0                    # mitad en $ efectivo
    rec_bs2 = round(4.0 * tasa, 2)   # mitad por Biopago (Bs)
    r = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 4}],
        "payment_method": "Mixto (Dólares Efectivo + Biopago)",
        "currency": "USD",
        "received_usd": rec_usd,
        "received_bs": rec_bs2,
        "method_2": "Biopago",
        "received_2": rec_bs2,
        "reference_2": "BIO-333",
    }, headers=h)
    assert r.status_code == 200
    venta = r.json()
    assert venta.get("method_2") == "Biopago"
    assert venta.get("reference_2") == "BIO-333"

    # IGTF proporcional (fracción 50% en $): menos que el 3% completo
    assert 0 < venta["igtf_amount"] < 0.15

    # Desglose por método: Dólares Efectivo (USD) + Biopago (Bs)
    res = client.get("/api/ventas/resumen", headers=h).json()
    met = {m["metodo"]: m for m in res["metodos"]}
    assert abs(met["Dólares Efectivo"]["usd"] - rec_usd) < 0.05
    assert abs(met["Biopago"]["bs"] - rec_bs2) < 0.05


# ==========================================
# QA / SEGURIDAD
# ==========================================

def _login_vendedor(usuario="cajeroqa", password="cajero456"):
    _crear_usuario_db(usuario, password, role="vendedor")
    token = client.post("/api/usuarios/login", json={"username": usuario, "password": password}).json()["token"]
    return _auth(token)


def test_security_headers():
    """Las respuestas llevan cabeceras de seguridad básicas."""
    r = client.get("/api/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert r.headers.get("Referrer-Policy") == "no-referrer"
    assert "Content-Security-Policy" in r.headers


def test_password_policy():
    """Contraseña/username deben cumplir la política mínima."""
    h = _auth(_login())
    assert client.post("/api/usuarios", json={"username": "corto", "password": "123"}, headers=h).status_code == 422
    assert client.post("/api/usuarios", json={"username": "x", "password": "123456"}, headers=h).status_code == 422
    assert client.post("/api/usuarios", json={"username": "valido", "password": "123456"}, headers=h).status_code == 200


def test_token_claims():
    """El JWT incluye fechas de emisión (iat) y expiración (exp)."""
    _crear_usuario_db("admin", "admin123")
    token = client.post("/api/usuarios/login", json={"username": "admin", "password": "admin123"}).json()["token"]
    import jwt as pyjwt
    payload = pyjwt.decode(token, options={"verify_signature": False})
    assert "exp" in payload and "iat" in payload


def test_rate_limit_login():
    """Tras N intentos fallidos se bloquea el login por usuario+IP (429)."""
    _crear_usuario_db("bloqueado", "clave123456", role="vendedor")
    for _ in range(20):
        r = client.post("/api/usuarios/login", json={"username": "bloqueado", "password": "incorrecta"})
        assert r.status_code == 200 and r.json()["ok"] is False
    # Con la contraseña correcta ya debe estar bloqueado
    assert client.post("/api/usuarios/login", json={"username": "bloqueado", "password": "clave123456"}).status_code == 429


def test_categorias_solo_admin():
    """Crear/editar/eliminar categorías exige rol admin; listar no."""
    h = _auth(_login())
    vh = _login_vendedor()
    cat = client.post("/api/categorias", json={"name": "Limpieza"}, headers=h)
    assert cat.status_code == 200
    cid = cat.json()["id"]

    # El vendedor puede ver la lista pero no modificar
    assert client.get("/api/categorias", headers=vh).status_code == 200
    assert client.post("/api/categorias", json={"name": "Ropa"}, headers=vh).status_code == 403
    assert client.put(f"/api/categorias/{cid}", json={"name": "Limpieza 2"}, headers=vh).status_code == 403
    assert client.delete(f"/api/categorias/{cid}", headers=vh).status_code == 403


def test_productos_crear_editar_solo_admin():
    """Crear/editar productos (precios) exige rol admin."""
    h = _auth(_login())
    vh = _login_vendedor("cajero_prod")
    body = {"name": "Arroz 1kg", "cost_price": 1.0, "sale_price": 1.5, "stock": 10, "min_stock": 5}
    assert client.post("/api/productos", json=body, headers=vh).status_code == 403

    p = client.post("/api/productos", json=body, headers=h).json()
    assert client.put(f"/api/productos/{p['id']}", json=body, headers=vh).status_code == 403


def test_barcode_duplicado_400():
    """Dos productos con el mismo código de barras devuelven 400 (no 500)."""
    h = _auth(_login())
    body = {"name": "Leche 1L", "barcode": "7790001", "cost_price": 1.0, "sale_price": 1.5}
    assert client.post("/api/productos", json=body, headers=h).status_code == 200
    dup = {"name": "Leche 2L", "barcode": "7790001", "cost_price": 1.0, "sale_price": 1.5}
    assert client.post("/api/productos", json=dup, headers=h).status_code == 400


def test_compras_crear_cualquier_rol():
    """Cualquier usuario autenticado (admin o vendedor) puede registrar compras nuevas."""
    h = _auth(_login())
    vh = _login_vendedor("cajero_compras")
    compra = {"supplier": "Distribuidora X", "items": [
        {"name": "Pasta 500g", "cost_price": 0.5, "min_stock": 5, "boxes": 1, "units_per_box": 10},
    ]}
    assert client.post("/api/compras", json=compra, headers=vh).status_code == 200
    compra2 = {"supplier": "Distribuidora Y", "items": [
        {"name": "Fideo 500g", "cost_price": 0.6, "min_stock": 5, "boxes": 1, "units_per_box": 10},
    ]}
    assert client.post("/api/compras", json=compra2, headers=h).status_code == 200


def test_baja_stock_solo_admin():
    """Registrar una baja de stock requiere rol admin."""
    h = _auth(_login())
    p = client.post("/api/productos", json={"name": "Jabón", "cost_price": 0.5, "sale_price": 1.0, "stock": 10}, headers=h).json()
    vh = _login_vendedor("cajero_baja")
    assert client.post(f"/api/productos/{p['id']}/baja", json={"cantidad": 2, "motivo": "Dañado"}, headers=vh).status_code == 403

def _venta_base(h, barcode="QA1", stock=10, precio=2.00):
    """Helper: crea un producto y una venta simple. Devuelve (producto, venta)."""
    prod = client.post("/api/productos", json={
        "barcode": barcode, "name": f"Prod {barcode}", "cost_price": 1.0,
        "sale_price": precio, "stock": stock,
    }, headers=h).json()
    venta = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 4}],
        "client_name": "Cliente Original",
    }, headers=h).json()
    return prod, venta


def test_crud_ventas_actualizar_solo_admin():
    """PUT /api/ventas/{id}: solo admin; recalcula total y ajusta stock."""
    h = _auth(_login())
    vh = _login_vendedor("cajero_ventau")
    prod, venta = _venta_base(h)
    pid = prod["id"]

    # El vendedor no puede actualizar
    assert client.put(f"/api/ventas/{venta['id']}", json={"client_name": "X"}, headers=vh).status_code == 403

    # Admin reduce la cantidad de 4 a 1: total 8.00 -> 2.00, stock 6 -> 9
    r = client.put(f"/api/ventas/{venta['id']}", json={
        "items": [{"product_id": pid, "quantity": 1}],
    }, headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2.00
    assert len(data["details"]) == 1 and data["details"][0]["quantity"] == 1
    assert client.get(f"/api/productos/{pid}", headers=h).json()["stock"] == 9

    # Cambia cliente, método de pago y referencia
    r = client.put(f"/api/ventas/{venta['id']}", json={
        "client_name": "Cliente Editado",
        "payment_method": "Pago Móvil",
        "reference": "123456",
    }, headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["client_name"] == "Cliente Editado"
    assert data["payment_method"] == "Pago Móvil"
    assert data["reference"] == "123456"

    # Stock insuficiente al ampliar (solo hay 9 disponibles)
    r = client.put(f"/api/ventas/{venta['id']}", json={
        "items": [{"product_id": pid, "quantity": 20}],
    }, headers=h)
    assert r.status_code == 400

    # Venta inexistente -> 404
    assert client.put("/api/ventas/99999", json={"client_name": "Y"}, headers=h).status_code == 404


def test_crud_ventas_eliminar_solo_admin():
    """DELETE /api/ventas/{id}: solo admin; devuelve el stock al inventario."""
    h = _auth(_login())
    vh = _login_vendedor("cajero_ventad")
    prod, venta = _venta_base(h, barcode="QA2")
    pid = prod["id"]
    vid = venta["id"]

    # El vendedor no puede eliminar
    assert client.delete(f"/api/ventas/{vid}", headers=vh).status_code == 403

    # Admin elimina: el stock vuelve de 6 a 10
    r = client.delete(f"/api/ventas/{vid}", headers=h)
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert client.get(f"/api/ventas/{vid}", headers=h).status_code == 404
    assert client.get(f"/api/productos/{pid}", headers=h).json()["stock"] == 10

    # Eliminar de nuevo -> 404
    assert client.delete(f"/api/ventas/{vid}", headers=h).status_code == 404


def test_crud_ventas_bloqueo_cierre_z():
    """No se puede editar ni eliminar ventas de días con caja cerrada."""
    h = _auth(_login())
    _, venta = _venta_base(h, barcode="QA3")

    # Cerrar la caja de hoy bloquea la edición y eliminación de la venta de hoy
    assert client.post("/api/ventas/cierre", headers=h).status_code == 200
    r_put = client.put(f"/api/ventas/{venta['id']}", json={"client_name": "Tarde"}, headers=h)
    assert r_put.status_code == 409
    r_del = client.delete(f"/api/ventas/{venta['id']}", headers=h)
    assert r_del.status_code == 409


def test_crud_creditos_actualizar_eliminar():
    """CRUD completo en cuentas por cobrar (todo el módulo es solo admin).

    PUT actualiza cliente/plazo/notas sincronizando la venta; DELETE elimina
    la cuenta junto con su venta a crédito y devuelve el stock.
    """
    h = _auth(_login())
    vh = _login_vendedor("cajero_cred")
    prod = client.post("/api/productos", json={
        "barcode": "QA4", "name": "Aceite", "cost_price": 2.0,
        "sale_price": 3.0, "stock": 10,
    }, headers=h).json()

    # Crear venta a crédito (Create del módulo Créditos)
    venta = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 2}],
        "is_credit": True, "client_name": "Doña Rosa", "days_term": 15,
    }, headers=h).json()
    assert venta["is_credit"] is True

    cuentas = client.get("/api/creditos", headers=vh)
    assert cuentas.status_code == 403  # listar créditos ya exige admin
    cuentas = client.get("/api/creditos", headers=h).json()
    cuenta = next(c for c in cuentas if c["sale_id"] == venta["id"])
    cid = cuenta["id"]
    assert cuenta["status"] == "pendiente"
    assert cuenta["days_term"] == 15

    # Actualizar cliente y plazo: vencimiento se recalcula (-8 días desde el ancla)
    r = client.put(f"/api/creditos/{cid}", json={
        "client_name": "Doña Rosa Pérez", "days_term": 7, "notes": "Paga los viernes",
    }, headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["client_name"] == "Doña Rosa Pérez"
    assert data["days_term"] == 7
    assert data["notes"] == "Paga los viernes"

    # La venta asociada quedó sincronizada
    venta_sync = client.get(f"/api/ventas/{venta['id']}", headers=h).json()
    assert venta_sync["client_name"] == "Doña Rosa Pérez"
    assert venta_sync["reference"] == "Paga los viernes"

    # Vendedor no puede actualizar ni eliminar
    assert client.put(f"/api/creditos/{cid}", json={"notes": "x"}, headers=vh).status_code == 403
    assert client.delete(f"/api/creditos/{cid}", headers=vh).status_code == 403

    # Admin elimina la cuenta: desaparece la cuenta Y la venta; stock vuelve a 10
    r = client.delete(f"/api/creditos/{cid}", headers=h)
    assert r.status_code == 200
    assert client.get(f"/api/creditos/{cid}", headers=h).status_code == 404
    assert client.get(f"/api/ventas/{venta['id']}", headers=h).status_code == 404
    assert client.get(f"/api/productos/{prod['id']}", headers=h).json()["stock"] == 10


def test_crud_ventas_actualizar_venta_credito_sincroniza_cuenta():
    """Editar los items de una venta a crédito actualiza su cuenta por cobrar."""
    h = _auth(_login())
    prod = client.post("/api/productos", json={
        "barcode": "QA5", "name": "Azúcar", "cost_price": 0.5,
        "sale_price": 1.0, "stock": 10,
    }, headers=h).json()
    venta = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 5}],
        "is_credit": True, "client_name": "Bodegón María",
    }, headers=h).json()

    # Reducir a 2 unidades: total 5.00 -> 2.00
    r = client.put(f"/api/ventas/{venta['id']}", json={
        "items": [{"product_id": prod["id"], "quantity": 2}],
    }, headers=h)
    assert r.status_code == 200 and r.json()["total"] == 2.00

    cuentas = client.get("/api/creditos", headers=h).json()
    cuenta = next(c for c in cuentas if c["sale_id"] == venta["id"])
    assert cuenta["total_usd"] == 2.00


def test_crud_ventas_actualizar_cobro_recibido():
    """PUT actualiza el monto recibido: valida el cobro y recalcula el cambio."""
    from services.bcv import DEFAULT_RATE

    h = _auth(_login())
    prod, venta = _venta_base(h, barcode="QA6", stock=10, precio=2.00)  # total 8.00
    vid = venta["id"]
    esperado_bs = 8.00 * DEFAULT_RATE

    # Monto recibido insuficiente -> 400 y la venta queda sin cambios
    r = client.put(f"/api/ventas/{vid}", json={"received_bs": esperado_bs - 50}, headers=h)
    assert r.status_code == 400
    assert client.get(f"/api/ventas/{vid}", headers=h).json()["change_bs"] is None

    # Monto suficiente: el backend recalcula el cambio automáticamente
    r = client.put(f"/api/ventas/{vid}", json={"received_bs": esperado_bs + 10}, headers=h)
    assert r.status_code == 200
    data = r.json()
    assert abs(data["change_bs"] - 10.0) < 0.01
    assert data["received_bs"] == round(esperado_bs + 10, 2)

    # Enviar 0 limpia el cobro registrado
    r = client.put(f"/api/ventas/{vid}", json={"received_bs": 0}, headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["received_bs"] is None and data["change_bs"] is None


def test_crud_ventas_actualizar_pago_mixto():
    """PUT cambia a método mixto ($ + Bs electrónico): guarda referencia y calcula el cambio."""
    from services.bcv import DEFAULT_RATE

    h = _auth(_login())
    prod, venta = _venta_base(h, barcode="QA7", stock=10, precio=2.00)  # total 8.00
    vid = venta["id"]
    payload_mixto = {
        "payment_method": "Mixto ($ + Pago Móvil)",
        "reference": "00998877",
        "received_usd": 5.0,
    }

    # El faltante en Bs no cubre el total (150 / 730 << 3 USD) -> 400
    r = client.put(f"/api/ventas/{vid}", json={**payload_mixto, "received_bs": 150.0}, headers=h)
    assert r.status_code == 400

    # Exceso en Bs -> el cambio se calcula en USD
    r = client.put(f"/api/ventas/{vid}", json={**payload_mixto, "received_bs": 2500.0}, headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["payment_method"] == "Mixto ($ + Pago Móvil)"
    assert data["reference"] == "00998877"
    esperado_recibido = 5.0 + 2500.0 / DEFAULT_RATE
    assert abs(data["change_usd"] - (esperado_recibido - 8.0)) < 0.01

    # Monto exacto -> sin cambio pendiente
    exacto_bs = round((8.0 - 5.0) * DEFAULT_RATE, 2)
    r = client.put(f"/api/ventas/{vid}", json={"received_usd": 5.0, "received_bs": exacto_bs}, headers=h)
    assert r.status_code == 200
    assert abs((r.json()["change_usd"] or 0.0)) < 0.01


def test_creditos_cobro_completo_con_metodo():
    """Registrar cobro: exige método, guarda referencia si es electrónico,
    usa la tasa del día del pago y marca la cuenta como pagada."""
    from services.bcv import DEFAULT_RATE

    h = _auth(_login())
    prod = client.post("/api/productos", json={
        "barcode": "QA8", "name": "Harina", "cost_price": 1.0,
        "sale_price": 2.0, "stock": 10,
    }, headers=h).json()
    venta = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 3}],  # total 6.00 USD
        "is_credit": True, "client_name": "Compadre Juan",
    }, headers=h).json()
    cuenta = next(c for c in client.get("/api/creditos", headers=h).json() if c["sale_id"] == venta["id"])
    cid = cuenta["id"]

    # Sin método -> 400
    r = client.post(f"/api/creditos/{cid}/pagar", json={}, headers=h)
    assert r.status_code == 422 or r.status_code == 400

    # Pago Móvil sin referencia -> 400
    r = client.post(f"/api/creditos/{cid}/pagar", json={"payment_method": "Pago Móvil"}, headers=h)
    assert r.status_code == 400

    # Cobro completo con referencia: la tasa aplicada es la vigente (día del pago)
    r = client.post(f"/api/creditos/{cid}/pagar", json={
        "payment_method": "Pago Móvil", "reference": "00745123",
    }, headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "pagado"
    assert data["payment_method"] == "Pago Móvil"
    assert data["reference"] == "00745123"
    assert data["saldo_usd"] == 0.0
    assert len(data["pagos"]) == 1
    pago = data["pagos"][0]
    assert abs(pago["monto_usd"] - 6.0) < 0.01
    assert abs(pago["monto_bs"] - 6.0 * DEFAULT_RATE) < 0.05
    assert abs(pago["rate_usd"] - DEFAULT_RATE) < 0.01

    # Ya pagada -> 400
    r = client.post(f"/api/creditos/{cid}/pagar", json={"payment_method": "Punto"}, headers=h)
    assert r.status_code == 400


def test_creditos_abonos_parciales():
    """Abonos parciales: la cuenta queda pendiente hasta cubrir el saldo total."""
    h = _auth(_login())
    prod = client.post("/api/productos", json={
        "barcode": "QA9", "name": "Arroz", "cost_price": 0.8,
        "sale_price": 2.0, "stock": 10,
    }, headers=h).json()
    venta = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 5}],  # total 10.00 USD
        "is_credit": True, "client_name": "Bodega El Progreso",
    }, headers=h).json()
    cid = next(c for c in client.get("/api/creditos", headers=h).json() if c["sale_id"] == venta["id"])["id"]

    # Abono de 4 USD -> sigue pendiente con saldo 6
    r = client.post(f"/api/creditos/{cid}/pagar", json={
        "payment_method": "Bolívares Efectivo", "monto_usd": 4.0,
    }, headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "pendiente"
    assert abs(data["saldo_usd"] - 6.0) < 0.01
    assert len(data["pagos"]) == 1

    # Abono mayor al saldo -> 400
    r = client.post(f"/api/creditos/{cid}/pagar", json={
        "payment_method": "Bolívares Efectivo", "monto_usd": 99.0,
    }, headers=h)
    assert r.status_code == 400

    # Segundo abono cubre el resto -> pagado
    r = client.post(f"/api/creditos/{cid}/pagar", json={
        "payment_method": "Dólares Efectivo", "monto_usd": 6.0,
    }, headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "pagado" and data["saldo_usd"] == 0.0
    assert len(data["pagos"]) == 2


def test_creditos_cobro_mixto():
    """Cobro mixto ($ + Bs) sobre una cuenta: valida montos y registra el cobro."""
    from services.bcv import DEFAULT_RATE

    h = _auth(_login())
    prod = client.post("/api/productos", json={
        "barcode": "QA10", "name": "Pasta", "cost_price": 0.5,
        "sale_price": 1.0, "stock": 10,
    }, headers=h).json()
    venta = client.post("/api/ventas", json={
        "items": [{"product_id": prod["id"], "quantity": 8}],  # total 8.00 USD
        "is_credit": True, "client_name": "Ferretería La 40",
    }, headers=h).json()
    cid = next(c for c in client.get("/api/creditos", headers=h).json() if c["sale_id"] == venta["id"])["id"]
    metodo_mixto = {"payment_method": "Mixto ($ + Pago Móvil)", "reference": "00991122"}

    # Mixto electrónico sin referencia -> 400
    r = client.post(f"/api/creditos/{cid}/pagar", json={**metodo_mixto, "reference": None}, headers=h)
    assert r.status_code == 400

    # Montos entregados insuficientes -> 400 (5 + 100/730 << 8)
    r = client.post(f"/api/creditos/{cid}/pagar", json={
        **metodo_mixto, "received_usd": 5.0, "received_bs": 100.0,
    }, headers=h)
    assert r.status_code == 400

    # Montos suficientes ($4 + Bs exacto para los $4 restantes) -> pagado
    exacto_bs = round(4.0 * DEFAULT_RATE, 2)
    r = client.post(f"/api/creditos/{cid}/pagar", json={
        **metodo_mixto, "received_usd": 4.0, "received_bs": exacto_bs,
    }, headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "pagado" and data["saldo_usd"] == 0.0
    pago = data["pagos"][0]
    assert pago["payment_method"] == "Mixto ($ + Pago Móvil)"
    assert abs(pago["monto_usd"] - 8.0) < 0.01
    assert pago["received_usd"] == 4.0 and pago["received_bs"] == exacto_bs
