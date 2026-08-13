import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Typography, IconButton, Alert, Snackbar, Box, Paper,
  Chip, Avatar, InputAdornment, Tooltip, Button, Select, MenuItem, FormControl, InputLabel
} from '@mui/material'
import { Add, Close, Store, Person, Scale, InfoOutlined, Inventory2, Payments } from '@mui/icons-material'
import { getProductos as fetchProductos } from '../api/productos'
import { getCategorias as fetchCategorias } from '../api/categorias'
import { createCompra } from '../api/compras'
import { limpiarNumero } from '../utils/num'

const formatNumber = (n) => {
  if (n === undefined || n === null) return '?'
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatStock = (p) => {
  const stock = p?.stock || 0
  if (p?.sale_unit === 'peso') {
    return `${(stock / 1000).toLocaleString('es-VE', { maximumFractionDigits: 2 })} kg`
  }
  return `${stock.toLocaleString('es-VE')} und.`
}

const stockColor = (p) => ((p?.stock || 0) < (p?.min_stock || 0) ? '#C62828' : '#2D5A1E')

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

const blankItem = () => ({
  id: crypto.randomUUID(),
  existing: false,
  product_id: null,
  name: '',
  barcode: '',
  category_id: '',
  unit: '',
  cost_price: '',
  sale_price: '',
  min_stock: 5,
  weight_kg: '',
  boxes: '',
  units_per_box: '',
  pack_price: '',
})

export default function NuevaCompraDialog({ open, onClose, onSaved }) {
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [supplier, setSupplier] = useState('')
  const [items, setItems] = useState([blankItem()])
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' })
  const [openSearch, setOpenSearch] = useState(null)

  useEffect(() => {
    if (!open) return
    let ignore = false
    const load = async () => {
      try {
        const [p, c] = await Promise.all([
          fetchProductos({ incluir_inactivos: true }),
          fetchCategorias(),
        ])
        if (!ignore) {
          setProductos(p.data)
          setCategorias(c.data)
        }
      } catch {
        if (!ignore) setSnack({ open: true, msg: 'No se pudo cargar el inventario. Revisa la conexión con el servidor.', severity: 'error' })
      }
      if (!ignore) {
        setSupplier('')
        setItems([blankItem()])
      }
    }
    load()
    return () => { ignore = true }
  }, [open])

  const handleAddItem = () => setItems([...items, blankItem()])
  const handleRemoveItem = (i) => setItems(items.filter((_, idx) => idx !== i))

  const updateItem = (i, patch) => {
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  const handleItemChange = (i, field, value) => {
    updateItem(i, { [field]: value })
  }

  const selectProduct = (i, p) => {
    updateItem(i, {
      existing: true,
      product_id: p.id,
      name: p.name,
      unit: p.sale_unit,
    })
    setOpenSearch(null)
  }

  const selectedProduct = (item) => item.product_id ? productos.find(p => p.id === item.product_id) : null

  const itemUnit = (item) => {
    if (item.unit) return item.unit
    const prod = selectedProduct(item)
    return prod ? prod.sale_unit : ''
  }

  const costoUnitario = (it) => {
    const u = itemUnit(it)
    if (u !== 'unidad') return +it.cost_price || 0
    const upb = +it.units_per_box || 0
    const pack = +it.pack_price || 0
    return upb > 0 ? pack / upb : 0
  }

  const totalEstimado = items.reduce((sum, it) => {
    const unit = itemUnit(it)
    if (unit === 'peso') {
      return sum + (+it.cost_price || 0) * (+it.weight_kg || 0)
    }
    return sum + (+it.pack_price || 0) * (+it.boxes || 0)
  }, 0)

  const itemSubtotal = (it) => {
    const unit = itemUnit(it)
    if (unit === 'peso') return (+it.cost_price || 0) * (+it.weight_kg || 0)
    return (+it.pack_price || 0) * (+it.boxes || 0)
  }

  const handleCreate = async () => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const prod = selectedProduct(it)
      const nameOk = it.existing ? !!prod : (it.name && it.name.trim())
      if (!nameOk) {
        setSnack({ open: true, msg: `Producto ${i + 1}: indica el nombre y presentación (obligatorio)`, severity: 'error' })
        return
      }
      const cat = categorias.find(c => c.id === Number(it.category_id) || (prod && Number(c.id) === prod.category_id))
      if (!cat) {
        setSnack({ open: true, msg: `Producto ${i + 1}: indica la categoría`, severity: 'error' })
        return
      }
      const unit = itemUnit(it) || cat.sale_unit
      if (unit === 'peso' && !(+it.weight_kg > 0)) {
        setSnack({ open: true, msg: `Producto ${i + 1}: indica el peso en kg (${cat.name})`, severity: 'error' })
        return
      }
      if (unit === 'peso' && (it.cost_price === '' || +it.cost_price < 0)) {
        setSnack({ open: true, msg: `Producto ${i + 1}: indica el precio por kg (${cat.name})`, severity: 'error' })
        return
      }
      if (unit === 'unidad' && (it.pack_price === '' || +it.pack_price < 0)) {
        setSnack({ open: true, msg: `Producto ${i + 1}: indica el precio del empaque (${cat.name})`, severity: 'error' })
        return
      }
      if (unit === 'unidad' && (!(+it.boxes > 0) || !(+it.units_per_box > 0))) {
        setSnack({ open: true, msg: `Producto ${i + 1}: indica cajas y unidades por caja (${cat.name})`, severity: 'error' })
        return
      }
    }

    const payload = {
      supplier: supplier.trim() || null,
      items: items.map((it) => {
        const prod = selectedProduct(it)
        const cat = categorias.find(c => c.id === Number(it.category_id)) || (prod && categorias.find(c => c.id === prod.category_id))
        const unit = (it.unit || prod?.sale_unit || cat?.sale_unit || 'unidad')
        const base = {
          sale_price: it.sale_price !== '' && it.sale_price !== null ? +it.sale_price : undefined,
          min_stock: +it.min_stock || 0,
        }
        if (unit === 'peso') {
          base.cost_price = +it.cost_price || 0
        } else {
          base.cost_price = costoUnitario(it)
        }
        if (it.existing && prod) {
          base.product_id = prod.id
        } else {
          base.name = (it.name || (prod ? prod.name : '')).trim()
          if (it.barcode) base.barcode = it.barcode.trim()
          base.category_id = cat ? cat.id : (prod ? prod.category_id : null)
        }
        if (unit === 'peso') {
          base.weight_kg = +it.weight_kg
        } else {
          base.boxes = +it.boxes
          base.units_per_box = +it.units_per_box
        }
        return base
      }),
    }

    try {
      await createCompra(payload)
      setSnack({ open: true, msg: 'Compra registrada exitosamente', severity: 'success' })
      onSaved()
      onClose()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al crear compra'
      setSnack({ open: true, msg, severity: 'error' })
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden' } } }}
      >
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          bgcolor: '#2D5A1E', color: '#FFF8F0', py: 2, px: 3,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Add sx={{ fontSize: 22 }} />
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, fontSize: '1.15rem' }}>
              Nueva Compra
            </Typography>
          </Box>
          <IconButton
            onClick={onClose}
            size="small"
            sx={{ color: 'rgba(255, 248, 240, 0.6)', '&:hover': { color: '#FFF8F0', bgcolor: 'rgba(255,248,240,0.1)' } }}
          >
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, px: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <InfoOutlined sx={{ fontSize: 16, color: '#6B5344' }} />
            <Typography variant="caption" sx={{ color: '#6B5344' }}>
              Los costos se registran en <b>USD</b>. La conversión a bolívares se hará al momento del pago.
            </Typography>
          </Box>

          <TextField
            label="Proveedor (opcional)"
            fullWidth
            size="small"
            autoComplete="off"
            name="proveedor"
            value={supplier}
            onChange={e => setSupplier(e.target.value)}
            placeholder="Nombre del proveedor"
            slotProps={{
              input: {
                startAdornment: <Person sx={{ fontSize: 18, color: '#6B5344', mr: 1, opacity: 0.5 }} />,
              },
            }}
            sx={{
              mb: 3,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.15)' },
                '&:hover fieldset': { borderColor: 'rgba(45, 90, 30, 0.3)' },
                '&.Mui-focused fieldset': { borderColor: '#2D5A1E' },
              },
            }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography sx={{ fontWeight: 600, color: '#2C1810', fontSize: '0.9rem' }}>
                Productos
              </Typography>
              {productos.length > 0 && (
                <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.7rem' }}>
                  {productos.length} en el inventario · busca por nombre o código
                </Typography>
              )}
            </Box>
            <Button
              onClick={handleAddItem}
              size="small"
              startIcon={<Add />}
              sx={{ color: '#2D5A1E', fontWeight: 600, fontSize: '0.8rem', '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.08)' } }}
            >
              Agregar
            </Button>
          </Box>

          {items.map((item, idx) => {
            const unit = itemUnit(item)
            const prod = selectedProduct(item)
            const cat = categorias.find(c => c.id === Number(item.category_id)) ||
                        (prod && categorias.find(c => c.id === prod.category_id))
            const q = item.name.trim().toLowerCase()
            const filtered = q
              ? productos
                  .filter(p =>
                    p.name.toLowerCase().includes(q) ||
                    (p.barcode && String(p.barcode).toLowerCase().includes(q))
                  )
                  .slice(0, 30)
              : []
            return (
              <Box
                key={item.id}
                sx={{
                  mb: 2,
                  p: 2,
                  borderRadius: 2.5,
                  border: `1px solid ${itemUnit(item) === 'peso' ? 'rgba(230, 145, 56, 0.4)' : 'rgba(45, 90, 30, 0.12)'}`,
                  bgcolor: itemUnit(item) === 'peso' ? 'rgba(230, 145, 56, 0.04)' : 'rgba(45, 90, 30, 0.02)',
                  animation: 'fade-in-up 0.25s ease-out both',
                }}
              >
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5 }}>
                  <Box sx={{ position: 'relative', flexGrow: 1, minWidth: 0 }}>
                    <TextField
                      autoComplete="off"
                      name="producto-nombre"
                      label={prod ? 'Producto seleccionado' : 'Nombre y presentación del producto *'}
                      placeholder="Ej: Harina PAN 1kg, Tomate (kg)..."
                      value={item.name}
                      onChange={e => handleItemChange(idx, 'name', e.target.value)}
                      onFocus={() => setOpenSearch(idx)}
                      onBlur={() => setTimeout(() => setOpenSearch(null), 150)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && filtered.length > 0) {
                          e.preventDefault()
                          selectProduct(idx, filtered[0])
                        }
                      }}
                      fullWidth
                      slotProps={{
                        input: {
                          startAdornment: <Store sx={{ fontSize: 20, color: '#2D5A1E', mr: 1.25, opacity: 0.7 }} />,
                        },
                      }}
                      sx={{
                        '& .MuiInputBase-root': {
                          borderRadius: 2,
                          py: 0.4,
                          fontSize: '0.98rem',
                          fontWeight: 500,
                        },
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: 'rgba(45, 90, 30, 0.25)' },
                          '&:hover fieldset': { borderColor: 'rgba(45, 90, 30, 0.4)' },
                          '&.Mui-focused fieldset': { borderColor: '#2D5A1E', borderWidth: '2px' },
                        },
                      }}
                    />
                    {openSearch === idx && item.name.trim() && filtered.length > 0 && (
                      <Paper
                        sx={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
                          maxHeight: 220, overflow: 'auto', mt: 0.5, borderRadius: 2,
                          boxShadow: '0 8px 24px rgba(44, 24, 16, 0.12)',
                          border: '1px solid rgba(45, 90, 30, 0.1)',
                          animation: 'fade-in-up 0.15s ease-out both',
                        }}
                      >
                        {filtered.map(p => (
                          <Box
                            key={p.id}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => selectProduct(idx, p)}
                            sx={{
                              display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1,
                              cursor: 'pointer', transition: 'background 0.1s ease',
                              borderBottom: '1px solid rgba(44, 24, 16, 0.04)',
                              '&:hover': { bgcolor: 'rgba(45, 90, 30, 0.08)' },
                              '&:last-of-type': { borderBottom: 'none' },
                            }}
                          >
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2C1810' }}>
                                {p.name}
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                                {p.barcode && (
                                  <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.68rem', fontFamily: 'monospace' }}>
                                    {p.barcode}
                                  </Typography>
                                )}
                                <Typography variant="caption" sx={{ color: stockColor(p), fontSize: '0.68rem', fontWeight: 600 }}>
                                  Stock: {formatStock(p)}
                                </Typography>
                                {p.category_name && (
                                  <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.68rem' }}>
                                    {p.category_name}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          </Box>
                        ))}
                      </Paper>
                    )}
                  </Box>
                  {items.length > 1 && (
                    <IconButton onClick={() => handleRemoveItem(idx)} size="small" aria-label={`Quitar producto`} sx={{ color: '#C62828', '&:hover': { bgcolor: 'rgba(198,40,40,0.08)' } }}>
                      <Close fontSize="small" />
                    </IconButton>
                  )}
                </Box>

                {!prod && item.name.trim() && (
                  <Chip
                    size="small"
                    icon={<InfoOutlined sx={{ fontSize: 14 }} />}
                    label="Producto nuevo: se creará en el inventario al registrar la compra"
                    sx={{ mb: 1.5, bgcolor: 'rgba(230,145,56,0.12)', color: '#B76E00', fontWeight: 600, borderRadius: 1.5, fontSize: '0.7rem' }}
                  />
                )}

                {!item.existing && !prod && (
                  <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
                    <TextField
                      label="Código de barras (opcional)"
                      size="small"
                      autoComplete="off"
                      name="codigo-barras"
                      value={item.barcode}
                      onChange={e => handleItemChange(idx, 'barcode', e.target.value)}
                      sx={{ flex: '1 1 220px', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                    <FormControl sx={{ flex: '1 1 240px' }} size="small">
                      <InputLabel id={`categoria-label-${item.id}`}>Categoría *</InputLabel>
                      <Select
                        labelId={`categoria-label-${item.id}`}
                        label="Categoría *"
                        value={item.category_id !== '' && item.category_id !== null ? item.category_id : ''}
                        onChange={e => {
                          const v = e.target.value
                          const catSel = categorias.find(c => String(c.id) === String(v))
                          updateItem(idx, {
                            category_id: v,
                            unit: catSel ? catSel.sale_unit : '',
                          })
                        }}
                        sx={{ borderRadius: 2 }}
                      >
                        {categorias.map(c => (
                          <MenuItem key={c.id} value={c.id}>
                            {c.name} ({c.sale_unit === 'peso' ? 'peso' : 'unidad'})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                )}
                {prod && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
                    {prod.category_name && (
                      <Chip
                        size="small"
                        icon={<Store sx={{ fontSize: 14 }} />}
                        label={`${prod.category_name} · ${prod.sale_unit === 'peso' ? 'por peso (kg)' : 'por unidad'}`}
                        sx={{ bgcolor: 'rgba(45, 90, 30, 0.08)', color: '#2D5A1E', fontWeight: 500, borderRadius: 1.5, fontSize: '0.7rem' }}
                      />
                    )}
                    <Chip
                      size="small"
                      icon={<Inventory2 sx={{ fontSize: 14 }} />}
                      label={`Stock actual: ${formatStock(prod)}`}
                      sx={{
                        bgcolor: stockColor(prod) === '#C62828' ? 'rgba(198,40,40,0.1)' : 'rgba(45,90,30,0.08)',
                        color: stockColor(prod),
                        fontWeight: 600,
                        borderRadius: 1.5,
                        fontSize: '0.7rem',
                      }}
                    />
                    {prod.min_stock > 0 && (
                      <Typography variant="caption" sx={{ color: '#6B5344' }}>
                        Stock mín. {prod.min_stock}
                      </Typography>
                    )}
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
                  {unit === 'peso' ? (
                    <TextField
                      label="Precio por kg (US$) *"
                      type="number"
                      size="small"
                      value={item.cost_price}
                      onChange={e => handleItemChange(idx, 'cost_price', limpiarNumero(e.target.value))}
                      slotProps={{
                        htmlInput: { min: 0, step: '0.01' },
                        input: {
                          startAdornment: <Payments sx={{ fontSize: 16, color: '#6B5344', mr: 1, opacity: 0.5 }} />,
                        },
                      }}
                      sx={{ flex: '1 1 200px', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                  ) : (
                    <TextField
                      label="Precio del empaque (US$) *"
                      type="number"
                      size="small"
                      value={item.pack_price}
                      onChange={e => handleItemChange(idx, 'pack_price', limpiarNumero(e.target.value))}
                      slotProps={{
                        htmlInput: { min: 0, step: '0.01' },
                        input: {
                          startAdornment: <Payments sx={{ fontSize: 16, color: '#6B5344', mr: 1, opacity: 0.5 }} />,
                        },
                      }}
                      helperText={item.units_per_box && item.pack_price !== ''
                        ? `Costo por unidad: $ ${formatNumber(costoUnitario(item))}`
                        : 'Se divide entre las unidades por caja'}
                      sx={{ flex: '1 1 180px', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                  )}
                  <TextField
                    label={unit === 'peso' ? 'Venta $/kg (opcional)' : 'Venta $/unidad (opcional)'}
                    type="number"
                    size="small"
                    value={item.sale_price}
                    onChange={e => handleItemChange(idx, 'sale_price', limpiarNumero(e.target.value))}
                    slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                    sx={{ flex: '1 1 110px', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                  <TextField
                    label="Stock mín."
                    type="number"
                    size="small"
                    value={item.min_stock}
                    onChange={e => handleItemChange(idx, 'min_stock', limpiarNumero(e.target.value))}
                    slotProps={{ htmlInput: { min: 0 } }}
                    sx={{ width: 110, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Box>

                {unit === 'peso' ? (
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <TextField
                      label="Peso (kg) *"
                      type="number"
                      size="small"
                      value={item.weight_kg}
                      onChange={e => handleItemChange(idx, 'weight_kg', limpiarNumero(e.target.value))}
                      slotProps={{
                        htmlInput: { min: 0.01, step: '0.01' },
                        input: {
                          startAdornment: <Scale sx={{ fontSize: 18, color: '#E69138', mr: 1 }} />,
                          endAdornment: <InputAdornment position="end">kg</InputAdornment>,
                        },
                      }}
                      sx={{ flex: '1 1 180px', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                    <Box sx={{ bgcolor: 'rgba(230,145,56,0.1)', px: 2, py: 1, borderRadius: 2, display: 'flex', gap: 2 }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.62rem', textTransform: 'uppercase' }}>Gramos</Typography>
                        <Typography sx={{ fontWeight: 700, color: '#2C1810', fontSize: '0.9rem' }}>
                          {((+item.weight_kg || 0) * 1000).toLocaleString('es-VE')} g
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.62rem', textTransform: 'uppercase' }}>Subtotal</Typography>
                        <Typography sx={{ fontWeight: 700, color: '#E6A23C', fontSize: '0.9rem' }}>
                          $ {formatNumber(itemSubtotal(item))}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <TextField
                      label="Cajas *"
                      type="number"
                      size="small"
                      value={item.boxes}
                      onChange={e => handleItemChange(idx, 'boxes', limpiarNumero(e.target.value))}
                      slotProps={{
                        htmlInput: { min: 1 },
                        input: { startAdornment: <Inventory2 sx={{ fontSize: 18, color: '#2D5A1E', mr: 1, opacity: 0.6 }} /> },
                      }}
                      sx={{ flex: '1 1 100px', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                    <TextField
                      label="Unidades / caja *"
                      type="number"
                      size="small"
                      value={item.units_per_box}
                      onChange={e => handleItemChange(idx, 'units_per_box', limpiarNumero(e.target.value))}
                      slotProps={{ htmlInput: { min: 1 } }}
                      sx={{ flex: '1 1 120px', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                    <Box sx={{ bgcolor: 'rgba(45,90,30,0.08)', borderRadius: 2, px: 2, py: 1, minWidth: 96 }}>
                      <Typography variant="caption" sx={{ color: '#6B5344', fontSize: '0.62rem', textTransform: 'uppercase' }}>Subtotal</Typography>
                      <Typography sx={{ fontWeight: 700, color: '#2D5A1E', fontSize: '0.9rem' }}>
                        $ {formatNumber(itemSubtotal(item))}
                      </Typography>
                      <Typography sx={{ fontWeight: 400, fontSize: '0.7rem', color: '#6B5344' }}>
                        {((+item.boxes || 0) * (+item.units_per_box || 0)).toLocaleString('es-VE')} und.
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            )
          })}

          {totalEstimado > 0 && (
            <Box sx={{
              mt: 2, pt: 2, borderTop: '2px solid #2D5A1E',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Typography sx={{ color: '#6B5344', fontWeight: 500, fontSize: '0.9rem' }}>
                Total estimado
              </Typography>
              <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2D5A1E', fontSize: '1.2rem' }}>
                $ {formatNumber(totalEstimado)}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, px: 3, borderTop: '1px solid rgba(45, 90, 30, 0.08)', bgcolor: '#F8F5F0' }}>
          <Button
            onClick={onClose}
            sx={{ color: '#6B5344', fontWeight: 500, borderRadius: 2, px: 3, '&:hover': { bgcolor: 'rgba(107,83,68,0.08)' } }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            sx={{
              bgcolor: '#2D5A1E', '&:hover': { bgcolor: '#1E3D14', transform: 'translateY(-1px)' },
              px: 4, py: 1, borderRadius: 2, fontWeight: 600,
              boxShadow: '0 4px 12px rgba(45,90,30,0.25)', transition: 'all 0.2s ease',
            }}
          >
            Registrar Compra
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack({ ...snack, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snack.severity} variant="filled" sx={{ borderRadius: 2.5, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', fontWeight: 500, '& .MuiAlert-icon': { fontSize: 20 } }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </>
  )
}