import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Typography, IconButton, MenuItem, Select, FormControl, InputLabel,
  Alert, Snackbar, Box, Chip, Avatar, Divider, Slide, Switch, FormControlLabel,
} from '@mui/material'
import {
  Add, Visibility, PointOfSale, Search, Close, AddCircle,
  RemoveCircle, Delete, ShoppingCart, Receipt, QrCodeScanner,
  Lock, CalendarToday, AssignmentTurnedIn, Download,
} from '@mui/icons-material'
import { getVentas, createVenta, descargarReporteZ, descargarFactura, getEstadoCierre, getResumenDia, cerrarCaja } from '../api/ventas'
import { getProductos } from '../api/productos'
import { getTasa } from '../api/tasa'
import Paginador from './Paginador'
import { usePaginacion } from '../hooks/usePaginacion'
import { limpiarNumero } from '../utils/num'

export const formatNumber = (n, digits = 2) => {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toLocaleString('es-VE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const money = (n, code) => {
  const val = formatNumber(n)
  return val === '—' ? val : `${code === 'USD' ? '$' : 'Bs.'} ${val}`
}

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

const PAYMENT_OPTIONS = [
  { value: 'Bolívares Efectivo', label: 'Bolívares en Efectivo', icon: '💵', currency: 'BS' },
  { value: 'Pago Móvil', label: 'Pago Móvil', icon: '📱', currency: 'BS' },
  { value: 'Transferencia', label: 'Transferencia', icon: '🏦', currency: 'BS' },
  { value: 'Biopago', label: 'Biopago', icon: '🔵', currency: 'BS' },
  { value: 'Dólares Efectivo', label: 'Dólares en Efectivo', icon: '💲', currency: 'USD' },
  { value: 'Punto', label: 'Punto de Venta', icon: '💳', currency: 'BS' },
]

const METHODS_WITH_REFERENCE = ['Punto', 'Pago Móvil', 'Transferencia', 'Biopago']

const currencyOf = (method) =>
  (PAYMENT_OPTIONS.find(o => o.value === method) || {}).currency || 'BS'

const saleTotal = (v) => {
  const code = currencyOf(v.payment_method)
  const val = code === 'BS' ? v.total * (v.rate_usd || 1) : v.total
  return money(val, code)
}

const rowSx = {
  animation: 'fade-in-up 0.3s ease-out both',
  '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.04)' },
  transition: 'background 0.15s ease',
}

