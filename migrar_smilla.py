"""
Migracion de datos desde smilla.db (base de datos del sistema anterior)
hacia minimarket.db (base de datos del sistema nuevo).

Uso:
    python migrar_smilla.py

Es idempotente: se puede ejecutar varias veces sin crear duplicados.
"""
import sqlite3
from pathlib import Path
from paths import DATABASE_PATH

# Rutas
VIEJA = Path(__file__).resolve().parent / "smilla.db"
NUEVA = DATABASE_PATH


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def migrar():
    if not VIEJA.exists():
        print(f"[ERROR] No se encuentra {VIEJA}")
        return
    if not NUEVA.exists():
        print(f"[ERROR] No se encuentra {NUEVA}. Ejecutá primero la app para crear la BD.")
        return

    vieja = sqlite3.connect(str(VIEJA))
    vieja.row_factory = sqlite3.Row
    nueva = sqlite3.connect(str(NUEVA))
    nueva.row_factory = sqlite3.Row

    # Desactivar foreign keys temporalmente para inserts masivos
    nueva.execute("PRAGMA foreign_keys = OFF")

    stats = {}

    try:
        # ── 1. CATEGORIES ── (ya idénticas, no tocar)
        print("- Categorias: ya existentes, OK")

        # ── 2. USERS ── (importar solo los que no existen)
        print("- Usuarios...")
        vieja_users = vieja.execute("SELECT * FROM users").fetchall()
        existentes = {r["username"] for r in nueva.execute("SELECT username FROM users").fetchall()}
        insertados = 0
        for u in vieja_users:
            if u["username"] not in existentes:
                nueva.execute(
                    "INSERT INTO users (username, password, full_name, role) VALUES (?,?,?,?)",
                    (u["username"], u["password"], u["full_name"], u["role"] or "vendedor"),
                )
                insertados += 1
        nueva.commit()
        stats["users"] = insertados
        print(f"  {insertados} usuarios nuevos importados")

        # ── 3. PRODUCTS ── (los 325 reales)
        print("- Productos...")
        vieja_products = vieja.execute("SELECT * FROM products").fetchall()
        # Mapa de categorías vieja -> nueva (mismo id, pero verificamos por nombre)
        cat_map_vieja = {r["id"]: r for r in vieja.execute("SELECT * FROM categories").fetchall()}
        existentes_prod = {r["name"] for r in nueva.execute("SELECT name FROM products").fetchall()}

        # ID de la categoría "Otros Artículos No Especificados" en la DB nueva
        otros_cat = nueva.execute("SELECT id FROM categories WHERE name LIKE '%Otros%'").fetchone()
        otros_id = otros_cat["id"] if otros_cat else 9

        insertados = 0
        saltados = 0
        for p in vieja_products:
            if p["name"] in existentes_prod:
                saltados += 1
                continue
            # Resolver categoría
            cat_id = p["category_id"]
            if cat_id is None:
                cat_id = otros_id
            sale_unit = p["sale_unit"] or "unidad"
            nueva.execute(
                """INSERT INTO products
                   (barcode, name, description, cost_price, sale_price,
                    stock, min_stock, category_id, sale_unit, activo)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    p["barcode"], p["name"], p["description"],
                    p["cost_price"], p["sale_price"],
                    p["stock"], p["min_stock"] or 5,
                    cat_id, sale_unit,
                    1 if p["activo"] else 0,
                ),
            )
            insertados += 1
        nueva.commit()
        stats["products"] = insertados
        print(f"  {insertados} productos nuevos importados, {saltados} ya existían")

        # Reconstruir mapa nombre->id de productos en la DB nueva
        prod_map = {r["name"]: r["id"] for r in nueva.execute("SELECT id, name FROM products").fetchall()}

        # Mapa de usuarios vieja -> nueva (para stock_bajas.user_id)
        user_map = {}
        for u in vieja_users:
            row = nueva.execute("SELECT id FROM users WHERE username=?", (u["username"],)).fetchone()
            if row:
                user_map[u["id"]] = row["id"]

        # ── 4. PURCHASES + PURCHASE_DETAILS ── (30 compras)
        print("- Compras...")
        vieja_purchases = vieja.execute("SELECT * FROM purchases ORDER BY id").fetchall()
        existentes_compras = set()
        for r in nueva.execute("SELECT created_at, total FROM purchases").fetchall():
            existentes_compras.add((r["created_at"], round(r["total"], 6)))

        insertadas = 0
        for comp in vieja_purchases:
            key = (comp["created_at"], round(comp["total"], 6))
            if key in existentes_compras:
                continue
            nueva.execute(
                "INSERT INTO purchases (created_at, supplier, total) VALUES (?,?,?)",
                (comp["created_at"], comp["supplier"], comp["total"]),
            )
            new_id = nueva.execute("SELECT last_insert_rowid()").fetchone()[0]
            # Detalles
            detalles = vieja.execute(
                "SELECT * FROM purchase_details WHERE purchase_id=?", (comp["id"],)
            ).fetchall()
            for d in detalles:
                prod_id = prod_map.get(
                    vieja.execute("SELECT name FROM products WHERE id=?", (d["product_id"],)).fetchone()["name"]
                )
                if not prod_id:
                    continue
                nueva.execute(
                    """INSERT INTO purchase_details
                       (purchase_id, product_id, quantity, cost_price,
                        boxes, units_per_box, weight_kg)
                       VALUES (?,?,?,?,?,?,?)""",
                    (
                        new_id, prod_id, d["quantity"], d["cost_price"],
                        d["boxes"], d["units_per_box"], d["weight_kg"],
                    ),
                )
            insertadas += 1
        nueva.commit()
        stats["purchases"] = insertadas
        print(f"  {insertadas} compras nuevas importadas")

        # ── 5. STOCK_BAJAS ── (12 registros)
        print("- Bajas de stock...")
        vieja_bajas = vieja.execute("SELECT * FROM stock_bajas").fetchall()
        existentes_bajas = set()
        for r in nueva.execute("SELECT product_id, cantidad, motivo, created_at FROM stock_bajas").fetchall():
            existentes_bajas.add((r["product_id"], r["cantidad"], r["motivo"], r["created_at"]))

        insertadas = 0
        for b in vieja_bajas:
            prod_id = prod_map.get(
                vieja.execute("SELECT name FROM products WHERE id=?", (b["product_id"],)).fetchone()["name"]
            )
            if not prod_id:
                print(f"  [!] Baja Skipping: producto id {b['product_id']} no encontrado en nueva DB")
                continue
            key = (prod_id, b["cantidad"], b["motivo"], b["created_at"])
            if key in existentes_bajas:
                continue
            uid = user_map.get(b["user_id"])
            nueva.execute(
                """INSERT INTO stock_bajas
                   (product_id, cantidad, motivo, user_id, user_full_name, restaurada, created_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (prod_id, b["cantidad"], b["motivo"], uid, b["user_full_name"],
                 1 if b["restaurada"] else 0, b["created_at"]),
            )
            insertadas += 1
        nueva.commit()
        stats["stock_bajas"] = insertadas
        print(f"  {insertadas} bajas de stock importadas")

        # ── 6. SALES + SALE_DETAILS ── (117 ventas)
        print("- Ventas...")
        vieja_sales = vieja.execute("SELECT * FROM sales ORDER BY id").fetchall()
        existentes_ventas = set()
        for r in nueva.execute("SELECT created_at, total FROM sales").fetchall():
            existentes_ventas.add((r["created_at"], round(r["total"], 6)))

        insertadas = 0
        skipped_details = 0
        for sale in vieja_sales:
            key = (sale["created_at"], round(sale["total"], 6))
            if key in existentes_ventas:
                continue
            nueva.execute(
                """INSERT INTO sales
                   (created_at, total, base_amount, iva_amount, igtf_amount,
                    payment_method, client_name, reference, rate_usd,
                    received_bs, received_usd, change_bs, change_usd,
                    is_credit, cuenta_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    sale["created_at"], sale["total"],
                    sale["base_amount"] or 0, sale["iva_amount"] or 0, sale["igtf_amount"] or 0,
                    sale["payment_method"], sale["client_name"], sale["reference"],
                    sale["rate_usd"],
                    sale["received_bs"], sale["received_usd"],
                    sale["change_bs"], sale["change_usd"],
                    1 if sale["is_credit"] else 0, None,  # cuenta_id se setea despues
                ),
            )
            new_id = nueva.execute("SELECT last_insert_rowid()").fetchone()[0]
            # Detalles
            detalles = vieja.execute(
                "SELECT * FROM sale_details WHERE sale_id=?", (sale["id"],)
            ).fetchall()
            for d in detalles:
                prod_id = prod_map.get(
                    vieja.execute("SELECT name FROM products WHERE id=?", (d["product_id"],)).fetchone()["name"]
                )
                if not prod_id:
                    skipped_details += 1
                    continue
                nueva.execute(
                    """INSERT INTO sale_details
                       (sale_id, product_id, quantity, price_at_sale, cost_price)
                       VALUES (?,?,?,?,?)""",
                    (new_id, prod_id, d["quantity"], d["price_at_sale"], d["cost_price"]),
                )
            insertadas += 1
        nueva.commit()
        stats["sales"] = insertadas
        print(f"  {insertadas} ventas nuevas importadas, {skipped_details} detalles saltados")

        # Reconstruir mapa sale_id vieja -> nueva
        # Usamos created_at+total como key para mapear
        sale_old_to_new = {}
        for sale in vieja_sales:
            key = (sale["created_at"], round(sale["total"], 6))
            row = nueva.execute(
                "SELECT id FROM sales WHERE created_at=? AND ABS(total - ?) < 0.001",
                (sale["created_at"], sale["total"]),
            ).fetchone()
            if row:
                sale_old_to_new[sale["id"]] = row["id"]

        # ── 7. CUENTAS_CREDITO ── (10 cuentas, 4 pendientes)
        print("- Cuentas de credito...")
        vieja_cuentas = vieja.execute("SELECT * FROM cuentas_credito").fetchall()
        existentes_cuentas = set()
        existentes_sale_ids = set()
        for r in nueva.execute("SELECT sale_id, client_name, created_at FROM cuentas_credito").fetchall():
            existentes_cuentas.add((r["sale_id"], r["client_name"], r["created_at"]))
            existentes_sale_ids.add(r["sale_id"])

        insertadas = 0
        for c in vieja_cuentas:
            new_sale_id = sale_old_to_new.get(c["sale_id"])
            if not new_sale_id:
                print(f"  [!] Credito Skipping: sale_id {c['sale_id']} no encontrado en nueva DB")
                continue
            key = (new_sale_id, c["client_name"], c["created_at"])
            if key in existentes_cuentas:
                continue
            if new_sale_id in existentes_sale_ids:
                print(f"  [!] Credito Skipping: sale_id {new_sale_id} ya tiene cuenta de credito")
                continue
            existentes_sale_ids.add(new_sale_id)
            nueva.execute(
                """INSERT INTO cuentas_credito
                   (sale_id, client_name, total_usd, total_bs, currency, rate_usd,
                    status, notes, created_at, paid_at, days_term, due_date,
                    notified, payment_method, reference)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    new_sale_id, c["client_name"],
                    c["total_usd"], c["total_bs"],
                    c["currency"] or "USD", c["rate_usd"],
                    c["status"] or "pendiente", c["notes"],
                    c["created_at"], c["paid_at"],
                    c["days_term"] or 15, c["due_date"],
                    1 if c["notified"] else 0,
                    c["payment_method"], c["payment_reference"],
                ),
            )
            new_cuenta_id = nueva.execute("SELECT last_insert_rowid()").fetchone()[0]

            # Si estaba pagada, crear PagoCredito con la info de la DB vieja
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
                        new_cuenta_id,
                        pago_monto_usd, pago_monto_bs, pago_rate,
                        c["payment_method"],
                        c["payment_reference"],
                        None, None, None,
                        c["paid_at"] or c["created_at"],
                    ),
                )
            insertadas += 1
        nueva.commit()
        stats["cuentas_credito"] = insertadas
        print(f"  {insertadas} cuentas de credito importadas")

        # Actualizar sales.cuenta_id para que apunte a las cuentas nuevas
        for c in vieja_cuentas:
            new_sale_id = sale_old_to_new.get(c["sale_id"])
            if not new_sale_id:
                continue
            row = nueva.execute(
                "SELECT id FROM cuentas_credito WHERE sale_id=?", (new_sale_id,)
            ).fetchone()
            if row:
                nueva.execute(
                    "UPDATE sales SET cuenta_id=? WHERE id=?", (row["id"], new_sale_id)
                )
        nueva.commit()

        # ── 8. CIERRES_DIARIOS ── (3 cierres)
        print("- Cierres diarios...")
        vieja_cierres = vieja.execute("SELECT * FROM cierres_diarios").fetchall()
        existentes_fechas = {r["fecha"] for r in nueva.execute("SELECT fecha FROM cierres_diarios").fetchall()}

        insertados = 0
        for ci in vieja_cierres:
            if ci["fecha"] in existentes_fechas:
                continue
            nueva.execute(
                """INSERT INTO cierres_diarios
                   (fecha, total_usd, total_bs, total_iva_usd, total_igtf_usd,
                    total_ventas, cerrado_por, created_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    ci["fecha"], ci["total_usd"], ci["total_bs"],
                    ci["total_iva_usd"] or 0, ci["total_igtf_usd"] or 0,
                    ci["total_ventas"] or 0, ci["cerrado_por"], ci["created_at"],
                ),
            )
            insertados += 1
        nueva.commit()
        stats["cierres_diarios"] = insertados
        print(f"  {insertados} cierres diarios importados")

        # ── 9. EXCHANGE_RATES ── (no migrar, el usuario lo actualiza desde la app)
        print("- Tasas de cambio: no migradas (el usuario puede actualizarlas desde la app)")

        # ── RESUMEN ──
        print("\n" + "=" * 50)
        print("  MIGRACIÓN COMPLETADA")
        print("=" * 50)
        for tabla, n in stats.items():
            print(f"  {tabla:20s}: {n:>4d} registros nuevos")

    except Exception as e:
        nueva.rollback()
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
    finally:
        nueva.execute("PRAGMA foreign_keys = ON")
        vieja.close()
        nueva.close()


if __name__ == "__main__":
    migrar()
