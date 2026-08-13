import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, Typography, IconButton, Box, Chip, Avatar
} from '@mui/material'
import { Close, Store, CalendarMonth, Person, Receipt, Scale, Inventory2, PictureAsPdf } from '@mui/icons-material'

const formatNumber = (n) => {
  if (n === undefined || n === null) return '?'
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatFecha = (dateStr) => {
  if (!dateStr) return '?'
  const d = new Date(dateStr)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const anio = d.getFullYear()
  const hora = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dia}/${mes}/${anio} ${hora}:${min}`
}

const qtyDesc = (d) => {
  if (d.weight_kg != null) {
    const kg = Number(d.weight_kg)
    return kg >= 1 ? `${kg.toLocaleString('es-VE')} kg` : `${(kg * 1000).toLocaleString('es-VE')} g`
  }
  if (d.boxes != null) return `${d.boxes} caja${d.boxes !== 1 ? 's' : ''}`
  return `${d.quantity.toLocaleString('es-VE')} und.`
}

export default function VerCompraDialog({ open, onClose, compra, onDescargar }) {
  const esPeso = (d) => d.weight_kg != null
  const subtotal = (d) => esPeso(d) ? d.cost_price * d.weight_kg : d.cost_price * d.quantity

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden' } } }}
    >
      <DialogTitle sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        bgcolor: '#2D5A1E', color: '#FFF8F0', py: 2, px: 3,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Receipt sx={{ fontSize: 22 }} />
          <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, fontSize: '1.15rem' }}>
            Compra #{compra?.id}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: 'rgba(255,248,240,0.6)', '&:hover': { color: '#FFF8F0', bgcolor: 'rgba(255,248,240,0.1)' } }}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 3, px: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: 'rgba(45,90,30,0.04)',
            px: 2.5, py: 1.5, borderRadius: 2, border: '1px solid rgba(45,90,30,0.08)', flex: 1, minWidth: 160,
          }}>
            <CalendarMonth sx={{ fontSize: 20, color: '#2D5A1E', opacity: 0.6 }} />
            <Box>
              <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha</Typography>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2C1810' }}>
                {compra && formatFecha(compra.created_at)}
              </Typography>
            </Box>
          </Box>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: 'rgba(45,90,30,0.04)',
            px: 2.5, py: 1.5, borderRadius: 2, border: '1px solid rgba(45,90,30,0.08)', flex: 1, minWidth: 140,
          }}>
            <Person sx={{ fontSize: 20, color: '#2D5A1E', opacity: 0.6 }} />
            <Box>
              <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proveedor</Typography>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2C1810' }}>
                {compra?.supplier || 'Sin proveedor'}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Typography sx={{ fontWeight: 600, color: '#2C1810', fontSize: '0.85rem', mb: 1.5 }}>
          Productos ({compra?.details?.length || 0})
        </Typography>

        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8F5F0' }}>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Producto</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cantidad</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Costo U.</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtotal</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {compra?.details?.map((d) => (
              <TableRow key={d.id} sx={{ '&:hover': { bgcolor: 'rgba(45,90,30,0.03)' } }}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 28, height: 28, bgcolor: 'rgba(45,90,30,0.1)', fontSize: '0.75rem', color: '#2D5A1E', fontWeight: 700 }}>
                      {compra.details.indexOf(d) + 1}
                    </Avatar>
                    <Box>
                      <Typography sx={{ fontWeight: 500, fontSize: '0.85rem', color: '#2C1810' }}>
                        {d.product?.name}
                      </Typography>
                      {d.product?.category_name && (
                        <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.66rem' }}>
                          {d.product.category_name}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell align="center">
                  <Chip
                    icon={esPeso(d) ? <Scale sx={{ fontSize: 14 }} /> : <Inventory2 sx={{ fontSize: 14 }} />}
                    label={qtyDesc(d)}
                    size="small"
                    sx={{
                      bgcolor: esPeso(d) ? 'rgba(230,145,56,0.1)' : 'rgba(45,90,30,0.08)',
                      color: esPeso(d) ? '#B76E00' : '#2D5A1E',
                      fontWeight: 700, fontSize: '0.75rem',
                    }}
                  />
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.85rem', color: '#6B5344' }}>
                  $ {formatNumber(d.cost_price)}{esPeso(d) ? '/kg' : '/u.'}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#2C1810' }}>
                  $ {formatNumber(subtotal(d))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Box sx={{ mt: 3, pt: 2, borderTop: '2px solid #2D5A1E', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="caption" sx={{ color: '#6B5344', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>Total (USD)</Typography>
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2D5A1E', fontSize: '1.35rem' }}>
              $ {formatNumber(compra?.total)}
            </Typography>
          </Box>
          <Chip
            icon={<Store />}
            label={`${compra?.details?.length} productos`}
            size="small"
            sx={{ bgcolor: 'rgba(45,90,30,0.08)', color: '#2D5A1E', fontWeight: 500 }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, px: 3, borderTop: '1px solid rgba(45,90,30,0.08)', bgcolor: '#F8F5F0' }}>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', width: '100%' }}>
          <Button
            onClick={() => onDescargar(compra?.id)}
            startIcon={<PictureAsPdf />}
            sx={{
              color: '#C62828', fontWeight: 600, borderRadius: 2,
              '&:hover': { bgcolor: 'rgba(198,40,40,0.06)' },
            }}
            aria-label="Descargar PDF"
          >
            PDF
          </Button>
          <Button onClick={onClose} sx={{ color: '#6B5344', fontWeight: 500, borderRadius: 2, px: 3, '&:hover': { bgcolor: 'rgba(107,83,68,0.08)' } }}>
            Cerrar
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}