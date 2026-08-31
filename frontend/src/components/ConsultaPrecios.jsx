import { useState, useEffect, useRef } from 'react'
import {
  Dialog, DialogTitle, DialogContent, Box,
  TextField, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, Chip, InputAdornment,
  IconButton, Tooltip
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import PriceCheckIcon from '@mui/icons-material/PriceCheck'
import { getProductos } from '../api/productos'
import { getTasa } from '../api/tasa'

export default function ConsultaPrecios({ open, onClose }) {
  const [productos, setProductos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(false)
  const [tasa, setTasa] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setBusqueda('')
      setProductos([])
      setCargando(true)
      Promise.all([
        getProductos(),
        getTasa().catch(() => ({ data: { rate: null } }))
      ])
        .then(([prods, tasaRes]) => {
          setProductos(prods.data)
          setTasa(tasaRes.data?.rate || null)
        })
        .catch(() => {})
        .finally(() => setCargando(false))
    }
  }, [open])

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const filtrados = (() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return productos
    return productos.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q) ||
      (p.category_name || '').toLowerCase().includes(q)
    )
  })()

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          bgcolor: '#FFF8F0',
          maxHeight: '80vh',
        }
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pb: 1,
        borderBottom: '1px solid rgba(201, 149, 42, 0.15)',
      }}>
        <PriceCheckIcon sx={{ color: '#C9952A' }} />
        <Typography sx={{
          fontFamily: '"Playfair Display", serif',
          fontWeight: 700,
          color: '#2C1810',
          flexGrow: 1,
        }}>
          Consulta de Precios
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: '#6B5344' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          placeholder="Buscar por nombre, código de barras o categoría..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#C9952A' }} />
              </InputAdornment>
            ),
          }}
        />

        {cargando ? (
          <Typography sx={{ textAlign: 'center', py: 4, color: '#6B5344' }}>
            Cargando productos...
          </Typography>
        ) : (
          <TableContainer sx={{ maxHeight: '55vh' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: '#2C1810', color: '#FFF8F0', fontWeight: 600 }}>
                    Producto
                  </TableCell>
                  <TableCell sx={{ bgcolor: '#2C1810', color: '#FFF8F0', fontWeight: 600 }}>
                    Categoría
                  </TableCell>
                  <TableCell sx={{ bgcolor: '#2C1810', color: '#FFF8F0', fontWeight: 600 }} align="right">
                    Precio Venta
                  </TableCell>
                  <TableCell sx={{ bgcolor: '#2C1810', color: '#FFF8F0', fontWeight: 600 }} align="right">
                    Stock
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ textAlign: 'center', py: 4, color: '#6B5344' }}>
                      {busqueda ? 'No se encontraron productos' : 'No hay productos registrados'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtrados.map((p, i) => (
                    <TableRow
                      key={p.id}
                      sx={{
                        bgcolor: i % 2 === 0 ? 'transparent' : 'rgba(201, 149, 42, 0.04)',
                        '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.08)' },
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: '#2C1810' }}>
                          {p.name}
                        </Typography>
                        {p.barcode && (
                          <Typography variant="caption" sx={{ color: '#9E8E7E' }}>
                            {p.barcode}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={p.category_name || 'Sin categoría'}
                          size="small"
                          sx={{
                            bgcolor: 'rgba(201, 149, 42, 0.1)',
                            color: '#6B5344',
                            fontSize: '0.72rem',
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#2D5A1E' }}>
                          ${p.sale_price?.toFixed(2)}
                        </Typography>
                        {tasa && (
                          <Typography variant="caption" sx={{ color: '#6B5344', fontWeight: 500 }}>
                            Bs. {(p.sale_price * tasa).toFixed(2)}
                          </Typography>
                        )}
                        <Typography variant="caption" sx={{ color: '#9E8E7E', display: 'block' }}>
                          {p.sale_unit === 'peso' ? '/kg' : '/unidad'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 500,
                            color: p.stock <= (p.min_stock || 5) ? '#C62828' : '#2C1810',
                          }}
                        >
                          {p.sale_unit === 'peso'
                            ? `${((p.stock || 0) / 1000).toFixed(1)} kg`
                            : p.stock || 0
                          }
                        </Typography>
                        {!p.activo && (
                          <Typography variant="caption" sx={{ color: '#C62828', display: 'block' }}>
                            Inactivo
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {!cargando && filtrados.length > 0 && (
          <Typography variant="caption" sx={{ display: 'block', textAlign: 'right', mt: 1, color: '#9E8E7E' }}>
            {filtrados.length} producto{filtrados.length !== 1 ? 's' : ''}
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  )
}
