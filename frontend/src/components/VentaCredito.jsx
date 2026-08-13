import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Typography, IconButton, Alert, Snackbar, Box, Chip,
  Avatar, Divider, Slide, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material'
import {
  CreditCard, Search, Close, AddCircle, RemoveCircle, Delete,
  ShoppingCart, Receipt, QrCodeScanner, CalendarMonth,
} from '@mui/icons-material'
import { getProductos } from '../api/productos'
import { getTasa } from '../api/tasa'
import { createVenta } from '../api/ventas'

export const formatNumber = (n, digits = 2) => {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toLocaleString('es-VE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const money = (n, code) => {
  const val = formatNumber(n)
  return val === '—' ? val : `${code === 'USD' ? '$' : 'Bs.'} ${val}`
}

const TERM_OPTIONS = [
  { value: 7, label: '7 días' },
  { value: 10, label: '10 días' },
  { value: 15, label: '15 días' },
]

export default function VentaCredito({ open, onClose, onVentaCreada }) {
  const [productos, setProductos] = useState([])
  const [search, setSearch] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [cart, setCart] = useState([])
  const [clientName, setClientName] = useState('')
  const [daysTerm, setDaysTerm] = useState(15)
  const [currency, setCurrency] = useState('BS')
  const [submitting, setSubmitting] = useState(false)
  const [tasa, setTasa] = useState(null)
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' })

  const searchRef = useRef(null)
  const resultsRef = useRef(null)

  useEffect(() => {
    if (open) {
      cargarDatos()
      setCart([])
      setSearch('')
      setClientName('')
      setDaysTerm(15)
      setCurrency('BS')
      setShowResults(false)
      setTimeout(() => searchRef.current?.focus(), 200)
    }
  }, [open])

  const cargarDatos = async () => {
    try {
      const [prodRes, tasaRes] = await Promise.all([getProductos(), getTasa()])
      setProductos(prodRes.data)
      setTasa(tasaRes.data?.rate || null)
    } catch {
      try {
        const prodRes = await getProductos()
        setProductos(prodRes.data)
      } catch {}
    }
  }

  const filtered = search.trim()
    ? productos.filter(p => {
        const q = search.toLowerCase()
        return p.name.toLowerCase().includes(q) ||
               (p.barcode && p.barcode.toLowerCase().includes(q))
      })
    : []

  const addToCart = useCallback((producto) => {
    const esPeso = producto.sale_unit === 'peso'
    setCart(prev => {
      const existing = prev.find(c => c.product_id === producto.id)
      if (existing) {
        if (esPeso) return prev
        return prev.map(c =>
          c.product_id === producto.id
            ? { ...c, unitQty: c.unitQty + 1 }
            : c
        )
      }
      return [...prev, {
        product_id: producto.id,
        name: producto.name,
        barcode: producto.barcode,
        sale_price: producto.sale_price,
        sale_unit: producto.sale_unit,
        unitQty: esPeso ? 0 : 1,
        weightG: esPeso ? 500 : 0,
        max_stock: producto.stock,
      }]
    })
    setSearch('')
    setShowResults(false)
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [])

  const updateQuantity = (productId, delta) => {
    setCart(prev =>
      prev.map(c => {
        if (c.product_id !== productId) return c
        const next = c.unitQty + delta
        if (next < 1) return c
        if (c.max_stock !== undefined && next > c.max_stock) return c
        return { ...c, unitQty: next }
      })
    )
  }

  const setQuantity = (productId, value) => {
    const n = parseInt(value, 10)
    if (isNaN(n)) return
    setCart(prev =>
      prev.map(c => {
        if (c.product_id !== productId) return c
        let next = n
        if (next < 1) next = 1
        if (c.max_stock !== undefined && next > c.max_stock) next = c.max_stock
        return { ...c, unitQty: next }
      })
    )
  }

  const updateWeight = (productId, grams) => {
    setCart(prev =>
      prev.map(c => c.product_id === productId ? { ...c, weightG: grams } : c)
    )
  }

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(c => c.product_id !== productId))
  }

  const subtotalDe = (c) =>
    c.sale_unit === 'peso' ? c.sale_price * ((c.weightG || 0) / 1000) : c.sale_price * c.unitQty

  const totalUSD = cart.reduce((sum, c) => sum + subtotalDe(c), 0)
  const tasaActual = tasa || 0
  const totalCobrar = currency === 'BS' ? totalUSD * tasaActual : totalUSD
  const itemsCount = cart.reduce((sum, c) => sum + (c.sale_unit === 'peso' ? 1 : c.unitQty), 0)

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && filtered.length === 1) {
      addToCart(filtered[0])
      e.preventDefault()
    }
    if (e.key === 'Escape') {
      setShowResults(false)
    }
  }

  const handleSearchChange = (e) => {
    const val = e.target.value
    setSearch(val)
    setShowResults(val.trim().length > 0)

    if (val.trim()) {
      const exactBarcode = productos.find(p =>
        p.barcode && p.barcode.toLowerCase() === val.trim().toLowerCase()
      )
      if (exactBarcode) {
        addToCart(exactBarcode)
      }
    }
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (resultsRef.current && !resultsRef.current.contains(e.target) &&
          searchRef.current && !searchRef.current.contains(e.target)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCreate = async () => {
    if (cart.length === 0) {
      setSnack({ open: true, msg: 'Agrega al menos un producto', severity: 'error' })
      return
    }
    if (!clientName.trim()) {
      setSnack({ open: true, msg: 'El nombre del cliente es obligatorio', severity: 'error' })
      return
    }
    if (!tasaActual) {
      setSnack({ open: true, msg: 'No se pudo obtener la tasa del BCV. Intenta de nuevo.', severity: 'error' })
      return
    }
    const pesoVacio = cart.find(c => c.sale_unit === 'peso' && (!c.weightG || c.weightG <= 0))
    if (pesoVacio) {
      setSnack({ open: true, msg: `Ingresa el peso en gramos para "${pesoVacio.name}"`, severity: 'error' })
      return
    }
    const sinStockKg = cart.find(c =>
      c.sale_unit === 'peso' && c.max_stock != null && (c.weightG || 0) > c.max_stock)
    if (sinStockKg) {
      setSnack({ open: true, msg: `Stock insuficiente para "${sinStockKg.name}"`, severity: 'error' })
      return
    }
    setSubmitting(true)
    try {
      await createVenta({
        payment_method: 'Crédito',
        client_name: clientName.trim(),
        reference: null,
        currency,
        rate: tasaActual,
        received_bs: null,
        received_usd: null,
        change_bs: null,
        change_usd: null,
        is_credit: true,
        days_term: daysTerm,
        items: cart.map(c =>
          c.sale_unit === 'peso'
            ? { product_id: c.product_id, quantity: Math.round(c.weightG || 0) }
            : { product_id: c.product_id, quantity: c.unitQty }),
      })
      setSnack({ open: true, msg: 'Venta a crédito registrada exitosamente', severity: 'success' })
      onVentaCreada?.()
      onClose()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al registrar venta a crédito'
      setSnack({ open: true, msg, severity: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const fechaVencimiento = (() => {
    const d = new Date()
    d.setDate(d.getDate() + daysTerm)
    const dia = String(d.getDate()).padStart(2, '0')
    const mes = String(d.getMonth() + 1).padStart(2, '0')
    return `${dia}/${mes}/${d.getFullYear()}`
  })()

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        slots={{ transition: Slide }}
        slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden', minHeight: 500 } }, transition: { direction: 'up' } }}
      >
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          bgcolor: '#2D5A1E', color: '#FFF8F0', py: 2, px: 3,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CreditCard sx={{ fontSize: 22 }} />
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, fontSize: '1.15rem' }}>
              Nueva Venta a Crédito
            </Typography>
          </Box>
          <IconButton
            onClick={onClose}
            size="small"
            sx={{ color: 'rgba(255, 248, 240, 0.6)', '&:hover': { color: '#FFF8F0', bgcolor: 'rgba(255,248,240,0.1)' } }}
          >
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Search Bar */}
          <Box sx={{ position: 'relative', px: 3, pt: 3, pb: 0 }}>
            <Box sx={{ position: 'relative' }}>
              <TextField
                inputRef={searchRef}
                placeholder="Buscar producto por nombre o código de barras..."
                value={search}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => search.trim() && setShowResults(true)}
                fullWidth
                variant="outlined"
                slotProps={{
                  input: {
                    startAdornment: (
                      <Search sx={{ fontSize: 20, color: '#6B5344', mr: 1, opacity: 0.5 }} />
                    ),
                    endAdornment: search.trim() ? (
                      <IconButton size="small" onClick={() => { setSearch(''); setShowResults(false) }}>
                        <Close fontSize="small" sx={{ color: '#6B5344' }} />
                      </IconButton>
                    ) : (
                      <QrCodeScanner sx={{ fontSize: 20, color: '#6B5344', opacity: 0.3 }} />
                    ),
                    sx: {
                      borderRadius: 2.5, py: 0.8, fontSize: '0.95rem',
                      bgcolor: '#F8F5F0',
                      '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.15)' },
                      '&:hover fieldset': { borderColor: 'rgba(45, 90, 30, 0.3)' },
                      '&.Mui-focused fieldset': { borderColor: '#2D5A1E', borderWidth: 2 },
                    },
                  },
                }}
              />
            </Box>

            {/* Search Results Dropdown */}
            {showResults && filtered.length > 0 && (
              <Paper
                ref={resultsRef}
                sx={{
                  position: 'absolute', top: '100%', left: 24, right: 24, zIndex: 10,
                  maxHeight: 220, overflow: 'auto', mt: 0.5, borderRadius: 2,
                  boxShadow: '0 8px 24px rgba(44, 24, 16, 0.12)',
                  border: '1px solid rgba(45, 90, 30, 0.1)',
                  animation: 'fade-in-up 0.15s ease-out both',
                }}
              >
                {filtered.map(p => (
                  <Box
                    key={p.id}
                    onClick={() => addToCart(p)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5,
                      cursor: 'pointer', transition: 'background 0.1s ease',
                      borderBottom: '1px solid rgba(44, 24, 16, 0.04)',
                      '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.08)' },
                      '&:last-of-type': { borderBottom: 'none' },
                    }}
                  >
                    <Avatar sx={{
                      width: 36, height: 36, bgcolor: 'rgba(45, 90, 30, 0.12)',
                      color: '#2D5A1E', fontWeight: 700, fontSize: '0.85rem',
                    }}>
                      {p.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2C1810' }}>
                        {p.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6B5344' }}>
                        {p.barcode ? `Código: ${p.barcode} · ` : ''}
                        Stock: {p.stock}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 700, color: '#2D5A1E', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                      {money(p.sale_price, 'USD')}{p.sale_unit === 'peso' ? '/kg' : ''}
                    </Typography>
                    <AddCircle sx={{ fontSize: 20, color: '#2D5A1E', ml: 1 }} />
                  </Box>
                ))}
              </Paper>
            )}

            {showResults && search.trim() && filtered.length === 0 && (
              <Paper
                sx={{
                  position: 'absolute', top: '100%', left: 24, right: 24, zIndex: 10,
                  mt: 0.5, borderRadius: 2, p: 2, textAlign: 'center',
                  boxShadow: '0 8px 24px rgba(44, 24, 16, 0.12)',
                }}
              >
                <Typography variant="body2" sx={{ color: '#6B5344' }}>
                  No se encontraron productos para "<b>{search}</b>"
                </Typography>
              </Paper>
            )}
          </Box>

          {/* Cliente, Plazo y Moneda */}
          <Box sx={{ px: 3, pt: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Nombre del cliente *"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                size="small"
                placeholder="Obligatorio para crédito"
                required
                sx={{
                  flex: 1, minWidth: 180,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2, bgcolor: '#F8F5F0',
                    '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.3)' },
                    '&:hover fieldset': { borderColor: '#2D5A1E' },
                    '&.Mui-focused fieldset': { borderColor: '#2D5A1E' },
                  },
                }}
              />
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel sx={{ color: '#6B5344' }}>Plazo de pago</InputLabel>
                <Select
                  value={daysTerm}
                  label="Plazo de pago"
                  onChange={e => setDaysTerm(e.target.value)}
                  sx={{
                    borderRadius: 2, bgcolor: '#F8F5F0',
                    '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.3)' },
                    '&:hover fieldset': { borderColor: '#2D5A1E' },
                    '&.Mui-focused fieldset': { borderColor: '#2D5A1E' },
                  }}
                >
                  {TERM_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <CalendarMonth sx={{ fontSize: 18, mr: 1, color: '#2D5A1E' }} />
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel sx={{ color: '#6B5344' }}>Moneda</InputLabel>
                <Select
                  value={currency}
                  label="Moneda"
                  onChange={e => setCurrency(e.target.value)}
                  sx={{
                    borderRadius: 2, bgcolor: '#F8F5F0',
                    '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.3)' },
                    '&:hover fieldset': { borderColor: '#2D5A1E' },
                    '&.Mui-focused fieldset': { borderColor: '#2D5A1E' },
                  }}
                >
                  <MenuItem value="BS">Bolívares (Bs.)</MenuItem>
                  <MenuItem value="USD">Dólares ($)</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          <Divider sx={{ mx: 3, my: 2 }} />

          {/* Cart */}
          <Box sx={{ flex: 1, px: 3, overflow: 'auto', minHeight: 180 }}>
            {cart.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <ShoppingCart sx={{ fontSize: 48, color: '#A5C49B', mb: 1, opacity: 0.4 }} />
                <Typography sx={{ color: '#6B5344', fontWeight: 500 }}>
                  Carrito vacío
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B5344', opacity: 0.5 }}>
                  Busca productos arriba para agregarlos
                </Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Receipt sx={{ fontSize: 18, color: '#6B5344', opacity: 0.5 }} />
                  <Typography sx={{ fontWeight: 600, color: '#2C1810', fontSize: '0.85rem' }}>
                    Carrito ({itemsCount} item{itemsCount !== 1 ? 's' : ''})
                  </Typography>
                </Box>

                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#F0F7EC' }}>
                      <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Producto</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Precio</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cantidad</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtotal</TableCell>
                      <TableCell sx={{ width: 40 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cart.map((c, i) => (
                      <TableRow
                        key={c.product_id}
                        sx={{
                          animation: `fade-in-up 0.2s ease-out ${i * 0.03}s both`,
                          '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.03)' },
                        }}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontWeight: 500, fontSize: '0.85rem', color: '#2C1810' }}>
                              {c.name}
                            </Typography>
                            {c.barcode && (
                              <Chip label={c.barcode} size="small" variant="outlined" sx={{
                                height: 20, fontSize: '0.6rem', borderColor: 'rgba(45, 90, 30, 0.2)',
                                color: '#6B5344', display: { xs: 'none', sm: 'inline-flex' },
                              }} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={{ color: '#6B5344', fontSize: '0.85rem' }}>
                          {money(c.sale_price, 'USD')}{c.sale_unit === 'peso' ? ' /kg' : ''}
                        </TableCell>
                        <TableCell align="center">
                          {c.sale_unit === 'peso' ? (
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                              <TextField
                                size="small"
                                type="number"
                                value={Number.isFinite(c.weightG) ? c.weightG : 0}
                                onChange={e => updateWeight(c.product_id, Math.round(parseFloat(e.target.value) || 0))}
                                slotProps={{ htmlInput: { min: 0, step: 50, 'aria-label': 'Peso en gramos' } }}
                                sx={{
                                  width: 100,
                                  '& .MuiOutlinedInput-root': {
                                    borderRadius: 2, fontSize: '0.85rem',
                                    bgcolor: 'rgba(45, 90, 30, 0.04)',
                                    '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.2)' },
                                    '&:hover fieldset': { borderColor: 'rgba(45, 90, 30, 0.4)' },
                                    '&.Mui-focused fieldset': { borderColor: '#2D5A1E' },
                                  },
                                }}
                              />
                              <Typography sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#2D5A1E' }}>g</Typography>
                            </Box>
                          ) : (
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
                              <IconButton
                                size="small"
                                onClick={() => updateQuantity(c.product_id, -1)}
                                disabled={c.unitQty <= 1}
                                sx={{ color: '#6B5344', '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.1)' } }}
                              >
                                <RemoveCircle fontSize="small" />
                              </IconButton>
                              <TextField
                                size="small"
                                type="number"
                                value={c.unitQty}
                                onChange={e => setQuantity(c.product_id, e.target.value)}
                                slotProps={{ htmlInput: { min: 1, 'aria-label': 'Cantidad' } }}
                                sx={{
                                  width: 68,
                                  '& .MuiOutlinedInput-root': {
                                    borderRadius: 2, fontSize: '0.9rem', fontWeight: 700,
                                    color: '#2C1810', textAlign: 'center',
                                    '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.15)' },
                                    '&:hover fieldset': { borderColor: 'rgba(45, 90, 30, 0.3)' },
                                    '&.Mui-focused fieldset': { borderColor: '#2D5A1E' },
                                  },
                                }}
                              />
                              <IconButton
                                size="small"
                                onClick={() => updateQuantity(c.product_id, 1)}
                                disabled={c.max_stock !== undefined && c.unitQty >= c.max_stock}
                                sx={{ color: '#2D5A1E', '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.1)' } }}
                              >
                                <AddCircle fontSize="small" />
                              </IconButton>
                            </Box>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#2C1810' }}>
                            {money(subtotalDe(c), 'USD')}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ p: 0.5 }}>
                          <IconButton
                            size="small"
                            onClick={() => removeFromCart(c.product_id)}
                            sx={{ color: '#C62828', opacity: 0.5, '&:hover': { opacity: 1, bgcolor: 'rgba(198, 40, 40, 0.08)' } }}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Box>

          {/* Bottom: Info + Total + Actions */}
          <Box sx={{
            borderTop: '1px solid rgba(45, 90, 30, 0.1)',
            bgcolor: '#F0F7EC',
            px: 3, py: 2,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Alert severity="info" sx={{ borderRadius: 2, bgcolor: 'rgba(45, 90, 30, 0.06)', border: '1px solid rgba(45, 90, 30, 0.2)' }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2D5A1E' }}>
                    Venta a Crédito
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#6B5344', mt: 0.5 }}>
                    El cliente pagará después. La venta se reflejará en ventas diarias y en cuentas por cobrar.
                  </Typography>
                </Alert>
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'rgba(45, 90, 30, 0.04)', border: '1px dashed rgba(45, 90, 30, 0.2)' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B5344' }}>
                    <strong>Cliente:</strong> {clientName || '—'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B5344' }}>
                    <strong>Moneda:</strong> {currency === 'BS' ? 'Bolívares' : 'Dólares'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B5344' }}>
                    <strong>Plazo:</strong> {daysTerm} días (vence: {fechaVencimiento})
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B5344' }}>
                    <strong>Saldo:</strong> {money(totalCobrar, currency)}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ textAlign: 'right', minWidth: 160 }}>
                <Typography variant="caption" sx={{ color: '#6B5344', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                  Total a cobrar
                </Typography>
                <Typography sx={{
                  fontFamily: '"Playfair Display", serif', fontWeight: 700,
                  color: totalUSD > 0 ? '#2D5A1E' : '#6B5344',
                  fontSize: '1.5rem', lineHeight: 1.2, whiteSpace: 'nowrap',
                }}>
                  {money(totalCobrar, currency)}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#6B5344' }}>
                  ({money(totalUSD, 'USD')} · tasa {tasaActual ? `Bs. ${tasaActual}` : 's/tasa'})
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2 }}>
              <Button
                onClick={onClose}
                sx={{ color: '#6B5344', fontWeight: 500, borderRadius: 2, px: 3, '&:hover': { bgcolor: 'rgba(107,83,68,0.08)' } }}
              >
                Cancelar
              </Button>
              <Button
                variant="contained"
                onClick={handleCreate}
                disabled={cart.length === 0 || submitting || !tasaActual || !clientName.trim()}
                sx={{
                  background: 'linear-gradient(135deg, #2D5A1E 0%, #1E3D14 100%)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #3A7028 0%, #2D5A1E 100%)',
                    transform: 'translateY(-1px)',
                  },
                  px: 4, py: 1.2, borderRadius: 2,
                  fontWeight: 600, fontSize: '0.95rem',
                  boxShadow: '0 4px 14px rgba(45, 90, 30, 0.3)',
                  transition: 'all 0.2s ease',
                  '&.Mui-disabled': {
                    background: 'rgba(45, 90, 30, 0.3)',
                    color: 'rgba(255, 248, 240, 0.5)',
                  },
                }}
              >
                {submitting ? 'Registrando...' : `Registrar Crédito ${money(totalCobrar, currency)}`}
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack({ ...snack, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snack.severity} variant="filled" sx={{ borderRadius: 2.5, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', fontWeight: 500 }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </>
  )
}
