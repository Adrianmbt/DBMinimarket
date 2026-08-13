export function limpiarNumero(v) {
  const s = String(v ?? '').trim()
  if (s === '' || s === '-') return s
  const neg = s.startsWith('-')
  const body = neg ? s.slice(1) : s
  const cleaned = body.replace(/^0+(?=\d)/, '')
  return (neg ? '-' : '') + cleaned
}