import api from './axios'

export const getCompras = () => api.get('/compras')
export const createCompra = (data) => api.post('/compras', data)

export const descargarPdfCompra = async (id) => {
  const res = await api.get(`/compras/${id}/pdf`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `compra_${id}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}