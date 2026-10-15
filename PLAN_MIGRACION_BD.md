# Plan de adaptación de la base de datos del cliente — Don Beni Minimarket

> Documento de trabajo. Objetivo: **instalar el sistema nuevo en la PC del
> cliente conservando todos sus datos** y adaptar su base de datos a los cambios
> realizados. Al ejecutarlo, volcar las entradas `CHG-012` y `REQ-007` (borradores
> al final) en `change_documents.md`, que es la fuente de verdad de despliegue.

- **Fecha:** 2026-10-15
- **Repo:** https://github.com/Adrianmbt/DBMinimarket
- **Autor:** Adrián (asistido por agente)

---

## 1. Resumen

- La adaptación **no requiere script de migración**: el propio sistema migra la
  base al arrancar (`main.py` lifespan → `Base.metadata.create_all` +
  `database.py::habilitar_columnas`).
- `create_all` crea las **tablas** que falten (p. ej. `clientes`).
- `habilitar_columnas` agrega **columnas** faltantes e índices, y ejecuta los
  **backfills** (roles, `currency`, `category_type`, directorio de clientes).
- El trabajo pendiente es **operativo**: llevar la versión nueva, respaldar la
  BD del cliente, colocarla en el lugar correcto, arrancar una vez (ahí corre la
  migración), verificar y crear las 2 categorías nuevas.
- **Hay dos modos de instalación** y la BD vive en lugares distintos según el
  modo (ver §3.0). El modo documentado en el `README` y el que usan los scripts
  del repo es **source con `instalar.bat`** (BD en la raíz del proyecto). El
  `packaging\build.ps1` genera un exe que usa `%APPDATA%\MinimarketDB`. Elegir el
  modo ANTES de empezar para no trabajar sobre la BD equivocada.

---

## 2. Hallazgos (auditoría de una copia antigua del cliente)

Se auditó la copia `minimarket (1).db` (solo lectura) como ensayo del
procedimiento.

### 2.1 Diferencias de esquema y quién las resuelve

| Falta en una BD antigua | Lo resuelve | Mecanismo |
|---|---|---|
| Tabla `clientes` | `create_all` | Creación de tabla al arrancar |
| `categories.category_type` | `habilitar_columnas` | `ALTER TABLE` + backfill |
| `products.category_type` | `habilitar_columnas` | `ALTER TABLE` + backfill desde categoría |
| `sales.method_2`, `sales.received_2`, `sales.reference_2` | `habilitar_columnas` | `ALTER TABLE` |
| `cuentas_credito.cliente_id` | `habilitar_columnas` | `ALTER TABLE` |
| `pagos_credito.grupo_pago` | `habilitar_columnas` | `ALTER TABLE` |
| 5 índices de rendimiento | `habilitar_columnas` | `CREATE INDEX IF NOT EXISTS` |

Toda la diferencia de esquema está cubierta. **No hay columnas ni tablas
esperadas por el código que queden sin migrar.**

### 2.2 Integridad de datos (copia de ensayo)

- Sin cuentas/pagos/detalles huérfanos; sin productos con categoría inexistente;
  sin ventas a crédito sin cuenta.
- `users.role` ya trae `admin`/`vendedor` (el backfill no cambia nada).
- `cuentas_credito.currency` ya es `USD` en todas (el backfill no cambia nada).
- `products.barcode`: 1 fila `''` + 97 `NULL` → sin conflicto con el índice
  único (`ix_products_barcode`); no hay códigos duplicados.
- **Fusión esperada del directorio:** 16 nombres crudos de cliente → **14 claves
  normalizadas** (`textutils.normalize_name_key`); las variantes equivalentes
  (p. ej. de "pom pom") se fusionan en un solo cliente. Es el comportamiento
  diseñado (`name_key` único).

### 2.3 Límites de datos (no son errores)

- `sales.method_2 / received_2 / reference_2` quedan en `NULL`: los cobros mixtos
  históricos no se pueden reconstruir (antes no se guardaban).
