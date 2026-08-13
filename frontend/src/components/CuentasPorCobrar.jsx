import { useState, useEffect } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, Typography, Chip, Box, Avatar, Alert, Snackbar,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  TextField, MenuItem, Select, FormControl, InputLabel, Divider,
} from '@mui/material'
import {
  AccountBalanceWallet, Search, CheckCircle, Pending, Visibility,
  Close, TrendingUp, TrendingDown, AttachMoney, MonetizationOn,
  Warning, Schedule,
} from '@mui/icons-material'
import { getCuentasCredito, marcarPagada, getResumenCredito, getProximasVencer, marcarNotificadas } from '../api/creditos'
import { formatNumber } from './Ventas'
import Paginador from './Paginador'
import { usePaginacion } from '../hooks/usePaginacion'

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

const formatFechaCorta = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const anio = d.getFullYear()
  return `${dia}/${mes}/${anio}`
}

const diasRestantes = (dueDate) => {
  if (!dueDate) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const vence = new Date(dueDate)
  vence.setHours(0, 0, 0, 0)
  const diff = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24))
  return diff
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

const rowSx = {
  animation: 'fade-in-up 0.3s ease-out both',
  '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.04)' },
  transition: 'background 0.15s ease',
}

export default function CuentasPorCobrar() {
  const [cuentas, setCuentas] = useState([])
  const [resumen, setResumen] = useState(null)
  const [filtro, setFiltro] = useState('pendiente')
  const [busqueda, setBusqueda] = useState('')
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null)
  const [pagando, setPagando] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailCuenta, setDetailCuenta] = useState(null)
  const [proximasVencer, setProximasVencer] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)

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
      if (noNotificadas.length > 0) {
        setNotifOpen(true)
      }
    } catch {
      setSnack({ open: true, msg: 'Error al cargar cuentas por cobrar', severity: 'error' })
    }
  }

  useEffect(() => {
    loadData()
  }, [filtro])

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

  const handleMarcarPagada = async () => {
    if (!cuentaSeleccionada) return
    setPagando(true)
    try {
      await marcarPagada(cuentaSeleccionada.id)
      setSnack({ open: true, msg: 'Cuenta marcada como pagada exitosamente', severity: 'success' })
      setConfirmOpen(false)
      setCuentaSeleccionada(null)
      loadData()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al marcar como pagada'
      setSnack({ open: true, msg, severity: 'error' })
    } finally {
      setPagando(false)
    }
  }

  const openDetail = async (cuenta) => {
    setDetailCuenta(cuenta)
    setDetailOpen(true)
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

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        mb: 3.5, flexWrap: 'wrap', gap: 2,
      }}>
        <Box sx={{ animation: 'fade-in-up 0.5s ease-out both' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <AccountBalanceWallet sx={{ fontSize: 28, color: '#C9952A' }} />
            <Typography variant="h4" sx={{
              fontFamily: '"Playfair Display", serif',
              fontWeight: 700, color: '#2C1810',
              fontSize: { xs: '1.5rem', sm: '1.85rem' },
            }}>
              Cuentas por Cobrar
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6B5344', ml: 0.5 }}>
            Ventas a crédito pendientes de cobro
          </Typography>
        </Box>
      </Box>

      {/* Notificación de cuentas próximas a vencer */}
      {notifOpen && proximasVencer.filter(c => !c.notified).length > 0 && (
        <Alert
          severity="warning"
          onClose={() => setNotifOpen(false)}
          action={
            <Button color="inherit" size="small" onClick={handleMarcarNotificadas}>
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

      {/* Resumen */}
      {resumen && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, mb: 3 }}>
          <Paper elevation={0} sx={{
            p: 2, borderRadius: 3, border: '1px solid rgba(198, 40, 40, 0.15)',
            animation: 'fade-in-up 0.4s ease-out both',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'rgba(198, 40, 40, 0.1)', color: '#C62828' }}>
                <Pending />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                  Pendientes
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: '#C62828' }}>
                  {resumen.total_pendiente}
                </Typography>
              </Box>
            </Box>
          </Paper>

          <Paper elevation={0} sx={{
            p: 2, borderRadius: 3, border: '1px solid rgba(198, 40, 40, 0.15)',
            animation: 'fade-in-up 0.4s ease-out 0.1s both',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'rgba(198, 40, 40, 0.1)', color: '#C62828' }}>
                <AttachMoney />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                  Saldo Pendiente
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#C62828' }}>
                  ${formatNumber(resumen.monto_pendiente_usd)}
                </Typography>
                <Typography variant="caption" sx={{ color: '#6B5344' }}>
                  Bs. {formatNumber(resumen.monto_pendiente_bs)}
                </Typography>
              </Box>
            </Box>
          </Paper>

          <Paper elevation={0} sx={{
            p: 2, borderRadius: 3, border: '1px solid rgba(45, 90, 30, 0.15)',
            animation: 'fade-in-up 0.4s ease-out 0.2s both',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'rgba(45, 90, 30, 0.1)', color: '#2D5A1E' }}>
                <CheckCircle />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                  Pagadas
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: '#2D5A1E' }}>
                  {resumen.total_pagado}
                </Typography>
              </Box>
            </Box>
          </Paper>

          <Paper elevation={0} sx={{
            p: 2, borderRadius: 3, border: '1px solid rgba(45, 90, 30, 0.15)',
            animation: 'fade-in-up 0.4s ease-out 0.3s both',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'rgba(45, 90, 30, 0.1)', color: '#2D5A1E' }}>
                <MonetizationOn />
              </Avatar>
              <Box>
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                  Total Cobrado
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#2D5A1E' }}>
                  ${formatNumber(resumen.monto_pagado_usd)}
                </Typography>
                <Typography variant="caption" sx={{ color: '#6B5344' }}>
                  Bs. {formatNumber(resumen.monto_pagado_bs)}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Box>
      )}

      {/* Filtros y búsqueda */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel sx={{ color: '#6B5344' }}>Filtrar por estado</InputLabel>
          <Select
            value={filtro}
            label="Filtrar por estado"
            onChange={e => setFiltro(e.target.value)}
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
          slotProps={{
            input: {
              startAdornment: <Search sx={{ color: '#C9952A', mr: 1, fontSize: 20 }} />,
            },
          }}
        />
      </Box>

      {/* Tabla */}
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
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Venta #</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Cliente</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Moneda</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }} align="right">Total</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Vence</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Estado</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }} align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {actuales.map((c) => {
              const dias = c.status === 'pendiente' ? diasRestantes(c.due_date) : null
              return (
                <TableRow key={c.id} sx={rowSx}>
                  <TableCell>
                    <Chip
                      label={`#${c.id}`}
                      size="small"
                      sx={{ bgcolor: 'rgba(45, 90, 30, 0.1)', color: '#2D5A1E', fontWeight: 700, fontSize: '0.7rem', borderRadius: 1.5 }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: '#6B5344', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {formatFecha(c.created_at)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`Venta #${c.sale_id}`}
                      size="small"
                      sx={{ bgcolor: 'rgba(201, 149, 42, 0.1)', color: '#C9952A', fontWeight: 600, fontSize: '0.7rem', borderRadius: 1.5 }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: '#2C1810', fontWeight: 500 }}>
                    {c.client_name}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={c.currency === 'BS' ? 'Bs.' : 'USD'}
                      size="small"
                      variant="outlined"
                      sx={{ borderColor: 'rgba(201, 149, 42, 0.25)', color: '#6B5344', fontWeight: 500, fontSize: '0.75rem' }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontWeight: 700, color: '#2C1810', fontSize: '0.9rem' }}>
                      {c.currency === 'BS'
                        ? `Bs. ${formatNumber(c.total_bs)}`
                        : `$ ${formatNumber(c.total_usd)}`
                      }
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem' }}>
                      {c.currency === 'BS'
                        ? `$ ${formatNumber(c.total_usd)}`
                        : `Bs. ${formatNumber(c.total_bs)}`
                      }
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {c.status === 'pendiente' && c.due_date ? (
                      <Chip
                        icon={<Schedule sx={{ fontSize: 14, color: `${vencimientoColor(dias)} !important` }} />}
                        label={dias !== null
                          ? dias < 0 ? `Vencida (${Math.abs(dias)}d)` : dias === 0 ? 'Vence hoy' : `${dias} días`
                          : formatFechaCorta(c.due_date)
                        }
                        size="small"
                        sx={{
                          bgcolor: vencimientoBg(dias),
                          color: vencimientoColor(dias),
                          fontWeight: 600, fontSize: '0.7rem',
                          '& .MuiChip-icon': { color: `${vencimientoColor(dias)} !important` },
                        }}
                      />
                    ) : (
                      <Typography sx={{ fontSize: '0.75rem', color: '#6B5344' }}>—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={c.status === 'pagado' ? <CheckCircle sx={{ fontSize: 14 }} /> : <Pending sx={{ fontSize: 14 }} />}
                      label={c.status === 'pagado' ? 'Pagado' : 'Pendiente'}
                      size="small"
                      sx={{
                        bgcolor: c.status === 'pagado' ? 'rgba(45, 90, 30, 0.1)' : 'rgba(198, 40, 40, 0.08)',
                        color: c.status === 'pagado' ? '#2D5A1E' : '#C62828',
                        fontWeight: 600, fontSize: '0.75rem',
                      }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      <IconButton
                        size="small"
                        onClick={() => openDetail(c)}
                        sx={{ color: '#C9952A', '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.1)' } }}
                      >
                        <Visibility fontSize="small" />
                      </IconButton>
                      {c.status === 'pendiente' && (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<CheckCircle sx={{ fontSize: 14 }} />}
                          onClick={() => { setCuentaSeleccionada(c); setConfirmOpen(true) }}
                          sx={{
                            bgcolor: '#2D5A1E', borderRadius: 2, fontSize: '0.7rem', fontWeight: 600,
                            '&:hover': { bgcolor: '#3A7A28' },
                            textTransform: 'none',
                          }}
                        >
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
                    <Avatar sx={{ width: 56, height: 56, bgcolor: 'rgba(45, 90, 30, 0.08)', mx: 'auto', mb: 1.5 }}>
                      <AccountBalanceWallet sx={{ fontSize: 28, color: '#2D5A1E' }} />
                    </Avatar>
                    <Typography sx={{ color: '#6B5344', fontWeight: 500, mb: 0.5 }}>
                      {busqueda.trim() ? 'No se encontraron cuentas para tu búsqueda' : 'No hay cuentas por cobrar'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6B5344', opacity: 0.6 }}>
                      {busqueda.trim() ? 'Prueba con otro término' : 'Las ventas a crédito aparecerán aquí'}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Paginador page={page} rowsPerPage={rowsPerPage} total={total} onPageChange={handleChangePage} onRowsPerPageChange={handleChangeRowsPerPage} />
      </TableContainer>

      {/* Confirmar cobro */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        slotProps={{ paper: { sx: { borderRadius: 3, minWidth: 350 } } }}
      >
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          bgcolor: '#2D5A1E', color: '#FFF8F0', py: 2, px: 3,
        }}>
          <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600 }}>
            Confirmar Cobro
          </Typography>
          <IconButton onClick={() => setConfirmOpen(false)} sx={{ color: 'rgba(255,248,240,0.6)' }}>
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {cuentaSeleccionada && (
            <Box>
              <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                ¿Estás seguro de que deseas marcar esta cuenta como pagada?
              </Alert>
              <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(45, 90, 30, 0.04)', border: '1px solid rgba(45, 90, 30, 0.15)' }}>
                <Typography sx={{ fontWeight: 600, color: '#2C1810', mb: 1 }}>
                  Detalles de la cuenta:
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B5344' }}>
                  <strong>Cliente:</strong> {cuentaSeleccionada.client_name}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B5344' }}>
                  <strong>Total:</strong> {cuentaSeleccionada.currency === 'BS'
                    ? `Bs. ${formatNumber(cuentaSeleccionada.total_bs)}`
                    : `$ ${formatNumber(cuentaSeleccionada.total_usd)}`
                  }
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B5344' }}>
                  <strong>Venta:</strong> #{cuentaSeleccionada.sale_id}
                </Typography>
                {cuentaSeleccionada.due_date && (
                  <Typography variant="body2" sx={{ color: '#6B5344' }}>
                    <strong>Vence:</strong> {formatFechaCorta(cuentaSeleccionada.due_date)}
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmOpen(false)}
            sx={{ color: '#6B5344' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleMarcarPagada}
            disabled={pagando}
            startIcon={<CheckCircle />}
            sx={{
              bgcolor: '#2D5A1E', borderRadius: 2, fontWeight: 600,
              '&:hover': { bgcolor: '#3A7A28' },
            }}
          >
            {pagando ? 'Procesando...' : 'Marcar como Pagada'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detalle de cuenta */}
      <Dialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          bgcolor: '#C9952A', color: '#FFF8F0', py: 2, px: 3,
        }}>
          <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600 }}>
            Detalle de Cuenta #{detailCuenta?.id}
          </Typography>
          <IconButton onClick={() => setDetailOpen(false)} sx={{ color: 'rgba(255,248,240,0.6)' }}>
            <Close fontSize="small" />
          </IconButton>
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
                  <Chip
                    icon={detailCuenta.status === 'pagado' ? <CheckCircle sx={{ fontSize: 14 }} /> : <Pending sx={{ fontSize: 14 }} />}
                    label={detailCuenta.status === 'pagado' ? 'Pagado' : 'Pendiente'}
                    size="small"
                    sx={{
                      bgcolor: detailCuenta.status === 'pagado' ? 'rgba(45, 90, 30, 0.1)' : 'rgba(198, 40, 40, 0.08)',
                      color: detailCuenta.status === 'pagado' ? '#2D5A1E' : '#C62828',
                      fontWeight: 600,
                    }}
                  />
                </Box>
                {detailCuenta.due_date && (
                  <>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Plazo</Typography>
                      <Typography sx={{ fontWeight: 600, color: '#2C1810' }}>{detailCuenta.days_term} días</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Fecha de Vencimiento</Typography>
                      <Typography sx={{ fontWeight: 600, color: vencimientoColor(diasRestantes(detailCuenta.due_date)) }}>
                        {formatFechaCorta(detailCuenta.due_date)}
                        {detailCuenta.status === 'pendiente' && diasRestantes(detailCuenta.due_date) !== null && (
                          <Typography component="span" sx={{ ml: 1, fontSize: '0.75rem', fontWeight: 500 }}>
                            ({diasRestantes(detailCuenta.due_date) < 0
                              ? `Vencida hace ${Math.abs(diasRestantes(detailCuenta.due_date))} días`
                              : diasRestantes(detailCuenta.due_date) === 0
                                ? 'Vence hoy'
                                : `${diasRestantes(detailCuenta.due_date)} días restantes`
                            })
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
                  {detailCuenta.currency === 'BS'
                    ? `Bs. ${formatNumber(detailCuenta.total_bs)}`
                    : `$ ${formatNumber(detailCuenta.total_usd)}`
                  }
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B5344' }}>
                  Equivalente: {detailCuenta.currency === 'BS'
                    ? `$ ${formatNumber(detailCuenta.total_usd)}`
                    : `Bs. ${formatNumber(detailCuenta.total_bs)}`
                  }
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B5344', mt: 0.5 }}>
                  Tasa BCV: {detailCuenta.rate_usd ? `Bs. ${detailCuenta.rate_usd}` : '—'}
                </Typography>
              </Box>

              {detailCuenta.status === 'pagado' && detailCuenta.paid_at && (
                <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: 'rgba(45, 90, 30, 0.04)', border: '1px solid rgba(45, 90, 30, 0.15)' }}>
                  <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase' }}>Fecha de Pago</Typography>
                  <Typography sx={{ fontWeight: 600, color: '#2D5A1E' }}>{formatFecha(detailCuenta.paid_at)}</Typography>
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
          <Button onClick={() => setDetailOpen(false)} sx={{ color: '#6B5344' }}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack(s => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  )
}
