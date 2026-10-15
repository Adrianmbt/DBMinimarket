# Bitácora de cambios — Don Beni Minimarket

Documento vivo. Registra **todo cambio** hecho en el entorno de desarrollo para
que un agente (asistido por el dueño del sistema) lo replique en la **PC del
cliente** de forma rápida, segura y sin tumbar el sistema.

> Regla de oro: **nada se aplica en la PC del cliente sin leer primero la
> entrada del cambio y su sección "Qué evitar".** La última vez se perdieron
> ~2 horas por el manejo del archivo de base de datos; este documento existe
> para que eso no vuelva a pasar.

- **Proyecto:** DBMinimarket / Sistema Don Beni
- **Repo:** https://github.com/Adrianmbt/DBMinimarket
- **Fecha de apertura:** 2026-10-12
- **Responsable dev:** Adrián (asistido por agente)

---

## 1. Cómo usar este documento

1. Cada cambio se registra como una entrada `CHG-###` con el **formato fijo** de
   la sección 3.
2. Cada trabajo pedido por el cliente se registra como `REQ-###` (sección 6) y
   referencia los `CHG` que lo implementan.
3. El agente en la PC del cliente:
   - Lee el `REQ` completo y sus `CHG`.
   - Ejecuta el **Protocolo de respaldo** (sección 5) antes de tocar nada.
   - Aplica solo los pasos indicados; si algo no coincide con el entorno
     descrito, **se detiene y avisa** (no improvisa).
   - Verifica con los criterios de aceptación del `REQ`.
4. Al terminar cada cambio aquí, se actualiza este archivo **antes** de
   empaquetar.

---

## 2. Entorno y restricciones conocidas

### Máquina de desarrollo (esta PC)
- **SO:** Windows. Shell: PowerShell 5.1.
- **Python del venv:** `venv\Scripts\python.exe` (Python 3.14.7).
- **Node/npm:** v24.19.0 / 11.17.0.
- **Base de datos (modo dev):** `minimarket.db` en la **raíz del proyecto**
  (`paths.py` → `DATA_DIR` = raíz cuando no está congelado).

### Máquina del cliente (empaquetado)
- La BD vive en `%APPDATA%\MinimarketDB\minimarket.db` (`paths.py`, modo
  congelado).
- Se ejecuta como `DonBeniMinimarket.exe`; se detiene con `packaging\Detener.bat`
  (`taskkill /IM DonBeniMinimarket.exe /F`).

### Restricciones de seguridad (IMPORTANTE)
- **Device Guard / Application Control bloquea `venv\Scripts\pip.exe`.**
  - Síntoma: `'...\venv\Scripts\pip.exe' ha sido bloqueado por la directiva de
    Device Guard de su organización`.
  - **Solución:** usar siempre `python -m pip ...`, **nunca** `pip` ni `pip.exe`.
  - `python.exe` y `python -m pip` **sí** funcionan.
- No usar `pip` suelto en ningún script, comando ni documentación.

### Comportamiento de arranque de la app (referencia)
- Al iniciar, `main.py` ejecuta `Base.metadata.create_all` + `habilitar_columnas()`:
  - **Solo agrega** columnas/índices faltantes (aditivo e idempotente).
  - Crea el usuario `admin` **únicamente si no hay usuarios**.
  - **No** inserta datos de demostración.
- `seed_data.py` y `migrar_smilla.py` insertan datos → **prohibidos en
  producción** (ver sección 5).

---

## 3. Registro de cambios (change log)

### Formato de entrada
```
### CHG-### — <título corto>
- Fecha:
- Archivo(s):
- Tipo: [añadido | modificado | eliminado | renombrado | movido]
- Motivo:
- Antes:
- Después:
- Pasos para replicar en la PC del cliente:
- Qué evitar:
- Verificación:
```

---

### CHG-001 — Instalador: usar `python -m pip` en vez de `pip`
- **Fecha:** 2026-10-12
- **Archivo(s):** `instalar.bat`
- **Tipo:** modificado
- **Motivo:** Device Guard bloquea `venv\Scripts\pip.exe`; el instalador
  invocaba `pip` directamente y fallaba en el paso 3.
- **Antes:**
  ```bat
  if exist requeriments.txt (
      pip install -r requeriments.txt
  ) else (
      pip install -r requirements.txt
  )
  ```
- **Después:**
  ```bat
  if exist requeriments.txt (
      python -m pip install -r requeriments.txt
  ) else (
      python -m pip install -r requirements.txt
  )
  ```
  (La línea `python -m pip install --upgrade pip` ya estaba correcta.)
- **Pasos para replicar en la PC del cliente:** si en esa PC se ejecuta un
  instalador, asegurar que **ningún** comando invoque `pip`/`pip.exe`; usar
  `python -m pip`.
- **Qué evitar:** ❌ Ejecutar `pip ...` o `venv\Scripts\pip.exe` (bloqueado).
  ✅ Ejecutar `python -m pip ...`.
- **Verificación:** las dependencias de `requeriments.txt` se instalan sin el
  error de Device Guard.

---

### CHG-002 — Instalador: omitir la BD si ya existe `minimarket.db`
- **Fecha:** 2026-10-12
- **Archivo(s):** `instalar.bat` (paso 5 y 5b)
- **Tipo:** modificado
- **Motivo:** el instalador ejecutaba `seed_data.py` (datos de demo) y
  `migrar_smilla.py` siempre. Con una BD real ya presente eso insertaría datos
  no deseados.
- **Antes:**
  ```bat
  echo =^> 5. Cargando datos iniciales...
  python seed_data.py
  if errorlevel 1 goto err_seed

  echo =^> 5b. Importando datos del sistema anterior...
  if exist smilla.db ( python migrar_smilla.py ... )
  ```
- **Después:**
  ```bat
  echo =^> 5. Base de datos...
  if exist minimarket.db (
      echo [SKIP] Ya existe minimarket.db. Se conserva la base de datos actual.
      goto db_lista
  )
  echo No existe minimarket.db; cargando datos iniciales...
  python seed_data.py
  ... (5b migrar_smilla.py igual que antes) ...
  :db_lista
  ```
- **Pasos para replicar en la PC del cliente:** asegurar que el flujo de
  arranque/actualización **no** ejecute `seed_data.py` ni `migrar_smilla.py`
  cuando la BD ya existe.
- **Qué evitar:** ❌ Correr `seed_data.py` / `migrar_smilla.py` sobre la BD real.
- **Verificación:** el instalador imprime `[SKIP] Ya existe minimarket.db...` y
  los conteos de la BD no cambian.

---

### CHG-003 — Reemplazar la BD activa por la del cliente
- **Fecha:** 2026-10-12
- **Archivo(s):** `minimarket.db`, `minimarket.db.bak_bodegon`,
  `minimarket.db.bak_caja`
- **Tipo:** reemplazado (swap de datos)
- **Motivo:** la BD activa era la del "bodegón" (menos productos). Se colocó el
  respaldo del cliente (antiguo, de unos días atrás) como BD activa.
- **Antes:** `minimarket.db` = 88 productos / 75 ventas (bodegón).
- **Después:** `minimarket.db` = respaldo del cliente:
  - `products` **352**, `sales` **581**, `purchases` **47**,
    `cuentas_credito` **16**, `cierres_diarios` **8**, `stock_bajas` **19**,
    `users` **3**.
  - Respaldos presentes: `minimarket.db.bak_bodegon` (bodegón),
    `minimarket.db.bak_caja` (copia del respaldo del cliente).
