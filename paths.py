import os
import sys
from pathlib import Path


def _esta_congelado() -> bool:
    """True cuando el código corre dentro de un ejecutable PyInstaller."""
    return bool(getattr(sys, "frozen", False))


def _ruta_datos() -> Path:
    """Directorio persistente donde se guardan la BD, la clave secreta y archivos.

    Prioridad:
    1. Variable de entorno MINIMARKET_DATA_DIR (si se define).
    2. En un ejecutable empaquetado: %APPDATA%\\MinimarketDB (perteneciente al usuario).
    3. En desarrollo: la raíz del proyecto (mantiene la base actual sin migrar).
    """
    env = os.getenv("MINIMARKET_DATA_DIR")
    if env:
        path = Path(env)
    elif _esta_congelado():
        base = os.getenv("APPDATA") or str(Path.home())
        path = Path(base) / "MinimarketDB"
    else:
        path = Path(__file__).resolve().parent
    path.mkdir(parents=True, exist_ok=True)
    return path


DATA_DIR = _ruta_datos()
DATABASE_PATH = DATA_DIR / "minimarket.db"
SECRET_KEY_FILE = DATA_DIR / "secret_key.txt"