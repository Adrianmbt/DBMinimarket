# Migración de Base de Datos - MinimarketDB

## Resumen

El archivo `smilla.db` contiene los datos reales del sistema anterior (semilla cargada el sábado pasado). Este archivo se importa automáticamente al ejecutar `instalar.bat`, transfiriendo la información a `minimarket.db` (la base de datos del sistema nuevo).

**Datos contenidos en smilla.db:**
- 325 productos reales
- 117 ventas históricas
- 30 compras a proveedores
- 10 cuentas de crédito (4 pendientes)
- 3 cierres diarios
- 12 registros de bajas de stock
- Usuarios del sistema anterior

---

## Flujo de Instalación

Cuando ejecutas `instalar.bat`, el proceso realiza estos pasos en orden:

```
Paso 5:  python seed_data.py          ← Crea datos de DEMO (40 productos ficticios)
Paso 5b: python migrar_smilla.py      ← Importa datos REALES de smilla.db (si existe)
```

**Nota:** Si `smilla.db` no existe, la app queda con datos de demostración (solo para pruebas).

---

## Instrucciones Paso a Paso

### 1. Verificar que smilla.db existe

Asegúrate de que el archivo `smilla.db` esté en la raíz del proyecto:

```
C:\Users\...\DBMinimarket\smilla.db
```

### 2. Ejecutar la instalación

Doble clic en `instalar.bat`. El script ejecutará automáticamente:
- Instalación de dependencias (Python y Node.js)
- Creación de datos de demostración (seed)
- Importación de datos reales desde `smilla.db`

### 3. Verificar resultados

Al finalizar, la consola mostrará un resumen como:

```
==================================================
  MIGRACIÓN COMPLETADA
==================================================
  users              :   X usuarios nuevos importados
  products           : XXX productos nuevos importados
  purchases          :  30 compras nuevas importadas
  stock_bajas        :  12 bajas de stock importadas
  sales              : 117 ventas nuevas importadas
  cuentas_credito    :  10 cuentas de credito importadas
  cierres_diarios    :   3 cierres diarios importados
```

---

## Qué se Migra (Tabla por Tabla)

| Tabla | Acción | Detalle |
|-------|--------|---------|
| `categories` | Se saltan | Ya idénticas en ambas bases de datos |
| `users` | Se importan | Solo los que no existen (sin duplicar) |
| `products` | Se importan | 325 productos reales, mapeando categorías |
| `purchases` | Se importan | 30 compras con sus detalles |
| `purchase_details` | Se importan | Detalle de cada compra (cantidad, costo, cajas, peso) |
| `stock_bajas` | Se importan | 12 registros de bajas de mercancía |
| `sales` | Se importan | 117 ventas con impuestos y métodos de pago |
| `sale_details` | Se importan | Detalle de productos vendidos |
| `cuentas_credito` | Se importan | 10 cuentas (4 pendientes, 6 pagadas) |
| `pagos_credito` | Se importan | Pagos registrados para cuentas pagadas |
| `cierres_diarios` | Se importan | 3 cierres de caja diarios |
| `exchange_rates` | **NO se migra** | Se actualiza desde la app (tasa BCV) |

---

## Semilla de Demostración

El archivo `seed_data.py` crea datos ficticios para pruebas:
- 40 productos de ejemplo (Harina PAN, Coca-Cola, etc.)
- 3 usuarios de prueba (admin, cajero1, cajero2)
- 10 compras de ejemplo
- 7 ventas de ejemplo

**Estos datos se crean ANTES de la migración.** Si ejecutas la migración, los datos reales de `smilla.db` se importan encima (sin duplicar).

### Para probar sin datos reales:
```bash
# No tener smilla.db en la raíz, o renombrarlo:
ren smilla.db smilla_backup.db
python seed_data.py
```

---

## Migración Automática de Esquema

Cuando la app inicia, `database.py` ejecuta `habilitar_columnas()` que:

1. **Agrega columnas nuevas** a tablas existentes (si faltan)
2. **Crea índices** para acelerar consultas
3. **Asigna roles** por defecto (admin = administrador, demás = vendedores)

Esto es idempotente: se puede ejecutar muchas veces sin problemas.

---

## Notas Importantes

1. **Script idempotente:** `migrar_smilla.py` se puede ejecutar varias veces sin crear duplicados.

2. **Backup recomendado:** Antes de migrar, haz una copia de seguridad:
   ```bash
   copy smilla.db smilla_backup_2026.db
   ```

3. **Tasas de cambio:** La tasa BCV no se migra (se actualiza automáticamente desde la API oficial).

4. **Contraseñas:** Los usuarios se importan con sus contraseñas hasheadas (bcrypt). Las contraseñas de la semilla de demostración son: admin/admin123, cajero1/cajero123, cajero2/cajero123.

5. **Categorías:** Las categorías de `smilla.db` ya son idénticas a las del sistema nuevo, por eso se saltan en la migración.

---

## Troubleshooting

### Error: "No se encuentra smilla.db"
- Verifica que el archivo esté en la raíz del proyecto
- El sistemaContinuará con datos de demostración

### Error: "No se encuentra minimarket.db"
- Ejecuta la app primero para crear la base de datos
- O ejecuta: `python -c "from database import Base, engine; Base.metadata.create_all(bind=engine)"`

### Error: "Fallo la carga de la semilla de datos"
- Verifica que Python esté instalado y en el PATH
- Verifica que las dependencias estén instaladas: `pip install -r requeriments.txt`

### Los productos no aparecen
- Verifica que la migración se ejecutó correctamente
- Revisa la consola para ver el resumen de la migración

### Los usuarios no funcionan
- Las contraseñas están hasheadas con bcrypt
- Si olvidaste las contraseñas, usa: admin/admin123

---

## Archivos Relacionados

| Archivo | Descripción |
|---------|-------------|
| `smilla.db` | Base de datos del sistema anterior (datos reales) |
| `minimarket.db` | Base de datos del sistema nuevo |
| `migrar_smilla.py` | Script de migración |
| `seed_data.py` | Semilla de datos de demostración |
| `database.py` | Conexión a BD y migración de esquema |
| `models.py` | Modelos de SQLAlchemy |
| `instalar.bat` | Script de instalación automática |

---

## Soporte

Repositorio: https://github.com/Adrianmbt/DBMinimarket
Abrir un Issue en GitHub para reportar problemas.
