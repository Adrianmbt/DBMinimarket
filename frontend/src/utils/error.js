export function mensajeError(err, fallback = 'Ocurrió un error inesperado') {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI (Pydantic) devuelve [{type,loc,msg,input}, ...] en un 422
    const partes = detail
      .map((d) => {
        const campo = Array.isArray(d?.loc) ? d.loc.filter((x) => x !== 'body').join('.') : ''
        const texto = d?.msg || ''
        return campo ? `${campo}: ${texto}` : texto
      })
      .filter(Boolean)
    if (partes.length) return partes.join(' · ')
  }
  if (detail && typeof detail === 'object') {
    const texto = detail.msg || detail.detail
    if (typeof texto === 'string') return texto
  }
  return err?.message || fallback
}
