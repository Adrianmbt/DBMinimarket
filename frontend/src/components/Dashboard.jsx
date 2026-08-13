import { useState, useEffect } from 'react'
import {
  Box, Typography, Alert, Divider, Skeleton, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import PointOfSaleIcon from '@mui/icons-material/PointOfSale'
import ReceiptIcon from '@mui/icons-material/Receipt'
import StorefrontIcon from '@mui/icons-material/Storefront'
import InventoryIcon from '@mui/icons-material/Inventory'
import ScaleIcon from '@mui/icons-material/Scale'
import LocalFloristIcon from '@mui/icons-material/LocalFlorist'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined'
import { getDashboard, limpiarDatos } from '../api/dashboard'
import { readSession } from '../utils/session'

// Paleta y utilidades ------------------------------------------------
const PALETA = ['#C9952A', '#8A5A2B', '#4A8A34', '#2D5A1E', '#5B6E8C', '#9B6B36', '#E8630C', '#6B5344']

const fmtNum = (n, d = 2) =>
  (!Number.isFinite(n) ? 0 : n).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d })

const money = (n, modo) => `${modo === 'bs' ? 'Bs.' : '$'} ${fmtNum(n)}`

const compact = (n) => {
  const a = Math.abs(n)
  if (a >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return Number(n).toLocaleString('es-VE', { maximumFractionDigits: 1 })
}

const sum = (arr) => (Array.isArray(arr) ? arr : []).reduce((s, x) => s + (x.usd || 0), 0)

const hoyLetras = () => {
  const d = new Date()
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const caps = (s) => s.charAt(0).toUpperCase() + s.slice(1)
  return `${caps(dias[d.getDay()])}, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

const Empty = ({ msg }) => (
  <Typography sx={{ color: '#A8937E', fontSize: '0.82rem', py: 4, textAlign: 'center' }}>
    {msg || 'Aún sin datos para mostrar'}
  </Typography>
)

const Panel = ({ children }) => (
  <Box sx={{
    borderRadius: 3, background: '#FFFFFF', p: { xs: 2, sm: 2.6 },
    border: '1px solid rgba(201, 149, 42, 0.10)',
    boxShadow: '0 1px 3px rgba(44,24,16,0.05), 0 8px 26px -22px rgba(44,24,16,0.4)',
    height: '100%',
  }}>
    {children}
  </Box>
)

const PanelTitle = ({ kicker, title, right }) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.8, gap: 1 }}>
    <Box>
      <Typography sx={{
        fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase',
        color: '#C9952A', fontWeight: 700, mb: 0.3,
      }}>
        {kicker}
      </Typography>
      <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, color: '#2C1810', fontSize: '1.05rem' }}>
        {title}
      </Typography>
    </Box>
    {right}
  </Box>
)

// ---------------------------------------------------------------- KPI
function Kpi({ label, value, secondary, icon, delta, color, idx }) {
  const up = delta != null && delta >= 0
  return (
    <Box className="animate-fade-in-up" sx={{
      animationDelay: `${idx * 0.06}s`,
      position: 'relative', overflow: 'hidden',
      borderRadius: 3, background: '#FFFFFF', p: 2.2,
      border: '1px solid rgba(201, 149, 42, 0.10)',
      boxShadow: '0 1px 3px rgba(44,24,16,0.05)',
      transition: 'transform 0.25s ease, box-shadow 0.25s ease',
      '&::before': {
        content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
        background: `linear-gradient(180deg, ${color}, transparent)`, opacity: 0.85,
      },
      '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 14px 34px -18px rgba(44,24,16,0.4)' },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.4 }}>
        <Typography sx={{ color: '#6B5344', fontSize: '0.62rem', letterSpacing: '0.09em', textTransform: 'uppercase', fontWeight: 600 }}>
          {label}
        </Typography>
        <Box sx={{ width: 32, height: 32, borderRadius: 1.8, display: 'grid', placeItems: 'center', bgcolor: `${color}12`, color }}>
          {icon}
        </Box>
      </Box>
      <Typography sx={{
        fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2C1810',
        fontSize: '1.5rem', lineHeight: 1.05, whiteSpace: 'nowrap',
      }}>
        {value}
      </Typography>
      {secondary && (
        <Typography sx={{ fontSize: '0.74rem', color: '#8A7159', mt: 0.4 }}>
          ≈ {secondary}
        </Typography>
      )}
      <Box sx={{ mt: 1, minHeight: 18, display: 'flex', alignItems: 'center', gap: 0.6 }}>
        {delta != null && (
          <Box sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.3, fontSize: '0.7rem', fontWeight: 700,
            px: 0.8, py: 0.2, borderRadius: 1,
            color: up ? '#2D5A1E' : '#C62828',
            bgcolor: up ? 'rgba(45,90,30,0.08)' : 'rgba(198,40,40,0.08)',
          }}>
            {up ? <TrendingUpIcon sx={{ fontSize: 13 }} /> : <TrendingDownIcon sx={{ fontSize: 13 }} />}
            {fmtNum(Math.abs(delta), 1)}%
          </Box>
        )}
        {delta != null && <Typography sx={{ fontSize: '0.62rem', color: '#A8937A' }}>vs. ayer</Typography>}
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------- Área 7 días
function AreaVentas({ data, modo, tasa }) {
  if (!data || data.length === 0) return <Empty />
  const W = 720, H = 230, PL = 12, PR = 12, PT = 24, PB = 4
  const vals = data.map(d => (modo === 'bs' ? d.usd * tasa : d.usd))
  const max = Math.max(1, ...vals)
  const n = data.length
  const ih = H - PT - PB, iw = W - PL - PR
  const X = (i) => PL + (n === 1 ? iw / 2 : (iw * i) / (n - 1))
  const Y = (v) => H - PB - (v / max) * ih
  const last = n - 1
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(vals[i]).toFixed(1)}`).join(' ')
  const area = `${line} L${X(last).toFixed(1)},${H} L${X(0).toFixed(1)},${H} Z`
  const grid = [0.25, 0.5, 0.75].map((f) => PT + ih * f)

  return (
    <Box>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 210, display: 'block' }}>
        <defs>
          <linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C9952A" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#C9952A" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((y, k) => (
          <line key={k} x1={PL} y1={y} x2={W - PR} y2={y} stroke="#EDE3D0" strokeWidth="1" strokeDasharray="3 6" />
        ))}
        <path d={area} fill="url(#gradArea)" className="chart-area" />
        <path d={line} fill="none" stroke="#C9952A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" pathLength="1" className="chart-line" />
        {data.map((d, i) => (
          <g key={i}>
            {i === last && (
              <>
                <line x1={X(i)} y1={Y(vals[i]) + 8} x2={X(i)} y2={H} stroke="#C9952A" strokeWidth="1" strokeOpacity="0.35" />
                <circle cx={X(i)} cy={Y(vals[i])} r="14" fill="#C9952A" fillOpacity="0.14" />
              </>
            )}
            <circle cx={X(i)} cy={Y(vals[i])} r={i === last ? 5 : 3.2}
              fill={i === last ? '#9E721E' : '#C9952A'} stroke="#FFF8F0" strokeWidth="2"
              className="chart-dot" style={{ animationDelay: `${0.35 + i * 0.1}s` }} />
          </g>
        ))}
      </svg>
      <Box sx={{ display: 'flex', mt: 0.6 }}>
        {data.map((d, i) => (
          <Typography key={i} sx={{
            flex: 1, textAlign: 'center', fontSize: '0.62rem',
            color: i === last ? '#C9952A' : '#A8937A', fontWeight: i === last ? 700 : 500,
            whiteSpace: 'nowrap',
          }}>
            {d.d}
          </Typography>
        ))}
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------- Donut
function Donut({ data = [], modo, tasa }) {
  const items = Array.isArray(data) ? data : []
  const totalV = sum(items) || 1
  const R = 34, C = 2 * Math.PI * R
  let acc = 0
  const segs = items.map((it) => {
    const frac = (it.usd || 0) / totalV
    const off = acc
    acc += frac
    return { it, frac, off }
  })
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ position: 'relative', width: 164, height: 164, mx: 'auto', mb: 2 }}>
        <svg viewBox="0 0 120 120" style={{ width: 164, height: 164, transform: 'rotate(-90deg)' }}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="#F0E7D5" strokeWidth="13" />
          {segs.map(({ it, frac, off }, i) => (
            <circle key={i} cx="60" cy="60" r={R} fill="none"
              stroke={PALETA[i % PALETA.length]} strokeWidth="13"
              strokeDasharray={`${Math.max(frac * C - 2, 0.5)} ${C}`}
              strokeDashoffset={-C * off} strokeLinecap="butt" />
          ))}
        </svg>
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <Box>
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2C1810', fontSize: '1.35rem', lineHeight: 1 }}>
              {money(modo === 'bs' ? sum(items) * tasa : sum(items), modo)}
            </Typography>
            <Typography sx={{ fontSize: '0.58rem', color: '#6B5344', letterSpacing: '0.08em' }}>TOTAL</Typography>
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.7 }}>
        {items.map((it, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PALETA[i % PALETA.length], flex: 'none' }} />
            <Typography sx={{ flex: 1, fontSize: '0.76rem', color: '#6B5344', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {it.metodo || it.nombre}
            </Typography>
            <Typography sx={{ fontSize: '0.74rem', color: '#2C1810', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {money(modo === 'bs' ? it.usd * tasa : it.usd, modo)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------- Resumen
const Resumen = ({ label, value }) => (
  <Box sx={{ bgcolor: '#F8F3E9', borderRadius: 2, px: 1.4, py: 1.3, border: '1px solid rgba(201,149,42,0.10)' }}>
    <Typography sx={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: '#A8937A', textTransform: 'uppercase' }}>{label}</Typography>
    <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '1.05rem', color: '#2C1810', mt: 0.3, whiteSpace: 'nowrap' }}>{value}</Typography>
  </Box>
)

// ---------------------------------------------------------------- Main
export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [modo, setModo] = useState('bs')

  const [cleanOpen, setCleanOpen] = useState(false)
  const [cleanClave, setCleanClave] = useState('')
  const [cleanMsg, setCleanMsg] = useState('')
  const [cleanErr, setCleanErr] = useState('')
  const [cleanBusy, setCleanBusy] = useState(false)

  const onLimpiar = async () => {
    setCleanBusy(true)
    setCleanErr('')
    setCleanMsg('')
    try {
      const res = await limpiarDatos(cleanClave.trim())
      setCleanMsg(res.data?.mensaje || 'Base de datos limpiada correctamente.')
      setCleanClave('')
      const d = await getDashboard()
      setData(d.data)
    } catch (e) {
      setCleanErr(e?.response?.data?.detail || 'No se pudo limpiar la base de datos.')
    } finally {
      setCleanBusy(false)
    }
  }

  useEffect(() => {
    let user = null
    const rawUser = readSession('user')
    if (rawUser) {
      try { user = JSON.parse(rawUser) } catch { user = null }
    }
    if (!user || user.role !== 'admin') {
      navigate('/ventas', { replace: true })
      return
    }
    getDashboard().then(res => setData(res.data)).catch(() => setError('Error al cargar el panel'))
  }, [navigate])

  if (error) return <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>
  if (!data) return (
    <Box sx={{ maxWidth: 1240, mx: 'auto' }}>
      <Skeleton variant="text" width={260} height={44} />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 2, mt: 2 }}>
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="rounded" height={128} sx={{ borderRadius: 3 }} />)}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 2, mt: 2 }}>
        <Skeleton variant="rounded" height={330} sx={{ borderRadius: 3 }} />
        <Skeleton variant="rounded" height={330} sx={{ borderRadius: 3 }} />
      </Box>
    </Box>
  )

  const tasa = data.tasa_bcv || 0
  const vv = (usd) => modo === 'bs' ? usd * tasa : usd
  const mon = (usd) => money(vv(usd), modo)
  const alt = (usd) => money(modo === 'bs' ? usd : usd * tasa, modo === 'bs' ? 'us' : 'bs')
  const serie = data.serie_ventas7 || []

  const kpis = [
    { label: 'Ventas hoy', value: mon(data.ventas_hoy), secondary: alt(data.ventas_hoy), icon: <PointOfSaleIcon sx={{ fontSize: 18 }} />, color: '#C9952A', delta: data.ventas_hoy_vs_ayer },
    { label: 'Ticket promedio', value: mon(data.ticket_promedio), secondary: alt(data.ticket_promedio), icon: <ReceiptIcon sx={{ fontSize: 18 }} />, color: '#4A8A34' },
    { label: 'Ventas del mes', value: mon(data.ventas_mes), secondary: alt(data.ventas_mes), icon: <StorefrontIcon sx={{ fontSize: 18 }} />, color: '#8A5A2A' },
    { label: 'Ganancia del día', value: mon(data.ganancia_dia), secondary: alt(data.ganancia_dia), icon: <TrendingUpIcon sx={{ fontSize: 18 }} />, color: '#2D5A1E' },
    { label: 'Valor inventario', value: mon(data.valor_inventario), secondary: alt(data.valor_inventario), icon: <InventoryIcon sx={{ fontSize: 18 }} />, color: '#5B6E8C' },
    { label: 'Transacciones', value: `${data.transacciones_hoy}`, secondary: `hoy · ticket ${mon(data.ticket_promedio)}`, icon: <ScaleIcon sx={{ fontSize: 18 }} />, color: '#E8630C' },
  ]

  const categorias = data.categorias || []
  const metodos = data.metodos_pago || []
  const top = data.top_productos || []
  const stock = data.stock_bajo || []
  const maxTop = top[0]?.usd || 1
  const totalSemana = serie.reduce((s, d) => s + d.usd, 0)

  return (
    <Box sx={{ maxWidth: 1240, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2C1810', fontSize: { xs: '1.6rem', sm: '2.1rem' }, lineHeight: 1.1 }}>
            Panel de Control
          </Typography>
          <Typography sx={{ color: '#8A7159', fontSize: '0.85rem', mt: 0.6 }}>
            {hoyLetras()} · {data.transacciones_hoy} venta{data.transacciones_hoy !== 1 ? 's' : ''} hoy
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            onClick={() => { setCleanClave(''); setCleanMsg(''); setCleanErr(''); setCleanOpen(true) }}
            size="small"
            startIcon={<DeleteSweepOutlinedIcon sx={{ fontSize: 17 }} />}
            sx={{
              textTransform: 'none', color: '#C62828', borderColor: 'rgba(198,40,40,0.35)',
              '&:hover': { bgcolor: 'rgba(198,40,40,0.06)', borderColor: '#C62828' },
            }}
          >
            Limpiar datos
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: '0.72rem', color: '#A8937A', mr: 0.5 }}>Tasa: Bs {fmtNum(tasa)}</Typography>
            <Box sx={{ display: 'inline-flex', border: '1px solid rgba(201,149,42,0.25)', borderRadius: 9, p: 0.4, bgcolor: '#fff' }}>
              {['bs', 'usd'].map((m) => (
                <Box key={m} onClick={() => setModo(m)} sx={{
                  px: 1.6, py: 0.5, borderRadius: 7, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700,
                  color: modo === m ? '#FFF8F0' : '#6B5344', bgcolor: modo === m ? '#C9952A' : 'transparent',
                  transition: 'all 0.2s ease',
                }}>
                  {m === 'bs' ? 'Bs.' : '$'}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* KPI */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(6,1fr)' }, gap: { xs: 1.4, md: 2 } }}>
        {kpis.map((k, i) => <Kpi key={k.label} {...k} idx={i} />)}
      </Box>

      {/* Gráfico principal + donut */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.8fr 1fr' }, gap: { xs: 2, md: 2.4 }, mt: 2.4 }}>
        <Panel>
          <PanelTitle
            kicker="Fluctuación diaria"
            title="Ventas — últimos 7 días"
            right={<Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2C1810', fontSize: '1.25rem' }}>{mon(totalSemana)}</Typography>}
          />
          <AreaVentas data={serie} modo={modo} tasa={tasa} />
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1.5 }}>
            <Resumen label="Total 7 días" value={mon(totalSemana)} />
            <Resumen label="Ventas del mes" value={mon(data.ventas_mes)} />
            <Resumen label="Ganancia semana" value={mon(data.ganancia_periodo)} />
          </Box>
        </Panel>

        <Panel>
          <PanelTitle kicker="Composición" title="Ventas por categoría" right={<LocalFloristIcon sx={{ color: '#C9952A' }} />} />
          {categorias.length ? <Donut data={categorias} modo={modo} tasa={tasa} /> : <Empty msg="Sin ventas en la semana" />}
        </Panel>
      </Box>

      {/* Productos + métodos + stock */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr 1fr' }, gap: { xs: 2, md: 2.4 }, mt: 2.4 }}>
        <Panel>
          <PanelTitle kicker="Rendimiento" title="Top productos (7 días)" />
          {top.length ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.7 }}>
              {top.map((p, i) => (
                <Box key={i}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4, gap: 1 }}>
                    <Typography sx={{ fontSize: '0.78rem', color: '#2C1810', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ color: '#C9952A', fontWeight: 700, marginRight: 6 }}>{i + 1}</span>{p.nombre}
                    </Typography>
                    <Typography sx={{ fontSize: '0.74rem', color: '#6B5344', fontWeight: 600, whiteSpace: 'nowrap' }}>{mon(p.usd)}</Typography>
                  </Box>
                  <Box sx={{ height: 7, bgcolor: '#F2EADA', borderRadius: 4, overflow: 'hidden' }}>
                    <Box className="bar-grow" sx={{ height: '100%', width: `${(p.usd / maxTop) * 100}%`, borderRadius: 4, background: 'linear-gradient(90deg,#C9952A,#E8C46A)', animationDelay: `${0.15 + i * 0.08}s` }} />
                  </Box>
                </Box>
              ))}
            </Box>
          ) : <Empty />}
        </Panel>

        <Panel>
          <PanelTitle kicker="Hoy" title="Métodos de pago" right={
            <Box sx={{ borderRadius: 2, px: 1.2, py: 0.3, bgcolor: 'rgba(201,149,42,0.1)', color: '#C9952A', fontWeight: 700, fontSize: '0.72rem' }}>
              {metodos.length} {metodos.length === 1 ? 'método' : 'métodos'}
            </Box>
          } />
          {metodos.length ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.4 }}>
              {metodos.map((m, i) => (
                <Box key={i}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mb: 0.5 }}>
                    <Box sx={{ width: 24, height: 24, borderRadius: 1.5, display: 'grid', placeItems: 'center', fontSize: '0.68rem', fontWeight: 700, bgcolor: `${PALETA[i % PALETA.length]}16`, color: PALETA[i % PALETA.length] }}>
                      {i + 1}
                    </Box>
                    <Typography sx={{ flex: 1, fontSize: '0.76rem', color: '#2C1810', fontWeight: 500 }}>{m.metodo}</Typography>
                    <Typography sx={{ fontSize: '0.74rem', color: '#2C1810', fontWeight: 700 }}>{mon(m.usd)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 4.4 }}>
                    <Box sx={{ flex: 1, bgcolor: '#F4EFE7', height: 5, borderRadius: 3, overflow: 'hidden' }}>
                      <Box className="bar-grow" sx={{ height: '100%', width: `${(m.usd / (sum(metodos) || 1)) * 100}%`, bgcolor: PALETA[i % PALETA.length], borderRadius: 3, animationDelay: `${0.15 + i * 0.08}s` }} />
                    </Box>
                    <Typography sx={{ fontSize: '0.6rem', color: '#A8937A', whiteSpace: 'nowrap' }}>{m.n} venta{m.n !== 1 ? 's' : ''}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : <Empty />}
        </Panel>

        <Panel>
          <PanelTitle kicker="Almacén" title="Estado del stock" right={<WarningAmberIcon sx={{ color: stock.length ? '#E8630C' : '#4A8A34' }} />} />
          <Box sx={{ borderRadius: 2.5, p: 2, mb: 1.8, background: 'linear-gradient(135deg,#2C1810,#3D2317)', color: '#FFF8F0' }}>
            <Typography sx={{ fontSize: '0.6rem', letterSpacing: '0.1em', opacity: 0.7 }}>UNIDADES EN INVENTARIO</Typography>
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '1.9rem', lineHeight: 1.1 }}>{fmtNum(data.stock_total)}</Typography>
            <Typography sx={{ fontSize: '0.68rem', opacity: 0.7, mt: 0.5 }}>Valor: {mon(data.valor_inventario)}</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: '#2C1810', mb: 1 }}>Bajo en stock</Typography>
          {stock.length ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
              {stock.slice(0, 6).map((p) => (
                <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#E8630C', flex: 'none' }} />
                  <Typography sx={{ flex: 1, fontSize: '0.74rem', color: '#6B5344', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#E8630C' }}>{p.stock}</Typography>
                </Box>
              ))}
              {data.stock_bajo_count > 6 && (
                <Typography sx={{ fontSize: '0.66rem', color: '#A8937A', mt: 0.5 }}>… y {data.stock_bajo_count - 6} más</Typography>
              )}
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.78rem', color: '#4A8A34' }}>Todo el inventario está en buen nivel.</Typography>
          )}
        </Panel>
      </Box>

      {/* Diálogo: limpiar base de datos (requiere clave) */}
      <Dialog open={cleanOpen} onClose={() => setCleanOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2C1810' }}>
          Limpiar base de datos
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#6B5344', fontSize: '0.86rem', mb: 2 }}>
            Se eliminarán las ventas, compras, inventario, cierres y tasas. Los
            <b> usuarios se conservan</b>. Esta acción es irreversible.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="Clave de reseteo"
            value={cleanClave}
            onChange={(e) => setCleanClave(e.target.value)}
            variant="outlined"
            size="small"
            onKeyDown={(e) => { if (e.key === 'Enter' && !cleanBusy) onLimpiar() }}
            sx={{ mb: 1 }}
          />
          {cleanErr && <Alert severity="error" sx={{ mb: 1 }}>{cleanErr}</Alert>}
          {cleanMsg && <Alert severity="success" sx={{ mb: 1 }}>{cleanMsg}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCleanOpen(false)} disabled={cleanBusy} sx={{ textTransform: 'none', color: '#6B5344' }}>
            Cancelar
          </Button>
          <Button
            onClick={onLimpiar}
            disabled={cleanBusy || !cleanClave.trim()}
            color="error"
            variant="contained"
            sx={{ textTransform: 'none' }}
          >
            {cleanBusy ? 'Limpiando…' : 'Limpiar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}