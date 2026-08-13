import axios from 'axios'
import { readSession, clearSessionKeys } from '../utils/session'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Adjunta el token JWT (si existe) a cada petición.
api.interceptors.request.use(
  (config) => {
    const token = readSession('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Limpia el token guardado en cualquiera de los dos storages.
function clearSession() {
  clearSessionKeys(['token', 'user'])
}

// Si el backend responde 401 (token ausente/inválido/expirado), cerrar sesión.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const isLoginRequest = error?.config?.url?.includes('/usuarios/login')
    if (status === 401 && !isLoginRequest) {
      clearSession()
      window.location.href = '/'
    }
    return Promise.reject(error)
  },
)

export { clearSession }
export default api