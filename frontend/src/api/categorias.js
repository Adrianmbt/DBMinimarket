import api from './axios'

export const getCategorias = () => api.get('/categorias')