- **Pasos para replicar en la PC del cliente:**
  1. **Detener el sistema** (en dev: `taskkill` sobre `python`/`node` del
     proyecto; en cliente: `packaging\Detener.bat`). No tocar la BD con el
     sistema corriendo.
  2. Respaldar la BD actual con fecha: `minimarket.db.bak_AAAA-MM-DD`.
  3. Copiar la BD deseada sobre `minimarket.db` (dev: raíz del proyecto;
     cliente: `%APPDATA%\MinimarketDB\minimarket.db`).
  4. Reiniciar (`iniciar.bat` / `DonBeniMinimarket.exe`) y verificar conteos.
- **Qué evitar:**
  - ❌ Reemplazar la BD con el servicio en ejecución.
  - ❌ Sobrescribir sin respaldo previo.
  - ❌ Confundir las variantes (bodegón vs. cliente).
- **Verificación:** los conteos de `products`/`sales` coinciden con la BD
  esperada (ver inventario, sección 4).

---

### CHG-004 — Formularios de venta (contado y crédito): más filas visibles, orden invertido y resaltado
- **Fecha:** 2026-10-12
- **Archivo(s):**
  - `frontend/src/components/Ventas.jsx` (diálogo "Nueva Venta")
  - `frontend/src/components/VentaCredito.jsx` (diálogo "Nueva Venta a Crédito")
  - `frontend/src/index.css` (keyframe `row-enter`)
