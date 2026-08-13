import api from './axios'

export const getProductos = (params) => api.get('/productos', { params })
export const createProducto = (data) => api.post('/productos', data)
export const updateProducto = (id, data) => api.put(`/productos/${id}`, data)
export const deleteProducto = (id) => api.delete(`/productos/${id}`)
export const registrarBaja = (id, data) => api.post(`/productos/${id}/baja`, data)
export const reactivarProducto = (id) => api.post(`/productos/${id}/reactivar`)
export const getBajas = () => api.get('/productos/bajas')
export const restaurarBaja = (id) => api.post(`/productos/bajas/${id}/restaurar`)