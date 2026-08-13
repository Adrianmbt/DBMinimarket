"""Punto de entrada del ejecutable (PyInstaller).

Detiene el backend en http://127.0.0.1:8000 (o MINIMARKET_PORT) y abre el
navegador automáticamente. Se compila sin consola (--windowed): el proceso
queda corriendo en segundo plano hasta que se cierre con el Administrador de
tareas o con la utilidad Detener.bat incluida en la carpeta distribuida.
"""
import logging
import os
import threading
import time
import urllib.request
import webbrowser

import uvicorn

# Importa la app (y, de forma transitiva, database/models/config/paths) que
# inicializa el DATA_DIR, crea las tablas y la clave secreta si hace falta.
from main import app
from paths import DATA_DIR

# Sin consola (--windowed) la salida estándar no existe: se registra a un archivo
# en el directorio de datos para diagnóstico y soporte.
logging.basicConfig(
    filename=str(DATA_DIR / "app.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logging.getLogger("uvicorn").handlers = logging.getLogger().handlers

HOST = "127.0.0.1"
PORT = int(os.getenv("MINIMARKET_PORT", "8000"))
URL = f"http://{HOST}:{PORT}"


def _abrir_navegador():
    # Espera a que el servidor responda /api/health y luego abre el navegador.
    for _ in range(30):
        try:
            urllib.request.urlopen(f"{URL}/api/health", timeout=1).read()
            break
        except Exception:
            time.sleep(0.5)
    webbrowser.open(URL)


def main():
    logging.info("Iniciando Don Beni Minimarket en %s", URL)
    try:
        threading.Thread(target=_abrir_navegador, daemon=True).start()
        uvicorn.run(app, host=HOST, port=PORT, log_level="info")
    except Exception:
        logging.exception("Error al iniciar el servidor")
        raise


if __name__ == "__main__":
    main()