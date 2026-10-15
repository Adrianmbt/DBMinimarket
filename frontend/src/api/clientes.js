import api from './axios'

export const getClientes = (params) => api.get('/clientes', { params })
export const crearCliente = (data) => api.post('/clientes', data)
export const actualizarCliente = (id, data) => api.put(`/clientes/${id}`, data)
export const desactivarCliente = (id) => api.delete(`/clientes/${id}`)
