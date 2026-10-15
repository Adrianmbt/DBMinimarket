import re
import unicodedata


def normalize_name_key(name: str) -> str:
    """Normaliza un nombre para comparar/clientes: minúsculas, sin acentos,
    sin espacios sobrantes. 'José  Pérez' -> 'jose perez'."""
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", str(name))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s