export default function Ventas() {
  const [ventas, setVentas] = useState([])
  const [openCreate, setOpenCreate] = useState(false)
  const [openView, setOpenView] = useState(false)
  const [viewVenta, setViewVenta] = useState(null)
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' })
  const [busquedaVentas, setBusquedaVentas] = useState('')
  const ventasFiltradas = (() => {
    const q = busquedaVentas.trim().toLowerCase()
    if (!q) return ventas
    return ventas.filter(v =>
      String(v.id).includes(q) ||
      (v.client_name || '').toLowerCase().includes(q) ||
      (v.payment_method || '').toLowerCase().includes(q) ||
      (v.reference || '').toLowerCase().includes(q) ||
      (v.details || []).some(d => (d.product?.name || '').toLowerCase().includes(q))
    )
  })()
  const { page, rowsPerPage, total, actuales, handleChangePage, handleChangeRowsPerPage } = usePaginacion(ventasFiltradas)

  const [productos, setProductos] = useState([])
  const [search, setSearch] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('Bolívares Efectivo')
  const [clientName, setClientName] = useState('')
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tasa, setTasa] = useState(null)
  const [mixed, setMixed] = useState(false)
  const [receivedBs, setReceivedBs] = useState('')
  const [receivedUsd, setReceivedUsd] = useState('')
  const [cierreLoading, setCierreLoading] = useState(false)
  const [cierreEstado, setCierreEstado] = useState(null)
  const [cierreConfirmOpen, setCierreConfirmOpen] = useState(false)
  const [fechaFiltro, setFechaFiltro] = useState('')
  const [resumen, setResumen] = useState(null)
  const [resumenLoading, setResumenLoading] = useState(false)

  const searchRef = useRef(null)
  const resultsRef = useRef(null)

  const rawUser = typeof window !== 'undefined' ? (localStorage.getItem('user') || sessionStorage.getItem('user')) : null
  const user = JSON.parse(rawUser || '{}')
  const isAdmin = user.role === 'admin'

  const hoyISO = new Date().toISOString().slice(0, 10)
  const cajaCerrada = cierreEstado?.cerrado === true

  const loadEstado = async () => {
    try {
      const res = await getEstadoCierre()
      setCierreEstado(res.data)
    } catch {}
  }

  useEffect(() => {
    aplicarFechaFiltro(hoyISO)
    loadEstado()
  }, [])

  const aplicarFechaFiltro = async (fecha) => {
    const dia = fecha || hoyISO
    setFechaFiltro(dia)
    setResumenLoading(true)
    try {
      const [ventasRes, resumenRes] = await Promise.all([getVentas(dia), getResumenDia(dia)])
      setVentas(ventasRes.data)
      setResumen(resumenRes.data)
    } catch {
      setSnack({ open: true, msg: 'Error al consultar esa fecha', severity: 'error' })
    } finally {
      setResumenLoading(false)
    }
  }

  const handleCierreConfirmado = async () => {
    setCierreConfirmOpen(false)
    setCierreLoading(true)
    try {
      await cerrarCaja()
      await descargarReporteZ(hoyISO)
      await Promise.all([aplicarFechaFiltro(hoyISO), loadEstado()])
      setSnack({ open: true, msg: 'Cierre Z realizado. La caja de hoy quedó cerrada.', severity: 'success' })
    } catch (err) {
      const msg = err.response?.data?.detail || 'No se pudo realizar el cierre Z'
      setSnack({ open: true, msg, severity: 'error' })
    } finally {
      setCierreLoading(false)
    }
  }

  const filtered = search.trim()
    ? productos.filter(p => {
        const q = search.toLowerCase()
        return p.name.toLowerCase().includes(q) ||
               (p.barcode && p.barcode.toLowerCase().includes(q))
      })
    : []

  const openCreateDialog = async () => {
    if (cajaCerrada) {
      setSnack({ open: true, msg: 'La caja de hoy ya fue cerrada. No se permiten más ventas hasta mañana.', severity: 'error' })
      return
    }
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
    setCart([])
    setSearch('')
    setPaymentMethod('Bolívares Efectivo')
    setClientName('')
    setReference('')
    setMixed(false)
    setReceivedBs('')
    setReceivedUsd('')
    setShowResults(false)
    setOpenCreate(true)
    setTimeout(() => searchRef.current?.focus(), 200)
  }

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
  const totalCobrar = currencyOf(paymentMethod) === 'BS' ? totalUSD * tasaActual : totalUSD
  const monedaTotal = currencyOf(paymentMethod)

  // Desglose de impuestos (misma fórmula que el backend): precios ya incluyen IVA/IGTF.
  const aplicaIGTF = paymentMethod === 'Dólares Efectivo'
  const baseLive = totalUSD > 0 ? totalUSD / (1 + 0.16 + (aplicaIGTF ? 0.03 : 0)) : 0
  const ivaLive = baseLive * 0.16
  const igtfLive = baseLive * (aplicaIGTF ? 0.03 : 0)

  // Moneda y tasa para mostrar el desglose guardado en "Ver venta".
  const viewCode = viewVenta ? currencyOf(viewVenta.payment_method) : 'USD'
  const viewRate = viewVenta?.rate_usd || 1
  const usdToView = (usdVal) => (viewCode === 'BS' ? usdVal * viewRate : usdVal)

  // Cobro recibido y cambio calculados en la moneda del método de pago.
  const recBs = parseFloat(String(receivedBs).replace(',', '.')) || 0
  const recUsd = parseFloat(String(receivedUsd).replace(',', '.')) || 0
  const recibeTotal = monedaTotal === 'BS'
    ? recBs + recUsd * tasaActual
    : recUsd + recBs / (tasaActual || 1)
  const cambio = (totalCobrar > 0 && recibeTotal > 0) ? recibeTotal - totalCobrar : null
  const montoInsuficiente = (totalCobrar > 0 && recibeTotal > 0 && recibeTotal < totalCobrar - 0.005) || recibeTotal <= 0
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
    if (cajaCerrada) {
      setSnack({ open: true, msg: 'La caja de hoy ya fue cerrada. No se permiten más ventas.', severity: 'error' })
      return
    }
    if (cart.length === 0) {
      setSnack({ open: true, msg: 'Agrega al menos un producto', severity: 'error' })
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
    const needsRef = METHODS_WITH_REFERENCE.includes(paymentMethod)
    if (needsRef && !reference.trim()) {
      setSnack({ open: true, msg: 'Ingresa la referencia de pago', severity: 'error' })
      return
    }
    if (montoInsuficiente) {
      setSnack({ open: true, msg: 'El monto recibido es menor al total a cobrar', severity: 'error' })
      return
    }
    setSubmitting(true)
    try {
      await createVenta({
        payment_method: paymentMethod,
        client_name: clientName.trim() || null,
        reference: reference.trim() || null,
        currency: monedaTotal,
        rate: tasaActual,
        received_bs: recBs > 0 ? recBs : null,
        received_usd: recUsd > 0 ? recUsd : null,
        change_bs: monedaTotal === 'BS' && cambio != null ? Math.max(cambio, 0) : null,
        change_usd: monedaTotal === 'USD' && cambio != null ? Math.max(cambio, 0) : null,
        is_credit: false,
        items: cart.map(c =>
          c.sale_unit === 'peso'
            ? { product_id: c.product_id, quantity: Math.round(c.weightG || 0) }
            : { product_id: c.product_id, quantity: c.unitQty }),
      })
      setSnack({ open: true, msg: 'Venta registrada exitosamente', severity: 'success' })
      setOpenCreate(false)
      setCart([])
      aplicarFechaFiltro(hoyISO)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al registrar venta'
      setSnack({ open: true, msg, severity: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const totalEnDivisa = money(totalCobrar, monedaTotal)

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        mb: 3.5, flexWrap: 'wrap', gap: 2,
      }}>
        <Box sx={{ animation: 'fade-in-up 0.5s ease-out both' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <PointOfSale sx={{ fontSize: 28, color: '#C9952A' }} />
            <Typography variant="h4" sx={{
              fontFamily: '"Playfair Display", serif',
              fontWeight: 700, color: '#2C1810',
              fontSize: { xs: '1.5rem', sm: '1.85rem' },
            }}>
              Ventas
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6B5344', ml: 0.5 }}>
            {cajaCerrada
              ? `Caja de hoy cerrada · ${cierreEstado?.total_ventas_hoy ?? 0} ventas · ${money(cierreEstado?.total_usd_hoy, 'USD')}`
              : `${ventas.length} venta${ventas.length !== 1 ? 's' : ''} registrada${ventas.length !== 1 ? 's' : ''}`}
          </Typography>
          {cajaCerrada && (
            <Chip
              icon={<Lock sx={{ fontSize: 15 }} />}
              label="Caja cerrada — sin nuevas ventas"
              size="small"
              sx={{
                mt: 1, bgcolor: 'rgba(198, 40, 40, 0.1)', color: '#C62828',
                fontWeight: 600, fontSize: '0.75rem', borderRadius: 1.5,
                animation: 'fade-in-up 0.4s ease-out 0.1s both',
              }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={openCreateDialog}
            disabled={cajaCerrada}
            sx={{
              background: 'linear-gradient(135deg, #C9952A 0%, #B8862A 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #D4A235 0%, #C9952A 100%)',
                transform: 'translateY(-1px)',
                boxShadow: '0 6px 20px rgba(201, 149, 42, 0.4)',
              },
              '&.Mui-disabled': {
                background: 'rgba(107, 83, 68, 0.15)',
                color: 'rgba(107, 83, 68, 0.5)',
              },
              px: 3.5, py: 1.2, borderRadius: 2.5,
              fontSize: '0.9rem', fontWeight: 600,
              boxShadow: '0 4px 14px rgba(201, 149, 42, 0.3)',
              transition: 'all 0.2s ease',
              animation: 'fade-in-up 0.5s ease-out 0.15s both',
            }}
          >
            Nueva Venta
          </Button>
          <Button
            variant="outlined"
            onClick={() => setCierreConfirmOpen(true)}
            disabled={cierreLoading || cajaCerrada}
            startIcon={<AssignmentTurnedIn />}
            sx={{
              borderColor: 'rgba(201, 149, 42, 0.4)',
              color: '#C9952A',
              borderRadius: 2.5, px: 3, py: 1.2,
              fontSize: '0.9rem', fontWeight: 600,
              '&:hover': { borderColor: '#C9952A', bgcolor: 'rgba(201, 149, 42, 0.06)' },
              '&.Mui-disabled': {
                borderColor: 'rgba(45, 90, 30, 0.3)',
                color: '#2D5A1E',
              },
              animation: 'fade-in-up 0.5s ease-out 0.2s both',
            }}
          >
            {cierreLoading ? 'Cerrando…' : cajaCerrada ? 'Caja cerrada ✓' : 'Cierre Z'}
          </Button>
        </Box>
      </Box>

      {/* Buscador de ventas */}
      <TextField
        value={busquedaVentas}
        onChange={e => setBusquedaVentas(e.target.value)}
        placeholder="Buscar por #, cliente, método de pago, referencia o producto…"
        size="small"
        fullWidth
        slotProps={{
          input: {
            startAdornment: <Search sx={{ color: '#C9952A', mr: 1, fontSize: 20 }} />,
          },
        }}
        sx={{
          mb: 2,
          '& .MuiInputBase-root': { borderRadius: 2 },
          '& fieldset': { borderColor: 'rgba(201, 149, 42, 0.25)' },
          '& .Mui-focused fieldset': { borderColor: '#C9952A' },
        }}
      />

      {/* Filtro por fecha */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          type="date"
          value={fechaFiltro}
          onChange={e => aplicarFechaFiltro(e.target.value)}
          size="small"
          slotProps={{
            input: {
              startAdornment: <CalendarToday sx={{ color: '#C9952A', mr: 1, fontSize: 18 }} />,
            },
            htmlInput: { max: hoyISO },
          }}
          sx={{
            width: { xs: '100%', sm: 220 },
            '& .MuiInputBase-root': { borderRadius: 2, bgcolor: 'rgba(255,248,240,0.8)' },
            '& fieldset': { borderColor: 'rgba(201, 149, 42, 0.25)' },
            '& .Mui-focused fieldset': { borderColor: '#C9952A' },
          }}
        />
        {fechaFiltro && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<Search />}
            disabled={resumenLoading}
            sx={{
              borderColor: 'rgba(201, 149, 42, 0.3)', color: '#6B5344', borderRadius: 2,
              fontSize: '0.75rem', fontWeight: 600, textTransform: 'none',
              '&:hover': { borderColor: '#C9952A', color: '#C9952A', bgcolor: 'rgba(201, 149, 42, 0.06)' },
            }}
          >
            {resumenLoading ? 'Consultando…' : 'Consultar día'}
          </Button>
        )}
        {fechaFiltro && resumen && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<Download />}
            onClick={() => descargarReporteZ(fechaFiltro)}
            sx={{
              borderColor: 'rgba(45, 90, 30, 0.3)', color: '#2D5A1E', borderRadius: 2,
              fontSize: '0.75rem', fontWeight: 600, textTransform: 'none',
              '&:hover': { borderColor: '#2D5A1E', bgcolor: 'rgba(45, 90, 30, 0.06)' },
            }}
          >
            Reporte Z de este día
          </Button>
        )}
      </Box>

      {/* Resumen estilo Reporte Z del día consultado */}
      {fechaFiltro && resumen && (
        <Paper
          elevation={0}
          sx={{
            mb: 2, borderRadius: 3, overflow: 'hidden',
            border: '1px solid rgba(201, 149, 42, 0.15)',
            animation: 'fade-in-up 0.4s ease-out both',
          }}
        >
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            bgcolor: '#2C1810', color: '#FFF8F0', px: 2.5, py: 1.2, flexWrap: 'wrap', gap: 1,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Receipt sx={{ color: '#E8C46A', fontSize: 20 }} />
              <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '1rem' }}>
                Resumen del {resumen.fecha}
              </Typography>
            </Box>
            {resumen.cerrado ? (
              <Chip
                icon={<Lock sx={{ fontSize: 13 }} />}
                label={`Cerrado por ${resumen.cierre?.cerrado_por || '—'}`}
                size="small"
                sx={{ bgcolor: 'rgba(45, 90, 30, 0.35)', color: '#FFF8F0', fontWeight: 600, fontSize: '0.7rem' }}
              />
            ) : (
              <Chip
                label="Caja abierta"
                size="small"
                sx={{ bgcolor: 'rgba(201, 149, 42, 0.3)', color: '#FFF8F0', fontWeight: 600, fontSize: '0.7rem' }}
              />
            )}
          </Box>
          <Box sx={{ p: 2.5, bgcolor: 'rgba(255,248,240,0.6)' }}>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, mb: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ventas del día</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: '#2C1810' }}>{resumen.total_ventas}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total USD</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: '#2D5A1E' }}>${formatNumber(resumen.total_usd)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Bs</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: '#2C1810' }}>Bs. {formatNumber(resumen.total_bs)}</Typography>
              </Box>
              <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Métodos de pago</Typography>
                {resumen.metodos.length ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                    {resumen.metodos.map(m => (
                      <Chip
                        key={m.metodo}
                        label={`${m.metodo}: ${m.n} · $${formatNumber(m.usd)}`}
                        size="small"
                        sx={{ bgcolor: 'rgba(201, 149, 42, 0.08)', color: '#6B5344', fontWeight: 500, fontSize: '0.7rem' }}
                      />
                    ))}
                  </Box>
                ) : (
                  <Typography sx={{ color: '#6B5344', fontSize: '0.8rem', mt: 0.5 }}>Sin ventas</Typography>
                )}
              </Box>
            </Box>
            <Typography variant="caption" sx={{ color: '#6B5344', opacity: 0.7 }}>
              La tabla inferior muestra el listado de ventas de ese día, igual que el reporte Z.
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Sales Table */}
      <TableContainer
        component={Paper}
        sx={{
          borderRadius: 3,
          border: '1px solid rgba(201, 149, 42, 0.06)',
          boxShadow: '0 1px 4px rgba(44, 24, 16, 0.06)',
          animation: 'fade-in-up 0.5s ease-out 0.2s both',
          overflow: 'hidden',
        }}
      >
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8F5F0' }}>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Fecha</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Productos</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Cliente</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Método Pago</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Referencia</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }} align="right">Total</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }} align="right">Detalle</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {actuales.map((v, i) => (
              <TableRow key={v.id} sx={rowSx}>
                <TableCell>
                  <Chip
                    label={`#${v.id}`}
                    size="small"
                    sx={{ bgcolor: 'rgba(201, 149, 42, 0.1)', color: '#C9952A', fontWeight: 700, fontSize: '0.7rem', borderRadius: 1.5 }}
                  />
                </TableCell>
                <TableCell sx={{ color: '#6B5344', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {formatFecha(v.created_at)}
                </TableCell>
                <TableCell>
                  <Chip
                    label={`${v.details?.length} item${v.details?.length !== 1 ? 's' : ''}`}
                    size="small"
                    sx={{ bgcolor: 'rgba(45, 90, 30, 0.08)', color: '#2D5A1E', fontWeight: 500, fontSize: '0.75rem', borderRadius: 1.5 }}
                  />
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem', color: '#2C1810', fontWeight: 500 }}>
                  {v.client_name || '—'}
                </TableCell>
                <TableCell>
                  {v.is_credit ? (
                    <Chip
                      label="Crédito"
                      size="small"
                      sx={{ bgcolor: 'rgba(198, 40, 40, 0.08)', color: '#C62828', fontWeight: 600, fontSize: '0.75rem', border: '1px solid rgba(198, 40, 40, 0.2)' }}
                    />
                  ) : (
                    <Chip
                      label={v.payment_method}
                      size="small"
                      variant="outlined"
                      sx={{ borderColor: 'rgba(201, 149, 42, 0.25)', color: '#6B5344', fontWeight: 500, fontSize: '0.75rem' }}
                    />
                  )}
                </TableCell>
                <TableCell sx={{ fontSize: '0.75rem', color: '#6B5344', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {v.reference || '—'}
                </TableCell>
                <TableCell align="right">
                  <Typography sx={{ fontWeight: 700, color: '#2C1810', fontSize: '0.9rem' }}>
                    {saleTotal(v)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Visibility />}
                    onClick={() => { setViewVenta(v); setOpenView(true) }}
                    sx={{
                      borderColor: 'rgba(201, 149, 42, 0.2)',
                      color: '#C9952A',
                      borderRadius: 2, fontSize: '0.7rem', fontWeight: 600, px: 1.2,
                      '&:hover': { borderColor: '#C9952A', bgcolor: 'rgba(201, 149, 42, 0.06)' },
                    }}
                  >
                    Ver
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {ventasFiltradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} sx={{ py: 6 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Avatar sx={{ width: 56, height: 56, bgcolor: 'rgba(201, 149, 42, 0.08)', mx: 'auto', mb: 1.5 }}>
                      <PointOfSale sx={{ fontSize: 28, color: '#C9952A' }} />
                    </Avatar>
                    <Typography sx={{ color: '#6B5344', fontWeight: 500, mb: 0.5 }}>
                      {busquedaVentas.trim() ? 'No se encontraron ventas para tu búsqueda' : 'No hay ventas registradas'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6B5344', opacity: 0.6 }}>
                      {busquedaVentas.trim() ? 'Prueba con otro término' : 'Crea tu primera venta usando el botón "Nueva Venta"'}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Paginador page={page} rowsPerPage={rowsPerPage} total={total} onPageChange={handleChangePage} onRowsPerPageChange={handleChangeRowsPerPage} />
      </TableContainer>

      {/* CREATE SALE — POS DIALOG */}
      <Dialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        maxWidth="md"
        fullWidth
        slots={{ transition: Slide }}
        slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden', minHeight: 500 } }, transition: { direction: 'up' } }}
      >
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          bgcolor: '#C9952A', color: '#FFF8F0', py: 2, px: 3,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Add sx={{ fontSize: 22 }} />
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, fontSize: '1.15rem' }}>
              Nueva Venta
            </Typography>
          </Box>
          <IconButton
            onClick={() => setOpenCreate(false)}
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
                      '& fieldset': { borderColor: 'rgba(201, 149, 42, 0.15)' },
                      '&:hover fieldset': { borderColor: 'rgba(201, 149, 42, 0.3)' },
                      '&.Mui-focused fieldset': { borderColor: '#C9952A', borderWidth: 2 },
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
                  border: '1px solid rgba(201, 149, 42, 0.1)',
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
                      '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.08)' },
                      '&:last-of-type': { borderBottom: 'none' },
                    }}
                  >
                    <Avatar sx={{
                      width: 36, height: 36, bgcolor: 'rgba(201, 149, 42, 0.12)',
                      color: '#C9952A', fontWeight: 700, fontSize: '0.85rem',
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
                    <AddCircle sx={{ fontSize: 20, color: '#C9952A', ml: 1 }} />
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

          {/* Client & Reference */}
          <Box sx={{ px: 3, pt: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Nombre del cliente"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                size="small"
                placeholder="Opcional"
                sx={{
                  flex: 1, minWidth: 180,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2, bgcolor: '#F8F5F0',
                    '& fieldset': { borderColor: 'rgba(201, 149, 42, 0.15)' },
                    '&:hover fieldset': { borderColor: 'rgba(201, 149, 42, 0.3)' },
                    '&.Mui-focused fieldset': { borderColor: '#C9952A' },
                  },
                }}
              />
              {METHODS_WITH_REFERENCE.includes(paymentMethod) && (
                <TextField
                  label="Referencia"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  size="small"
                  placeholder="Número de referencia"
                  required
                  sx={{
                    flex: 1, minWidth: 180,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2, bgcolor: '#F8F5F0',
                      '& fieldset': { borderColor: 'rgba(201, 149, 42, 0.15)' },
                      '&:hover fieldset': { borderColor: 'rgba(201, 149, 42, 0.3)' },
                      '&.Mui-focused fieldset': { borderColor: '#C9952A' },
                    },
                  }}
                />
              )}
            </Box>
          </Box>

          <Divider sx={{ mx: 3, my: 2 }} />

          {/* Cart */}
          <Box sx={{ flex: 1, px: 3, overflow: 'auto', minHeight: 180 }}>
            {cart.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <ShoppingCart sx={{ fontSize: 48, color: '#E8C46A', mb: 1, opacity: 0.4 }} />
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
                    <TableRow sx={{ bgcolor: '#F8F5F0' }}>
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
                          '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.03)' },
                        }}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontWeight: 500, fontSize: '0.85rem', color: '#2C1810' }}>
                              {c.name}
                            </Typography>
                            {c.barcode && (
                              <Chip label={c.barcode} size="small" variant="outlined" sx={{
                                height: 20, fontSize: '0.6rem', borderColor: 'rgba(201, 149, 42, 0.2)',
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
                                onChange={e => updateWeight(c.product_id, Math.round(parseFloat(limpiarNumero(e.target.value)) || 0))}
                                slotProps={{ htmlInput: { min: 0, step: 50, 'aria-label': 'Peso en gramos' } }}
                                sx={{
                                  width: 100,
                                  '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    fontSize: '0.85rem',
                                    bgcolor: 'rgba(232, 99, 12, 0.04)',
                                    '& fieldset': { borderColor: 'rgba(232, 99, 12, 0.2)' },
                                    '&:hover fieldset': { borderColor: 'rgba(232, 99, 12, 0.4)' },
                                    '&.Mui-focused fieldset': { borderColor: '#E8630C' },
                                  },
                                }}
                              />
                              <Typography sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#E8630C' }}>g</Typography>
                            </Box>
                          ) : (
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
                              <IconButton
                                size="small"
                                onClick={() => updateQuantity(c.product_id, -1)}
                                disabled={c.unitQty <= 1}
                                sx={{ color: '#6B5344', '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.1)' } }}
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
                                    borderRadius: 2,
                                    fontSize: '0.9rem',
                                    fontWeight: 700,
                                    color: '#2C1810',
                                    textAlign: 'center',
                                    '& fieldset': { borderColor: 'rgba(201, 149, 42, 0.15)' },
                                    '&:hover fieldset': { borderColor: 'rgba(201, 149, 42, 0.3)' },
                                    '&.Mui-focused fieldset': { borderColor: '#C9952A' },
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

          {/* Bottom: Payment + Total + Actions */}
          <Box sx={{
            borderTop: '1px solid rgba(201, 149, 42, 0.1)',
            bgcolor: '#F8F5F0',
            px: 3, py: 2,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ minWidth: 200, flex: 1 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel sx={{ color: '#6B5344' }}>Método de Pago</InputLabel>
                  <Select
                    value={paymentMethod}
                    label="Método de Pago"
                    onChange={e => setPaymentMethod(e.target.value)}
                    sx={{
                      borderRadius: 2,
                      bgcolor: '#FFF8F0',
                      '& fieldset': { borderColor: 'rgba(201, 149, 42, 0.2)' },
                      '&:hover fieldset': { borderColor: 'rgba(201, 149, 42, 0.4)' },
                      '&.Mui-focused fieldset': { borderColor: '#C9952A' },
                      fontWeight: 500,
                    }}
                  >
                    {PAYMENT_OPTIONS.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.icon} {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: 'rgba(232, 99, 12, 0.75)' }}>
                    Tasa BCV: Bs. {formatNumber(tasaActual)}
                  </Typography>
                  <FormControlLabel
                    control={<Switch size="small" checked={mixed} onChange={e => { setMixed(e.target.checked); if (!e.target.checked) { setReceivedBs(''); setReceivedUsd('') } }} />}
                    label={<Typography sx={{ fontSize: '0.78rem', color: '#6B5344' }}>Cobro mixto (Bs + $)</Typography>}
                  />
                </Box>

                {/* Cobro recibido y cambio */}
                {cart.length > 0 && (
                  <Box sx={{ mt: 1.5, display: 'grid', gap: 1.5, gridTemplateColumns: mixed ? '1fr 1fr' : '1fr', alignItems: 'start' }}>
                    {mixed && (
                      <TextField
                        label="Recibe ($USD)"
                        size="small"
                        type="number"
                        value={receivedUsd}
                        onChange={e => setReceivedUsd(e.target.value)}
                        slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                      />
                    )}
                    {mixed ? (
                      <TextField
                        label="Recibe (Bs)"
                        type="number"
                        value={receivedBs}
                        onChange={e => setReceivedBs(e.target.value)}
                        slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                      />
                    ) : (
                      <TextField
                        label={monedaTotal === 'BS' ? 'Recibe en Bs' : 'Recibe en $'}
                        type="number"
                        value={monedaTotal === 'BS' ? receivedBs : receivedUsd}
                        onChange={e => monedaTotal === 'BS' ? setReceivedBs(e.target.value) : setReceivedUsd(e.target.value)}
                        slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                      />
                    )}
                    {recibeTotal > 0 && (
                      <Typography sx={{ fontSize: '0.8rem', color: montoInsuficiente ? '#C62828' : '#2D5A1E', fontWeight: 600, mt: 0.5, gridColumn: mixed ? '1 / -1' : 'auto' }}>
                        {montoInsuficiente
                          ? `Faltan ${money(totalCobrar - recibeTotal, monedaTotal)}`
                          : cambio != null
                            ? `Cambio a devolver: ${money(cambio, monedaTotal)}`
                            : ''}
                      </Typography>
                    )}
                  </Box>
                )}
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
                  {totalEnDivisa}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#6B5344' }}>
                  ({money(totalUSD, 'USD')} · tasa {tasaActual ? `Bs. ${tasaActual}` : 's/tasa'})
                </Typography>
                {totalUSD > 0 && (
                  <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed rgba(201,149,42,0.25)', display: 'flex', flexDirection: 'column', gap: 0.3, minWidth: 200 }}>
                    <Typography variant="caption" sx={{ color: '#6B5344', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6rem' }}>
                      Impuestos incluidos ({monedaTotal === 'BS' ? 'Bs' : 'USD'})
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#6B5344' }}>
                      Base: <b>{money(monedaTotal === 'BS' ? baseLive * (tasaActual || 1) : baseLive, monedaTotal)}</b>
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#C9952A' }}>
                      IVA 16%: <b>{money(monedaTotal === 'BS' ? ivaLive * (tasaActual || 1) : ivaLive, monedaTotal)}</b>
                    </Typography>
                    {aplicaIGTF ? (
                      <Typography sx={{ fontSize: '0.75rem', color: '#C62828' }}>
                        IGTF 3%: <b>{money(igtfLive, 'USD')}</b>
                      </Typography>
                    ) : (
                      <Typography sx={{ fontSize: '0.72rem', color: '#6B5344', opacity: 0.75 }}>
                        IGTF: no aplica (solo Dólares en Efectivo)
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2 }}>
              <Button
                onClick={() => setOpenCreate(false)}
                sx={{ color: '#6B5344', fontWeight: 500, borderRadius: 2, px: 3, '&:hover': { bgcolor: 'rgba(107,83,68,0.08)' } }}
              >
                Cancelar
              </Button>
              <Button
                variant="contained"
                onClick={handleCreate}
                disabled={cart.length === 0 || submitting || !tasaActual}
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
                {submitting ? 'Registrando...' : `Cobrar ${money(totalCobrar, monedaTotal)}`}
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* VIEW SALE DIALOG */}
      <Dialog
        open={openView}
        onClose={() => setOpenView(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden' } } }}
      >
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          bgcolor: '#C9952A', color: '#FFF8F0', py: 2, px: 3,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Receipt sx={{ fontSize: 22 }} />
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, fontSize: '1.15rem' }}>
              Venta #{viewVenta?.id}
            </Typography>
          </Box>
          <IconButton
            onClick={() => setOpenView(false)}
            size="small"
            sx={{ color: 'rgba(255,248,240,0.6)', '&:hover': { color: '#FFF8F0', bgcolor: 'rgba(255,248,240,0.1)' } }}
          >
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, px: 3 }}>
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5,
              bgcolor: 'rgba(201, 149, 42, 0.04)', px: 2.5, py: 1.5, borderRadius: 2,
              border: '1px solid rgba(201, 149, 42, 0.08)', flex: 1, minWidth: 120,
            }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Fecha
                </Typography>
                <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2C1810' }}>
                  {viewVenta && formatFecha(viewVenta.created_at)}
                </Typography>
              </Box>
            </Box>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5,
              bgcolor: 'rgba(201, 149, 42, 0.04)', px: 2.5, py: 1.5, borderRadius: 2,
              border: '1px solid rgba(201, 149, 42, 0.08)', flex: 1, minWidth: 120,
            }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Cliente
                </Typography>
                <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2C1810' }}>
                  {viewVenta?.client_name || '—'}
                </Typography>
              </Box>
            </Box>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5,
              bgcolor: 'rgba(201, 149, 42, 0.04)', px: 2.5, py: 1.5, borderRadius: 2,
              border: '1px solid rgba(201, 149, 42, 0.08)', flex: 1, minWidth: 120,
            }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Método de Pago
                </Typography>
                <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2C1810' }}>
                  {viewVenta?.payment_method}
                </Typography>
              </Box>
            </Box>
            {viewVenta?.reference && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                bgcolor: 'rgba(201, 149, 42, 0.04)', px: 2.5, py: 1.5, borderRadius: 2,
                border: '1px solid rgba(201, 149, 42, 0.08)', flex: 1, minWidth: 120,
              }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Referencia
                  </Typography>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2C1810' }}>
                    {viewVenta?.reference}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>

          <Typography sx={{ fontWeight: 600, color: '#2C1810', fontSize: '0.85rem', mb: 1.5 }}>
            Productos ({viewVenta?.details?.length || 0})
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#F8F5F0' }}>
                <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Producto</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cant.</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Precio</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtotal</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {viewVenta?.details?.map((d, i) => (
                <TableRow key={d.id} sx={{ '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.03)' } }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 28, height: 28, bgcolor: 'rgba(201, 149, 42, 0.1)', fontSize: '0.75rem', color: '#C9952A', fontWeight: 700 }}>
                        {i + 1}
                      </Avatar>
                      <Typography sx={{ fontWeight: 500, fontSize: '0.85rem', color: '#2C1810' }}>
                        {d.product?.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={`${d.quantity}${d.product?.sale_unit === 'peso' ? ' g' : ''}`} size="small" sx={{ bgcolor: 'rgba(201, 149, 42, 0.08)', color: '#C9952A', fontWeight: 700, fontSize: '0.75rem', minWidth: 36 }} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.85rem', color: '#6B5344' }}>
                    {money(d.price_at_sale, 'USD')}{d.product?.sale_unit === 'peso' ? ' /kg' : ''}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#2C1810' }}>
                    {money(d.product?.sale_unit === 'peso' ? d.price_at_sale * (d.quantity / 1000) : d.price_at_sale * d.quantity, 'USD')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Box sx={{ mt: 3, pt: 2, borderTop: '2px solid #C9952A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="caption" sx={{ color: '#6B5344', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                {viewVenta ? (currencyOf(viewVenta.payment_method) === 'BS' ? 'Total (Bs)' : 'Total (USD)') : 'Total'}
              </Typography>
              <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2D5A1E', fontSize: '1.35rem' }}>
                {viewVenta ? saleTotal(viewVenta) : '—'}
              </Typography>
              {viewVenta?.received_bs != null && viewVenta?.change_bs != null && (
                <Typography sx={{ fontSize: '0.78rem', color: '#6B5344', mt: 0.5 }}>
                  Cambio: {money(viewVenta.change_bs, 'BS')} {viewVenta.received_usd ? `(${money(viewVenta.received_usd, 'USD')} recibidos en $)` : ''}
                </Typography>
              )}
              {viewVenta?.received_usd != null && viewVenta?.change_usd != null && (
                <Typography sx={{ fontSize: '0.78rem', color: '#6B5344', mt: 0.5 }}>
                  Cambio: {money(viewVenta.change_usd, 'USD')} {viewVenta.received_bs ? `(${money(viewVenta.received_bs, 'BS')} recibidos en Bs)` : ''}
                </Typography>
              )}
            </Box>
            <Box sx={{ textAlign: 'right', minWidth: 160 }}>
              <Typography variant="caption" sx={{ color: '#6B5344', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                Desglose ({viewVenta ? (currencyOf(viewVenta.payment_method) === 'BS' ? 'Bs' : 'USD') : 'USD'})
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                <Typography sx={{ fontSize: '0.78rem', color: '#6B5344' }}>
                  Base imponible: <b>{money(usdToView(viewVenta?.base_amount ?? 0), viewCode)}</b>
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: '#C9952A' }}>
                  IVA 16% incluido: <b>{money(usdToView(viewVenta?.iva_amount ?? 0), viewCode)}</b>
                </Typography>
                {(viewVenta?.igtf_amount ?? 0) > 0 ? (
                  <Typography sx={{ fontSize: '0.78rem', color: '#C62828' }}>
                    IGTF 3% incluido: <b>{money(usdToView(viewVenta.igtf_amount), viewCode)}</b>
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: '0.78rem', color: '#6B5344', opacity: 0.7 }}>
                    IGTF: — (solo pago en Dólares en Efectivo)
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3, borderTop: '1px solid rgba(201, 149, 42, 0.08)', bgcolor: '#F8F5F0' }}>
          {viewVenta && (
            <Button
              onClick={() => descargarFactura(viewVenta.id)}
              startIcon={<Receipt />}
              sx={{ color: '#2D5A1E', fontWeight: 600, borderRadius: 2, mr: 'auto', '&:hover': { bgcolor: 'rgba(45,90,30,0.08)' } }}
            >
              Imprimir Factura
            </Button>
          )}
          <Button onClick={() => setOpenView(false)} sx={{ color: '#6B5344', fontWeight: 500, borderRadius: 2, px: 3, '&:hover': { bgcolor: 'rgba(107,83,68,0.08)' } }}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* CONFIRM CIERRE Z */}
      <Dialog
        open={cierreConfirmOpen}
        onClose={() => setCierreConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden' } } }}
      >
        <DialogTitle sx={{
          bgcolor: '#2C1810', color: '#FFF8F0', py: 2, px: 3,
          display: 'flex', alignItems: 'center', gap: 1.5,
        }}>
          <AssignmentTurnedIn sx={{ color: '#E8C46A' }} />
          <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, fontSize: '1.1rem' }}>
            Cierre Z del día
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, px: 3 }}>
          <Typography sx={{ color: '#2C1810', fontSize: '0.9rem', mb: 1.5 }}>
            Se generará el reporte Z de hoy ({hoyISO}) y la caja quedará <b>cerrada</b>.
          </Typography>
          <Alert severity="warning" sx={{ borderRadius: 2, fontSize: '0.8rem' }}>
            Después de este cierre <b>no se podrán registrar más ventas</b> hasta mañana. ¿Deseas continuar?
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3, borderTop: '1px solid rgba(201, 149, 42, 0.08)', bgcolor: '#F8F5F0' }}>
          <Button onClick={() => setCierreConfirmOpen(false)} sx={{ color: '#6B5344', fontWeight: 500, borderRadius: 2, px: 3 }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleCierreConfirmado}
            disabled={cierreLoading}
            sx={{
              bgcolor: '#2D5A1E', borderRadius: 2, px: 3.5, fontWeight: 600,
              '&:hover': { bgcolor: '#1E3D14' },
            }}
          >
            {cierreLoading ? 'Cerrando…' : 'Confirmar cierre Z'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
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
    </Box>
  )
}
