# Migración de Base de Datos - MinimarketDB

## Resumen

El archivo `minimarketmg.db` contiene los datos reales del sistema (backup del domingo). Este archivo se importa al ejecutar `python migrar_seed.py`, transfiriendo la información a `minimarket.db` (la base de datos del sistema).

**Datos contenidos en minimarketmg.db:**
- 334 productos reales
- 236 ventas históricas
- 36 compras a proveedores
- 13 cuentas de crédito (6 pendientes, 7 pagadas)
- 4 cierres diarios
- 16 registros de bajas de stock
- 3 usuarios del sistema

---

## Flujo de Migración

Cuando ejecutas `python migrar_seed.py`, el proceso realiza estos pasos:

```
1. Elimina datos demo actuales de minimarket.db
2. Importa categorías, usuarios, productos
3. Importa compras con sus detalles
4. Importa bajas de stock
5. Importa ventas con sus detalles
6. Importa cuentas de crédito y extrae pagos a tabla pagos_credito
7. Importa cierres diarios
8. Importa tasas de cambio
9. Verifica integridad de la migración
```

---

## Instrucciones Paso a Paso

### 1. Verificar que minimarketmg.db existe

Asegúrate de que el archivo `minimarketmg.db` esté en la raíz del proyecto:

```
C:\Users\...\DBMinimarket\minimarketmg.db
```

### 2. Ejecutar la migración

```bash
python migrar_seed.py
```

### 3. Verificar resultados

Al finalizar, la consola mostrará un resumen como:

```
==================================================
  VERIFICACION DE MIGRACION
==================================================
  categories               :     9 registros
  users                    :     3 registros
  products                 :   334 registros
  purchases                :    36 registros
  purchase_details         :    36 registros
  sales                    :   236 registros
  sale_details             :   407 registros
  stock_bajas              :    16 registros
  cuentas_credito          :    13 registros
  pagos_credito            :     3 registros
  cierres_diarios          :     4 registros
  exchange_rates           :     1 registros

  Creditos pendientes: 6
  Creditos pagados: 7
  Pagos registrados: 3
```

---

## Qué se Migra (Tabla por Tabla)

| Tabla | Acción | Detalle |
|-------|--------|---------|
| `categories` | Se reemplazan | 9 categorías idénticas |
| `users` | Se reemplazan | 3 usuarios (admin, cajero1, cajero2) |
| `products` | Se reemplazan | 334 productos reales con categorías |
| `purchases` | Se reemplazan | 36 compras con sus detalles |
| `purchase_details` | Se reemplazan | Detalle de cada compra (cantidad, costo, cajas, peso) |
| `stock_bajas` | Se reemplazan | 16 registros de bajas de mercancía |
| `sales` | Se reemplazan | 236 ventas con impuestos y métodos de pago |
| `sale_details` | Se reemplazan | 407 detalles de productos vendidos |
| `cuentas_credito` | Se reemplazan | 13 cuentas (6 pendientes, 7 pagadas) |
| `pagos_credito` | Se crean | 3 pagos extraídos de cuentas pagadas |
| `cierres_diarios` | Se reemplazan | 4 cierres de caja diarios |
| `exchange_rates` | Se reemplazan | 1 tasa de cambio |

**Nota:** La tabla `pagos_credito` es nueva en el esquema actual. Las cuentas de crédito pagadas en `minimarketmg.db` tenían los datos de pago embebidos (`payment_method`, `payment_reference`, etc.). El script `migrar_seed.py` extrae estos datos y los inserta en `pagos_credito`.

---

## Semilla de Demostración

El archivo `seed_data.py` crea datos ficticios para pruebas iniciales:
- 40 productos de ejemplo (Harina PAN, Coca-Cola, etc.)
- 3 usuarios de prueba (admin, cajero1, cajero2)
- 10 compras de ejemplo
- 7 ventas de ejemplo

**Para cargar datos reales:**
```bash
# Asegurar que minimarketmg.db existe en la raíz
python migrar_seed.py
```

**Para volver a datos de demo:**
```bash
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

1. **Script de migración:** `migrar_seed.py` reemplaza completamente los datos demo con los datos reales de `minimarketmg.db`.

2. **Backup recomendado:** Antes de migrar, haz una copia de seguridad:
   ```bash
   copy minimarket.db minimarket_backup_2026.db
   ```

3. **Tasas de cambio:** La tasa BCV se migra desde el backup, pero puede actualizarse desde la app.

4. **Contraseñas:** Los usuarios se importan con sus contraseñas hasheadas (bcrypt). Las contraseñas de la semilla de demostración son: admin/admin123, cajero1/cajero123, cajero2/cajero123.

5. **Cuentas de crédito:** Las cuentas pagadas se migran con sus datos de pago extraídos a la tabla `pagos_credito`.

6. **Integridad referencial:** El script verifica que no haya detalles huérfanos (productos inexistentes en detalles de ventas/compras).

---

## Troubleshooting

### Error: "No se encuentra minimarketmg.db"
- Verifica que el archivo esté en la raíz del proyecto
- El sistema no podrá cargar datos reales sin este archivo

### Error: "No se encuentra minimarket.db"
- Ejecuta la app primero para crear la base de datos
- O ejecuta: `python -c "from database import Base, engine; Base.metadata.create_all(bind=engine)"`

### Los productos no aparecen
- Verifica que la migración se ejecutó correctamente
- Revisa la consola para ver el resumen de la migración
- Verifica que `minimarketmg.db` tenga datos

### Los usuarios no funcionan
- Las contraseñas están hasheadas con bcrypt
- Si olvidaste las contraseñas, usa: admin/admin123

### Error de integridad referencial
- El script verifica que no haya detalles huérfanos
- Si hay errores, verifica que los productos existan en ambas bases de datos

---

## Archivos Relacionados

| Archivo | Descripción |
|---------|-------------|
| `minimarketmg.db` | Backup de la base de datos (datos reales del domingo) |
| `minimarket.db` | Base de datos actual del sistema |
| `migrar_seed.py` | Script de migración desde minimarketmg.db |
| `migrar_smilla.py` | Script de migración desde smilla.db (sistema anterior) |
| `seed_data.py` | Semilla de datos de demostración |
| `database.py` | Conexión a BD y migración de esquema |
| `models.py` | Modelos de SQLAlchemy |
| `instalar.bat` | Script de instalación automática |

---

## Soporte

Repositorio: https://github.com/Adrianmbt/DBMinimarket
Abrir un Issue en GitHub para reportar problemas.
