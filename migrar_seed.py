"""
Migracion de datos desde minimarketmg.db (backup del domingo)
hacia minimarket.db (base de datos actual del sistema).

Reemplaza los datos demo actuales con los datos reales del backup.

Uso:
    python migrar_seed.py

Es idempotente: se puede ejecutar varias veces sin crear duplicados.
"""
import sqlite3
from pathlib import Path

VIEJA = Path(__file__).resolve().parent / "minimarketmg.db"
NUEVA = Path(__file__).resolve().parent / "minimarket.db"

TABLAS_ORDEN = [
    "pagos_credito", "cuentas_credito", "sale_details", "sales",
    "purchase_details", "purchases", "stock_bajas", "cierres_diarios",
    "products", "users", "categories", "exchange_rates",
]


def limpiar_datos_demo(conn):
    """Elimina los datos demo de minimarket.db para cargar los reales."""
    print("\n--- Limpiando datos demo ---")
    conn.execute("PRAGMA foreign_keys = OFF")
    for tabla in TABLAS_ORDEN:
        count = conn.execute(f"SELECT COUNT(*) FROM {tabla}").fetchone()[0]
        if count > 0:
            conn.execute(f"DELETE FROM {tabla}")
            print(f"  {tabla}: {count} registros eliminados")
    conn.commit()
    conn.execute("PRAGMA foreign_keys = ON")
    print("  [OK] Datos demo eliminados")


def migrar_categorias(vieja, nueva):
    print("\n--- Categorias ---")
    cats = vieja.execute("SELECT * FROM categories ORDER BY id").fetchall()
    for c in cats:
        nueva.execute(
            "INSERT INTO categories (id, name, description, sale_unit, created_at) VALUES (?,?,?,?,?)",
            (c["id"], c["name"], c["description"], c["sale_unit"], c["created_at"]),
        )
    nueva.commit()
    cat_map = {r["name"]: r["id"] for r in nueva.execute("SELECT id, name FROM categories").fetchall()}
    print(f"  [OK] {len(cats)} categorias importadas")
    return cat_map


def migrar_usuarios(vieja, nueva):
    print("\n--- Usuarios ---")
    users = vieja.execute("SELECT * FROM users").fetchall()
    for u in users:
        nueva.execute(
            "INSERT INTO users (id, username, password, full_name, role) VALUES (?,?,?,?,?)",
            (u["id"], u["username"], u["password"], u["full_name"], u["role"] or "vendedor"),
        )
    nueva.commit()
    print(f"  [OK] {len(users)} usuarios importados")


def migrar_productos(vieja, nueva, cat_map):
    print("\n--- Productos ---")
    otros_id = cat_map.get("Otros Artículos No Especificados", 9)
    products = vieja.execute("SELECT * FROM products ORDER BY id").fetchall()
    for p in products:
        cat_id = p["category_id"] or otros_id
        sale_unit = p["sale_unit"] or "unidad"
        nueva.execute(
            """INSERT INTO products
               (id, barcode, name, description, cost_price, sale_price,
                stock, min_stock, category_id, sale_unit, activo)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                p["id"], p["barcode"], p["name"], p["description"],
                p["cost_price"], p["sale_price"],
                p["stock"], p["min_stock"] or 5,
                cat_id, sale_unit, 1 if p["activo"] else 0,
            ),
        )
    nueva.commit()
    prod_map = {r["name"]: r["id"] for r in nueva.execute("SELECT id, name FROM products").fetchall()}
    print(f"  [OK] {len(products)} productos importados")
    return prod_map


def migrar_compras(vieja, nueva, prod_map):
    print("\n--- Compras ---")
    compras = vieja.execute("SELECT * FROM purchases ORDER BY id").fetchall()
    for comp in compras:
        nueva.execute(
            "INSERT INTO purchases (id, created_at, supplier, total) VALUES (?,?,?,?)",
            (comp["id"], comp["created_at"], comp["supplier"], comp["total"]),
        )
        detalles = vieja.execute(
            "SELECT * FROM purchase_details WHERE purchase_id=?", (comp["id"],)
        ).fetchall()
        for d in detalles:
            prod_name = vieja.execute(
                "SELECT name FROM products WHERE id=?", (d["product_id"],)
            ).fetchone()
            if not prod_name:
                continue
            prod_id = prod_map.get(prod_name["name"])
            if not prod_id:
                continue
            nueva.execute(
                """INSERT INTO purchase_details
                   (id, purchase_id, product_id, quantity, cost_price,
                    boxes, units_per_box, weight_kg)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (d["id"], comp["id"], prod_id, d["quantity"], d["cost_price"],
                 d["boxes"], d["units_per_box"], d["weight_kg"]),
            )
    nueva.commit()
    print(f"  [OK] {len(compras)} compras importadas")


