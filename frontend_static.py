import sys
from pathlib import Path

from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


def _dist_dir() -> Path:
    """Resuelve el directorio de la interfaz compilada (frontend/dist).

    - En el ejecutable: la carpeta empaquetada como 'frontend_ui' dentro de PyInstaller.
    - En desarrollo: frontend/dist dentro del repositorio.
    """
    if getattr(sys, "frozen", False):
        base = getattr(sys, "_MEIPASS", Path(__file__).resolve().parent)
        return Path(base) / "frontend_ui"
    return Path(__file__).resolve().parent / "frontend" / "dist"


def montar_frontend(app) -> bool:
    """Sirve la interfaz compilada desde el propio FastAPI.

    Devuelve True si se montó el frontend. Si el dist no existe (por ejemplo,
    en desarrollo donde Vite sirve la app), devuelve False sin tocar nada.
    """
    dist = _dist_dir()
    index = dist / "index.html"
    assets = dist / "assets"

    if not (dist.is_dir() and index.exists()):
        return False

    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    @app.get("/{ruta:path}", include_in_schema=False)
    def spa(ruta: str):
        # Cualquier ruta /api no registrada responde 404 en vez del index.html.
        if ruta == "api" or ruta.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        # Fallback SPA: todas las rutas no-API devuelven el index.html.
        return FileResponse(str(index))

    return True