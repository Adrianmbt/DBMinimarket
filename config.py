import os
import secrets

from paths import SECRET_KEY_FILE

# En producción puedes definir estas variables de entorno:
#   MINIMARKET_SECRET_KEY  -> clave secreta para firmar JWT
#   MINIMARKET_ORIGINS     -> orígenes CORS permitidos, separados por coma
#   MINIMARKET_TOKEN_EXPIRE_MIN -> minutos de validez del token


def _load_or_create_secret() -> str:
    """Devuelve la clave de firma JWT.

    Si no se define MINIMARKET_SECRET_KEY, se genera una clave aleatoria
    persistente (secret_key.txt junto a la base de datos) para que los tokens
    sobrevivan a los reinicios sin exponer una clave por defecto en el código.
    """
    env_key = os.getenv("MINIMARKET_SECRET_KEY")
    if env_key:
        return env_key
    key_file = SECRET_KEY_FILE
    try:
        if key_file.exists():
            return key_file.read_text(encoding="utf-8").strip()
        key = secrets.token_hex(32)
        key_file.write_text(key, encoding="utf-8")
        return key
    except OSError:
        # Si no se puede escribir el archivo, se usa una clave por sesión
        # (los tokens se invalidan al reiniciar el proceso).
        return secrets.token_hex(32)


SECRET_KEY = _load_or_create_secret()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("MINIMARKET_TOKEN_EXPIRE_MIN", "720"))

# Orígenes permitidos por CORS. Por defecto solo orígenes locales de desarrollo;
# en producción define MINIMARKET_ORIGINS con las URLs reales.
_DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
CORS_ORIGINS = [o.strip() for o in os.getenv("MINIMARKET_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()]

# Límite de intentos de inicio de sesión por usuario+IP (anti fuerza bruta).
LOGIN_MAX_ATTEMPTS = int(os.getenv("MINIMARKET_LOGIN_MAX_ATTEMPTS", "20"))
LOGIN_WINDOW_SECONDS = int(os.getenv("MINIMARKET_LOGIN_WINDOW_SECONDS", "900"))