/**
 * ¿El producto puede ofrecerse en las modales de venta (contado y crédito)?
 *
 * - Los servicios no descuentan stock, así que siempre son vendibles.
 * - El resto (normal y precio fijo en Bs) necesita stock disponible; si está
 *   en 0 se oculta de la búsqueda para no estorbar (p. ej. duplicados sin stock).
 */
export function esVendible(p) {
  const tipo = p?.category_type || p?.category?.category_type || 'normal'
  if (tipo === 'service') return true
  return (p?.stock ?? 0) > 0
}
