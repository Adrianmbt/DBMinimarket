import { aFechaVE } from '../utils/date'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, Typography, Chip, Box, Avatar, Alert, Snackbar,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  TextField, MenuItem, Select, FormControl, InputLabel, Divider,
  Slide, CircularProgress, Switch,
} from '@mui/material'
import {
  AccountBalanceWallet, Search, CheckCircle, Pending, Visibility,
  Close, Warning, Schedule, CreditCard, AddCircle, RemoveCircle,
  Delete, ShoppingCart, Receipt, QrCodeScanner, CalendarMonth, Edit,
} from '@mui/icons-material'
import {
  getCuentasCredito, registrarCobro, getResumenCredito,
  getProximasVencer, marcarNotificadas,
  actualizarCuenta, eliminarCuenta,
} from '../api/creditos'
import { getProductos } from '../api/productos'
import { getTasa } from '../api/tasa'
import { createVenta } from '../api/ventas'
import { formatNumber } from './Ventas'
import Paginador from './Paginador'
import { usePaginacion } from '../hooks/usePaginacion'
import { mensajeError } from '../utils/error'

const money = (n, code) => {
  const val = formatNumber(n)
  return val === '—' ? val : `${code === 'USD' ? '$' : 'Bs.'} ${val}`
}

const formatFecha = (dateStr) => {
  if (!dateStr) return '—'
  const d = aFechaVE(dateStr)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const anio = d.getFullYear()
  const hora = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dia}/${mes}/${anio} ${hora}:${min}`
}

const formatFechaCorta = (dateStr) => {
  if (!dateStr) return '—'
  const d = aFechaVE(dateStr)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${d.getFullYear()}`
}

const diasRestantes = (dueDate) => {
  if (!dueDate) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const vence = new Date(dueDate)
  vence.setHours(0, 0, 0, 0)
  return Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24))
}

const vencimientoColor = (dias) => {
  if (dias === null) return '#6B5344'
  if (dias < 0) return '#C62828'
  if (dias <= 3) return '#E65100'
  if (dias <= 7) return '#F9A825'
  return '#2D5A1E'
}

const vencimientoBg = (dias) => {
  if (dias === null) return 'rgba(107, 83, 68, 0.06)'
  if (dias < 0) return 'rgba(198, 40, 40, 0.1)'
  if (dias <= 3) return 'rgba(230, 81, 0, 0.08)'
  if (dias <= 7) return 'rgba(249, 168, 37, 0.1)'
  return 'rgba(45, 90, 30, 0.06)'
}

const TERM_OPTIONS = [
  { value: 7, label: '7 días' },
  { value: 10, label: '10 días' },
  { value: 15, label: '15 días' },
]

/* Métodos de pago para el cobro (igual que ventas) */
const COBRO_PAYMENT_OPTIONS = [
  { value: 'Bolívares Efectivo', label: 'Bolívares en Efectivo', icon: '💵', currency: 'BS' },
  { value: 'Pago Móvil', label: 'Pago Móvil', icon: '📱', currency: 'BS' },
  { value: 'Transferencia', label: 'Transferencia', icon: '🏦', currency: 'BS' },
  { value: 'Biopago', label: 'Biopago', icon: '🔵', currency: 'BS' },
  { value: 'Dólares Efectivo', label: 'Dólares en Efectivo', icon: '💲', currency: 'USD' },
  { value: 'Punto', label: 'Punto de Venta', icon: '💳', currency: 'BS' },
]
const COBRO_METHODS_WITH_REFERENCE = ['Punto', 'Pago Móvil', 'Transferencia', 'Biopago']

const rowSx = {
  animation: 'fade-in-up 0.3s ease-out both',
  '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.04)' },
  transition: 'background 0.15s ease',
}

/* ──────────────────────────────────────────────
   Componente principal: Créditos
   ────────────────────────────────────────────── */