- Las categorías especiales **`Precio Fijo` (`fixed_bs`)** y **`Servicios`
  (`service`)** no existen en una BD antigua: hay que crearlas (paso 6).
- `sales.rate_usd` ya existe y está poblado en la copia auditada.

### 2.4 Cambios del sistema nuevo sin `CHG` todavía

Además de lo ya anotado en `change_documents.md` (CHG-001..011), falta documentar:

- `categories.category_type` y `products.category_type`
  (`normal | fixed_bs | service`) con **herencia automática** desde la categoría
  (`models.py`, `schemas.py`, `database.py`, `routers/productos.py`).
- **Lógica de las 2 categorías nuevas** (`routers/ventas.py:341-367`):
  - `service`: el precio se ingresa en Bs al momento de la venta
    (`price_bs`), se guarda como `price_bs / tasa` y **no descuenta stock**.
  - `fixed_bs`: usa `product.sale_price` (interpretado en Bs) ÷ tasa por
    unidad/kg y **sí descuenta stock**.
  - `normal`: sin cambios respecto a antes.
- **Editar stock solo admin** (`frontend/src/components/Productos.jsx`:
  `disabled={!isAdmin}`): solo frontend, sin impacto en la BD.
- Mejoras visuales de las ventanas de venta (ya en CHG-004..008) y los cambios
  actuales de `Ventas.jsx` / `Creditos.jsx`.

---

## 3. Procedimiento de despliegue (PC del cliente)

> Regla de oro (change_documents.md §5.3): **detener el servicio → respaldo con
> fecha → aplicar → reiniciar**. Nunca copiar la BD con el sistema corriendo.

### 3.0 Revisión de `instalar.bat` y modos de instalación

**Elegir el modo ANTES de empezar.** La BD vive en sitios distintos:

