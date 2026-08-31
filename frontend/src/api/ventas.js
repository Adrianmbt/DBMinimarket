import api from './axios'

export const getVentas = (fecha) => api.get('/ventas', { params: fecha ? { fecha } : {} })
export const createVenta = (data) => api.post('/ventas', data)
export const updateVenta = (id, data) => api.put(`/ventas/${id}`, data)
export const deleteVenta = (id) => api.delete(`/ventas/${id}`)
export const getEstadoCierre = () => api.get('/ventas/cierre/estado')
export const getResumenDia = (fecha) => api.get('/ventas/resumen', { params: { fecha } })
export const cerrarCaja = () => api.post('/ventas/cierre', null, { responseType: 'blob' })
export const abrirCaja = () => api.delete('/ventas/cierre')

const downloadBlob = (res, filename) => {
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export const descargarReporteZ = async (fecha) => {
  const res = await api.get('/ventas/cierre/pdf', { params: fecha ? { fecha } : {}, responseType: 'blob' })
  downloadBlob(res, `reporte_z_${fecha || new Date().toISOString().slice(0, 10)}.pdf`)
}

export const descargarFactura = async (id) => {
  const res = await api.get(`/ventas/${id}/factura`, { responseType: 'blob' })
  downloadBlob(res, `factura_${id}.pdf`)
}