export default function Creditos() {
  /* ── Estado de cuentas por cobrar ── */
  const [cuentas, setCuentas] = useState([])
  const [resumen, setResumen] = useState(null)
  const [filtro, setFiltro] = useState('pendiente')
  const [busqueda, setBusqueda] = useState('')
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null)
  const [pagando, setPagando] = useState(false)
  /* ── Estado del diálogo de cobro (método, referencia, mixto y abonos) ── */
  const [cobroTasa, setCobroTasa] = useState(null)
  const [cobroMetodo, setCobroMetodo] = useState('Bolívares Efectivo')
  const [cobroMixtoBs, setCobroMixtoBs] = useState('Bolívares Efectivo')
  const [cobroRef, setCobroRef] = useState('')
  const [cobroRecBs, setCobroRecBs] = useState('')
  const [cobroRecUsd, setCobroRecUsd] = useState('')
  const [abonoActivo, setAbonoActivo] = useState(false)
  const [abonoMonto, setAbonoMonto] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailCuenta, setDetailCuenta] = useState(null)
  const [proximasVencer, setProximasVencer] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)

  /* ── Estado de edición/eliminación (solo admin) ── */
  const rawUser = typeof window !== 'undefined' ? (localStorage.getItem('user') || sessionStorage.getItem('user')) : null
  const isAdmin = JSON.parse(rawUser || '{}').role === 'admin'
  const [editOpen, setEditOpen] = useState(false)
  const [editCuenta, setEditCuenta] = useState(null)
  const [editCliente, setEditCliente] = useState('')
  const [editPlazo, setEditPlazo] = useState(15)
  const [editNotas, setEditNotas] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  /* ── Estado del dialogo de nueva venta a crédito ── */
  const [creditDialogOpen, setCreditDialogOpen] = useState(false)
  const [productos, setProductos] = useState([])
  const [search, setSearch] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [cart, setCart] = useState([])
  const [clientName, setClientName] = useState('')
  const [daysTerm, setDaysTerm] = useState(15)
  const [submitting, setSubmitting] = useState(false)
  const [tasa, setTasa] = useState(null)

  const searchRef = useRef(null)
  const resultsRef = useRef(null)

  /* ── Carga de datos ── */
  const loadData = async () => {
    try {
      const [cuentasRes, resumenRes, proximasRes] = await Promise.all([
        getCuentasCredito(filtro ? { status: filtro } : {}),
        getResumenCredito(),
        getProximasVencer(3),
      ])
      setCuentas(cuentasRes.data)
      setResumen(resumenRes.data)
      setProximasVencer(proximasRes.data)
      const noNotificadas = proximasRes.data.filter(c => !c.notified)
      if (noNotificadas.length > 0) setNotifOpen(true)
    } catch {
      setSnack({ open: true, msg: 'Error al cargar datos de créditos', severity: 'error' })
    }
  }

  useEffect(() => { loadData() }, [filtro])

  /* ── Filtrado de cuentas ── */
  const cuentasFiltradas = (() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return cuentas
    return cuentas.filter(c =>
      String(c.id).includes(q) ||
      c.client_name.toLowerCase().includes(q) ||
      String(c.sale_id).includes(q)
    )
  })()

  const { page, rowsPerPage, total, actuales, handleChangePage, handleChangeRowsPerPage } = usePaginacion(cuentasFiltradas)

  /* ── Acciones de cuentas ── */
  const openCobroDialog = async (c) => {
    setCuentaSeleccionada(c)
    setCobroMetodo('Bolívares Efectivo')
    setCobroMixtoBs('Bolívares Efectivo')
    setCobroRef('')
    setCobroRecBs('')
    setCobroRecUsd('')
    setAbonoActivo(false)
    setAbonoMonto('')
    setCobroTasa(null)
    setConfirmOpen(true)
    try {
      const tasaRes = await getTasa()
      setCobroTasa(tasaRes.data?.rate || null)
    } catch {
      setCobroTasa(null)
    }
  }

  /* ── Derivados del diálogo de cobro ── */
  const cobroSaldo = cuentaSeleccionada
    ? (cuentaSeleccionada.saldo_usd ?? cuentaSeleccionada.total_usd ?? 0)
    : 0
  const cobroYaAbonado = cuentaSeleccionada
    ? Math.max((cuentaSeleccionada.total_usd || 0) - cobroSaldo, 0)
    : 0
  const cobroEsMixto = cobroMetodo === 'Mixto'
  const cobroMetodoRef = cobroEsMixto ? cobroMixtoBs : cobroMetodo
  const cobroNecesitaRef = COBRO_METHODS_WITH_REFERENCE.includes(cobroMetodoRef)
  const cRecBs = parseFloat(String(cobroRecBs).replace(',', '.')) || 0
  const cRecUsd = parseFloat(String(cobroRecUsd).replace(',', '.')) || 0
  const abonoSolicitado = parseFloat(String(abonoMonto).replace(',', '.')) || 0
  const cobroMoneda = cobroEsMixto
    ? 'USD'
    : (COBRO_PAYMENT_OPTIONS.find(o => o.value === cobroMetodo) || {}).currency || 'BS'
  const cobroEsBs = !cobroEsMixto && cobroMoneda === 'BS'
  const abonoSolicitadoUsd = cobroEsBs && cobroTasa ? abonoSolicitado / cobroTasa : abonoSolicitado
  const montoAbonar = abonoActivo && abonoSolicitado > 0 ? Math.min(abonoSolicitadoUsd, cobroSaldo) : cobroSaldo
  const cobroRecibeTotal = cobroEsMixto && cobroTasa ? cRecUsd + cRecBs / cobroTasa : 0
  const cobroFaltaUsd = cobroEsMixto && cobroRecibeTotal > 0 ? Math.max(montoAbonar - cobroRecibeTotal, 0) : null
  const cobroInsuficiente = cobroEsMixto && cobroRecibeTotal > 0 && cobroFaltaUsd > 0.005
  const abonoExcede = abonoActivo && abonoSolicitado > 0 && abonoSolicitadoUsd > cobroSaldo + 0.005

  const handleRegistrarCobro = async () => {
    if (!cuentaSeleccionada) return
    if (!cobroMetodo) {
      setSnack({ open: true, msg: 'Selecciona el método de pago con el que cancela el cliente', severity: 'error' })
      return
    }
    if (abonoExcede) {
      setSnack({ open: true, msg: `El abono excede el saldo pendiente (${money(cobroSaldo, 'USD')})`, severity: 'error' })
      return
    }
    if (cobroInsuficiente) {
      setSnack({ open: true, msg: 'Los montos recibidos no cubren el monto a abonar', severity: 'error' })
      return
    }
    if (cobroNecesitaRef && !cobroRef.trim()) {
      setSnack({ open: true, msg: `Ingresa la referencia bancaria del pago (${cobroMetodoRef})`, severity: 'error' })
      return
    }
    setPagando(true)
    try {
      const payload = {
        payment_method: cobroEsMixto ? `Mixto ($ + ${cobroMixtoBs})` : cobroMetodo,
        reference: cobroNecesitaRef ? (cobroRef.trim() || null) : null,
        ...(abonoActivo && abonoSolicitado > 0 ? { monto_usd: abonoSolicitadoUsd } : {}),
        ...(cobroEsMixto ? { received_usd: cRecUsd, received_bs: cRecBs } : {}),
      }
      await registrarCobro(cuentaSeleccionada.id, payload)
      const completa = !abonoActivo || abonoSolicitadoUsd >= cobroSaldo - 0.005
      setSnack({
        open: true,
        msg: completa
          ? `Cuenta #${cuentaSeleccionada.id} pagada por completo`
          : `Abono de ${money(montoAbonar, 'USD')} registrado · saldo ${money(Math.max(cobroSaldo - montoAbonar, 0), 'USD')}`,
        severity: 'success',
      })
      setConfirmOpen(false)
      setCuentaSeleccionada(null)
      loadData()
    } catch (err) {
      setSnack({ open: true, msg: mensajeError(err, 'Error al registrar el cobro'), severity: 'error' })
    } finally { setPagando(false) }
  }

  const handleMarcarNotificadas = async () => {
    const ids = proximasVencer.filter(c => !c.notified).map(c => c.id)
    if (ids.length === 0) return
    try {
      await marcarNotificadas(ids)
      setProximasVencer(prev => prev.map(c => ({ ...c, notified: true })))
      setNotifOpen(false)
    } catch {}
  }

  /* ── Edición y eliminación de cuentas (solo admin) ── */
  const openEditDialog = (c) => {
    if (!isAdmin) return
    setEditCuenta(c)
    setEditCliente(c.client_name || '')
    setEditPlazo(c.days_term || 15)
    setEditNotas(c.notes || '')
    setEditOpen(true)
  }

  const nuevoVencimiento = (() => {
    if (!editCuenta) return null
    // aFechaVE + sin toISOString: el ISO devuelve la fecha en UTC y, en
    // Venezuela (UTC-4), adelanta un día para vencimientos de medianoche.
    const ancla = aFechaVE(editCuenta.due_date || editCuenta.created_at)
    const delta = editPlazo - (editCuenta.days_term || 0)
    ancla.setDate(ancla.getDate() + delta)
    return formatFechaCorta(ancla)
  })()

  const handleEditSave = async () => {
    if (!editCuenta) return
    if (!editCliente.trim()) {
      setSnack({ open: true, msg: 'El nombre del cliente es obligatorio', severity: 'error' })
      return
    }
    setEditSaving(true)
    try {
      await actualizarCuenta(editCuenta.id, {
        client_name: editCliente.trim(),
        days_term: editPlazo,
        notes: editNotas.trim() || null,
      })
      setSnack({ open: true, msg: `Cuenta #${editCuenta.id} actualizada exitosamente`, severity: 'success' })
      setEditOpen(false)
      setEditCuenta(null)
      loadData()
    } catch (err) {
      setSnack({ open: true, msg: mensajeError(err, 'Error al actualizar la cuenta'), severity: 'error' })
    } finally {
      setEditSaving(false)
    }
  }

  const confirmDelete = (c) => {
    if (!isAdmin) return
    setDeleteTarget(c)
    setDeleteOpen(true)
  }

  const handleDeleteConfirmado = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await eliminarCuenta(deleteTarget.id)
      setSnack({
        open: true,
        msg: `Cuenta #${deleteTarget.id} eliminada junto con su venta. Stock devuelto.`,
        severity: 'success',
      })
      setDeleteOpen(false)
      setDeleteTarget(null)
      loadData()
    } catch (err) {
      setSnack({ open: true, msg: mensajeError(err, 'Error al eliminar la cuenta'), severity: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  /* ── Abrir dialogo de nueva venta a crédito ── */
  const openCreditDialog = async () => {
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
    setClientName('')
    setDaysTerm(15)
    setShowResults(false)
    setCreditDialogOpen(true)
    setTimeout(() => searchRef.current?.focus(), 200)
  }

  /* ── Lógica del carrito ── */
  const filtered = search.trim()
    ? productos.filter(p => {
        const q = search.toLowerCase()
        return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q))
      })
    : []

  const addToCart = useCallback((producto) => {
    const esPeso = producto.sale_unit === 'peso'
    setCart(prev => {
      const existing = prev.find(c => c.product_id === producto.id)
      if (existing) {
        if (esPeso) return prev
        return prev.map(c => c.product_id === producto.id ? { ...c, unitQty: c.unitQty + 1 } : c)
      }
      return [...prev, {
        product_id: producto.id, name: producto.name, barcode: producto.barcode,
        sale_price: producto.sale_price, sale_unit: producto.sale_unit,
        unitQty: esPeso ? 0 : 1, weightG: esPeso ? 1000 : 0, max_stock: producto.stock,
      }]
    })
    setSearch('')
    setShowResults(false)
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [])

  const updateQuantity = (productId, delta) => {
    setCart(prev => prev.map(c => {
      if (c.product_id !== productId) return c
      const next = c.unitQty + delta
      if (next < 1 || (c.max_stock !== undefined && next > c.max_stock)) return c
      return { ...c, unitQty: next }
    }))
  }

  const setQuantity = (productId, value) => {
    const n = parseInt(value, 10)
    if (isNaN(n)) return
    setCart(prev => prev.map(c => {
      if (c.product_id !== productId) return c
      let next = Math.max(1, n)
      if (c.max_stock !== undefined && next > c.max_stock) next = c.max_stock
      return { ...c, unitQty: next }
    }))
  }

  const updateWeight = (productId, grams) => {
    setCart(prev => prev.map(c => c.product_id === productId ? { ...c, weightG: grams } : c))
  }

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(c => c.product_id !== productId))
  }

  const subtotalDe = (c) =>
    c.sale_unit === 'peso' ? c.sale_price * ((c.weightG || 0) / 1000) : c.sale_price * c.unitQty

  const totalUSD = cart.reduce((sum, c) => sum + subtotalDe(c), 0)
  const tasaActual = tasa || 0
  // La deuda queda denominada en dólares: el método de pago se elige al cobrar
  const totalCobrar = totalUSD
  const itemsCount = cart.reduce((sum, c) => sum + (c.sale_unit === 'peso' ? 1 : c.unitQty), 0)

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && filtered.length === 1) { addToCart(filtered[0]); e.preventDefault() }
    if (e.key === 'Escape') setShowResults(false)
  }

  const handleSearchChange = (e) => {
    const val = e.target.value
    setSearch(val)
    setShowResults(val.trim().length > 0)
    if (val.trim()) {
      const exactBarcode = productos.find(p => p.barcode && p.barcode.toLowerCase() === val.trim().toLowerCase())
      if (exactBarcode) addToCart(exactBarcode)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (resultsRef.current && !resultsRef.current.contains(e.target) &&
          searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCreateCredit = async () => {
    if (cart.length === 0) { setSnack({ open: true, msg: 'Agrega al menos un producto', severity: 'error' }); return }
    if (!clientName.trim()) { setSnack({ open: true, msg: 'El nombre del cliente es obligatorio', severity: 'error' }); return }
    if (!tasaActual) { setSnack({ open: true, msg: 'No se pudo obtener la tasa del BCV', severity: 'error' }); return }
    const pesoVacio = cart.find(c => c.sale_unit === 'peso' && (!c.weightG || c.weightG <= 0))
    if (pesoVacio) { setSnack({ open: true, msg: `Ingresa el peso en gramos para "${pesoVacio.name}"`, severity: 'error' }); return }
    const sinStock = cart.find(c => c.sale_unit === 'peso' && c.max_stock != null && (c.weightG || 0) > c.max_stock)
    if (sinStock) { setSnack({ open: true, msg: `Stock insuficiente para "${sinStock.name}"`, severity: 'error' }); return }
    setSubmitting(true)
    try {
      await createVenta({
        payment_method: 'Crédito', client_name: clientName.trim(), reference: null,
        currency: 'USD', rate: tasaActual, received_bs: null, received_usd: null,
        change_bs: null, change_usd: null, is_credit: true, days_term: daysTerm,
        items: cart.map(c => c.sale_unit === 'peso'
          ? { product_id: c.product_id, quantity: Math.round(c.weightG || 0) }
          : { product_id: c.product_id, quantity: c.unitQty }),
      })
      setSnack({ open: true, msg: 'Venta a crédito registrada exitosamente', severity: 'success' })
      setCreditDialogOpen(false)
      loadData()
    } catch (err) {
      setSnack({ open: true, msg: mensajeError(err, 'Error al registrar venta a crédito'), severity: 'error' })
    } finally { setSubmitting(false) }
  }

  const fechaVencimiento = (() => {
    const d = new Date(); d.setDate(d.getDate() + daysTerm)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  })()

  /* ──────────────────────────────────────────────
     Render
     ────────────────────────────────────────────── */
  return (
    <Box component="main" aria-label="Gestión de créditos">
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3.5, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ animation: 'fade-in-up 0.5s ease-out both' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <AccountBalanceWallet sx={{ fontSize: 28, color: '#C9952A' }} aria-hidden="true" />
            <Typography variant="h4" component="h1" sx={{
              fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2C1810',
              fontSize: { xs: '1.5rem', sm: '1.85rem' },
            }}>
              Créditos
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6B5344', ml: 0.5 }}>
            Ventas a crédito y cuentas por cobrar
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddCircle />}
          onClick={openCreditDialog}
          aria-label="Nueva venta a crédito"
          sx={{
            background: 'linear-gradient(135deg, #2D5A1E 0%, #1E4A14 100%)',
            '&:hover': { background: 'linear-gradient(135deg, #3A7A28 0%, #2D5A1E 100%)', transform: 'translateY(-1px)', boxShadow: '0 6px 20px rgba(45, 90, 30, 0.4)' },
            px: 3.5, py: 1.2, borderRadius: 2.5, fontSize: '0.9rem', fontWeight: 600,
            boxShadow: '0 4px 14px rgba(45, 90, 30, 0.3)', transition: 'all 0.2s ease',
            animation: 'fade-in-up 0.5s ease-out 0.15s both',
          }}
        >
          Nueva Venta a Crédito
        </Button>
      </Box>

      {/* ── Notificación de cuentas próximas a vencer ── */}
      {notifOpen && proximasVencer.filter(c => !c.notified).length > 0 && (
        <Alert
          severity="warning"
          onClose={() => setNotifOpen(false)}
          role="status"
          aria-live="polite"
          action={
            <Button color="inherit" size="small" onClick={handleMarcarNotificadas} aria-label="Marcar notificaciones como vistas">
              Marcar como vistas
            </Button>
          }
          sx={{ mb: 2, borderRadius: 2, animation: 'fade-in-up 0.4s ease-out both' }}
        >
          <Typography sx={{ fontWeight: 600 }}>
            {proximasVencer.filter(c => !c.notified).length} cuenta(s) proxima(s) a vencerse
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {proximasVencer.filter(c => !c.notified).map(c =>
              `${c.client_name} (vence en ${diasRestantes(c.due_date)} días)`
            ).join(' · ')}
          </Typography>
        </Alert>
      )}

      {/* ── Tarjetas de resumen ── */}
      {resumen && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, mb: 3 }} role="region" aria-label="Resumen de créditos">
          <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid rgba(198, 40, 40, 0.15)', animation: 'fade-in-up 0.4s ease-out both' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'rgba(198, 40, 40, 0.1)', color: '#C62828' }} aria-hidden="true"><Pending /></Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Pendientes</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: '#C62828' }}>{resumen.total_pendiente}</Typography>
              </Box>
            </Box>
          </Paper>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid rgba(198, 40, 40, 0.15)', animation: 'fade-in-up 0.4s ease-out 0.1s both' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'rgba(198, 40, 40, 0.1)', color: '#C62828' }} aria-hidden="true">💵</Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Saldo Pendiente</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#C62828' }}>${formatNumber(resumen.monto_pendiente_usd)}</Typography>
                <Typography variant="caption" sx={{ color: '#6B5344' }}>Bs. {formatNumber(resumen.monto_pendiente_bs)}</Typography>
              </Box>
            </Box>
          </Paper>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid rgba(45, 90, 30, 0.15)', animation: 'fade-in-up 0.4s ease-out 0.2s both' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'rgba(45, 90, 30, 0.1)', color: '#2D5A1E' }} aria-hidden="true"><CheckCircle /></Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Pagadas</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: '#2D5A1E' }}>{resumen.total_pagado}</Typography>
              </Box>
            </Box>
          </Paper>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid rgba(45, 90, 30, 0.15)', animation: 'fade-in-up 0.4s ease-out 0.3s both' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'rgba(45, 90, 30, 0.1)', color: '#2D5A1E' }} aria-hidden="true">💰</Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Total Cobrado</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#2D5A1E' }}>${formatNumber(resumen.monto_pagado_usd)}</Typography>
                <Typography variant="caption" sx={{ color: '#6B5344' }}>Bs. {formatNumber(resumen.monto_pagado_bs)}</Typography>
              </Box>
            </Box>
          </Paper>
        </Box>
      )}

      {/* ── Filtros y búsqueda ── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="filtro-estado-label" sx={{ color: '#6B5344' }}>Filtrar por estado</InputLabel>
          <Select
            labelId="filtro-estado-label"
            value={filtro}
            label="Filtrar por estado"
            onChange={e => setFiltro(e.target.value)}
            slotProps={{ input: { 'aria-label': 'Filtrar cuentas por estado' } }}
            sx={{
              borderRadius: 2, bgcolor: '#FFF8F0',
              '& fieldset': { borderColor: 'rgba(201, 149, 42, 0.25)' },
              '&:hover fieldset': { borderColor: 'rgba(201, 149, 42, 0.4)' },
              '&.Mui-focused fieldset': { borderColor: '#C9952A' },
            }}
          >
            <MenuItem value="pendiente">Pendientes</MenuItem>
            <MenuItem value="pagado">Pagadas</MenuItem>
            <MenuItem value="">Todas</MenuItem>
          </Select>
        </FormControl>
        <TextField
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por #, cliente o venta..."
          size="small"
          sx={{
            flex: 1, minWidth: 200,
            '& .MuiInputBase-root': { borderRadius: 2 },
            '& fieldset': { borderColor: 'rgba(201, 149, 42, 0.25)' },
            '& .Mui-focused fieldset': { borderColor: '#C9952A' },
          }}
          slotProps={{ input: { startAdornment: <Search sx={{ color: '#C9952A', mr: 1, fontSize: 20 }} aria-hidden="true" />, 'aria-label': 'Buscar cuentas por cobrar' } }}
        />
      </Box>

      {/* ── Tabla de cuentas por cobrar ── */}
      <TableContainer
        component={Paper}
        role="region"
        aria-label="Listado de cuentas por cobrar"
        sx={{
          borderRadius: 3, border: '1px solid rgba(201, 149, 42, 0.06)',
          boxShadow: '0 1px 4px rgba(44, 24, 16, 0.06)',
          animation: 'fade-in-up 0.5s ease-out 0.2s both', overflow: 'hidden',
        }}
      >
        <Table aria-label="Cuentas por cobrar">
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8F5F0' }}>
              {['#', 'Fecha', 'Venta #', 'Cliente', 'Moneda', 'Total', 'Vence', 'Estado', 'Acciones'].map(h => (
                <TableCell key={h} scope="col" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', ...(h === 'Total' || h === 'Acciones' ? { align: h === 'Total' ? 'right' : 'center' } : {}) }}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {actuales.map((c) => {
              const dias = c.status === 'pendiente' ? diasRestantes(c.due_date) : null
              return (
                <TableRow key={c.id} sx={rowSx}>
                  <TableCell><Chip label={`#${c.id}`} size="small" sx={{ bgcolor: 'rgba(45, 90, 30, 0.1)', color: '#2D5A1E', fontWeight: 700, fontSize: '0.7rem', borderRadius: 1.5 }} /></TableCell>
                  <TableCell sx={{ color: '#6B5344', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatFecha(c.created_at)}</TableCell>
                  <TableCell><Chip label={`Venta #${c.sale_id}`} size="small" sx={{ bgcolor: 'rgba(201, 149, 42, 0.1)', color: '#C9952A', fontWeight: 600, fontSize: '0.7rem', borderRadius: 1.5 }} /></TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: '#2C1810', fontWeight: 500 }}>{c.client_name}</TableCell>
                  <TableCell><Chip label={c.currency === 'BS' ? 'Bs.' : 'USD'} size="small" variant="outlined" sx={{ borderColor: 'rgba(201, 149, 42, 0.25)', color: '#6B5344', fontWeight: 500, fontSize: '0.75rem' }} /></TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontWeight: 700, color: '#2C1810', fontSize: '0.9rem' }}>
                      {c.currency === 'BS' ? `Bs. ${formatNumber(c.total_bs)}` : `$ ${formatNumber(c.total_usd)}`}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem' }}>
                      {c.currency === 'BS' ? `$ ${formatNumber(c.total_usd)}` : `Bs. ${formatNumber(c.total_bs)}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {c.status === 'pendiente' && c.due_date ? (
                      <Chip
                        icon={<Schedule sx={{ fontSize: 14, color: `${vencimientoColor(dias)} !important` }} />}
                        label={dias !== null
                          ? dias < 0 ? `Vencida (${Math.abs(dias)}d)` : dias === 0 ? 'Vence hoy' : `${dias} días`
                          : formatFechaCorta(c.due_date)}
                        size="small"
                        aria-label={`Vence: ${formatFechaCorta(c.due_date)}, ${dias !== null ? (dias < 0 ? `vencida hace ${Math.abs(dias)} días` : `${dias} días restantes`) : ''}`}
                        sx={{ bgcolor: vencimientoBg(dias), color: vencimientoColor(dias), fontWeight: 600, fontSize: '0.7rem', '& .MuiChip-icon': { color: `${vencimientoColor(dias)} !important` } }}
                      />
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={c.status === 'pagado' ? <CheckCircle sx={{ fontSize: 14 }} /> : <Pending sx={{ fontSize: 14 }} />}
                      label={c.status === 'pagado'
                        ? 'Pagado'
                        : (c.pagos?.length > 0
                          ? `Parcial · falta ${money(c.saldo_usd ?? c.total_usd, 'USD')}`
                          : 'Pendiente')}
                      size="small"
                      sx={{
                        bgcolor: c.status === 'pagado'
                          ? 'rgba(45, 90, 30, 0.1)'
                          : (c.pagos?.length > 0 ? 'rgba(249, 168, 37, 0.12)' : 'rgba(198, 40, 40, 0.08)'),
                        color: c.status === 'pagado'
                          ? '#2D5A1E'
                          : (c.pagos?.length > 0 ? '#B8860B' : '#C62828'),
                        fontWeight: 600, fontSize: '0.75rem',
                      }}
                    />
                    {c.status === 'pagado' && c.payment_method && (
                      <Typography variant="caption" sx={{ display: 'block', color: '#6B5344', fontSize: '0.62rem', mt: 0.3 }}>
                        {c.payment_method}{c.reference ? ` · Ref ${c.reference}` : ''}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      <IconButton size="small" onClick={() => { setDetailCuenta(c); setDetailOpen(true) }} aria-label={`Ver detalle de cuenta #${c.id}`} sx={{ color: '#C9952A', '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.1)' } }}>
                        <Visibility fontSize="small" />
                      </IconButton>
                      {isAdmin && (
                        <IconButton size="small" onClick={() => openEditDialog(c)} aria-label={`Editar cuenta #${c.id}`} sx={{ color: '#2D5A1E', '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.1)' } }}>
                          <Edit fontSize="small" />
                        </IconButton>
                      )}
                      {isAdmin && (
                        <IconButton size="small" onClick={() => confirmDelete(c)} aria-label={`Eliminar cuenta #${c.id}`} sx={{ color: '#C62828', '&:hover': { bgcolor: 'rgba(198, 40, 40, 0.1)' } }}>
                          <Delete fontSize="small" />
                        </IconButton>
                      )}
                      {c.status === 'pendiente' && (
                        <Button size="small" variant="contained" startIcon={<CheckCircle sx={{ fontSize: 14 }} />}
                          onClick={() => openCobroDialog(c)}
                          aria-label={`Registrar cobro de la cuenta #${c.id}`}
                          sx={{ bgcolor: '#2D5A1E', borderRadius: 2, fontSize: '0.7rem', fontWeight: 600, '&:hover': { bgcolor: '#3A7A28' }, textTransform: 'none' }}>
                          Cobrar
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              )
            })}
            {cuentasFiltradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} sx={{ py: 6 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Avatar sx={{ width: 56, height: 56, bgcolor: 'rgba(45, 90, 30, 0.08)', mx: 'auto', mb: 1.5 }} aria-hidden="true">
                      <AccountBalanceWallet sx={{ fontSize: 28, color: '#2D5A1E' }} />
                    </Avatar>
                    <Typography sx={{ color: '#6B5344', fontWeight: 500, mb: 0.5 }}>
                      {busqueda.trim() ? 'No se encontraron cuentas para tu búsqueda' : 'No hay cuentas por cobrar'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6B5344', opacity: 0.6 }}>
                      {busqueda.trim() ? 'Prueba con otro término' : 'Crea una venta a crédito usando el botón de arriba'}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Paginador page={page} rowsPerPage={rowsPerPage} total={total} onPageChange={handleChangePage} onRowsPerPageChange={handleChangeRowsPerPage} />
      </TableContainer>

      {/* ══════════════════════════════════════════════════
          DIALOG: Nueva Venta a Crédito
          ══════════════════════════════════════════════════ */}
      <Dialog
        open={creditDialogOpen}
        onClose={() => setCreditDialogOpen(false)}
        maxWidth="md" fullWidth
        slots={{ transition: Slide }}
        slotProps={{
          paper: { sx: { borderRadius: 3, overflow: 'hidden', minHeight: 500 } },
          transition: { direction: 'up' },
        }}
        aria-labelledby="credit-dialog-title"
      >
        <DialogTitle id="credit-dialog-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#2D5A1E', color: '#FFF8F0', py: 2, px: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CreditCard sx={{ fontSize: 22 }} aria-hidden="true" />
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, fontSize: '1.15rem' }}>
              Nueva Venta a Crédito
            </Typography>
          </Box>
          <IconButton onClick={() => setCreditDialogOpen(false)} size="small" aria-label="Cerrar formulario" sx={{ color: 'rgba(255, 248, 240, 0.6)', '&:hover': { color: '#FFF8F0', bgcolor: 'rgba(255,248,240,0.1)' } }}>
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Buscador de productos */}
          <Box sx={{ position: 'relative', px: 3, pt: 3, pb: 0 }}>
            <TextField
              inputRef={searchRef}
              placeholder="Buscar producto por nombre o código de barras..."
              value={search}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => search.trim() && setShowResults(true)}
              fullWidth variant="outlined"
              slotProps={{
                input: {
                  startAdornment: <Search sx={{ fontSize: 20, color: '#6B5344', mr: 1, opacity: 0.5 }} aria-hidden="true" />,
                  endAdornment: search.trim()
                    ? <IconButton size="small" onClick={() => { setSearch(''); setShowResults(false) }} aria-label="Limpiar búsqueda"><Close fontSize="small" sx={{ color: '#6B5344' }} /></IconButton>
                    : <QrCodeScanner sx={{ fontSize: 20, color: '#6B5344', opacity: 0.3 }} aria-hidden="true" />,
                  sx: { borderRadius: 2.5, py: 0.8, fontSize: '0.95rem', bgcolor: '#F8F5F0', '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.15)' }, '&:hover fieldset': { borderColor: 'rgba(45, 90, 30, 0.3)' }, '&.Mui-focused fieldset': { borderColor: '#2D5A1E', borderWidth: 2 } },
                  'aria-label': 'Buscar producto',
                  role: 'combobox',
                  'aria-expanded': showResults && filtered.length > 0,
                  'aria-controls': 'product-search-listbox',
                },
              }}
            />
            {showResults && filtered.length > 0 && (
              <Paper ref={resultsRef} id="product-search-listbox" role="listbox" aria-label="Productos encontrados"
                sx={{ position: 'absolute', top: '100%', left: 24, right: 24, zIndex: 10, maxHeight: 220, overflow: 'auto', mt: 0.5, borderRadius: 2, boxShadow: '0 8px 24px rgba(44, 24, 16, 0.12)', border: '1px solid rgba(45, 90, 30, 0.1)', animation: 'fade-in-up 0.15s ease-out both' }}>
                {filtered.map(p => (
                  <Box key={p.id} role="option" tabIndex={0} aria-selected={false}
                    onClick={() => addToCart(p)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addToCart(p) } }}
                    sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5, cursor: 'pointer', transition: 'background 0.1s ease', borderBottom: '1px solid rgba(44, 24, 16, 0.04)', '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.08)' }, '&:focus-visible': { outline: '2px solid #2D5A1E', outlineOffset: '-2px' }, '&:last-of-type': { borderBottom: 'none' } }}>
                    <Avatar sx={{ width: 36, height: 36, bgcolor: 'rgba(45, 90, 30, 0.12)', color: '#2D5A1E', fontWeight: 700, fontSize: '0.85rem' }} aria-hidden="true">{p.name.charAt(0).toUpperCase()}</Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2C1810' }}>{p.name}</Typography>
                      <Typography variant="caption" sx={{ color: '#6B5344' }}>{p.barcode ? `Código: ${p.barcode} · ` : ''}Stock: {p.stock}</Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 700, color: '#2D5A1E', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{money(p.sale_price, 'USD')}{p.sale_unit === 'peso' ? '/kg' : ''}</Typography>
                    <AddCircle sx={{ fontSize: 20, color: '#2D5A1E', ml: 1 }} aria-hidden="true" />
                  </Box>
                ))}
              </Paper>
            )}
            {showResults && search.trim() && filtered.length === 0 && (
              <Paper sx={{ position: 'absolute', top: '100%', left: 24, right: 24, zIndex: 10, mt: 0.5, borderRadius: 2, p: 2, textAlign: 'center', boxShadow: '0 8px 24px rgba(44, 24, 16, 0.12)' }}>
                <Typography variant="body2" sx={{ color: '#6B5344' }}>No se encontraron productos para "<b>{search}</b>"</Typography>
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
                size="small" required
                placeholder="Obligatorio para crédito"
                slotProps={{ htmlInput: { 'aria-required': 'true' } }}
                sx={{ flex: 1, minWidth: 180, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#F8F5F0', '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.3)' }, '&:hover fieldset': { borderColor: '#2D5A1E' }, '&.Mui-focused fieldset': { borderColor: '#2D5A1E' } } }}
              />
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel id="plazo-pago-label" sx={{ color: '#6B5344' }}>Plazo de pago</InputLabel>
                <Select labelId="plazo-pago-label" value={daysTerm} label="Plazo de pago" onChange={e => setDaysTerm(e.target.value)}
                  slotProps={{ select: { 'aria-label': 'Plazo de pago en días' } }}
                  sx={{ borderRadius: 2, bgcolor: '#F8F5F0', '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.3)' }, '&:hover fieldset': { borderColor: '#2D5A1E' }, '&.Mui-focused fieldset': { borderColor: '#2D5A1E' } }}>
                  {TERM_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}><CalendarMonth sx={{ fontSize: 18, mr: 1, color: '#2D5A1E' }} aria-hidden="true" />{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Box>

          <Divider sx={{ mx: 3, my: 2 }} />

          {/* Carrito */}
          <Box sx={{ flex: 1, px: 3, overflow: 'auto', minHeight: 180 }}>
            {cart.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <ShoppingCart sx={{ fontSize: 48, color: '#A5C49B', mb: 1, opacity: 0.4 }} aria-hidden="true" />
                <Typography sx={{ color: '#6B5344', fontWeight: 500 }}>Carrito vacío</Typography>
                <Typography variant="body2" sx={{ color: '#6B5344', opacity: 0.5 }}>Busca productos arriba para agregarlos</Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Receipt sx={{ fontSize: 18, color: '#6B5344', opacity: 0.5 }} aria-hidden="true" />
                  <Typography sx={{ fontWeight: 600, color: '#2C1810', fontSize: '0.85rem' }}>Carrito ({itemsCount} item{itemsCount !== 1 ? 's' : ''})</Typography>
                </Box>
                <Table size="small" aria-label="Productos en el carrito">
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
                      <TableRow key={c.product_id} sx={{ animation: `fade-in-up 0.2s ease-out ${i * 0.03}s both`, '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.03)' } }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontWeight: 500, fontSize: '0.85rem', color: '#2C1810' }}>{c.name}</Typography>
                            {c.barcode && <Chip label={c.barcode} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.6rem', borderColor: 'rgba(45, 90, 30, 0.2)', color: '#6B5344', display: { xs: 'none', sm: 'inline-flex' } }} />}
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={{ color: '#6B5344', fontSize: '0.85rem' }}>{money(c.sale_price, 'USD')}{c.sale_unit === 'peso' ? ' /kg' : ''}</TableCell>
                        <TableCell align="center">
                          {c.sale_unit === 'peso' ? (
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                              <TextField size="small" type="number" value={Number.isFinite(c.weightG) ? c.weightG : 0}
                                onChange={e => updateWeight(c.product_id, Math.round(parseFloat(e.target.value) || 0))}
                                slotProps={{ htmlInput: { min: 0, step: 50, 'aria-label': `Peso en gramos de ${c.name}` } }}
                                sx={{ width: 100, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.85rem', bgcolor: 'rgba(45, 90, 30, 0.04)', '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.2)' }, '&:hover fieldset': { borderColor: 'rgba(45, 90, 30, 0.4)' }, '&.Mui-focused fieldset': { borderColor: '#2D5A1E' } } }} />
                              <Typography sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#2D5A1E' }}>g</Typography>
                            </Box>
                          ) : (
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
                              <IconButton size="small" onClick={() => updateQuantity(c.product_id, -1)} disabled={c.unitQty <= 1} aria-label={`Disminuir cantidad de ${c.name}`} sx={{ color: '#6B5344', '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.1)' } }}><RemoveCircle fontSize="small" /></IconButton>
                              <TextField size="small" type="number" value={c.unitQty} onChange={e => setQuantity(c.product_id, e.target.value)}
                                slotProps={{ htmlInput: { min: 1, 'aria-label': `Cantidad de ${c.name}` } }}
                                sx={{ width: 68, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.9rem', fontWeight: 700, color: '#2C1810', textAlign: 'center', '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.15)' }, '&:hover fieldset': { borderColor: 'rgba(45, 90, 30, 0.3)' }, '&.Mui-focused fieldset': { borderColor: '#2D5A1E' } } }} />
                              <IconButton size="small" onClick={() => updateQuantity(c.product_id, 1)} disabled={c.max_stock !== undefined && c.unitQty >= c.max_stock} aria-label={`Aumentar cantidad de ${c.name}`} sx={{ color: '#2D5A1E', '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.1)' } }}><AddCircle fontSize="small" /></IconButton>
                            </Box>
                          )}
                        </TableCell>
                        <TableCell align="right"><Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#2C1810' }}>{money(subtotalDe(c), 'USD')}</Typography></TableCell>
                        <TableCell sx={{ p: 0.5 }}>
                          <IconButton size="small" onClick={() => removeFromCart(c.product_id)} aria-label={`Eliminar ${c.name} del carrito`} sx={{ color: '#C62828', opacity: 0.5, '&:hover': { opacity: 1, bgcolor: 'rgba(198, 40, 40, 0.08)' } }}><Delete fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Box>

          {/* Footer: Info + Total + Acciones */}
          <Box sx={{ borderTop: '1px solid rgba(45, 90, 30, 0.1)', bgcolor: '#F0F7EC', px: 3, py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Alert severity="info" sx={{ borderRadius: 2, bgcolor: 'rgba(45, 90, 30, 0.06)', border: '1px solid rgba(45, 90, 30, 0.2)' }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2D5A1E' }}>Venta a Crédito</Typography>
                  <Typography variant="body2" sx={{ color: '#6B5344', mt: 0.5 }}>El cliente pagará después. Se reflejará en ventas diarias y cuentas por cobrar.</Typography>
                </Alert>
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'rgba(45, 90, 30, 0.04)', border: '1px dashed rgba(45, 90, 30, 0.2)' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B5344' }}><strong>Cliente:</strong> {clientName || '—'}</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B5344' }}><strong>Deuda:</strong> en dólares ($), el método de pago se elige al cobrar</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B5344' }}><strong>Plazo:</strong> {daysTerm} días (vence: {fechaVencimiento})</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B5344' }}><strong>Saldo:</strong> {money(totalCobrar, 'USD')}</Typography>
                </Box>
              </Box>
              <Box sx={{ textAlign: 'right', minWidth: 160 }}>
                <Typography variant="caption" sx={{ color: '#6B5344', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>Total a cobrar</Typography>
                <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: totalUSD > 0 ? '#2D5A1E' : '#6B5344', fontSize: '1.5rem', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{money(totalCobrar, 'USD')}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#6B5344' }}>(≈ Bs. {formatNumber(totalUSD * tasaActual)} · tasa {tasaActual ? `Bs. ${tasaActual}` : 's/tasa'})</Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2 }}>
              <Button onClick={() => setCreditDialogOpen(false)} sx={{ color: '#6B5344', fontWeight: 500, borderRadius: 2, px: 3, '&:hover': { bgcolor: 'rgba(107,83,68,0.08)' } }}>Cancelar</Button>
              <Button variant="contained" onClick={handleCreateCredit}
                disabled={cart.length === 0 || submitting || !tasaActual || !clientName.trim()}
                aria-label={`Registrar venta a crédito por ${money(totalCobrar, 'USD')}`}
                sx={{ background: 'linear-gradient(135deg, #2D5A1E 0%, #1E3D14 100%)', '&:hover': { background: 'linear-gradient(135deg, #3A7028 0%, #2D5A1E 100%)', transform: 'translateY(-1px)' }, px: 4, py: 1.2, borderRadius: 2, fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 4px 14px rgba(45, 90, 30, 0.3)', transition: 'all 0.2s ease', '&.Mui-disabled': { background: 'rgba(45, 90, 30, 0.3)', color: 'rgba(255, 248, 240, 0.5)' } }}>
                {submitting ? 'Registrando...' : `Registrar Crédito ${money(totalCobrar, 'USD')}`}
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════
          DIALOG: Registrar cobro (total o abono parcial)
          ══════════════════════════════════════════════════ */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} slotProps={{ paper: { sx: { borderRadius: 3, minWidth: 420 } } }} aria-labelledby="confirm-cobro-title">
        <DialogTitle id="confirm-cobro-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#2D5A1E', color: '#FFF8F0', py: 2, px: 3 }}>
          <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600 }}>Registrar Cobro</Typography>
          <IconButton onClick={() => setConfirmOpen(false)} aria-label="Cerrar" sx={{ color: 'rgba(255,248,240,0.6)' }}><Close fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {cuentaSeleccionada && (
            <Box>
              {/* Resumen de la deuda */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderRadius: 2, bgcolor: 'rgba(45, 90, 30, 0.04)', border: '1px solid rgba(45, 90, 30, 0.15)', mb: 2 }}>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6B5344' }}><strong>Cliente:</strong> {cuentaSeleccionada.client_name}</Typography>
                  <Typography variant="body2" sx={{ color: '#6B5344' }}>Venta #{cuentaSeleccionada.sale_id}{cuentaSeleccionada.due_date ? ` · Vence ${formatFechaCorta(cuentaSeleccionada.due_date)}` : ''}</Typography>
                  {cobroYaAbonado > 0.005 && (
                    <Typography variant="body2" sx={{ color: '#B8860B', fontWeight: 600 }}>
                      Ya abonado: {money(cobroYaAbonado, 'USD')} ({cuentaSeleccionada.pagos?.length || 0} pago{cuentaSeleccionada.pagos?.length === 1 ? '' : 's'})
                    </Typography>
                  )}
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" sx={{ color: '#6B5344', textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: '0.06em' }}>Saldo a cobrar</Typography>
                  <Typography sx={{ fontWeight: 700, color: '#2D5A1E', fontSize: '1.35rem', whiteSpace: 'nowrap' }}>{money(cobroSaldo, 'USD')}</Typography>
                  <Typography variant="caption" sx={{ color: '#6B5344' }}>
                    ≈ Bs. {formatNumber(cobroSaldo * (cobroTasa || 0))} · tasa del día
                  </Typography>
                </Box>
              </Box>

              {/* Método de pago */}
              <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                <InputLabel>Método de pago</InputLabel>
                <Select
                  value={cobroMetodo}
                  label="Método de pago"
                  onChange={e => setCobroMetodo(e.target.value)}
                  renderValue={(val) =>
                    val === 'Mixto'
                      ? `Mixto ($ + ${cobroMixtoBs})`
                      : (COBRO_PAYMENT_OPTIONS.find(o => o.value === val)?.label || val)}
                  sx={{ borderRadius: 2, bgcolor: '#FFF8F0' }}
                >
                  {COBRO_PAYMENT_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.icon} {opt.label}
                    </MenuItem>
                  ))}
                  <MenuItem value="Mixto">🔀 Mixto ($ efectivo + Bs)</MenuItem>
                </Select>
              </FormControl>

              {/* Mixto: método en Bs y montos entregados */}
              {cobroEsMixto && (
                <Box sx={{ mb: 1.5, display: 'grid', gap: 1.5 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Método de pago en Bolívares</InputLabel>
                    <Select
                      value={cobroMixtoBs}
                      label="Método de pago en Bolívares"
                      onChange={e => setCobroMixtoBs(e.target.value)}
                      sx={{ borderRadius: 2, bgcolor: '#FFF8F0' }}
                    >
                      {COBRO_PAYMENT_OPTIONS.filter(o => o.currency === 'BS').map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.icon} {opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <TextField
                      label="Recibe ($USD)" size="small" type="number"
                      value={cobroRecUsd} onChange={e => setCobroRecUsd(e.target.value)}
                      slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                    />
                    <TextField
                      label={`Recibe (Bs)${cobroTasa ? ` · tasa ${cobroTasa}` : ''}`} size="small" type="number"
                      value={cobroRecBs} onChange={e => setCobroRecBs(e.target.value)}
                      slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                    />
                  </Box>
                  {cobroRecibeTotal > 0 && (
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: cobroInsuficiente ? '#C62828' : '#2D5A1E' }}>
                      {cobroInsuficiente
                        ? `Faltan ${money(cobroFaltaUsd * cobroTasa, 'BS')} (${money(cobroFaltaUsd, 'USD')})`
                        : `Cubre ${money(Math.min(cobroRecibeTotal, montoAbonar), 'USD')}${cobroRecibeTotal > montoAbonar + 0.005 ? ` · sobra ${money(cobroRecibeTotal - montoAbonar, 'USD')}` : ''}`}
                    </Typography>
                  )}
                </Box>
              )}

              {/* Referencia bancaria */}
              {cobroNecesitaRef && (
                <TextField
                  label={`Referencia bancaria (${cobroMetodoRef})`}
                  size="small" fullWidth required
                  value={cobroRef} onChange={e => setCobroRef(e.target.value)}
                  placeholder="Ej: 00845123"
                  sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#FFF8F0' } }}
                />
              )}

              {/* Abono parcial (opcional) */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography sx={{ fontSize: '0.78rem', color: '#6B5344' }}>¿El cliente abona solo una parte?</Typography>
                <Switch size="small" checked={abonoActivo} onChange={e => { setAbonoActivo(e.target.checked); if (!e.target.checked) setAbonoMonto('') }} />
              </Box>
              {abonoActivo && (
                <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: '1fr auto', gap: 1.5, alignItems: 'start' }}>
                  <TextField
                    label={cobroEsBs ? 'Monto del abono (Bs)' : 'Monto del abono ($USD)'}
                    size="small" type="number"
                    value={abonoMonto} onChange={e => setAbonoMonto(e.target.value)}
                    error={abonoExcede}
                    helperText={abonoExcede
                      ? cobroEsBs
                        ? `No puede exceder el saldo (${money(cobroSaldo * (cobroTasa || 0), 'BS')})`
                        : `No puede exceder el saldo (${money(cobroSaldo, 'USD')})`
                      : cobroEsBs && abonoSolicitado > 0 && cobroTasa
                        ? `≈ ${money(abonoSolicitadoUsd, 'USD')}`
                        : ' '}
                    slotProps={{ htmlInput: { min: 0.01, max: cobroEsBs ? cobroSaldo * (cobroTasa || 0) : cobroSaldo, step: 0.01 } }}
                  />
                  <Box sx={{ textAlign: 'right', pt: 1 }}>
                    <Typography variant="caption" sx={{ color: '#6B5344', display: 'block' }}>Nuevo saldo tras el abono</Typography>
                    {cobroEsBs ? (
                      <>
                        <Typography sx={{ fontWeight: 700, color: '#C9952A' }}>
                          {money(Math.max((cobroSaldo - montoAbonar) * (cobroTasa || 0), 0), 'BS')}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#6B5344' }}>
                          {money(Math.max(cobroSaldo - montoAbonar, 0), 'USD')}
                        </Typography>
                      </>
                    ) : (
                      <>
                        <Typography sx={{ fontWeight: 700, color: '#C9952A' }}>
                          {money(Math.max(cobroSaldo - montoAbonar, 0), 'USD')}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#6B5344' }}>
                          ≈ Bs. {formatNumber(Math.max((cobroSaldo - montoAbonar) * (cobroTasa || 0), 0))}
                        </Typography>
                      </>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmOpen(false)} sx={{ color: '#6B5344' }}>Cancelar</Button>
          <Button variant="contained" onClick={handleRegistrarCobro}
            disabled={pagando || !cobroTasa || abonoExcede || cobroInsuficiente}
            startIcon={<CheckCircle />}
            sx={{ bgcolor: '#2D5A1E', borderRadius: 2, fontWeight: 600, '&:hover': { bgcolor: '#3A7A28' } }}>
            {pagando ? 'Procesando...' : (abonoActivo && abonoSolicitado > 0 && abonoSolicitadoUsd < cobroSaldo - 0.005)
              ? `Registrar Abono ${money(montoAbonar, 'USD')}`
              : 'Registrar Cobro Completo'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══════════════════════════════════════════════════
          DIALOG: Detalle de cuenta
          ══════════════════════════════════════════════════ */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }} aria-labelledby="detail-cuenta-title">
        <DialogTitle id="detail-cuenta-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#C9952A', color: '#FFF8F0', py: 2, px: 3 }}>
          <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600 }}>Detalle de Cuenta #{detailCuenta?.id}</Typography>
          <IconButton onClick={() => setDetailOpen(false)} aria-label="Cerrar detalle" sx={{ color: 'rgba(255,248,240,0.6)' }}><Close fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {detailCuenta && (
            <Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Cliente</Typography>
                  <Typography sx={{ fontWeight: 600, color: '#2C1810' }}>{detailCuenta.client_name}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Fecha</Typography>
                  <Typography sx={{ fontWeight: 600, color: '#2C1810' }}>{formatFecha(detailCuenta.created_at)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Venta Asociada</Typography>
                  <Typography sx={{ fontWeight: 600, color: '#C9952A' }}>#{detailCuenta.sale_id}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Estado</Typography>
                  <Chip icon={detailCuenta.status === 'pagado' ? <CheckCircle sx={{ fontSize: 14 }} /> : <Pending sx={{ fontSize: 14 }} />}
                    label={detailCuenta.status === 'pagado' ? 'Pagado' : 'Pendiente'} size="small"
                    sx={{ bgcolor: detailCuenta.status === 'pagado' ? 'rgba(45, 90, 30, 0.1)' : 'rgba(198, 40, 40, 0.08)', color: detailCuenta.status === 'pagado' ? '#2D5A1E' : '#C62828', fontWeight: 600 }} />
                </Box>
                {detailCuenta.due_date && (
                  <>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Plazo</Typography>
                      <Typography sx={{ fontWeight: 600, color: '#2C1810' }}>{detailCuenta.days_term} días</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Vencimiento</Typography>
                      <Typography sx={{ fontWeight: 600, color: vencimientoColor(diasRestantes(detailCuenta.due_date)) }}>
                        {formatFechaCorta(detailCuenta.due_date)}
                        {detailCuenta.status === 'pendiente' && diasRestantes(detailCuenta.due_date) !== null && (
                          <Typography component="span" sx={{ ml: 1, fontSize: '0.75rem', fontWeight: 500 }}>
                            ({diasRestantes(detailCuenta.due_date) < 0 ? `Vencida hace ${Math.abs(diasRestantes(detailCuenta.due_date))} días` : diasRestantes(detailCuenta.due_date) === 0 ? 'Vence hoy' : `${diasRestantes(detailCuenta.due_date)} días restantes`})
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                  </>
                )}
              </Box>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(201, 149, 42, 0.04)', border: '1px solid rgba(201, 149, 42, 0.15)' }}>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Monto Total</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1.5rem', color: '#2C1810' }}>
                  {detailCuenta.currency === 'BS' ? `Bs. ${formatNumber(detailCuenta.total_bs)}` : `$ ${formatNumber(detailCuenta.total_usd)}`}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B5344' }}>
                  Equivalente: {detailCuenta.currency === 'BS' ? `$ ${formatNumber(detailCuenta.total_usd)}` : `Bs. ${formatNumber(detailCuenta.total_bs)}`}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B5344', mt: 0.5 }}>Tasa BCV: {detailCuenta.rate_usd ? `Bs. ${detailCuenta.rate_usd}` : '—'}</Typography>
              </Box>
              {detailCuenta.status === 'pagado' && detailCuenta.paid_at && (
                <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: 'rgba(45, 90, 30, 0.04)', border: '1px solid rgba(45, 90, 30, 0.15)' }}>
                  <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Fecha de Pago</Typography>
                  <Typography sx={{ fontWeight: 600, color: '#2D5A1E' }}>{formatFecha(detailCuenta.paid_at)}</Typography>
                  {detailCuenta.payment_method && (
                    <Typography variant="body2" sx={{ color: '#6B5344', mt: 0.5 }}>
                      Pagado con <strong>{detailCuenta.payment_method}</strong>
                      {detailCuenta.reference ? ` · Ref ${detailCuenta.reference}` : ''}
                    </Typography>
                  )}
                </Box>
              )}
              {detailCuenta.pagos?.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Historial de cobros</Typography>
                  {detailCuenta.pagos.map((p, i) => (
                    <Box key={p.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: i < detailCuenta.pagos.length - 1 ? '1px dashed rgba(107, 83, 68, 0.15)' : 'none' }}>
                      <Box>
                        <Typography variant="body2" sx={{ color: '#2C1810', fontWeight: 500 }}>
                          {p.payment_method}{p.reference ? ` · Ref ${p.reference}` : ''}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem' }}>
                          {formatFecha(p.created_at)} · tasa Bs. {p.rate_usd}{p.registrado_por ? ` · por ${p.registrado_por}` : ''}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#2D5A1E' }}>{money(p.monto_usd, 'USD')}</Typography>
                        <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem' }}>Bs. {formatNumber(p.monto_bs)}</Typography>
                      </Box>
                    </Box>
                  ))}
                  {detailCuenta.status === 'pendiente' && (
                    <Typography variant="body2" sx={{ mt: 1, fontWeight: 600, color: '#B8860B' }}>
                      Saldo pendiente: {money(detailCuenta.saldo_usd ?? detailCuenta.total_usd, 'USD')}
                    </Typography>
                  )}
                </Box>
              )}
              {detailCuenta.notes && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Notas</Typography>
                  <Typography sx={{ color: '#6B5344' }}>{detailCuenta.notes}</Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDetailOpen(false)} sx={{ color: '#6B5344' }}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* ══════════════════════════════════════════════════
          DIALOG: Editar cuenta por cobrar (solo admin)
          ══════════════════════════════════════════════════ */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden' } } }} aria-labelledby="edit-cuenta-title">
        <DialogTitle id="edit-cuenta-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#2D5A1E', color: '#FFF8F0', py: 2, px: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Edit sx={{ fontSize: 22 }} />
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, fontSize: '1.1rem' }}>
              Editar Cuenta #{editCuenta?.id}
            </Typography>
          </Box>
          <IconButton onClick={() => setEditOpen(false)} aria-label="Cerrar edición" size="small" sx={{ color: 'rgba(255,248,240,0.6)', '&:hover': { color: '#FFF8F0', bgcolor: 'rgba(255,248,240,0.1)' } }}>
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {editCuenta && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <TextField
                label="Nombre del cliente"
                value={editCliente}
                onChange={e => setEditCliente(e.target.value)}
                required
                fullWidth
                size="small"
                slotProps={{ htmlInput: { 'aria-required': 'true' } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#F8F5F0' } }}
              />
              <FormControl size="small" fullWidth>
                <InputLabel id="edit-plazo-label">Plazo de pago</InputLabel>
                <Select
                  labelId="edit-plazo-label"
                  value={editPlazo}
                  label="Plazo de pago"
                  onChange={e => setEditPlazo(e.target.value)}
                  slotProps={{ select: { 'aria-label': 'Nuevo plazo de pago en días' } }}
                  sx={{ borderRadius: 2, bgcolor: '#F8F5F0' }}
                >
                  {TERM_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <CalendarMonth sx={{ fontSize: 18, mr: 1, color: '#2D5A1E' }} />
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Notas"
                value={editNotas}
                onChange={e => setEditNotas(e.target.value)}
                multiline
                rows={2}
                fullWidth
                size="small"
                placeholder="Observaciones de la cuenta…"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#F8F5F0' } }}
              />
              <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(45, 90, 30, 0.04)', border: '1px dashed rgba(45, 90, 30, 0.2)' }}>
                <Typography sx={{ fontSize: '0.78rem', color: '#6B5344' }}>
                  <strong>Cliente:</strong> {editCliente || '—'}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: '#6B5344' }}>
                  <strong>Saldo:</strong> {editCuenta.currency === 'BS' ? `Bs. ${formatNumber(editCuenta.total_bs)}` : `$ ${formatNumber(editCuenta.total_usd)}`}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: '#6B5344' }}>
                  <strong>Nuevo vencimiento:</strong> {nuevoVencimiento || '—'}
                </Typography>
              </Box>
              <Alert severity="info" sx={{ borderRadius: 2, fontSize: '0.78rem' }}>
                Para cambiar los productos o el monto de esta venta a crédito, edita la venta #{editCuenta.sale_id} desde el módulo de Ventas.
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)} sx={{ color: '#6B5344' }}>Cancelar</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editSaving || !editCliente.trim()} startIcon={<Edit />}
            sx={{ bgcolor: '#2D5A1E', borderRadius: 2, fontWeight: 600, '&:hover': { bgcolor: '#3A7A28' } }}>
            {editSaving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══════════════════════════════════════════════════
          DIALOG: Confirmar eliminación de cuenta (solo admin)
          ══════════════════════════════════════════════════ */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden' } } }} aria-labelledby="delete-cuenta-title">
        <DialogTitle id="delete-cuenta-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#C62828', color: '#FFF8F0', py: 2, px: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Delete />
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, fontSize: '1.1rem' }}>
              Eliminar Cuenta #{deleteTarget?.id}
            </Typography>
          </Box>
          <IconButton onClick={() => setDeleteOpen(false)} aria-label="Cerrar" size="small" sx={{ color: 'rgba(255,248,240,0.6)' }}>
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography sx={{ color: '#2C1810', fontSize: '0.9rem', mb: 1.5 }}>
            ¿Seguro que deseas eliminar esta cuenta por cobrar? Esta acción <b>no se puede deshacer</b>.
          </Typography>
          {deleteTarget && (
            <Alert severity="warning" sx={{ borderRadius: 2, fontSize: '0.8rem' }}>
              También se eliminará la <b>venta #{deleteTarget.sale_id}</b> asociada y sus productos se
              <b> devolverán al inventario</b>.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} sx={{ color: '#6B5344' }}>Cancelar</Button>
          <Button variant="contained" onClick={handleDeleteConfirmado} disabled={deleting} startIcon={<Delete />}
            sx={{ bgcolor: '#C62828', borderRadius: 2, fontWeight: 600, '&:hover': { bgcolor: '#8E1B1B' } }}>
            {deleting ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnack(s => ({ ...s, open: false }))} severity={snack.severity} variant="filled" role="status" aria-live="polite"
          sx={{ width: '100%', borderRadius: 2 }}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  )
}