| Modo | Cómo se instala | Dónde vive la BD | Interfaz |
|---|---|---|---|
| **Source** (el del `README`) | Copiar la carpeta del proyecto → `instalar.bat` → acceso directo → `iniciar.bat` | **raíz del proyecto** (`paths.py` en modo dev) | `npm run dev` (Vite); **no** requiere `npm run build` |
| **Empaquetado (exe)** | `packaging\build.ps1` → distribuir `dist\DonBeniMinimarket\` + `packaging\Detener.bat` | **`%APPDATA%\MinimarketDB`** | `frontend/dist` ya embebido |

> ⚠️ Inconsistencia a resolver: el `README` documenta el modo **source**, pero
> `change_documents.md` §2 dice que el cliente corre el **exe**. Confirmar cuál
> usa realmente el cliente; el procedimiento cambia de carpeta de BD.

Hallazgos al revisar `instalar.bat`:

- ✅ Instala dependencias de Python con `python -m pip` (CHG-001) y usa
  `requeriments.txt`.
- ✅ **Salta la semilla si ya existe `minimarket.db`** (línea 76 →
  `[SKIP] Ya existe minimarket.db. Se conserva la base de datos actual.`). Por
  eso el orden correcto en el cliente source es: **colocar primero la BD y
  después ejecutar `instalar.bat`**.
- ✅ Solo ejecuta `migrar_smilla.py` si existe `smilla.db`.
- ⚠️ **`instalar.bat` NO ejecuta la migración de esquema** (no arranca el
  backend). La migración (`create_all` + `habilitar_columnas`) ocurre en el
  **primer arranque** (`iniciar.bat` / exe).
- ⚠️ Si se ejecuta `instalar.bat` **sin** la BD del cliente presente, carga
  **datos de demostración** (`seed_data.py`). Colocar la BD antes, o reemplazarla
  después.
- ⚠️ Borra `node_modules` y `package-lock.json` en cada ejecución (lento, pero
  funciona).
- ⚠️ Está pensado para el **layout source**: comprueba `minimarket.db` en la raíz.
  En el modo exe la BD está en `%APPDATA%`; ejecutar `instalar.bat` en ese caso
  crearía un `minimarket.db` demo en la carpeta, **sin uso** por el exe.
- ❌ No hay respaldo automático de la BD: el respaldo es **manual** (Paso 2).

### Paso 0 — Preparar la versión nueva en la máquina de desarrollo

- **Modo source:** copiar la carpeta del proyecto actualizada (sin `venv`,
  `node_modules`, `frontend/dist`, `minimarket.db*` ni `secret_key.txt`). **No**
  hace falta `npm run build`: `iniciar.ps1` usa `npm run dev`.
- **Modo exe:**
  ```powershell
  cd frontend; npm run build; cd ..
  packaging\build.ps1
  ```
  Resultado: `dist\DonBeniMinimarket\` con el `.exe` y la interfaz nueva.

### Paso 1 — Detener el sistema en la PC del cliente

- **Modo source:** cerrar la ventana del navegador (los servidores se detienen
  solos). Si quedaran procesos, verificar que no haya `python`/`node` del
  proyecto en el Administrador de tareas.
- **Modo exe:** ejecutar `packaging\Detener.bat`
  (`taskkill /IM DonBeniMinimarket.exe /F`).
- **Verificar** que el sistema está apagado **antes** de tocar la BD.

### Paso 2 — Respaldar la base del cliente (obligatorio)

1. Localizar la BD según el modo: raíz del proyecto (source) o
   `%APPDATA%\MinimarketDB\` (exe).
2. Copiar `minimarket.db` a un respaldo con fecha:
   `minimarket.db.bak_AAAA-MM-DD_HHMM` (misma carpeta o disco aparte).
3. Copiar también `secret_key.txt` (para conservar las sesiones válidas).

### Paso 3 — Instalar la versión nueva y colocar la BD del cliente

- **Modo source:**
  1. Copiar la carpeta del proyecto nueva.
  2. Colocar la BD del cliente como `minimarket.db` en la **raíz** del proyecto
     (y conservar `secret_key.txt`).
  3. Ejecutar `instalar.bat`: verá la BD y **saltará la semilla**
     (`[SKIP] Ya existe minimarket.db`).
- **Modo exe:** reemplazar la carpeta `DonBeniMinimarket\` por la nueva;
  **NO borrar** `%APPDATA%\MinimarketDB\`; **no** ejecutar `instalar.bat`.
- En ambos modos: **NO** ejecutar `seed_data.py` ni `migrar_smilla.py`.

### Paso 4 — Arrancar una vez (corre la migración automática)

- Abrir el sistema (`iniciar.bat` en source, el `.exe` en modo empaquetado). En
  el arranque:
  - `create_all` crea `clientes` si falta.
  - `habilitar_columnas` agrega columnas/índices y ejecuta los backfills.
  - Crea `admin/admin123` **solo** si la tabla `users` está vacía (con datos del
    cliente, **no** se toca ningún usuario).

### Paso 5 — Verificar (ver §4)

### Paso 6 — Crear las 2 categorías nuevas (datos, Nivel 1)

Con un usuario **admin** → pantalla *Categorías*:

| Nombre | Unidad | Tipo |
|---|---|---|
| `Servicios` | `unidad` | **Servicios** (`service`) |
| `Precio Fijo` | `unidad` | **Precio Fijo** (`fixed_bs`) |

Luego, en *Inventario*, asignar los productos correspondientes a esas categorías
(el tipo se hereda de la categoría).

> Si el cliente no usará esas funciones, este paso es opcional; el sistema
> funciona igual sin esas categorías.

---

## 4. Verificación

### 4.1 Conteos antes/después (no debe cambiar ningún dato)

Registrar los conteos **antes** (con la BD respaldada) y **después** de la
migración; deben coincidir en: `products`, `sales`, `sale_details`, `purchases`,
`purchase_details`, `cuentas_credito`, `pagos_credito`, `stock_bajas`,
`cierres_diarios`, `users`, `categories`.

### 4.2 Esquema (solo lectura)

Consultas de comprobación sobre la BD del modo elegido: raíz del proyecto
(`minimarket.db`, source) o `%APPDATA%\MinimarketDB\minimarket.db` (exe).

```sql
-- La tabla nueva existe
SELECT name FROM sqlite_master WHERE type='table' AND name='clientes';

