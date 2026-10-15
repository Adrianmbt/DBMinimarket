# AGENTS.md

Sistema de gestión local (Windows, una sola PC) para un minimarket, en español:
backend FastAPI + SQLite, frontend React/Vite. Comentarios, docs e interfaz están
en español — escribe también en español los comentarios y documentos nuevos.

## Comandos

- **Usa siempre `python -m pip`, nunca `pip` a secas** — Device Guard bloquea
  `venv\Scripts\pip.exe`. El fichero de dependencias está mal escrito:
  `requeriments.txt`.
  `venv\Scripts\python.exe -m pip install -r requeriments.txt`
- Backend: `venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000`
  (`iniciar.ps1` lo lanza **sin** `--reload` → los cambios de backend requieren
  reinicio manual).
- Frontend: `cd frontend; npm run dev` → http://localhost:5173, proxy de `/api`
  hacia `:8000`.
- Ambos a la vez: `iniciar.bat` / `iniciar.ps1` (procesos ocultos + navegador
  aislado).
- Tests: `python -m pytest -q` (46 tests, ~100 s, SQLite en memoria, sin
  preparación). Un solo test: `python -m pytest test_main.py::test_name -q`
- Build del frontend: `cd frontend; npm run build` → `frontend/dist` (FastAPI lo
  sirve cuando existe). Empaquetado exe: `packaging\build.ps1`.
- No existe linter/formatter/typecheck/CI. No inventes uno; verifica con
  `pytest` + `npm run build`.

## Arquitectura

- Punto de entrada: `main.py` (el lifespan ejecuta `create_all` +
  `habilitar_columnas()` y crea `admin/admin123` **solo** si la tabla `users`
  está vacía). Routers en `routers/` montados bajo `/api`; tasa BCV, PDF y
  rate limiting en `services/`.
- Ruta de la BD según `paths.py`: en dev, `minimarket.db` en la raíz del
  proyecto; en el exe empaquetado, `%APPDATA%\MinimarketDB`; se puede
  sobreescribir con la variable `MINIMARKET_DATA_DIR`.
- **Migraciones: no hay Alembic.** Las columnas/tablas nuevas se añaden al
  diccionario de `database.py::habilitar_columnas` (solo aditivo e idempotente)
  y se registran como cambio de esquema Nivel 2 en `change_documents.md` §5.2
  (requiere aprobación escrita).
- Frontend: React 19 + MUI + Tailwind 4. No edites `frontend/src/api/axios.js`
  (base relativa `/api`) ni `frontend/vite.config.js` — regla del README.
- `frontend/src/components/VentaCredito.jsx` es **código muerto**; el diálogo
  real de venta a crédito es `Creditos.jsx`.

## Flujos de trabajo

- **Registra cada cambio en `change_documents.md`**: añade una entrada
  `CHG-###` con el formato fijo (§3) antes de empaquetar; los trabajos pedidos
  por el cliente se anotan además como `REQ-###`. Ese fichero es la fuente de
  verdad para desplegar en la PC del cliente.
- Nunca ejecutes `seed_data.py` ni `migrar_smilla.py` sobre la `minimarket.db`
  real (datos de demostración / migración puntual; prohibido en producción).
- Nunca subas `minimarket.db` ni `secret_key.txt` (están en `.gitignore`).
  Precaución: `.gitignore` **no** cubre `minimarket.db.bak_*` (uno ya está
  trackeado) — staged explícitamente, nunca `git add -A`.
- Cambios en la BD: parar el servicio → respaldo con fecha → cambio → reiniciar
  (`change_documents.md` §5.3). Los cambios solo de frontend se despliegan en
  caliente con `frontend/dist`.
