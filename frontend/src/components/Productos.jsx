import { useState, useEffect } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, IconButton, Typography, Chip, Alert, Snackbar, Box,
  MenuItem, Select, FormControl, InputLabel, Tabs, Tab,
  FormControlLabel, Switch,
} from '@mui/material'
import { Edit, DeleteSweep, Inventory2, Search, SettingsBackupRestore, Add } from '@mui/icons-material'
import { getProductos, createProducto, updateProducto, registrarBaja, getBajas, restaurarBaja, reactivarProducto } from '../api/productos'
import { getCategorias } from '../api/categorias'
import Paginador from './Paginador'
import { usePaginacion } from '../hooks/usePaginacion'
import { limpiarNumero } from '../utils/num'
import { readSession } from '../utils/session'

const emptyProduct = {
  barcode: '', name: '', description: '', cost_price: 0, sale_price: 0,
  stock: 0, min_stock: 5, category_id: null, sale_unit: 'unidad',
}

const formatFecha = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  const fecha = d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
  return `${fecha} ${hora}`
}

export default function Productos() {
  const rawUser = readSession('user')
  const user = JSON.parse(rawUser || '{}')
  const isAdmin = user.role === 'admin'

  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [bajas, setBajas] = useState([])
  const [tab, setTab] = useState(0)

  const [openEdit, setOpenEdit] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(emptyProduct)

  const [openBaja, setOpenBaja] = useState(false)
  const [bajaProd, setBajaProd] = useState(null)
  const [bajaForm, setBajaForm] = useState({ cantidad: '', motivo: '' })

  const [openInactivos, setOpenInactivos] = useState(false)
  const [incluirInactivos, setIncluirInactivos] = useState(false)

  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' })
  const [busqueda, setBusqueda] = useState('')
  const [busquedaBajas, setBusquedaBajas] = useState('')

  const filtrados = (() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return productos
    return productos.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q) ||
      (p.category_name || '').toLowerCase().includes(q)
    )
  })()
  const { page, rowsPerPage, total, actuales, handleChangePage, handleChangeRowsPerPage } = usePaginacion(filtrados)

  const bajasFiltradas = (() => {
    const q = busquedaBajas.trim().toLowerCase()
    if (!q) return bajas
    return bajas.filter(b =>
      (b.product?.name || '').toLowerCase().includes(q) ||
      (b.motivo || '').toLowerCase().includes(q) ||
      (b.user_full_name || '').toLowerCase().includes(q)
    )
  })()
  const bajasPagin = usePaginacion(bajasFiltradas)

  const load = async (incInactivos = incluirInactivos) => {
    try {
      const [prods, cats] = await Promise.all([
        getProductos(incInactivos ? { incluir_inactivos: true } : {}),
        getCategorias()
      ])
      setProductos(prods.data)
      setCategorias(cats.data)
    } catch {
      setSnack({ open: true, msg: 'Error al cargar productos', severity: 'error' })
    }
  }

  const loadBajas = async () => {
    try {
      const res = await getBajas()
      setBajas(res.data)
    } catch {
      setSnack({ open: true, msg: 'Error al cargar las bajas de stock', severity: 'error' })
    }
  }

  useEffect(() => {
    load()
  }, [incluirInactivos])

  useEffect(() => {
    if (tab === 1 && isAdmin) loadBajas()
  }, [tab, isAdmin])

  const handleSave = async () => {
    const payload = {
      ...form,
      cost_price: Number(limpiarNumero(form.cost_price)) || 0,
      sale_price: Number(limpiarNumero(form.sale_price)) || 0,
      min_stock: parseInt(form.min_stock, 10) || 5,
    }
    try {
      if (editId) {
        await updateProducto(editId, payload)
        setSnack({ open: true, msg: 'Producto actualizado', severity: 'success' })
      } else {
        await createProducto(payload)
        setSnack({ open: true, msg: 'Producto agregado al inventario', severity: 'success' })
      }
      setOpenEdit(false)
      setForm(emptyProduct)
      setEditId(null)
      load()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al guardar'
      setSnack({ open: true, msg, severity: 'error' })
    }
  }

  const handleNew = () => {
    setEditId(null)
    setForm({ ...emptyProduct, stock: 0 })
    setOpenEdit(true)
  }

  const handleEdit = (p) => {
    setEditId(p.id)
    setForm({ ...emptyProduct, ...p, category_id: p.category_id || null, sale_unit: p.sale_unit || 'unidad' })
    setOpenEdit(true)
  }

  const openBajaDialog = (p) => {
    setBajaProd(p)
    setBajaForm({ cantidad: '', motivo: '' })
    setOpenBaja(true)
  }

  const handleRegistrarBaja = async () => {
    if ((bajaProd.stock || 0) <= 0) {
      setSnack({ open: true, msg: 'Este producto no tiene stock para dar de baja', severity: 'error' })
      return
    }
    const cantidad = parseInt(limpiarNumero(bajaForm.cantidad), 10) || 0
    if (cantidad <= 0) {
      setSnack({ open: true, msg: 'Indica una cantidad válida', severity: 'error' })
      return
    }
    if (!bajaForm.motivo.trim()) {
      setSnack({ open: true, msg: 'El motivo es obligatorio para Eliminar', severity: 'error' })
      return
    }
    if (cantidad > (bajaProd.stock || 0)) {
      setSnack({ open: true, msg: 'La cantidad supera el stock disponible', severity: 'error' })
      return
    }
    try {
      await registrarBaja(bajaProd.id, { cantidad, motivo: bajaForm.motivo.trim() })
      setSnack({ open: true, msg: 'Stock dados de baja correctamente', severity: 'success' })
      setOpenBaja(false)
      load()
      if (tab === 1) loadBajas()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al Eliminar'
      setSnack({ open: true, msg, severity: 'error' })
    }
  }

  const handleRestaurar = async (b) => {
    if (!window.confirm(`¿Restaurar ${b.cantidad} de "${b.product?.name}" y devolverlo al stock?`)) return
    try {
      await restaurarBaja(b.id)
      setSnack({ open: true, msg: 'Stock restaurado correctamente', severity: 'success' })
      load()
      loadBajas()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al restaurar'
      setSnack({ open: true, msg, severity: 'error' })
    }
  }

  const handleReactivar = async (p) => {
    if (!window.confirm(`¿Reactivar el producto "${p.name}"?`)) return
    try {
      await reactivarProducto(p.id)
      setSnack({ open: true, msg: 'Producto reactivado correctamente', severity: 'success' })
      load()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al reactivar'
      setSnack({ open: true, msg, severity: 'error' })
    }
  }

  const unidadLabel = (v) => (v === 'peso' ? 'peso (kg)' : 'unidad')
  const precioLabel = (p) => (p.sale_unit === 'peso' ? 'Bs./kg' : 'Bs./u.')
  const stockLabel = (p) => (p.sale_unit === 'peso' ? `${(p.stock / 1000).toLocaleString('es-VE')} kg` : String(p.stock))
  const bajaCantidadLabel = (b) => (b.product?.sale_unit === 'peso' ? `${(b.cantidad / 1000).toLocaleString('es-VE')} kg` : `${b.cantidad} u.`)

  return (
    <Box>
      {/* Encabezado */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ animation: 'fade-in-up 0.5s ease-out both' }}>
          <Typography variant="h4" sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2C1810' }}>
            Inventario
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {productos.length} producto{productos.length !== 1 ? 's' : ''} activo{productos.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        {isAdmin && (
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleNew}
              sx={{
                bgcolor: '#2D5A1E',
                '&:hover': { bgcolor: '#1E3D14' },
                borderRadius: 2.5,
                px: 2.5, py: 1,
                fontSize: '0.85rem', fontWeight: 600,
                animation: 'fade-in-up 0.5s ease-out 0.15s both',
              }}
            >
              Nuevo Producto
            </Button>
            <Button
              variant="outlined"
              startIcon={<DeleteSweep />}
              onClick={() => { loadBajas(); setOpenInactivos(true) }}
              sx={{
                color: '#E8630C',
                borderColor: 'rgba(232, 99, 12, 0.35)',
                borderRadius: 2.5,
                px: 2.5, py: 1,
                fontSize: '0.85rem', fontWeight: 600,
                animation: 'fade-in-up 0.5s ease-out 0.2s both',
                '&:hover': { borderColor: '#E8630C', bgcolor: 'rgba(232, 99, 12, 0.06)' },
              }}
            >
              Productos de Baja
            </Button>
          </Box>
        )}
      </Box>

      {/* Pestañas */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        textColor="inherit"
        sx={{ mb: 2, '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 }, '& .Mui-selected': { color: '#C9952A' }, '& .MuiTabs-indicator': { bgcolor: '#C9952A' } }}
      >
        <Tab label="Productos" />
        {isAdmin && <Tab label="Bajas de stock" />}
      </Tabs>

      {/* BUSCADOR Y FILTROS */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, gap: 2, mb: 2 }}>
        <TextField
          value={tab === 0 ? busqueda : busquedaBajas}
          onChange={e => (tab === 0 ? setBusqueda : setBusquedaBajas)(e.target.value)}
          placeholder={tab === 0 ? 'Buscar por nombre, código o categoría…' : 'Buscar por producto, motivo o responsable…'}
          size="small"
          fullWidth
          slotProps={{
            input: {
              startAdornment: <Search sx={{ color: '#C9952A', mr: 1, fontSize: 20 }} />,
            },
          }}
          sx={{
            '& .MuiInputBase-root': { borderRadius: 2 },
            '& fieldset': { borderColor: 'rgba(201, 149, 42, 0.25)' },
            '& .Mui-focused fieldset': { borderColor: '#C9952A' },
          }}
        />
        {tab === 0 && isAdmin && (
          <FormControlLabel
            control={
              <Switch
                checked={incluirInactivos}
                onChange={e => setIncluirInactivos(e.target.checked)}
                color="warning"
              />
            }
            label={
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#6B5344', whiteSpace: 'nowrap' }}>
                Mostrar inactivos
              </Typography>
            }
            sx={{ ml: { xs: 0, md: 1 }, mr: 0 }}
          />
        )}
      </Box>

      {tab === 0 ? (
        <TableContainer component={Paper} className="animate-fade-in-up stagger-2">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Código</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Nombre</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Categoría</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Unidad</TableCell>
                {isAdmin && <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Precio Venta</TableCell>}
                {isAdmin && <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Costo</TableCell>}
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Stock</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Mín</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {actuales.map((p, i) => (
                <TableRow
                  key={p.id}
                  sx={{
                    animation: `fade-in-up 0.3s ease-out ${0.05 + i * 0.03}s both`,
                    bgcolor: p.activo ? 'inherit' : 'rgba(0, 0, 0, 0.03)',
                    color: p.activo ? 'inherit' : 'text.disabled',
                    '&:hover': { bgcolor: p.activo ? 'rgba(201, 149, 42, 0.04)' : 'rgba(0, 0, 0, 0.05)' },
                    transition: 'background-color 0.2s ease',
                  }}
                >
                  <TableCell>
                    <Chip
                      label={p.barcode || '—'}
                      size="small"
                      variant="outlined"
                      sx={{ borderColor: 'rgba(201, 149, 42, 0.3)', color: p.activo ? '#6B5344' : 'text.disabled', fontWeight: 500, fontSize: '0.75rem' }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span style={{ textDecoration: p.activo ? 'none' : 'line-through', opacity: p.activo ? 1 : 0.7 }}>
                        {p.name}
                      </span>
                      {!p.activo && (
                        <Chip
                          label="Inactivo"
                          size="small"
                          sx={{ bgcolor: 'rgba(198, 40, 40, 0.1)', color: '#C62828', fontWeight: 600, fontSize: '0.65rem' }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {p.category_name ? (
                      <Chip label={p.category_name} size="small" sx={{ bgcolor: 'rgba(201, 149, 42, 0.1)', color: '#6B5344', fontSize: '0.7rem', fontWeight: 500, opacity: p.activo ? 1 : 0.6 }} />
                    ) : <Typography variant="caption" sx={{ color: '#6B5344', opacity: 0.4 }}>—</Typography>}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={unidadLabel(p.sale_unit)}
                      size="small"
                      sx={{
                        bgcolor: p.sale_unit === 'peso' ? 'rgba(232, 99, 12, 0.1)' : 'rgba(201, 149, 42, 0.08)',
                        color: p.sale_unit === 'peso' ? '#E8630C' : '#6B5344',
                        fontWeight: 600, fontSize: '0.7rem',
                        opacity: p.activo ? 1 : 0.6
                      }}
                    />
                  </TableCell>
                  {isAdmin && (
                    <TableCell sx={{ color: p.activo ? '#2D5A1E' : 'text.disabled', fontWeight: 600, fontSize: '0.85rem' }}>
                      Bs. {p.sale_price?.toFixed(2)}
                      <Typography variant="caption" sx={{ color: '#6B5344', fontWeight: 400, ml: 0.3, fontSize: '0.6rem', opacity: p.activo ? 1 : 0.6 }}>
                        {precioLabel(p)}
                      </Typography>
                    </TableCell>
                  )}
                  {isAdmin && <TableCell sx={{ color: p.activo ? '#6B5344' : 'text.disabled', fontSize: '0.8rem' }}>Bs. {p.cost_price?.toFixed(2)}</TableCell>}
                  <TableCell>
                    <Chip
                      label={stockLabel(p)}
                      size="small"
                      sx={{
                        fontWeight: 600, fontSize: '0.75rem',
                        bgcolor: !p.activo ? '#757575' : (p.stock < p.min_stock ? '#E8630C' : p.stock === 0 ? '#C62828' : 'rgba(45, 90, 30, 0.1)'),
                        color: !p.activo ? '#fff' : (p.stock < p.min_stock ? '#fff' : p.stock === 0 ? '#fff' : '#2D5A1E'),
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: p.activo ? '#6B5344' : 'text.disabled', fontSize: '0.8rem' }}>{p.min_stock}</TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => handleEdit(p)} aria-label="Editar producto" sx={{ color: '#C9952A', '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.1)' } }}>
                      <Edit fontSize="small" />
                    </IconButton>
                    {!p.activo ? (
                      isAdmin && (
                        <IconButton
                          onClick={() => handleReactivar(p)}
                          aria-label="Reactivar producto"
                          title="Reactivar producto"
                          sx={{
                            color: '#2D5A1E',
                            '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.1)' },
                          }}
                        >
                          <SettingsBackupRestore fontSize="small" />
                        </IconButton>
                      )
                    ) : (
                      <IconButton
                        onClick={() => openBajaDialog(p)}
                        aria-label="Dar de baja / eliminar stock"
                        disabled={(p.stock || 0) <= 0}
                        title={(p.stock || 0) <= 0 ? 'Sin stock, no se puede dar de baja' : 'Dar de baja / eliminar stock'}
                        sx={{
                          color: '#C62828',
                          '&:hover': { bgcolor: 'rgba(198, 40, 40, 0.1)' },
                          '&.Mui-disabled': { color: 'rgba(198, 40, 40, 0.3)' },
                        }}
                      >
                        <DeleteSweep fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 9 : 7} align="center" sx={{ py: 4 }}>
                    <Inventory2 sx={{ fontSize: 48, color: '#E8C46A', mb: 1 }} />
                    <Typography color="text.secondary">
                      {busqueda.trim() ? 'No se encontraron resultados para tu búsqueda' : 'No hay productos activos'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Paginador page={page} rowsPerPage={rowsPerPage} total={total} onPageChange={handleChangePage} onRowsPerPageChange={handleChangeRowsPerPage} />
        </TableContainer>
      ) : (
        <TableContainer component={Paper} className="animate-fade-in-up stagger-2">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>#</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Producto</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Cantidad</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Motivo</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Responsable</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Fecha</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Estado</TableCell>
                {isAdmin && (
                  <TableCell align="center" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Acciones</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {bajasPagin.actuales.map((b, i) => (
                <TableRow
                  key={b.id}
                  sx={{
                    animation: `fade-in-up 0.3s ease-out ${0.05 + i * 0.03}s both`,
                    bgcolor: b.restaurada ? 'rgba(45, 90, 30, 0.03)' : 'inherit',
                    '&:hover': { bgcolor: b.restaurada ? 'rgba(45, 90, 30, 0.06)' : 'rgba(232, 99, 12, 0.03)' },
                  }}
                >
                  <TableCell sx={{ color: '#6B5344', fontSize: '0.8rem' }}>#{b.id}</TableCell>
                  <TableCell sx={{ fontWeight: 500, fontSize: '0.85rem' }}>{b.product?.name || '—'}</TableCell>
                  <TableCell>
                    <Chip label={bajaCantidadLabel(b)} size="small" sx={{ bgcolor: 'rgba(232, 99, 12, 0.1)', color: '#E8630C', fontWeight: 600, fontSize: '0.75rem' }} />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: '#2C1810', maxWidth: 260 }}>{b.motivo}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: '#6B5344' }}>{b.user_full_name || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: '#6B5344', whiteSpace: 'nowrap' }}>{formatFecha(b.created_at)}</TableCell>
                  <TableCell>
                    {b.restaurada ? (
                      <Chip
                        label="Restaurada"
                        size="small"
                        sx={{ bgcolor: 'rgba(45, 90, 30, 0.12)', color: '#2D5A1E', fontWeight: 600, fontSize: '0.7rem' }}
                      />
                    ) : (
                      <Chip
                        label="Activa"
                        size="small"
                        sx={{ bgcolor: 'rgba(232, 99, 12, 0.12)', color: '#E8630C', fontWeight: 600, fontSize: '0.7rem' }}
                      />
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell align="center">
                      {!b.restaurada ? (
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<SettingsBackupRestore />}
                          onClick={() => handleRestaurar(b)}
                          sx={{
                            bgcolor: '#2D5A1E',
                            '&:hover': { bgcolor: '#1E3D14' },
                            borderRadius: 2,
                            whiteSpace: 'nowrap',
                            fontSize: '0.75rem',
                            px: 1.5,
                            py: 0.5,
                          }}
                        >
                          Restaurar
                        </Button>
                      ) : (
                        <Typography variant="caption" sx={{ color: '#6B5344', opacity: 0.5 }}>—</Typography>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {bajasFiltradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 8 : 7} align="center" sx={{ py: 4 }}>
                    <Search sx={{ fontSize: 48, color: '#E8C46A', mb: 1 }} />
                    <Typography color="text.secondary">
                      {busquedaBajas.trim() ? 'No se encontraron bajas para tu búsqueda' : 'Aún no hay bajas de stock registradas'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Paginador page={bajasPagin.page} rowsPerPage={bajasPagin.rowsPerPage} total={bajasPagin.total} onPageChange={bajasPagin.handleChangePage} onRowsPerPageChange={bajasPagin.handleChangeRowsPerPage} />
        </TableContainer>
      )}

      {/* CREAR / EDITAR PRODUCTO */}
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, color: '#2C1810', borderBottom: '1px solid rgba(201, 149, 42, 0.1)' }}>
          {editId ? 'Editar Producto' : 'Nuevo Producto'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField label="Código de Barras" value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} size="small" />
            <TextField label="Nombre" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} size="small" />
            <TextField label="Descripción" multiline rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} size="small" />
            <FormControl size="small">
              <InputLabel>Categoría</InputLabel>
              <Select
                value={form.category_id ?? ''}
                label="Categoría"
                onChange={e => {
                  const catId = e.target.value
                  const cat = categorias.find(c => c.id === catId)
                  setForm({ ...form, category_id: catId, sale_unit: cat?.sale_unit || 'unidad' })
                }}
              >
                <MenuItem value=""><em>Sin categoría</em></MenuItem>
                {categorias.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {editId ? (
              <Typography variant="caption" sx={{ color: '#6B5344', bgcolor: 'rgba(45, 90, 30, 0.06)', px: 1.5, py: 0.8, borderRadius: 1, fontWeight: 500 }}>
                El stock no se edita aquí: entra por las compras y sale por las ventas o las bajas de stock.
              </Typography>
            ) : (
              <Typography variant="caption" sx={{ color: '#6B5344', bgcolor: 'rgba(45, 90, 30, 0.06)', px: 1.5, py: 0.8, borderRadius: 1, fontWeight: 500 }}>
                Stock inicial: cantidad actual de unidades (o kg) disponibles al cargar este producto por primera vez.
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Stock"
                type="number"
                value={form.stock}
                onChange={e => setForm({ ...form, stock: parseInt(limpiarNumero(e.target.value), 10) || 0 })}
                size="small"
                disabled={!!editId}
                sx={{ flex: 1 }}
                helperText={unidadLabel(form.sale_unit)}
              />
              <TextField label="Stock Mínimo" type="number" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: limpiarNumero(e.target.value) })} size="small" sx={{ flex: 1 }} />
            </Box>
            {isAdmin ? (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label={form.sale_unit === 'peso' ? 'Precio Costo (Bs./kg)' : 'Precio Costo (Bs.)'} type="number" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: limpiarNumero(e.target.value) })} size="small" sx={{ flex: 1 }} />
                <TextField label={form.sale_unit === 'peso' ? 'Precio Venta (Bs./kg)' : 'Precio Venta (Bs./u.)'} type="number" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: limpiarNumero(e.target.value) })} size="small" sx={{ flex: 1 }} />
              </Box>
            ) : (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Costo (Bs.)" value={form.cost_price} size="small" disabled sx={{ flex: 1 }} />
                <TextField label="Precio Venta (Bs.)" value={form.sale_price} size="small" disabled sx={{ flex: 1 }} helperText="Solo el administrador edita precios" />
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(201, 149, 42, 0.1)' }}>
          <Button onClick={() => setOpenEdit(false)} sx={{ color: '#6B5344' }}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#C9952A', '&:hover': { bgcolor: '#9E721E' }, px: 3 }}>
            {editId ? 'Guardar' : 'Agregar Producto'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* BAJA DE STOCK */}
      <Dialog open={openBaja} onClose={() => setOpenBaja(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: '#2C1810', fontFamily: '"Playfair Display", serif', fontWeight: 600, borderBottom: '1px solid rgba(232, 99, 12, 0.15)' }}>
          Eliminar Producto · {bajaProd?.name}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" sx={{ color: '#6B5344', mb: 2 }}>
            Stock disponible: <b>{bajaProd?.sale_unit === 'peso' ? `${((bajaProd?.stock || 0) / 1000).toLocaleString('es-VE')} kg` : `${bajaProd?.stock} u.`}</b>. Esto resta del stock y queda registrado con su motivo para control.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label={bajaProd?.sale_unit === 'peso' ? 'Cantidad a retirar (kg)' : 'Cantidad a retirar'}
              type="number"
              value={bajaForm.cantidad}
              onChange={e => setBajaForm({ ...bajaForm, cantidad: limpiarNumero(e.target.value) })}
              size="small"
              autoFocus
              required
            />
            <TextField
              label="Motivo de la baja"
              value={bajaForm.motivo}
              onChange={e => setBajaForm({ ...bajaForm, motivo: e.target.value })}
              multiline rows={3}
              placeholder="Ej: Producto vencido, dañado, merma, etc."
              size="small"
              required
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(201, 149, 42, 0.1)' }}>
          <Button onClick={() => setOpenBaja(false)} sx={{ color: '#6B5344' }}>Cancelar</Button>
          <Button variant="contained" onClick={handleRegistrarBaja} sx={{ bgcolor: '#E8630C', '&:hover': { bgcolor: '#C25306' }, px: 3 }} startIcon={<DeleteSweep />}>
            Confirmar Baja
          </Button>
        </DialogActions>
      </Dialog>

      {/* PRODUCTOS DE BAJA (restaurar) */}
      <Dialog open={openInactivos} onClose={() => setOpenInactivos(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: '#2C1810', fontFamily: '"Playfair Display", serif', fontWeight: 600, borderBottom: '1px solid rgba(232, 99, 12, 0.15)' }}>
          Restaurar bajas de stock
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2 }}>
          {bajas.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">No hay bajas de stock registradas</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {bajas.map(b => {
                const restaurada = b.restaurada
                const cantidadLabel = b.product?.sale_unit === 'peso'
                  ? `${(b.cantidad / 1000).toLocaleString('es-VE')} kg`
                  : `${b.cantidad} u.`
                return (
                  <Box
                    key={b.id}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5,
                      p: 1.5, borderRadius: 2,
                      border: `1px solid ${restaurada ? 'rgba(45, 90, 30, 0.25)' : 'rgba(232, 99, 12, 0.2)'}`,
                      bgcolor: restaurada ? 'rgba(45, 90, 30, 0.04)' : 'rgba(232, 99, 12, 0.03)',
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }} noWrap>
                        {b.product?.name || '—'}
                        <Chip
                          label={cantidadLabel}
                          size="small"
                          sx={{ ml: 1, bgcolor: 'rgba(232, 99, 12, 0.12)', color: '#E8630C', fontWeight: 600, fontSize: '0.65rem' }}
                        />
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6B5344' }} noWrap>
                        {b.motivo} · {b.user_full_name || '—'} · {formatFecha(b.created_at)}
                      </Typography>
                    </Box>
                    {restaurada ? (
                      <Chip label="Restaurada" size="small" sx={{ bgcolor: 'rgba(45, 90, 30, 0.12)', color: '#2D5A1E', fontWeight: 600 }} />
                    ) : (
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleRestaurar(b)}
                        sx={{ bgcolor: '#2D5A1E', '&:hover': { bgcolor: '#1E3D14' }, borderRadius: 2, whiteSpace: 'nowrap' }}
                      >
                        Restaurar
                      </Button>
                    )}
                  </Box>
                )
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenInactivos(false)} sx={{ color: '#6B5344' }}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack({ ...snack, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snack.severity} sx={{ borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  )
}