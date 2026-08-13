from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from paths import DATABASE_PATH

# La BD vive en %APPDATA%\MinimarketDB (ejecutable) o en la raíz del proyecto (dev).
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"

# connect_args={"check_same_thread": False} es vital para SQLite en FastAPI
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def habilitar_columnas(db):
    """Migración ligera: agrega columnas nuevas a tablas ya existentes en SQLite.

    Recibe una sesión; usa PRAGMA table_info para conocer las columnas actuales
    y ALTER TABLE para añadir solo las que faltan.
    """
    table_columns = {
        "products": {
            "sale_unit": "VARCHAR DEFAULT 'unidad'",
            "activo": "BOOLEAN DEFAULT 1",
        },
        "users": {
            "role": "VARCHAR DEFAULT 'vendedor'",
        },
        "purchase_details": {
            "boxes": "INTEGER",
            "units_per_box": "INTEGER",
            "weight_kg": "FLOAT",
        },
        "stock_bajas": {
            "restaurada": "BOOLEAN DEFAULT 0",
        },
        "sales": {
            "rate_usd": "FLOAT",
            "received_bs": "FLOAT",
            "received_usd": "FLOAT",
            "change_bs": "FLOAT",
            "change_usd": "FLOAT",
            "base_amount": "FLOAT DEFAULT 0",
            "iva_amount": "FLOAT DEFAULT 0",
            "igtf_amount": "FLOAT DEFAULT 0",
            "is_credit": "BOOLEAN DEFAULT 0",
            "cuenta_id": "INTEGER",
        },
        "cierres_diarios": {
            "total_iva_usd": "FLOAT DEFAULT 0",
            "total_igtf_usd": "FLOAT DEFAULT 0",
        },
        "cuentas_credito": {
            "days_term": "INTEGER DEFAULT 10",
            "due_date": "DATE",
            "notified": "BOOLEAN DEFAULT 0",
        },
    }
    for tabla, columnas in table_columns.items():
        try:
            rows = db.execute(text(f"PRAGMA table_info({tabla})")).fetchall()
        except OperationalError:
            # La tabla no existe todavía; create_all la creará con las columnas.
            continue
        column_names = {r[1] for r in rows}
        for nombre, tipo in columnas.items():
            if nombre not in column_names:
                db.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {tipo}"))

    # Backfill: el usuario 'admin' conserva el rol de administrador; los demás
    # quedan como vendedores (nuevo sistema de roles). Idempotente.
    try:
        db.execute(text("UPDATE users SET role='admin' WHERE username='admin'"))
        db.execute(text("UPDATE users SET role='vendedor' WHERE username<>'admin' AND (role IS NULL OR role='')"))
    except OperationalError:
        pass

    # Índices para acelerar las consultas más frecuentes (fechas y FKs).
    # create_all no toca tablas existentes, así que se crean de forma idempotente.
    indices = [
        "CREATE INDEX IF NOT EXISTS ix_sales_created_at ON sales (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_sale_details_sale_id ON sale_details (sale_id)",
        "CREATE INDEX IF NOT EXISTS ix_sale_details_product_id ON sale_details (product_id)",
        "CREATE INDEX IF NOT EXISTS ix_purchases_created_at ON purchases (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_purchase_details_purchase_id ON purchase_details (purchase_id)",
    ]
    for idx in indices:
        try:
            db.execute(text(idx))
        except OperationalError:
            continue


# Dependencia para los Endpoints (abre una sesión por petición y la cierra al terminar)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()