// Fechas y día de negocio del sistema en hora de VENEZUELA (UTC-4).
//
// El backend guarda los timestamps en UTC naive y los devuelve sin zona
// (ej. "2026-10-01T16:39:20"). Si el navegador los abre con `new Date(str)`,
// los interpreta como hora LOCAL: se ven 4 horas tarde y, a partir de las 20:00,
// con la fecha del día siguiente. Ese fue el "reinicio" que vio el cliente.
//
// Aquí se fija Venezuela de forma explícita con `timeZone`, así el resultado no
// depende del reloj del navegador ni del de Windows. El offset es fijo
// (Venezuela no aplica horario de verano desde 2016).
//
// `aFechaVE` devuelve un Date cuyas partes locales (getHours/getDate/...) son las
// de Venezuela, para que los formateadores existentes sigan funcionando igual.

const TZ_VE = 'America/Caracas'

const partes = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ_VE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

// Partes de fecha/hora de `instante` en hora de Venezuela.
function _partes(instante) {
  const p = {}
  for (const { type, value } of partes.formatToParts(instante)) {
    if (type !== 'literal') p[type] = value
  }
  // hourCycle puede devolver "24" para medianoche en algunos runtimes.
  if (p.hour === '24') p.hour = '00'
  return p
}

// Hora de Venezuela de un timestamp UTC naive del backend ("2026-10-01T16:39:20"),
// un ISO con zona, o un Date ya convertido (pasa sin cambios).
export function aFechaVE(valor) {
  if (!valor) return null
  if (valor instanceof Date) return valor
  let s = String(valor)
  // "2026-10-01 16:39:20" -> "2026-10-01T16:39:20Z" para que se lea como UTC.
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s = s.replace(' ', 'T') + 'Z'
  const ms = Date.parse(s)
  if (Number.isNaN(ms)) return null
  const p = _partes(new Date(ms))
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
}

// Instante actual como Date con las partes de Venezuela.
function _ahoraVE() {
  return aFechaVE(new Date())
}

// Fecha del día de negocio en formato YYYY-MM-DD (hora de Venezuela).
// No usar toISOString() para esto: devuelve la fecha en UTC, que en Venezuela
// (UTC-4) adelanta un día después de las 20:00 y oculta las ventas de hoy.
export function hoyISO() {
  const d = _ahoraVE()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

// "01/10/2026 12:39" desde un timestamp del backend.
export function formatFechaVE(valor) {
  const d = aFechaVE(valor)
  if (!d) return '—'
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// "01/10/2026" desde un timestamp del backend.
export function formatFechaCortaVE(valor) {
  const d = aFechaVE(valor)
  if (!d) return '—'
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${d.getFullYear()}`
}

// "12:39" desde un timestamp del backend.
export function formatHoraVE(valor) {
  const d = aFechaVE(valor)
  if (!d) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