def migrar_bajas_stock(vieja, nueva, prod_map):
    print("\n--- Bajas de stock ---")
    bajas = vieja.execute("SELECT * FROM stock_bajas ORDER BY id").fetchall()
    user_map = {}
    for u in vieja.execute("SELECT id, username FROM users").fetchall():
        row = nueva.execute("SELECT id FROM users WHERE username=?", (u["username"],)).fetchone()
        if row:
            user_map[u["id"]] = row["id"]

    for b in bajas:
        prod_name = vieja.execute(
            "SELECT name FROM products WHERE id=?", (b["product_id"],)
        ).fetchone()
        if not prod_name:
            continue
        prod_id = prod_map.get(prod_name["name"])
        if not prod_id:
            continue
        uid = user_map.get(b["user_id"])
        nueva.execute(
            """INSERT INTO stock_bajas
               (id, product_id, cantidad, motivo, user_id, user_full_name, restaurada, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (b["id"], prod_id, b["cantidad"], b["motivo"], uid,
             b["user_full_name"], 1 if b["restaurada"] else 0, b["created_at"]),
        )
    nueva.commit()
    print(f"  [OK] {len(bajas)} bajas de stock importadas")


def migrar_ventas(vieja, nueva, prod_map):
    print("\n--- Ventas ---")
    ventas = vieja.execute("SELECT * FROM sales ORDER BY id").fetchall()
    sale_old_to_new = {}

    for sale in ventas:
        nueva.execute(
            """INSERT INTO sales
               (id, created_at, total, base_amount, iva_amount, igtf_amount,
                payment_method, client_name, reference, rate_usd,
                received_bs, received_usd, change_bs, change_usd,
                is_credit, cuenta_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                sale["id"], sale["created_at"], sale["total"],
                sale["base_amount"] or 0, sale["iva_amount"] or 0, sale["igtf_amount"] or 0,
                sale["payment_method"], sale["client_name"], sale["reference"],
                sale["rate_usd"],
                sale["received_bs"], sale["received_usd"],
                sale["change_bs"], sale["change_usd"],
                1 if sale["is_credit"] else 0, None,
            ),
        )
        sale_old_to_new[sale["id"]] = sale["id"]

        detalles = vieja.execute(
            "SELECT * FROM sale_details WHERE sale_id=?", (sale["id"],)
        ).fetchall()
        for d in detalles:
            prod_name = vieja.execute(
                "SELECT name FROM products WHERE id=?", (d["product_id"],)
            ).fetchone()
            if not prod_name:
                continue
            prod_id = prod_map.get(prod_name["name"])
            if not prod_id:
                continue
            nueva.execute(
                """INSERT INTO sale_details
                   (sale_id, product_id, quantity, price_at_sale, cost_price)
                   VALUES (?,?,?,?,?)""",
                (sale["id"], prod_id, d["quantity"], d["price_at_sale"], d["cost_price"]),
            )
    nueva.commit()
    print(f"  [OK] {len(ventas)} ventas importadas")
    return sale_old_to_new


def migrar_cuentas_credito(vieja, nueva, sale_old_to_new):
    print("\n--- Cuentas de credito ---")
    cuentas = vieja.execute("SELECT * FROM cuentas_credito ORDER BY id").fetchall()

    for c in cuentas:
        sale_id = sale_old_to_new.get(c["sale_id"], c["sale_id"])
        nueva.execute(
            """INSERT INTO cuentas_credito
               (id, sale_id, client_name, total_usd, total_bs, currency, rate_usd,
                status, notes, created_at, paid_at, days_term, due_date,
                notified, payment_method, reference)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                c["id"], sale_id, c["client_name"],
                c["total_usd"], c["total_bs"],
                c["currency"] or "USD", c["rate_usd"],
                c["status"] or "pendiente", c["notes"],
                c["created_at"], c["paid_at"],
                c["days_term"] or 10, c["due_date"],
                1 if c["notified"] else 0,
                c["payment_method"], c["payment_reference"],
            ),
        )

        # Si esta pagada, crear registro en pagos_credito
        if c["status"] == "pagado" and c["payment_method"]:
            pago_monto_usd = c["payment_amount_usd"] or c["total_usd"]
            pago_monto_bs = c["payment_amount_bs"] or c["total_bs"]
            pago_rate = c["payment_rate_usd"] or c["rate_usd"] or 0
            nueva.execute(
                """INSERT INTO pagos_credito
                   (cuenta_id, monto_usd, monto_bs, rate_usd, payment_method,
                    reference, received_bs, received_usd, registrado_por, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    c["id"],
                    pago_monto_usd, pago_monto_bs, pago_rate,
                    c["payment_method"],
                    c["payment_reference"],
                    None, None, None,
                    c["paid_at"] or c["created_at"],
                ),
            )

    # Actualizar sales.cuenta_id
    for c in cuentas:
        sale_id = sale_old_to_new.get(c["sale_id"], c["sale_id"])
        nueva.execute(
            "UPDATE sales SET cuenta_id=?, is_credit=1 WHERE id=?",
            (c["id"], sale_id),
        )
    nueva.commit()
    print(f"  [OK] {len(cuentas)} cuentas de credito importadas")


