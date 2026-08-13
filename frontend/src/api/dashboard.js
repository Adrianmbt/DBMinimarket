import api from './axios'

export const getDashboard = () => api.get('/dashboard')

export const limpiarDatos = (clave) => api.post('/admin/limpiar-datos', { clave })
