import api from './axios'

export const getCuentasCredito = (params) => api.get('/creditos', { params })
export const getCuentaCredito = (id) => api.get(`/creditos/${id}`)
export const marcarPagada = (id) => api.post(`/creditos/${id}/pagar`)
export const getResumenCredito = () => api.get('/creditos/resumen')
export const getProximasVencer = (dias = 3) => api.get('/creditos/proximas-vencer', { params: { dias } })
export const marcarNotificadas = (cuentaIds) => api.post('/creditos/marcar-notificadas', cuentaIds)