def migrar_cierres(vieja, nueva):
    print("\n--- Cierres diarios ---")
    cierres = vieja.execute("SELECT * FROM cierres_diarios ORDER BY id").fetchall()
    for ci in cierres:
        nueva.execute(
            """INSERT INTO cierres_diarios
               (id, fecha, total_usd, total_bs, total_iva_usd, total_igtf_usd,
                total_ventas, cerrado_por, created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                ci["id"], ci["fecha"], ci["total_usd"], ci["total_bs"],
                ci["total_iva_usd"] or 0, ci["total_igtf_usd"] or 0,
                ci["total_ventas"] or 0, ci["cerrado_por"], ci["created_at"],
            ),
        )
    nueva.commit()
    print(f"  [OK] {len(cierres)} cierres diarios importados")


def migrar_exchange_rates(vieja, nueva):
    print("\n--- Tasas de cambio ---")
    rates = vieja.execute("SELECT * FROM exchange_rates").fetchall()
    for r in rates:
        nueva.execute(
            "INSERT INTO exchange_rates (id, currency, rate, updated_at) VALUES (?,?,?,?)",
            (r["id"], r["currency"], r["rate"], r["updated_at"]),
        )
    nueva.commit()
    print(f"  [OK] {len(rates)} tasas importadas")


def verificar_migracion(nueva):
    print("\n" + "=" * 50)
    print("  VERIFICACION DE MIGRACION")
    print("=" * 50)
    tablas = [
        "categories", "users", "products", "purchases", "purchase_details",
        "sales", "sale_details", "stock_bajas", "cuentas_credito",
        "pagos_credito", "cierres_diarios", "exchange_rates",
    ]
    for t in tablas:
        count = nueva.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t:25s}: {count:>5d} registros")

    # Verificar integridad basica
    orphan_details = nueva.execute(
        "SELECT COUNT(*) FROM sale_details WHERE product_id NOT IN (SELECT id FROM products)"
    ).fetchone()[0]
    orphan_purchases = nueva.execute(
        "SELECT COUNT(*) FROM purchase_details WHERE product_id NOT IN (SELECT id FROM products)"
    ).fetchone()[0]
    print(f"\n  Sale details huerfanos: {orphan_details}")
    print(f"  Purchase details huerfanos: {orphan_purchases}")

    # Verificar creditos
    creditos_pendientes = nueva.execute(
        "SELECT COUNT(*) FROM cuentas_credito WHERE status='pendiente'"
    ).fetchone()[0]
    creditos_pagados = nueva.execute(
        "SELECT COUNT(*) FROM cuentas_credito WHERE status='pagado'"
    ).fetchone()[0]
    pagos = nueva.execute("SELECT COUNT(*) FROM pagos_credito").fetchone()[0]
    print(f"  Creditos pendientes: {creditos_pendientes}")
    print(f"  Creditos pagados: {creditos_pagados}")
    print(f"  Pagos registrados: {pagos}")


def migrar():
    if not VIEJA.exists():
        print(f"[ERROR] No se encuentra {VIEJA}")
        return
    if not NUEVA.exists():
        print(f"[ERROR] No se encuentra {NUEVA}. Ejecuta primero la app para crear la BD.")
        return

    vieja = sqlite3.connect(str(VIEJA))
    vieja.row_factory = sqlite3.Row
    nueva = sqlite3.connect(str(NUEVA))
    nueva.row_factory = sqlite3.Row

    try:
        limpiar_datos_demo(nueva)

        cat_map = migrar_categorias(vieja, nueva)
        migrar_usuarios(vieja, nueva)
        prod_map = migrar_productos(vieja, nueva, cat_map)
        migrar_compras(vieja, nueva, prod_map)
        migrar_bajas_stock(vieja, nueva, prod_map)
        sale_map = migrar_ventas(vieja, nueva, prod_map)
        migrar_cuentas_credito(vieja, nueva, sale_map)
        migrar_cierres(vieja, nueva)
        migrar_exchange_rates(vieja, nueva)

        verificar_migracion(nueva)

        print("\n" + "=" * 50)
        print("  MIGRACION COMPLETADA EXITOSAMENTE")
        print("=" * 50)

    except Exception as e:
        nueva.rollback()
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
    finally:
        vieja.close()
        nueva.close()


if __name__ == "__main__":
    migrar()
