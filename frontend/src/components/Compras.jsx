import { useState, useEffect } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, TextField, Typography, IconButton, Snackbar, Box, Chip, Avatar, Tooltip, Alert
} from '@mui/material'
import { Add, ShoppingCart, Visibility, PictureAsPdf, Search } from '@mui/icons-material'
import { getCompras, descargarPdfCompra } from '../api/compras'
import Paginador from './Paginador'
import { usePaginacion } from '../hooks/usePaginacion'
import NuevaCompraDialog from './NuevaCompraDialog'
import VerCompraDialog from './VerCompraDialog'

const formatNumber = (n) => {
  if (n === undefined || n === null) return '—'
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatStock = (p) => {
  const stock = p?.stock || 0
  if (p?.sale_unit === 'peso') {
    return `${(stock / 1000).toLocaleString('es-VE', { maximumFractionDigits: 2 })} kg`
  }
  return `${stock.toLocaleString('es-VE')} und.`
}

const stockColor = (p) => ((p?.stock || 0) < (p?.min_stock || 0) ? '#C62828' : '#2D5A1E')

const formatFecha = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const anio = d.getFullYear()
  const hora = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dia}/${mes}/${anio} ${hora}:${min}`
}

const itemRowSx = {
  animation: 'fade-in-up 0.3s ease-out both',
  '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.03)' },
  transition: 'background 0.15s ease',
}

const qtyDesc = (d) => {
  if (d.weight_kg != null) {
    const kg = Number(d.weight_kg)
    return kg >= 1 ? `${kg.toLocaleString('es-VE')} kg` : `${(kg * 1000).toLocaleString('es-VE')} g`
  }
  if (d.boxes != null) return `${d.boxes} caja${d.boxes !== 1 ? 's' : ''}`
  return `${d.quantity.toLocaleString('es-VE')} und.`
}

export default function Compras() {
  const [compras, setCompras] = useState([])
  const [openCreate, setOpenCreate] = useState(false)
  const [openView, setOpenView] = useState(false)
  const [viewCompra, setViewCompra] = useState(null)
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' })
  const [busquedaCompras, setBusquedaCompras] = useState('')
  const comprasFiltradas = (() => {
    const q = busquedaCompras.trim().toLowerCase()
    if (!q) return compras
    return compras.filter(c =>
      String(c.id).includes(q) ||
      (c.supplier || '').toLowerCase().includes(q) ||
      (c.details || []).some(d => (d.product?.name || '').toLowerCase().includes(q))
    )
  })()
  const { page, rowsPerPage, total, actuales, handleChangePage, handleChangeRowsPerPage } = usePaginacion(comprasFiltradas)

  const load = async () => {
    try {
      const res = await getCompras()
      setCompras(res.data)
    } catch {
      setSnack({ open: true, msg: 'Error al cargar compras', severity: 'error' })
    }
  }

  useEffect(() => { load() }, [])

  const descargar = async (id) => {
    try {
      await descargarPdfCompra(id)
    } catch {
      setSnack({ open: true, msg: 'Error al generar el PDF', severity: 'error' })
    }
  }

  return (
    <Box>
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        mb: 3.5, flexWrap: 'wrap', gap: 2,
      }}>
        <Box sx={{ animation: 'fade-in-up 0.5s ease-out both' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <ShoppingCart sx={{ fontSize: 28, color: '#2D5A1E' }} />
            <Typography variant="h4" sx={{
              fontFamily: '"Playfair Display", serif',
              fontWeight: 700, color: '#2C1810',
              fontSize: { xs: '1.5rem', sm: '1.85rem' },
            }}>
              Compras
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6B5344', ml: 0.5 }}>
            {compras.length} compra{compras.length !== 1 ? 's' : ''} registrada{compras.length !== 1 ? 's' : ''} · costos en USD
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setOpenCreate(true)}
          sx={{
            bgcolor: '#2D5A1E',
            '&:hover': { bgcolor: '#1E3D14' },
            px: 3.5, py: 1.2, borderRadius: 2.5,
            fontSize: '0.9rem', fontWeight: 600,
            boxShadow: '0 4px 14px rgba(45, 90, 30, 0.3)',
            '&:hover': { bgcolor: '#1E3D14', boxShadow: '0 6px 20px rgba(45, 90, 30, 0.4)', transform: 'translateY(-1px)' },
            transition: 'all 0.2s ease',
            animation: 'fade-in-up 0.5s ease-out 0.15s both',
          }}
        >
          Nueva Compra
        </Button>
      </Box>

      <TextField
        value={busquedaCompras}
        onChange={e => setBusquedaCompras(e.target.value)}
        placeholder="Buscar por #, proveedor o producto…"
        size="small"
        fullWidth
        slotProps={{
          input: {
            startAdornment: <Search sx={{ color: '#2D5A1E', mr: 1, fontSize: 20 }} />,
          },
        }}
        sx={{
          mb: 2,
          '& .MuiInputBase-root': { borderRadius: 2 },
          '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.25)' },
          '& .Mui-focused fieldset': { borderColor: '#2D5A1E' },
        }}
      />

      <TableContainer
        component={Paper}
        sx={{
          borderRadius: 3,
          border: '1px solid rgba(45, 90, 30, 0.06)',
          boxShadow: '0 1px 4px rgba(44, 24, 16, 0.06)',
          animation: 'fade-in-up 0.5s ease-out 0.2s both',
          overflow: 'hidden',
        }}
      >
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8F5F0' }}>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Fecha</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Proveedor</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Productos</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase' }} align="right">Total (USD)</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase' }} align="right">Detalle</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {actuales.map((c) => (
              <TableRow key={c.id} sx={itemRowSx}>
                <TableCell>
                  <Chip
                    label={`#${c.id}`}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(45, 90, 30, 0.1)',
                      color: '#2D5A1E',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      borderRadius: 1.5,
                    }}
                  />
                </TableCell>
                <TableCell sx={{ color: '#6B5344', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                  {formatFecha(c.created_at)}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography sx={{ fontWeight: 500, color: '#2C1810' }}>
                      {c.supplier || '—'}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {(c.details || []).map((d) => (
                      <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 500, color: '#2C1810', fontSize: '0.85rem' }}>
                          {d.product?.name || '—'}
                        </Typography>
                        <Tooltip title={d.weight_kg != null ? 'Kilogramos comprados' : (d.boxes != null ? 'Cajas compradas' : 'Unidades')}>
                          <Chip
                            size="small"
                            icon={d.weight_kg != null
                              ? <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: '#E69138', display: 'inline-block' }} />
                              : (d.boxes != null ? <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: '#2D5A1E', display: 'inline-block' }} /> : undefined)}
                            label={qtyDesc(d)}
                            sx={{
                              bgcolor: d.weight_kg != null ? 'rgba(230,145,56,0.12)' : 'rgba(45,90,30,0.08)',
                              color: d.weight_kg != null ? '#B76E00' : '#2D5A1E',
                              fontWeight: 700, fontSize: '0.72rem', borderRadius: 1.5,
                            }}
                          />
                        </Tooltip>
                      </Box>
                    ))}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Typography sx={{ fontWeight: 700, color: '#2C1810', fontSize: '0.95rem' }}>
                    $ {formatNumber(c.total)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                    <Tooltip title="Descargar PDF">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PictureAsPdf />}
                        onClick={() => descargar(c.id)}
                        sx={{
                          borderColor: 'rgba(198, 40, 40, 0.3)',
                          color: '#C62828',
                          borderRadius: 2,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          px: 1.2,
                          '&:hover': { borderColor: '#C62828', bgcolor: 'rgba(198,40,40,0.05)' },
                        }}
                        aria-label="Descargar PDF de la compra"
                      >
                        PDF
                      </Button>
                    </Tooltip>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Visibility />}
                      onClick={() => { setViewCompra(c); setOpenView(true) }}
                      sx={{
                        borderColor: 'rgba(45, 90, 30, 0.2)',
                        color: '#2D5A1E',
                        borderRadius: 2,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        px: 1.5,
                        '&:hover': { borderColor: '#2D5A1E', bgcolor: 'rgba(45, 90, 30, 0.06)' },
                      }}
                    >
                      Ver
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {comprasFiltradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ py: 6 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Avatar sx={{ width: 56, height: 56, bgcolor: 'rgba(45, 90, 30, 0.08)', mx: 'auto', mb: 1.5 }}>
                      <ShoppingCart sx={{ fontSize: 28, color: '#2D5A1E' }} />
                    </Avatar>
                    <Typography sx={{ color: '#6B5344', fontWeight: 500, mb: 0.5 }}>
                      {busquedaCompras.trim() ? 'No se encontraron compras para tu búsqueda' : 'No hay compras registradas'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6B5344', opacity: 0.6 }}>
                      {busquedaCompras.trim() ? 'Prueba con otro término' : 'Crea tu primera compra usando el botón "Nueva Compra"'}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Paginador page={page} rowsPerPage={rowsPerPage} total={total} onPageChange={handleChangePage} onRowsPerPageChange={handleChangeRowsPerPage} />
      </TableContainer>

      <NuevaCompraDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onSaved={() => { load(); setOpenCreate(false) }}
      />

      <VerCompraDialog
        open={openView}
        onClose={() => setOpenView(false)}
        compra={viewCompra}
        onDescargar={descargar}
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack({ ...snack, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snack.severity} variant="filled" sx={{ borderRadius: 2.5, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', fontWeight: 500, '& .MuiAlert-icon': { fontSize: 20 } }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  )
}