-- Columnas nuevas
PRAGMA table_info(categories);       -- debe incluir category_type
PRAGMA table_info(products);         -- debe incluir category_type
PRAGMA table_info(cuentas_credito);  -- debe incluir cliente_id
PRAGMA table_info(pagos_credito);    -- debe incluir grupo_pago
PRAGMA table_info(sales);            -- debe incluir method_2, received_2, reference_2

-- Índices de rendimiento (5)
SELECT name FROM sqlite_master WHERE type='index'
  AND name IN ('ix_sales_created_at','ix_sale_details_sale_id',
               'ix_sale_details_product_id','ix_purchases_created_at',
               'ix_purchase_details_purchase_id');
```

### 4.3 Backfills

```sql
-- Todas las cuentas quedaron enlazadas al directorio (debe dar 0)
SELECT COUNT(*) FROM cuentas_credito WHERE cliente_id IS NULL;

-- Clientes creados = nº de nombres normalizados distintos
SELECT COUNT(DISTINCT name_key) FROM clientes;

-- Ningún producto sin tipo
SELECT COUNT(*) FROM products WHERE category_type IS NULL OR category_type='';
```

> Riesgo: el backfill de clientes corre dentro de un `try/except` que silencia
> `OperationalError`. Si `cuentas_credito … cliente_id IS NULL` no da 0, ejecutar
> el backfill manual (misma lógica de `database.py::habilitar_columnas`) con el
> sistema detenido y respaldo previo.

### 4.4 Pruebas funcionales (con el sistema arriba)

- Login con los usuarios del cliente (contraseñas intactas).
- Inventario: se listan los productos con su categoría y tipo.
- Créditos → vista **"Por cliente"**: aparecen los clientes creados desde los
  nombres históricos y sus saldos pendientes.
- Registrar una venta de **servicio** (precio en Bs, no descuenta stock) y una de
  **precio fijo** (descuenta stock).
- Admin: editar el stock de un producto desde *Inventario*.

---

## 5. Criterios de aceptación

- El sistema arranca y es usable con los datos del cliente.
- Los conteos de §4.1 **no cambian** respecto al respaldo.
- Login OK con los usuarios existentes; no se recreó `admin` ni se alteraron
  contraseñas.
- `clientes` poblado; `cuentas_credito.cliente_id` no nulo en el 100%.
- Se pueden registrar ventas de servicio y de precio fijo; admin edita stock.
- Intervención total **< 30 min** por PC, sin caída no planificada.

---

## 6. Rollback

1. Detener el sistema (source: cerrar la ventana; exe: `packaging\Detener.bat`).
2. Restaurar `minimarket.db.bak_AAAA-MM-DD_HHMM` → `minimarket.db`, en la carpeta
   que corresponda al modo (raíz del proyecto o `%APPDATA%\MinimarketDB\`).
3. Restaurar la carpeta anterior del sistema si fuese necesario.
4. Reiniciar.

El backfill es **idempotente**: reintentar no duplica clientes ni enlaces.

---

## 7. Riesgos y notas

- **Nunca** copiar la BD con el sistema corriendo.
- **No** ejecutar `seed_data.py` / `migrar_smilla.py` en producción.
- No confundir variantes de BD (bodegón vs. cliente; ver inventario en
  `change_documents.md` §4). Nunca `git add -A` (`.gitignore` no cubre
  `minimarket.db.bak_*`).
- Conservar `secret_key.txt`: si se regenera, las sesiones (tokens) se invalidan
  (los usuarios deben volver a iniciar sesión).
- Conservar el respaldo al menos hasta confirmar la verificación completa.
- Toda la migración es **Nivel 2** (tabla/columnas nuevas): registrar la
  aprobación escrita en `change_documents.md` §5.2 antes de aplicar en el
  cliente.
- Los cobros mixtos históricos quedan con `method_2`/`received_2` en `NULL`.
- **`instalar.bat` no migra el esquema**: la migración solo corre al abrir el
  sistema (Paso 4). No dar la instalación por terminada sin arrancar y verificar.
- **`instalar.bat` no respalda nada**: el respaldo es manual (Paso 2). En modo
  source, colocar la BD del cliente **antes** de ejecutarlo, o cargará datos de
  demostración.
- Confirmar el **modo de instalación** (source vs. exe) antes de tocar nada: el
  comando de parada y la carpeta de la BD cambian.

---

## 8. Borradores para `change_documents.md`

### CHG-012 — Categorías especiales (Servicios / Precio Fijo), tipo heredado y edición de stock por admin

- **Fecha:** 2026-10-15
- **Archivo(s):** `models.py`, `schemas.py`, `database.py`,
  `routers/productos.py`, `routers/ventas.py`,
  `frontend/src/components/Productos.jsx`, `frontend/src/components/Ventas.jsx`,
  `test_main.py`
- **Tipo:** añadido (backend + frontend + migración ligera de BD)
- **Motivo:** habilitar dos tipos de categoría nuevos y la edición de stock por
  administrador.
- **Antes:** no existía `category_type`; todas las ventas se calculaban con
  `sale_price` en USD y descontaban stock.
- **Después:**
  - `categories.category_type` y `products.category_type`
    (`normal | fixed_bs | service`), con herencia desde la categoría
    (`_sync_from_category`).
  - `service`: precio en Bs al vender (`price_bs`), guardado como
    `price_bs / tasa`; **no** descuenta stock.
  - `fixed_bs`: `sale_price` (Bs) ÷ tasa; **sí** descuenta stock.
  - *Inventario*: el admin puede editar el stock (`disabled={!isAdmin}`).
  - Migración ligera: `habilitar_columnas` agrega `category_type` y hace backfill.
- **Pasos para replicar en la PC del cliente:**
  - **Modo source:** copiar la carpeta del proyecto actualizada y ejecutar
    `iniciar.bat` (usa `npm run dev`; **no** hace falta `npm run build`);
    **reiniciar el backend** aplica el `ALTER TABLE`.
  - **Modo exe:** `npm run build` en `frontend/`, `packaging\build.ps1` y
    desplegar la carpeta nueva.
  - Crear las categorías del paso 6.
- **Qué evitar:** ❌ Renombrar `unitQty`↔`quantity` en un solo lado; ❌ sumar Bs.
  al total USD sin dividir por la tasa.
- **Verificación:** `python -m pytest -q` OK; `npm run build` OK; venta de
  servicio (no baja stock) y de precio fijo (baja stock); admin edita stock.

### REQ-007 — Instalar el sistema nuevo en la PC del cliente conservando su BD

- **Fecha:** 2026-10-15
- **Pedido por:** Adrián (dueño del sistema)
- **Estado:** planificado
- **Objetivo:** dejar el sistema actualizado en la PC del cliente **sin perder
  datos**, adaptando su base al esquema nuevo y habilitando las funciones nuevas.
- **Alcance:** instalación/actualización por el modo elegido (**source con
  `instalar.bat`** o **exe empaquetado**); conservación de la BD del cliente en
  su carpeta (raíz del proyecto o `%APPDATA%\MinimarketDB\`); migración automática
  al primer arranque; creación de las categorías `Servicios` y `Precio Fijo`.
- **Fuera de alcance:** no ejecutar `seed_data.py` / `migrar_smilla.py`; no
  borrar `secret_key.txt`; no tocar las contraseñas de los usuarios.
- **Cambios que lo implementan:** CHG-012 (y CHG-009..011 ya desplegados).
- **Plan de ejecución:** pasos 0–6 de este documento.
- **Criterios de aceptación:** ver §5.
- **Rollback:** ver §6.
