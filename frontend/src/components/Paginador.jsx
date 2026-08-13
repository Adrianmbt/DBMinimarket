import { TablePagination } from '@mui/material'

export default function Paginador({ page, rowsPerPage, total, onPageChange, onRowsPerPageChange }) {
  return (
    <TablePagination
      component="div"
      count={total}
      page={page}
      rowsPerPage={rowsPerPage}
      onPageChange={onPageChange}
      onRowsPerPageChange={onRowsPerPageChange}
      rowsPerPageOptions={[5, 10, 15, 25]}
      labelRowsPerPage="Filas por página:"
      labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
      sx={{
        color: '#6B5344',
        '.MuiTablePagination-toolbar': { minHeight: 48 },
        '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': { fontSize: '0.8rem' },
      }}
    />
  )
}