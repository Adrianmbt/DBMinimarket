import { useState } from 'react'

export function usePaginacion(items, filasPorPagina = 5) {
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(filasPorPagina)
  const total = items.length
  const maxPage = total === 0 ? 0 : Math.ceil(total / rowsPerPage) - 1
  const pageSegura = Math.min(page, maxPage)
  const actuales = items.slice(pageSegura * rowsPerPage, pageSegura * rowsPerPage + rowsPerPage)

  const handleChangePage = (_e, newPage) => setPage(newPage)
  const handleChangeRowsPerPage = (e) => {
    setRowsPerPage(parseInt(e.target.value, 10))
    setPage(0)
  }

  return { page: pageSegura, rowsPerPage, total, actuales, handleChangePage, handleChangeRowsPerPage }
}