- **Tipo:** modificado
- **Motivo:** en la pantalla chica del cliente (10–13") el carrito solo mostraba
  ~2 productos. En ventas de 10+ productos el vendedor debía buscar los ítems
  uno por uno y se confundía. Se pidió ver más filas, invertir el orden (último
  agregado arriba) y resaltar el producto recién agregado.
- **Antes:**
  - Diálogo `maxWidth="md"` con alto libre (`minHeight: 500`), crecía según el
    contenido y empujaba el carrito fuera de pantalla.
  - El carrito se renderizaba en orden de inserción con animación por índice.
  - Espaciados amplios (`px: 3`, `py: 2`, `my: 2`) y bloque de impuestos
    siempre expandido.
- **Después:**
  - **Alto fijo y scroll interno:** el `Paper` del diálogo usa
    `display:flex, flexDirection:column, height: min(92dvh, 900px)`
    (`fullScreen` + `height:100%` cuando la ventana ≤ 900px).
  - **Zonas rígidas vs. elásticas:** barra de búsqueda, fila de cliente/plazo/moneda,
    `Divider` y barra inferior llevan `flexShrink: 0`; el **carrito** es la única
    zona `flex: 1, minHeight: 0, overflow: auto` → absorbe todo el espacio libre.
  - **Compactado:** paddings `px: 3 → 2.5`, `py: 2 → 1.5`, `my: 2 → 1.5`,
    celdas de tabla `py: 0.5`, encabezado del carrito `mb: 1` y fijo (`sticky`).
  - **Orden invertido:** `cart.map(...)` → `[...cart].reverse().map(...)` (el
    **último agregado aparece arriba**). El array `cart` no cambia de orden
    (el envío al backend conserva el orden de inserción).
  - **Resaltado:** al agregar un producto se guarda `highlightId`; la fila se
    pinta con acento (dorado `#C9952A` en contado, verde `#2D5A1E` en crédito)
    durante **1600 ms** y entra con la animación `row-enter`.
  - **Impuestos colapsables** (solo contado): resumen en una línea; se expande
    con click (`taxOpen` + `ExpandMore`/`ExpandLess`).
  - **Etiqueta** "Último agregado arriba" a la derecha del encabezado del carrito.
- **Cambio adicional (corrección):** `VentaCredito.jsx` usaba `mensajeError`
  (línea del `catch` de `handleCreate`) **sin importarlo** → habría fallado en el
  camino de error. Se agregó `import { mensajeError } from '../utils/error'`.
- **Pasos para replicar en la PC del cliente:**
  1. Copiar los 3 archivos al árbol de fuentes.
  2. En `frontend/`: `npm install` (si hace falta) y `npm run build`.
  3. Desplegar `frontend/dist` (build estático). **No** requiere tocar la BD ni
     el backend; se puede hacer en caliente.
- **Qué evitar:**
  - ❌ Quitar `minHeight: 0` del contenedor del carrito: sin él, el flex no
    permite scroll y vuelve a empujar el layout.
  - ❌ Invertir el array `cart` antes de enviarlo (debe enviarse en orden de
    inserción); invertir **solo** en el render.
  - ❌ Usar animación que fije `background-color` con `fill-mode: both` sobre la
    fila: pisaría el resaltado. Por eso `row-enter` solo anima `opacity`/`transform`.
- **Verificación:**
  - `npm run build` en `frontend/` termina sin errores.
  - En ventana ≤ 900px el diálogo es `fullScreen`; en cualquier tamaño se ven
    **≥ 6–8 filas** del carrito y la barra inferior + búsqueda siguen visibles.
  - Al agregar productos, el último aparece arriba resaltado ~1.5 s.
  - El total, la tasa y los impuestos se calculan igual que antes.

> **Nota (ver CHG-005):** parte de este cambio se aplicó sobre
> `frontend/src/components/VentaCredito.jsx`, que resultó ser **código muerto**
> (no lo importa ningún componente). El diálogo **real** de venta a crédito es
> el de `Creditos.jsx`. CHG-005 corrige el alcance y aplica allí el rediseño.

---

### CHG-005 — Rediseño en 2 columnas de los formularios de venta (contado y crédito)
- **Fecha:** 2026-10-12
- **Archivo(s):**
  - `frontend/src/components/Ventas.jsx` (diálogo "Nueva Venta")
  - `frontend/src/components/Creditos.jsx` (diálogo "Nueva Venta a Crédito") ← real
  - `frontend/src/components/VentaCredito.jsx` (**código muerto**; ver nota)
- **Tipo:** modificado
- **Motivo:** aprovechar el ancho del monitor para **2 columnas** (buscador+carrito
  a la izquierda; cliente/pago a la derecha), subir el **total** y
  **"Consultar precio"** al encabezado, y dejar **un solo botón** de cobro en el
  pie. Así el carrito gana casi todo el alto y el vendedor ve muchos más
  productos en la pantalla chica del cliente (10–13").
- **Antes:** layout de **una columna**: buscador → cliente/plazo(/moneda) →
  `Divider` → carrito → pie con *total + 2 botones* (Cancelar/Cobrar).
- **Después:**
  - **Breakpoint:** `isWide = useMediaQuery('(min-width: 1000px)')`.
  - **Paper:** `fullScreen={!isWide}`; `borderRadius isWide?3:0`,
    `height isWide?'min(92dvh, 900px)':'100%'`, `display:flex, flexDirection:column`.
  - **Encabezado (`DialogTitle`):** título + **total a cobrar** (y tasa) + X para
    cerrar; en **Ventas** además el botón **"Consultar precio"**
    (`PriceCheck`, `setConsultaPreciosOpen(true)`). Se **eliminó** el botón
    *Cancelar* del pie (equivale a la X).
  - **Fila principal:** `flexDirection isWide?'row':'column'`, `flex:1, minHeight:0, overflow:hidden`.
    - **Izquierda** `flex '1.7 1 0'` (chico: `'1 1 auto'`): buscador + carrito.
      El **carrito** es la única zona con scroll (`flex:1, minHeight:0, overflow:auto`).
    - **Derecha** `flex isWide?'1 1 0':'0 0 auto'`, `minWidth isWide?340:0`,
      `bgcolor '#F8F5F0'` (crédito `#F0F7EC`), `borderLeft` en ancho / `borderTop`
      al apilar, `overflowY:auto`, `maxHeight isWide?'none':'46vh'`: **cliente**
      (+ **referencia** en contado si el método la pide) / **plazo** / **moneda**
      (contado) / métodos de pago / resumen. El **total** va al final con `mt:'auto'`.
  - **Pie (`DialogContent` footer):** **solo** botón Cobrar / Registrar Crédito,
    `width {xs:'100%', md:'auto'}`.
  - **Carrito:** orden invertido (`[...cart].reverse()` solo en render) + fila
    `row-enter` + resaltado del último agregado (dorado `#C9952A` en contado,
    verde `#2D5A1E` en crédito) — se aplica **también** al diálogo de `Creditos.jsx`.
- **Corrección de alcance (IMPORTANTE):** el diálogo real de venta a crédito es
  el de **`Creditos.jsx`**. `VentaCredito.jsx` **no está importado por nadie**
  (código muerto) → los cambios de CHG-004 allí efectuados **no** afectaban la UI
  real. CHG-005 aplica el rediseño al diálogo verdadero.
- **Pasos para replicar en la PC del cliente:**
  1. Copiar `frontend/src/components/Ventas.jsx` y `Creditos.jsx`.
  2. En `frontend/`: `npm install` (si hace falta) y `npm run build`.
  3. Desplegar `frontend/dist`. **Sin** tocar BD ni backend (en caliente).
- **Qué evitar:**
  - ❌ Tocar la lógica de cálculo ni el payload al backend.
  - ❌ Quitar `minHeight:0` del carrito ni del contenedor de la fila.
  - ❌ Invertir el array `cart` antes de enviarlo (invertir **solo** en render).
  - ❌ Usar animación que fije `background-color` sobre la fila (pisaría el resaltado).
- **Verificación:**
  - `npm run build` en `frontend/` sin errores (ref: `Creditos` ~50.8 kB, `Ventas` ~68.2 kB).
  - En ventana **≥ 1000px** se ven **2 columnas**; en **< 1000px** apila (panel
    derecho hasta `46vh`) con búsqueda, carrito y botón siempre visibles.
  - El total del encabezado y el del panel coinciden con la lógica anterior.

---

### CHG-006 — "Nueva Venta": monto pagado anclado y referencia del cobro simple reubicada
- **Fecha:** 2026-10-12
- **Archivo(s):** `frontend/src/components/Ventas.jsx` (diálogo "Nueva Venta")
- **Tipo:** modificado
- **Motivo:**
  1. La **referencia** del cobro simple aparecía **junto al nombre del cliente**
     (en la columna derecha) y se confundía con el campo del cliente; además, al
     pasar a **mixto** desaparecía sin dejar claro dónde iba.
  2. El botón **"Cobrar"** no se anclaba al **monto pagado** (solo avisaba al
     enviar); debía quedar deshabilitado hasta que el monto cubriera el total.
  3. Aclarar la etiqueta del monto recibido ("Recibe…" → **"Monto pagado"**).
- **Antes:**
  - El bloque **Cliente** incluía el campo `Referencia` cuando el método lo
    requiere (`METHODS_WITH_REFERENCE.includes(paymentMethod)`).
  - Inputs de monto llamados `Recibe en Bs` / `Recibe en $` (simple) y
    `Recibe <método> (Bs|$)` (mixto).
  - Botón: `disabled={cart.length === 0 || submitting || !tasaActual}`.
- **Después:**
  - La **Referencia** del cobro simple se movió a la sección **Pago**, debajo del
    selector de método (`!mixed && METHODS_WITH_REFERENCE.includes(paymentMethod)`).
    En **mixto** se mantienen las **2 referencias** (`mixedRef1`/`mixedRef2`) como
    estaban.
  - Inputs renombrados a **"Monto pagado (Bs|$)"**: **1** para simple, **2** para
    mixto (sin cambio funcional en mixto).
  - Botón **anclado**: `disabled` incluye `montoInsuficiente` → no se cobra hasta
    que el **monto pagado** cubra el total (o el abono). Es obligatorio ingresarlo.
- **Pasos para replicar en la PC del cliente:** copiar `Ventas.jsx`;
  `npm run build` en `frontend/`; desplegar `frontend/dist`. Sin BD/backend.
- **Qué evitar:** no tocar la lógica de cálculo (IVA/IGTF/totales) ni el payload;
  mantener `minHeight:0` en el carrito; no invertir el array `cart` antes de enviar.
- **Verificación:** `npm run build` sin errores. En **simple** aparece 1 campo
  "Monto pagado (Bs|$)" (+ Referencia si el método la pide) en la sección Pago; en
  **mixto**, 2 montos + 2 referencias. El botón "Cobrar" queda **deshabilitado**
  mientras falte monto y muestra "Faltan…"/"Cambio a devolver…".

---

### CHG-007 — Modal de venta más grande y columna derecha más compacta
- **Fecha:** 2026-10-12
- **Archivo(s):** `frontend/src/components/Ventas.jsx` (Nueva Venta) y
  `frontend/src/components/Creditos.jsx` (venta a crédito) — misma maquetación.
- **Tipo:** modificado (solo UI/sizing)
- **Motivo:** el contenido seguía cortándose: había que **escrollear a un lado**
  para ver el **botón de eliminar artículo** del carrito y los elementos de la
  **columna derecha** (cobro mixto, total a pagar). Se pidió una modal **más
  ancha y un poco más alta**, con los elementos de la derecha **más pequeños**.
- **Antes:** `maxWidth="md"` (900 px); alto `min(92dvh, 900px)`; columna derecha
  `minWidth 340` y `px 2.5` (Ventas) / `px 3` (Créditos); total a `1.5rem`.
- **Después:**
  - `maxWidth="lg"` (1200 px) → más ancho útil; el carrito ya no se corta.
  - Alto `min(96dvh, 960px)` → un poco más alto.
  - Columna derecha `minWidth 320` y paddings `px 2` (Ventas) / `px 2.5`
    (Créditos); `Divider` `mx 2 / 2.5`, `my 1`; footer `px 2 / 2.5`.
  - Total a cobrar `1.5rem → 1.4rem`.
  - Proporción columnas **1.7 : 1** (izq. carrito : der. pago), con `minWidth:0`
    para permitir el ajuste.
- **Pasos para replicar:** copiar `Ventas.jsx` y `Creditos.jsx`; `npm run build`;
  desplegar `frontend/dist`. Sin BD/backend.
- **Qué evitar:** no bajar de `1.7` en la proporción (volvería el scroll lateral);
  mantener `minWidth:0` en ambas columnas.
- **Verificación:** build OK. En ≥1000 px el botón de eliminar artículo y el total
  se ven sin scroll horizontal; en <1000 px la modal ocupa pantalla completa.

---

### CHG-008 — "Registrar Cobro" (créditos): monto pagado en método simple y botón anclado
- **Fecha:** 2026-10-12
- **Archivo(s):** `frontend/src/components/Creditos.jsx` (diálogo "Registrar Cobro")
- **Tipo:** modificado
- **Motivo:** paridad con "Nueva Venta" (CHG-006). En **método simple** no existía
  input de **monto pagado** (solo en mixto) y el botón no se anclaba al monto:
  se podía cobrar sin registrar cuánto entregó el cliente.
- **Antes:** solo **Mixto** tenía 2 inputs (`cobroRecUsd`/`cobroRecBs`), el
  cálculo `cobroRecibeTotal`/`cobroFaltaUsd`/`cobroInsuficiente` existía **solo
  para mixto**, y `received_bs`/`received_usd` se enviaban **solo en mixto**.
- **Después:**
  - Nuevo campo **"Monto pagado (Bs|$)"** para el **método simple**, con la
    moneda del método (`cobroMoneda`): `cobroRecBs` si es Bs, `cobroRecUsd` si es $.
  - `cobroRecibeUsd` **generalizado** (simple Bs → `cRecBs/tasa`; simple $ →
    `cRecUsd`; mixto → `cRecUsd + cRecBs/tasa`).
  - `cobroInsuficiente` generalizado: `cobroRecibeUsd <= 0.005 || falta > 0.005`
    → el botón queda **deshabilitado** hasta cubrir el monto a cobrar/abonar.
  - Mensaje de estado unificado ("Faltan…"/"Cubre…"/"sobra…"), visible para
    simple y mixto.
  - **Payload:** ahora se envían `received_bs`/`received_usd` también en simple
    (Bs → `received_bs`; $ → `received_usd`). Backend no requiere cambios:
    `registrar_cobro` **solo valida** en mixto, pero **guarda** `received_*`
    en cualquier método.
  - Labels de mixto `Recibe (…)` → **`Monto pagado (…)`**.
- **Pasos para replicar:** copiar `Creditos.jsx`; `npm run build`; desplegar
  `frontend/dist`. Sin cambios en backend ni BD.
- **Qué evitar:** no tocar la lógica de abono parcial (`montoAbonar`,
  `abonoExcede`) ni la de referencia (`cobroNecesitaRef`).
- **Verificación:** build OK. Con método simple aparece 1 campo "Monto pagado" y
  el botón se habilita al cubrir el monto; en mixto, 2 campos. Al cobrar se
  envían los montos entregados al backend.

---

### CHG-009 — Directorio de clientes y cobro consolidado de créditos (FIFO)
- **Fecha:** 2026-10-12
- **Archivo(s):**
  - **Nuevos:** `routers/clientes.py`, `textutils.py`, `frontend/src/api/clientes.js`
  - **Modificados (backend):** `models.py`, `schemas.py`, `database.py`, `main.py`,
    `routers/creditos.py`, `routers/ventas.py`
  - **Modificados (frontend):** `frontend/src/api/creditos.js`,
    `frontend/src/components/Creditos.jsx`, `frontend/src/components/Ventas.jsx`
- **Tipo:** **nuevo** (backend + frontend + migración ligera de BD)
- **Motivo:** las ventas a crédito guardaban el cliente como **texto libre**
  (`client_name`) y cada venta creaba **1 cuenta independiente**. No había forma
  de ver el **estado de cuenta** de un cliente con varias compras ni de cobrar
  **varias compras a la vez**. Se pidió: (1) estado de cuenta por cliente con
  créditos **pendientes**; (2) **directorio de clientes** (no coincidencia por
  texto); (3) directorio **solo en ventas a crédito**; (4) cobro **automático
  FIFO** (la compra más antigua primero); (5) **solo consolidado por cliente,
  con abonos permitidos**; (6) **backfill automático** de los nombres existentes.
- **Antes:**
  - No existía entidad **Cliente**; `Sale.client_name` y
    `CuentaCredito.client_name` eran texto libre.
  - Cada `CuentaCredito` se cobraba **individualmente** por
    `POST /api/creditos/{id}/pagar` (`routers/creditos.py::registrar_cobro`).
- **Después:**
  - **BD (migración ligera, idempotente):** nueva tabla `clientes` (`Cliente`:
    `id`, `name`, `name_key` único, `phone`, `notes`, `activo`, `created_at`);
    columnas nuevas `cuentas_credito.cliente_id` (FK `clientes.id`, nullable,
    index) y `pagos_credito.grupo_pago` (VARCHAR, index). `database.py::
    habilitar_columnas` las agrega si faltan y ejecuta **backfill**: crea un
    cliente por cada nombre distinto y enlaza las cuentas sin `cliente_id`.
    `create_all` crea la tabla `clientes`.
  - **`textutils.py`:** `normalize_name_key(name)` (minúsculas, sin acentos ni
    espacios) para evitar duplicados.
  - **`routers/clientes.py`:** `get_or_create_cliente()`; `GET /api/clientes`
    (`q`, `incluir_inactivos`), `POST` (409 si duplicado), `PUT /{id}` (renombra
    y **propaga** a cuentas y ventas), `DELETE /{id}` (**baja lógica**).
  - **`routers/creditos.py`:** nuevo **`POST /api/creditos/cliente/{cliente_id}/
    pagar`** — cobro **consolidado FIFO**: reparte el monto entre las cuentas
    pendientes (más antigua primero); sin `monto_usd` cobra el total, con
    `monto_usd` permite **abono parcial**; crea **un `PagoCredito` por cuenta**
    con el mismo `grupo_pago`; marca `pagado` al llegar a 0; `received_*` solo en
    el primer pago; devuelve resumen + `aplicado[]`.
  - **`routers/ventas.py`:** al crear crédito resuelve el cliente por
    `cliente_id` o por nombre (`get_or_create_cliente`); al editar acepta
    `cliente_id` (relink) o nombre.
  - **Frontend `Creditos.jsx`:**
    - Carga el directorio (`getClientes`) junto con las cuentas.
    - **Selector de cliente** (`Autocomplete` freeSolo + botón de directorio) en
      el diálogo "Nueva Venta a Crédito"; envía `cliente_id` (o `client_name`).
    - **Toggle "Por venta / Por cliente"** (`vista`): vista agrupada
      (`ClientesCreditosView`) con tarjeta por cliente (nº de créditos
      pendientes, total en USD, desglose por venta con vencimiento) y botón
      **"Cobrar consolidado"**.
    - **Cobro consolidado** reutiliza el diálogo "Registrar Cobro": estado
      `cobroCliente`; `openCobroCliente(cliente)` fija el saldo a la **suma** de
      cuentas pendientes; `handleRegistrarCobro` ramifica → `pagarCliente(id)` vs
      `registrarCobro(cuenta.id)`; encabezado y título adaptados
      ("Cobro consolidado · <cliente>", desglose).
    - **Gestión del directorio** (diálogo "Directorio de Clientes"):
      crear / buscar / editar / desactivar.
  - **Frontend `Ventas.jsx`:** en la **edición de venta a crédito**
    (`editVenta.is_credit`) el campo cliente pasa a **`Autocomplete`** del
    directorio y `SaleUpdate` envía `cliente_id`; en ventas de contado se mantiene
    el texto libre.
- **Pasos para replicar:**
  1. **Respaldo de la BD (obligatorio):** copiar `minimarket.db`.
  2. Copiar backend (`models.py`, `textutils.py`, `database.py`, `schemas.py`,
     `main.py`, `routers/clientes.py`, `routers/creditos.py`, `routers/ventas.py`).
  3. Copiar frontend (`api/clientes.js`, `api/creditos.js`, `Creditos.jsx`,
     `Ventas.jsx`); `npm run build`; desplegar `frontend/dist`.
  4. Reiniciar el backend: `create_all` crea `clientes`; `habilitar_columnas`
     agrega `cliente_id`/`grupo_pago` y ejecuta el **backfill** (idempotente).
- **Qué evitar:** no correr `seed_data.py`/`migrar_smilla.py` en producción; no
  ejecutar backfill sobre la BD activa sin respaldo previo (Nivel 1).
- **Verificación:** `python -m pytest -q` → **44 passed**; `npm run build` OK.
  Nueva venta a crédito con cliente del directorio → `cliente_id` persistido;
  vista "Por cliente" agrupa pendientes; "Cobrar consolidado" con abono parcial
  reparte FIFO y deja el saldo correcto.

---

### CHG-010 — Carrito de "Nueva Venta": suma correcta de productos y servicios
- **Fecha:** 2026-10-13
- **Archivo(s):** `frontend/src/components/Ventas.jsx`, `test_main.py`
- **Tipo:** modificado (corrección de bug)
- **Motivo:** al agregar un producto o un servicio al carrito la sumatoria no
  avanzaba (subtotal/total quedaban en "—") y la venta no se podía registrar.
- **Antes:**
  - `addToCart` escribía los ítems con los campos viejos (`quantity`, `stock`)
    mientras el resto del componente (subtotal, contador, inputs de cantidad y
    el payload) leía `unitQty` / `weightG` / `max_stock`.
  - Resultado: `subtotalDe(c) = sale_price * undefined = NaN` →
    `formatNumber(NaN)` = "—" → total, subtotales y "Carrito (NaN items)";
    el payload enviaba `quantity: undefined` → 422 del backend.
  - El monto del servicio (Bs.) y el precio fijo (`fixed_bs`, `sale_price` en
    Bs.) se sumaban como si fueran USD, sin dividir por la tasa BCV; además se
    mostraban con símbolo `$`.
- **Después:**
  - `addToCart` vuelve a escribir `unitQty` / `weightG` / `max_stock`
    (mismo shape que `Creditos.jsx` y `VentaCredito.jsx`), conservando
    `isService` / `price_bs_manual` / `isFixedBs`.
  - `subtotalDe` convierte a USD lo que está en Bs. (`price_bs_manual` del
    servicio y `sale_price` del precio fijo) con la tasa BCV, igual que el
    backend (`routers/ventas.py` → `price_bs / rate` y `sale_price / rate`).
  - `tasaActual` se declaró antes de `totalUSD` (evita referencia antes de
    inicializarse).
  - Cada servicio agregado recibe un `lineId` único: la fila usa
    `key={lineId}` y `removeFromCart(item)` elimina solo esa fila (antes dos
    servicios iguales tenían la misma key y se borraban juntos).
  - Precio unitario en el carrito mostrado en `Bs.` para servicio / precio fijo.
  - `test_main.py`: nuevo `test_venta_servicio_y_precio_fijo_en_bs` que fija el
    contrato del backend (servicio sin `price_bs` → 400; total =
    `price_bs / rate_usd`; precio fijo = `sale_price / rate` por unidad; el
    servicio no descuenta stock).
- **Pasos para replicar en la PC del cliente:**
  1. Copiar `frontend/src/components/Ventas.jsx` y `test_main.py`.
  2. En `frontend/`: `npm run build` y desplegar `frontend/dist`.
  3. Sin cambios de esquema/BD; el backend no cambió (solo se agregó test).
- **Qué evitar:** ❌ Renombrar de nuevo `unitQty` ↔ `quantity` en un solo lado
  del archivo. ❌ Sumar montos en Bs. al total en USD sin dividir por la tasa.
- **Verificación:** `python -m pytest -q` → **45 passed**; `npm run build` sin
  errores. En el carrito: subtotal y total cambian al agregar productos y
  servicios; un servicio de Bs. 360 con tasa 730 aporta $0.49 (Bs. 360).

---

### CHG-011 — API de productos: 500 al crear productos sin código de barras
- **Fecha:** 2026-10-13
- **Archivo(s):** `routers/productos.py`, `test_main.py`
- **Tipo:** modificado (corrección de bug)
- **Motivo:** `POST /api/productos` devolvía **500** al crear productos dejando
  el código de barras vacío (visible al crear productos de categoría
  "Precio Fijo", pero aplica a **cualquier** categoría).
- **Antes:**
  - El formulario envía `barcode: ""`; `products.barcode` tiene **índice
    ÚNICO** (`ix_products_barcode`) y SQLite no trata `''` como NULL →
    `IntegrityError: UNIQUE constraint failed: products.barcode` → 500.
  - `_validar_barcode_unico` se saltaba la validación con valores vacíos
    (`if not barcode: return`), así que nadie lo interceptaba y el error
    llegaba crudo desde la BD. Bastaba **un** producto existente con `''`
    (id 340, "Glup naranja 2ltr") para que todos los siguientes fallaran.
- **Después:** `_normalizar_barcode()` convierte vacío/espacios en **NULL** antes
  de persistir (crear y actualizar). SQLite permite varios NULL → varios
  productos "sin código" coexisten; los códigos reales siguen siendo únicos
  (400, no 500).
- **Pasos para replicar en la PC del cliente:**
  1. Copiar `routers/productos.py` y `test_main.py`.
  2. **Reiniciar el backend** (no corre con `--reload`).
  3. Sin cambios de esquema/BD; no requiere respaldo (solo lógica de la app).
- **Qué evitar:** ❌ Hacer `UPDATE` de la BD a mano para "arreglar" el duplicado:
  no hace falta y el esquema (Nivel 2) no cambió. ❌ Quitar el índice único de
  `products.barcode` (es lo que protege los códigos reales).
- **Verificación:** `python -m pytest -q` → **46 passed** (incluye
  `test_producto_sin_codigo_de_barras`, que fallaba con 500 antes del fix).
  En la app: crear dos productos seguidos sin código de barras → ambos guardan
  (respuesta 200, `barcode: null`).

---

### CHG-013 — Ocultar productos sin stock en las modales de venta (contado y crédito)
- **Fecha:** 2026-10-15
- **Archivo(s):** `frontend/src/utils/productos.js` (**nuevo**),
  `frontend/src/components/Ventas.jsx`, `frontend/src/components/Creditos.jsx`
- **Tipo:** añadido + modificado
- **Motivo:** en la búsqueda de "Nueva Venta" y "Nueva Venta a Crédito" aparecían
  productos con **stock 0** (típicamente duplicados sin movimientos) y se podían
  agregar al carrito. Se pidió que no estorben en las ventas.
- **Antes:**
  - `filtered` en `Ventas.jsx` y `Creditos.jsx` filtraba solo por nombre/código;
    mostraba todo lo que devolvía `GET /api/productos` (que ya excluye
    `activo=false`, **pero no** los de stock 0 con `activo=true`).
  - El auto-agregado por **código de barras exacto** (`handleSearchChange`) y el
    Enter de un solo resultado también aceptaban productos con stock 0.
- **Después:** helper compartido `esVendible(p)` en `utils/productos.js`:
  - `category_type === 'service'` → **siempre** visible (los servicios no
    descuentan stock).
  - `normal` / `fixed_bs` → visible solo si `stock > 0`.
  Se aplica en `filtered` y en la búsqueda por código exacto de ambas modales
  (venta nueva, venta a crédito y edición de venta en `Ventas.jsx`).
- **Pasos para replicar en la PC del cliente:**
  1. Copiar `frontend/src/utils/productos.js`, `Ventas.jsx` y `Creditos.jsx`.
  2. `cd frontend; npm run build` y desplegar `frontend/dist`.
  3. **Solo frontend** → no reinicia backend, sin cambios de esquema/BD.
- **Qué evitar:** ❌ No filtrar por stock en `ConsultaPrecios.jsx` ni en
  `NuevaCompraDialog.jsx` (ahí sí deben verse los productos con stock 0).
  ❌ No tocar `VentaCredito.jsx` (código muerto; el diálogo real es
  `Creditos.jsx`). ❌ No cambiar la regla en el backend.
- **Verificación:** `cd frontend; npm run build` → OK. `python -m pytest -q` →
  **46 passed** (sin cambios de backend). En la app: un producto con stock 0
  (no servicio) ya no aparece ni se agrega al escanear su código; un servicio y
  un producto con stock siguen apareciendo.
- **Nota de numeración:** los números `CHG-012` y `REQ-007` están **reservados**
  por el plan pendiente de migración (`PLAN_MIGRACION_BD.md` §8); se volcarán a
  esta bitácora al ejecutarlo.

---

## 4. Inventario de artefactos relevantes

### Base de datos
| Archivo | Contenido | Estado |
|---|---|---|
| `minimarket.db` | Respaldo del cliente (352 productos, 581 ventas) | **activa** |
| `minimarket.db.bak_caja` | Copia del respaldo del cliente | respaldo |
| `minimarket.db.bak_bodegon` | BD previa del bodegón (88 productos) | respaldo |

### Scripts
| Archivo | Función | Notas |
|---|---|---|
| `instalar.bat` | Instala dependencias Python (via `python -m pip`) y frontend | omite BD si ya existe |
| `iniciar.bat` / `iniciar.ps1` | Arranca backend (uvicorn) + frontend (vite) + navegador | dev |
| `seed_data.py` | Datos de demostración | **prohibido en producción** |
| `migrar_smilla.py` | Migra desde `smilla.db` (sistema anterior) | solo migración puntual |
| `packaging\build.ps1` | Empaqueta con PyInstaller | build |
| `packaging\Detener.bat` | Detiene el `.exe` del cliente | `taskkill /IM DonBeniMinimarket.exe /F` |

### Rutas clave
- Dev: `minimarket.db` en la raíz del proyecto.
- Cliente: `%APPDATA%\MinimarketDB\minimarket.db`.
- Migración de esquema automática: `habilitar_columnas()` en `database.py`.

### Artefactos de clientes / crédito consolidado (CHG-009, REQ-004)
| Archivo | Función |
|---|---|
| `models.py` | `Cliente` (tabla `clientes`); `CuentaCredito.cliente_id`; `PagoCredito.grupo_pago` |
| `textutils.py` | `normalize_name_key(name)` (clave única de nombre) |
| `routers/clientes.py` | CRUD del directorio + `get_or_create_cliente()` |
| `routers/creditos.py` | Cobro individual + `POST /cliente/{id}/pagar` (FIFO) |
| `database.py` | `habilitar_columnas` + **backfill** de clientes (idempotente) |
| `schemas.py` | `ClienteCreate/Update/Response`; `cliente_id`/`grupo_pago` |
| `frontend/src/api/clientes.js` | API del directorio |
| `frontend/src/components/Creditos.jsx` | Selector, vista "Por cliente", cobro consolidado, directorio |
| `frontend/src/components/Ventas.jsx` | Selector de cliente en edición de crédito |
- Arranque app: `main.py` (lifespan).

---

## 5. Reglas para cambios en la PC del cliente (spec-driven)

> Objetivo: **implementar en menos de 30 minutos, sin caída del sistema y con
> cambios en tiempo real.**

### 5.1 Flujo spec-driven
1. **Especificación** (`REQ-###`): qué se pide, criterios de aceptación, qué NO
   se toca.
2. **Plan**: pasos concretos, archivos, orden, rollback.
3. **Ejecución** por el agente, siguiendo el plan al pie de la letra.
4. **Verificación** contra los criterios de aceptación.
5. Si algo no coincide con lo documentado → **detener y avisar**, no improvisar.

### 5.2 Política de contacto con la base de datos (contacto mínimo)
- **Nivel 1 — Datos (filas):** `INSERT` / `UPDATE` / `DELETE` dentro de las
  tablas. **Permitido** con respaldo previo. No requiere revisión.
- **Nivel 2 — Esquema (tablas/campos):** `ALTER TABLE`, `DROP COLUMN`,
  `DROP TABLE`, renombrar o cambiar tipos.
  - **Requiere revisión y justificación escrita** (problema, por qué es
    necesario, impacto, plan de rollback). **Sin excepción.**
  - Incluye lo que agregue `habilitar_columnas()`: sus migraciones actuales son
    solo aditivas e idempotentes, pero **toda columna/tabla nueva debe
    registrarse como cambio aprobado** antes de subir al cliente.
- **Preferencia:** resolver todo con cambios de **Nivel 1 + lógica de la app**,
  evitando tocar el esquema. (Expectativa actual: no se necesita modificación
  mayor de la BD.)

### 5.3 Respaldo y rollback (obligatorio antes de cualquier cambio)
1. Detener el servicio.
2. Copiar la BD: `minimarket.db.bak_AAAA-MM-DD_HHMM`.
3. Aplicar el cambio.
4. Si algo falla → restaurar el respaldo y reiniciar.

### 5.4 Cero caída / tiempo real
- No correr `seed_data.py` ni `migrar_smilla.py` en producción.
- Preferir reinicios controlados del backend sobre cambios destructivos.
- Cambios del frontend (build estático) son de bajo riesgo.
- Meta: intervención total **< 30 min**.

---

## 6. Requerimientos

### Formato de requerimiento
```
### REQ-### — <título>
- Fecha:
- Pedido por:
- Objetivo:
- Alcance (qué se toca):
- Fuera de alcance (qué NO se toca):
- Cambios que lo implementan (CHG):
- Plan de ejecución:
- Criterios de aceptación:
- Rollback:
```

---

### REQ-001 — Puesta en marcha del sistema en la PC del cliente con su BD real
- **Fecha:** 2026-10-12
- **Pedido por:** Adrián (dueño del sistema)
- **Estado:** abierto (planificado)
- **Objetivo:** dejar el sistema corriendo en la PC del cliente con **su base de
  datos real** (respaldo antiguo de unos días, válido para trabajar), sin
  ejecutar seed/migración y sin repetir los errores que costaron horas.
- **Alcance (qué se toca):**
  - `instalar.bat` (ensure: para referencias — CHG-001, CHG-002).
  - BD `minimarket.db` (colocar el respaldo del cliente — CHG-003).
  - Arranque: `iniciar.bat` / `DonBeniMinimarket.exe`.
- **Fuera de alcance:**
  - **No** tocar el esquema (Nivel 2) salvo que un `REQ` futuro lo justifique.
  - **No** ejecutar `seed_data.py` ni `migrar_smilla.py`.
- **Cambios que lo implementan:** CHG-001, CHG-002, CHG-003.
- **Plan de ejecución:**
  1. Detener el sistema en la PC del cliente.
  2. Respaldar su BD actual con fecha.
  3. Verificar/colocar la BD del cliente como `%APPDATA%\MinimarketDB\minimarket.db`.
  4. Confirmar que el flujo de arranque/actualización **no** corre seed/migración
     cuando la BD existe (equivalente a CHG-002).
  5. Arrancar y verificar.
- **Criterios de aceptación:**
  - El sistema arranca y es usable con los datos del cliente.
  - Conteos de referencia: `products` **352**, `sales` **581**.
  - No se insertó ningún dato de demostración.
  - Intervención total **< 30 min**, sin caída no planificada.
- **Rollback:** restaurar el respaldo tomado en el paso 2 y reiniciar.

> **Pendiente (se completa al empaquetar):** versión exacta del paquete,
> contenido del respaldo a desplegar y checklist final de verificación en la
> PC del cliente.

---

### REQ-002 — Mejorar UX de "Nueva Venta" y "Nueva Venta a Crédito" en pantalla chica
- **Fecha:** 2026-10-12
- **Pedido por:** Adrián (dueño del sistema)
- **Estado:** implementado en dev (pendiente de desplegar en cliente)
- **Objetivo:** que en el monitor chico del cliente (10–13", ~1366×768) el
  carrito muestre muchas más filas y que el vendedor identifique rápido el
  último producto agregado, en ventas de 10+ productos.
- **Alcance (qué se toca):**
  - `frontend/src/components/Ventas.jsx` (diálogo de venta al contado).
  - `frontend/src/components/VentaCredito.jsx` (diálogo de venta a crédito).
  - `frontend/src/index.css` (keyframe `row-enter`).
- **Fuera de alcance:**
  - **No** se toca el esquema/BD (Nivel 1+app logic solamente).
  - **No** se cambia la lógica de cálculo (tasa, IVA, IGTF, totales) ni el
    payload enviado al backend.
  - **No** se modifica el diálogo de edición de venta ni otras pantallas.
- **Cambios que lo implementan:** CHG-004.
- **Plan de ejecución:**
  1. Aplicar los cambios de layout/accesibilidad a ambos diálogos (CHG-004).
  2. `npm run build` en `frontend/` y verificar que compila.
  3. Probar el flujo de agregar 10+ productos en ventana ≤ 900px y en escritorio.
  4. Desplegar `frontend/dist` en la PC del cliente (sin tocar BD/backend).
- **Criterios de aceptación:**
  - Se ven **≥ 6–8 filas** del carrito en pantalla chica; búsqueda y barra
    inferior siempre visibles (sin scroll para llegar a ellas).
  - El **último producto agregado** aparece **arriba**, resaltado ~1.5 s.
  - Botón "Registrar" siempre accesible; sin cortes de layout.
  - Totales, IVA e IGTF idénticos a antes (sin regresión de cálculo).
  - `npm run build` sin errores.
- **Rollback:** revertir los 3 archivos a su versión previa y reconstruir el
  frontend (los diálogos vuelven al comportamiento anterior; sin impacto en BD).

---

### REQ-003 — Diálogos de venta en 2 columnas (carrito + pago) para pantalla chica
- **Fecha:** 2026-10-12
- **Pedido por:** Adrián (dueño del sistema)
- **Estado:** implementado en dev (pendiente de desplegar en cliente)
- **Objetivo:** reorganizar los diálogos **"Nueva Venta"** (contado) y
  **"Nueva Venta a Crédito"** en **2 columnas** para seguir viendo muchas filas
  del carrito (requisito de REQ-002) y, a la vez, ordenar mejor el pago:
  **carrito a la izquierda**, **cliente/pago a la derecha**, **total y
  "Consultar precio" en el encabezado**, y **un solo botón** de cobro en el pie.
- **Alcance (qué se toca):**
  - `frontend/src/components/Ventas.jsx` (diálogo de venta al contado).
  - `frontend/src/components/Creditos.jsx` (diálogo **real** de venta a crédito).
- **Fuera de alcance:**
  - **No** se toca esquema/BD (solo lógica de la app / layout).
  - **No** se cambia la lógica de cálculo (tasa, IVA, IGTF, totales) ni el payload
    enviado al backend.
  - **No** se modifica el diálogo de edición de venta, ni el de cobro, ni otras
    pantallas.
- **Cambios que lo implementan:** CHG-005, CHG-006, CHG-007, CHG-008.
- **Decisiones aprobadas (brainstorming):**
  1. Comportamiento **responsive**: 2 columnas si hay ancho; si no, se **apila**
     (buscador arriba, carrito con prioridad de alto, panel de pago debajo plegado).
  2. **Carrito a la izquierda, pago a la derecha.**
  3. Total + "Consultar precio" en el encabezado; abajo **solo** el botón de cobro
     (cancelar = X del encabezado).
  4. **Breakpoint:** 1000px.
- **Plan de ejecución:**
  1. Aplicar el layout de 2 columnas a `Ventas.jsx` (CHG-005).
  2. Aplicar el mismo layout al diálogo de `Creditos.jsx` (incluye orden invertido
     y resaltado del carrito).
  3. `npm run build` en `frontend/` y verificar.
  4. Revisión visual del usuario (ventana ≥ 1000px y < 1000px).
  5. Desplegar `frontend/dist` en la PC del cliente (sin tocar BD/backend).
- **Criterios de aceptación:**
  - En **≥ 1000px** se ven **2 columnas** (carrito izq., pago der.); en **< 1000px**
    se **apila** y el botón de cobro sigue siempre visible.
  - Se ven **≥ 6–8 filas** del carrito en pantalla chica; búsqueda y pie visibles
    sin scroll para llegar a ellos.
  - **Total a cobrar** en el encabezado (Ventas también con **"Consultar precio"**).
  - **Último producto agregado arriba**, resaltado ~1.5 s.
  - Totales, IVA e IGTF idénticos a antes (sin regresión de cálculo).
  - `npm run build` sin errores.
- **Rollback:** revertir `Ventas.jsx` y `Creditos.jsx` a su versión previa y
  reconstruir el frontend (sin impacto en BD).

---

### REQ-004 — Directorio de clientes y cobro consolidado de créditos (FIFO)
- **Fecha:** 2026-10-12
- **Pedido por:** Adrián (dueño del sistema)
- **Estado:** implementado en dev (pendiente de desplegar en cliente)
- **Objetivo:** poder ver el **estado de cuenta** de un cliente que tiene **varias
  compras a crédito** y **cobrarlas todas juntas**, en vez de una por una. El
  cliente deja de ser **texto libre** y pasa a un **directorio** reutilizable.
- **Alcance (qué se toca):**
  - **Backend:** nueva entidad **`Cliente`** y tabla `clientes`; `cliente_id` en
    `cuentas_credito`; `grupo_pago` en `pagos_credito`; CRUD `routers/clientes.py`;
    cobro consolidado `POST /api/creditos/cliente/{id}/pagar`; `textutils.py`.
  - **Frontend:** selector de cliente (`Autocomplete`) en venta y edición de
    crédito; vista **"Por cliente"** con estado de cuenta; botón **"Cobrar
    consolidado"**; diálogo **"Directorio de Clientes"**.
  - **Migración ligera de BD:** `habilitar_columnas` (columnas idempotentes) +
    **backfill** de nombres existentes → clientes.
- **Fuera de alcance:**
  - **No** se agrupan ventas de **contado** (el directorio aplica **solo a
    crédito**; los clientes de confianza son a crédito).
  - **No** se cambia el cobro **individual** por cuenta (sigue disponible en la
    vista "Por venta").
  - **No** se reescribe la lógica de totales/tasa/IVA/IGTF.
- **Cambios que lo implementan:** CHG-009.
- **Decisiones aprobadas (brainstorming):**
  1. Estado de cuenta por cliente con créditos **pendientes**.
  2. **Directorio de clientes** (no coincidencia por texto libre).
  3. Directorio **solo en ventas a crédito**.
  4. Cobro **automático FIFO** (la compra más antigua primero).
  5. **Solo consolidado por cliente, permitiendo abonos** (no cobro individual
     forzado); el cobro individual se mantiene aparte.
  6. **Backfill automático** de los nombres existentes al crear la tabla.
- **Plan de ejecución:**
  1. **Respaldo de `minimarket.db`** (Nivel 1, obligatorio).
  2. Backend: `Cliente`, columnas, backfill, CRUD, cobro consolidado (CHG-009).
  3. Frontend: selector, vista por cliente, cobro consolidado, directorio.
  4. `npm run build` y `python -m pytest -q`.
  5. Desplegar backend + `frontend/dist` y reiniciar (aplica migración ligera).
- **Criterios de aceptación:**
  - Al crear una venta a crédito se puede **elegir/crear** un cliente del
    directorio; queda asociado por `cliente_id`.
  - La vista **"Por cliente"** muestra, por cliente, nº de créditos pendientes,
    total pendiente y **desglose** por venta (fecha, venta #, saldo, vence).
  - **"Cobrar consolidado"** reparte el pago **FIFO**; un **abono parcial** deja
    el saldo correcto y puede repetirse.
  - El **directorio** permite **crear, buscar, editar y desactivar** clientes.
  - Los clientes existentes (texto libre) quedan **enlazados** tras el backfill.
  - `python -m pytest -q` (**44 passed**) y `npm run build` sin errores.
- **Rollback:** restaurar el respaldo de `minimarket.db`, revertir archivos de
  backend/frontend a su versión previa y reconstruir el frontend. El backfill es
  **idempotente**, por lo que re-ejecutar no duplica clientes.

---

### REQ-005 — Bug de sumatoria en el carrito de "Nueva Venta" (productos y servicios)
- **Fecha:** 2026-10-13
- **Pedido por:** Adrián (dueño del sistema)
- **Estado:** implementado en dev (pendiente de desplegar en cliente)
- **Objetivo:** que agregar productos y servicios al carrito de venta contado
  **sume correctamente**; los servicios se cobran en bolívares y su monto debe
  sumar al total.
- **Alcance (qué se toca):**
  - `frontend/src/components/Ventas.jsx` (diálogo "Nueva Venta").
  - `test_main.py` (test de contrato servicio/precio fijo).
- **Fuera de alcance (qué NO se toca):**
  - No se modifica esquema/BD ni la lógica de backend de ventas.
  - No se cambia el diálogo de venta a crédito (`Creditos.jsx`).
- **Cambios que lo implementan:** CHG-010.
- **Criterios de aceptación:**
  - Al agregar un producto, el subtotal de la fila, el contador de ítems y el
    total se actualizan (no aparece "—" ni "NaN").
  - Al agregar un servicio y escribir el monto en Bs., el carrito muestra
    `Bs. <monto>` y el total crece en `monto / tasa` USD (≈ `monto` Bs.).
  - El botón "Cobrar" registra la venta (payload con `quantity` y `price_bs`).
  - `python -m pytest -q` → **45 passed**; `npm run build` sin errores.
- **Rollback:** revertir `Ventas.jsx` a su versión previa y reconstruir el
  frontend (sin impacto en BD).

---

### REQ-006 — Crear productos sin código de barras (error 500)
- **Fecha:** 2026-10-13
- **Pedido por:** Adrián (dueño del sistema)
- **Estado:** implementado en dev (pendiente de desplegar en cliente)
- **Objetivo:** poder crear productos (en especial de la categoría **Precio
  Fijo**) dejando el código de barras vacío, sin que la API responda 500.
- **Alcance (qué se toca):**
  - `routers/productos.py` (crear/actualizar producto).
  - `test_main.py` (regresión del bug).
- **Fuera de alcance (qué NO se toca):**
  - No se modifica esquema/BD (el índice único se mantiene).
  - No se modifica el formulario de Inventario.
- **Cambios que lo implementan:** CHG-011.
- **Criterios de aceptación:**
  - Dos productos consecutivos sin código de barras se guardan (200).
  - Un código de barras repetido sigue respondiendo **400** con mensaje claro.
  - `python -m pytest -q` → **46 passed**.
- **Rollback:** revertir `routers/productos.py` a su versión previa y reiniciar
  el backend (sin cambios de BD).

---

### REQ-007 — *(reservado)* Instalar el sistema nuevo en la PC del cliente conservando su BD
> Reservado por `PLAN_MIGRACION_BD.md` §8; se volcará a esta bitácora al ejecutar
> el plan de migración. No usar este número para otro requerimiento.

---

### REQ-008 — Ocultar productos sin stock en las modales de venta (contado y crédito)
- **Fecha:** 2026-10-15
- **Pedido por:** Adrián (dueño del sistema)
- **Estado:** implementado en dev (pendiente de desplegar en cliente)
- **Objetivo:** que los productos con **stock 0** (p. ej. duplicados sin
  movimientos) no aparezcan ni se puedan agregar en las modales de "Nueva Venta"
  y "Nueva Venta a Crédito", sin borrar ni alterar el inventario ni el historial.
- **Alcance (qué se toca):**
  - `frontend/src/utils/productos.js` (helper `esVendible`).
  - `frontend/src/components/Ventas.jsx` (búsqueda y código de barras).
  - `frontend/src/components/Creditos.jsx` (búsqueda y código de barras).
- **Fuera de alcance (qué NO se toca):**
  - No se modifica esquema/BD, backend ni `routers/productos.py`.
  - No se borra ni desactiva ningún producto (seguirá en Inventario).
  - No se altera `ConsultaPrecios.jsx` ni `NuevaCompraDialog.jsx`.
- **Cambios que lo implementan:** CHG-013.
- **Plan de ejecución:** copiar los 3 archivos y `npm run build`; desplegar
  `frontend/dist` (cambio en caliente, sin reinicio de backend).
- **Criterios de aceptación:**
  - Un producto `normal`/`fixed_bs` con stock 0 no aparece en la búsqueda ni se
    agrega al escanear su código de barras, en contado y en crédito.
  - Los servicios (`category_type = service`) siempre aparecen.
  - Un producto con stock > 0 se comporta igual que antes.
  - `npm run build` sin errores; `python -m pytest -q` → **46 passed**.
- **Rollback:** revertir los 3 archivos y reconstruir el frontend (sin impacto
  en BD).

