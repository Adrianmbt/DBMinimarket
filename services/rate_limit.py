"""Limitador de intentos de login en memoria (anti fuerza bruta).

Cuenta SOLO los intentos fallidos dentro de una ventana de tiempo, por
combinación (IP + nombre de usuario). Un intento exitoso reinicia el contador,
por lo que los inicios de sesión legítimos nunca se ven bloqueados.
"""
import threading
import time
from collections import defaultdict, deque


class LoginThrottle:
    def __init__(self, max_attempts: int = 20, window_seconds: int = 900):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._fails: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    @staticmethod
    def _key(ip: str, username: str) -> str:
        return f"{ip}|{username.strip().lower()}"

    def _prune(self, key: str):
        """Elimina los intentos anteriores a la ventana."""
        limite = time.monotonic() - self.window_seconds
        dq = self._fails[key]
        while dq and dq[0] < limite:
            dq.popleft()
        if not dq:
            del self._fails[key]

    def check(self, ip: str, username: str) -> bool:
        """True si el intento está permitido (no se superó el máximo de fallos)."""
        with self._lock:
            key = self._key(ip, username)
            if key not in self._fails:
                return True
            self._prune(key)
            return len(self._fails.get(key, ())) < self.max_attempts

    def record_failure(self, ip: str, username: str):
        with self._lock:
            key = self._key(ip, username)
            self._prune(key)
            self._fails[key].append(time.monotonic())

    def reset(self, ip: str, username: str):
        with self._lock:
            self._fails.pop(self._key(ip, username), None)


login_throttle = LoginThrottle()
