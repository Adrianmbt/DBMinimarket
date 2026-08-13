# Sistema Don Beni Minimarket

Sistema de gestión para minimarket: inventario, ventas, compras, caja y reportes.
Backend en Python/FastAPI + frontend en React/Vite, todo local en una PC.

## Requisitos previos (instalar UNA sola vez)

1. **Python 3.13** (64 bits) — descárgalo de <https://www.python.org/downloads/>.
   - **IMPORTANTE:** durante la instalación marca la casilla **"Add Python to PATH"**.
2. **Node.js 22 LTS** — descárgalo de <https://nodejs.org/>.
   - Incluye `npm`, necesario para el frontend.

No necesitas nada más.

## Instalación en la PC nueva

1. Copia la carpeta completa del sistema al **Escritorio** (o donde prefieras).
2. Haz doble clic en **`instalar.bat`**.
   - Crea el entorno de Python, instala dependencias del backend y del frontend.
   - Carga los datos iniciales (categorías, productos, usuarios) en `minimarket.db`.
   - Crea el acceso directo **"Sistema Don Beni"** en el Escritorio con su icono.
3. Espera a que termine (la primera vez tarda unos minutos descargando dependencias).

## Uso diario

- Haz doble clic en **"Sistema Don Beni"** (acceso directo del Escritorio).
- Se abre el sistema en una ventana de navegador aislada. No hay ventanas de consola.
- **Para apagar:** cierra esa ventana del navegador y los servidores se detienen solos.

Usuarios iniciales (creados por la instalación):

| Usuario  | Contraseña | Rol        |
|----------|-----------|------------|
| admin    | admin123  | Administrador |
| cajero1  | cajero123 | Vendedor   |
| cajero2  | cajero123 | Vendedor   |

> ⚠️ Cambia la contraseña del administrador después de la primera instalación.

## Datos y respaldo

- Toda la información (ventas, compras, inventario, usuarios) vive en el archivo **`minimarket.db`** (SQLite) en la carpeta del proyecto.
- **Los datos se conservan** entre reinicios. La instalación solo carga datos de ejemplo si la base está vacía.
- Para respaldar: copia `minimarket.db` y `secret_key.txt` a un disco extraíble. Para restaurar, cópialos de vuelta **antes** de iniciar el sistema.

## ¿Cambiar la IP?

**No es necesario.** Si el sistema se usa **solo en esa PC** (caso recomendado), todo funciona con `localhost` automáticamente: no hay que cambiar ninguna IP al instalar en otra PC.

El servidor siempre abre en `http://localhost:5173`. La IP de red de cada PC no interviene porque nada se conecta por red: el navegador y los servidores viven en la misma máquina.

### Si algún día quieres acceder desde OTRA PC de la red (avanzado)

Si otra PC, tablet o celular de la misma red debe abrir el sistema, sí hay que adaptar la IP:

1. Averigua la IP de la PC servidor: abre `cmd` y ejecuta `ipconfig`. Busca el valor `Dirección IPv4` (ej: `192.168.1.50`).
2. En `iniciar.ps1` cambia las líneas:
   - `$backendUrl = 'http://127.0.0.1:8000'` → se mantiene (el proxy interno usa localhost).
   - La línea `$frontendUrl = 'http://localhost:5173'` → cambia por `$frontendUrl = 'http://<IP-de-esta-PC>:5173'`.
3. En `config.py`, añade la IP a los orígenes CORS:
   ```
   _DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://<IP-de-esta-PC>:5173"
   ```
4. En el firewall de Windows permite las conexiones (o acepta el aviso de "Red privada").
5. En la otra PC/tablet/celular, abre `http://<IP-de-esta-PC>:5173`.

> **No toques `frontend/src/api/axios.js`.** Su URL base es relativa (`/api`) y se
> adapta automáticamente al host del navegador; el proxy interno de Vite sigue
> apuntando a `localhost:8000`, así que ese archivo funciona igual sin cambios.
> Tampoco modifiques `frontend/vite.config.js`.

## Archivos importantes

| Archivo       | Qué hace                                            |
|---------------|-----------------------------------------------------|
| `instalar.bat`  | Instalación completa: venv, dependencias, semilla, acceso directo. |
| `iniciar.ps1`   | Arranca backend + frontend ocultos y abre el navegador aislado. |
| `iniciar.bat`   | Lanzador del sistema (mismo fin que el acceso directo). |
| `DonBeni.ico`   | Icono del acceso directo.                          |
| `minimarket.db` | Base de datos con todo el negocio.                 |
| `logs\sistema.log` | Registro de arranques/apagados (para diagnóstico). |

## Actualizar el sistema en GitHub (para el desarrollador)

El código del sistema vive en el repositorio
<https://github.com/Adrianmbt/DBMinimarket>. Para subir cambios a ese repositorio
necesitas **Git**.

### 1. Instalar Git

- Descarga la **última versión estable** de Git para Windows (64 bits) desde
  <https://git-scm.com/download/win>.
- Ejecuta el instalador con los valores por defecto. Solo revisa que en la
  pantalla **"Adjusting your PATH"** esté marcada la opción
  **"Git from the command line and also from 3rd-party software"**.
- Comprueba que quedó bien instalado: abre `cmd` y ejecuta:

  ```
  git --version
  ```

  Debe mostrar algo como `git version 2.5x.x.windows.1`.

### 2. Configurar tu identidad (una sola vez)

```
git config --global user.name "Adrian Bello"
git config --global user.email "tu-correo@ejemplo.com"
```

### 3. Subir los cambios

Desde la carpeta del proyecto:

```
git status                                    # ver qué cambió
git add instalar.bat README.md                # agregar los archivos que cambiaste
git commit -m "Descripción breve del cambio"  # guardar el cambio
git push origin main                          # subirlo a GitHub
```

La primera vez te pedirá usuario y contraseña (o token) de GitHub. Git instala
por defecto el **Git Credential Manager**: la primera vez abre una ventana para
iniciar sesión en GitHub y luego recuerda tu sesión, así que no tendrás que
escribir nada más en las siguientes subidas.

> **Importante:** nunca subas `minimarket.db` ni `secret_key.txt` (contienen los
> datos del negocio y la clave de firma JWT). El archivo `.gitignore` ya los
> excluye automáticamente.
