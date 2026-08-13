// Utilidades de sesion: guardan token/usuario en localStorage o sessionStorage.
// Se lee SIEMPRE de storage (sin cache en memoria) para evitar tokens vencidos
// u obsoletos que se quedaban "pegados" y provocaban 401 en el dashboard.

export function readSession(key) {
  const local = localStorage.getItem(key)
  if (local !== null) return local
  return sessionStorage.getItem(key)
}

export function writeSession(key, value, remember) {
  localStorage.removeItem(key)
  sessionStorage.removeItem(key)
  const storage = remember ? localStorage : sessionStorage
  storage.setItem(key, value)
}

export function clearSessionKeys(keys) {
  keys.forEach((k) => {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
  })
}