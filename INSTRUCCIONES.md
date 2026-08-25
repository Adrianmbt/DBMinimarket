# DBMinimarket - Instrucciones de Instalacion y Solucion de Problemas

## Instalacion rapida

1. Ejecutar `instalar.bat` como administrador (Windows) o con permisos de escritura.
2. Esperar a que instale dependencias de backend (Python/FastAPI) y frontend (React).
3. Abrir `http://localhost:5173` en el navegador.

## Backend

- Requiere Python 3.8+ y pip.
- Dependencias en `requirements.txt`.
- Ejecutar con: `uvicorn main:app --reload --port 8000`

## Frontend

- Requiere Node.js 16+.
- Ejecutar con:
  ```bash
  cd frontend
  npm install
  npm run dev
  ```

---

## Solucion de Problemas Comunes

### 1. Error "No module named X" en el backend
```bash
pip install -r requirements.txt
```

### 2. Puerto 8000 ocupado
Cambiar el puerto al iniciar uvicorn:
```bash
uvicorn main:app --reload --port 8001
```
Actualizar `frontend/src/api/compras.js` (o el archivo correspondiente) con el nuevo puerto.

### 3. Error de CORS al conectar frontend con backend
Verificar que `main.py` tenga configurado CORS para `http://localhost:5173`.

### 4. Base de datos no encontrada
- Verificar que el archivo `.env` tenga la ruta correcta de la BD.
- Ejecutar `migrar_smilla.py` si se necesita migrar datos:
  ```bash
  python migrar_smilla.py
  ```

### 5. Error "command not found" al ejecutar scripts .bat
- Ejecutar PowerShell/CMD como administrador.
- Verificar que las variables de entorno de Python y Node esten configuradas.

### 6. Frontend no carga (pantalla en blanco)
```bash
cd frontend
rm -rf node_modules
npm install
npm run dev
```

### 7. Icono de la aplicacion no aparece
- Verificar que `DonBeni.ico` este en la raiz del proyecto.
- En FastAPI, servir archivos estaticos desde `/static`.

### 8. Errores de migracion de datos
- Verificar conexion a la base de datos origen en `migrar_smilla.py`.
- Revisar logs de errores en consola.

### 9. Git push falla con "permission denied"
```bash
git config user.email "tu-email@github.com"
git config user.name "TuUsuario"
```
Usar GitHub CLI (`gh auth login`) o configurar token de acceso.

### 10. Errores de encoding (caracteres especiales)
Asegurar que los archivos Python tengan encoding UTF-8 al inicio:
```python
# -*- coding: utf-8 -*-
```

---

## Contacto

Repositorio: https://github.com/Adrianmbt/DBMinimarket
Abrir un Issue en GitHub para reportar problemas.
