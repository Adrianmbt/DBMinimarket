import { useState, useEffect } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, IconButton, Typography, Chip, Alert, Snackbar, Box,
  MenuItem, Select, FormControl, InputLabel, Avatar,
} from '@mui/material'
import {
  Add, Edit, Delete, Lock, ManageAccounts, Person, Badge,
} from '@mui/icons-material'
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario } from '../api/usuarios'
import { readSession } from '../utils/session'
import Paginador from './Paginador'
import { usePaginacion } from '../hooks/usePaginacion'

const emptyForm = { username: '', full_name: '', role: 'vendedor', password: '' }

export default function Usuarios() {
  const rawUser = readSession('user')
  const currentUser = JSON.parse(rawUser || '{}')

  const [usuarios, setUsuarios] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [eliminar, setEliminar] = useState(null)
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' })

  const filtrados = (() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return usuarios
    return usuarios.filter(u =>
      (u.username || '').toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    )
  })()
  const { page, rowsPerPage, total, actuales, handleChangePage, handleChangeRowsPerPage } = usePaginacion(filtrados)

  const load = async () => {
    try {
      const res = await getUsuarios()
      setUsuarios(res.data)
    } catch {
      setSnack({ open: true, msg: 'Error al cargar usuarios', severity: 'error' })
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditId(null)
    setForm(emptyForm)
    setOpen(true)
  }

  const openEdit = (u) => {
    setEditId(u.id)
    setForm({ username: u.username, full_name: u.full_name || '', role: u.role || 'vendedor', password: '' })
    setOpen(true)
  }

  const handleSave = async () => {
    if (!form.username.trim()) {
      setSnack({ open: true, msg: 'Ingresa el nombre de usuario', severity: 'error' })
      return
    }
    if (!editId && form.password.length < 6) {
      setSnack({ open: true, msg: 'La contraseña debe tener al menos 6 caracteres', severity: 'error' })
      return
    }
    setSaving(true)
    try {
      if (editId) {
        const payload = {
          username: form.username.trim(),
          full_name: form.full_name.trim() || null,
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        }
        await updateUsuario(editId, payload)
        setSnack({ open: true, msg: 'Usuario actualizado', severity: 'success' })
      } else {
        await createUsuario({
          username: form.username.trim(),
          password: form.password,
          full_name: form.full_name.trim() || null,
          role: form.role,
        })
        setSnack({ open: true, msg: 'Usuario creado', severity: 'success' })
      }
      setOpen(false)
      load()
    } catch (err) {
      setSnack({ open: true, msg: err.response?.data?.detail || 'Error al guardar el usuario', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!eliminar) return
    try {
      await deleteUsuario(eliminar.id)
      setSnack({ open: true, msg: `Usuario "${eliminar.username}" eliminado`, severity: 'success' })
      setEliminar(null)
      load()
    } catch (err) {
      setSnack({ open: true, msg: err.response?.data?.detail || 'Error al eliminar el usuario', severity: 'error' })
      setEliminar(null)
    }
  }

  const rolChip = (role) => (
    <Chip
      icon={role === 'admin' ? <Lock sx={{ fontSize: 13 }} /> : <Person sx={{ fontSize: 13 }} />}
      label={role === 'admin' ? 'Administrador' : 'Vendedor'}
      size="small"
      sx={{
        fontWeight: 600, fontSize: '0.72rem', borderRadius: 1.5,
        bgcolor: role === 'admin' ? 'rgba(45, 90, 30, 0.12)' : 'rgba(201, 149, 42, 0.12)',
        color: role === 'admin' ? '#2D5A1E' : '#9E721E',
      }}
    />
  )

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        mb: 3.5, flexWrap: 'wrap', gap: 2,
      }}>
        <Box sx={{ animation: 'fade-in-up 0.5s ease-out both' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <ManageAccounts sx={{ fontSize: 28, color: '#C9952A' }} />
            <Typography variant="h4" sx={{
              fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2C1810',
              fontSize: { xs: '1.5rem', sm: '1.85rem' },
            }}>
              Usuarios
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6B5344', ml: 0.5 }}>
            {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} · solo administradores
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={openCreate}
          sx={{
            background: 'linear-gradient(135deg, #C9952A 0%, #B8862A 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #D4A235 0%, #C9952A 100%)',
              transform: 'translateY(-1px)', boxShadow: '0 6px 20px rgba(201, 149, 42, 0.4)',
            },
            px: 3.5, py: 1.2, borderRadius: 2.5,
            fontSize: '0.9rem', fontWeight: 600,
            boxShadow: '0 4px 14px rgba(201, 149, 42, 0.3)',
            transition: 'all 0.2s ease', animation: 'fade-in-up 0.5s ease-out 0.15s both',
          }}
        >
          Nuevo Usuario
        </Button>
      </Box>

      {/* Buscador */}
      <TextField
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por usuario, nombre o rol…"
        size="small"
        fullWidth
        sx={{
          mb: 2,
          '& .MuiInputBase-root': { borderRadius: 2 },
          '& fieldset': { borderColor: 'rgba(201, 149, 42, 0.25)' },
          '& .Mui-focused fieldset': { borderColor: '#C9952A' },
        }}
      />

      {/* Tabla */}
      <TableContainer
        component={Paper}
        sx={{
          borderRadius: 3, border: '1px solid rgba(201, 149, 42, 0.06)',
          boxShadow: '0 1px 4px rgba(44, 24, 16, 0.06)',
          animation: 'fade-in-up 0.5s ease-out 0.2s both', overflow: 'hidden',
        }}
      >
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8F5F0' }}>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Usuario</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Nombre completo</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Rol</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: '#6B5344', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {actuales.map((u) => {
              const soyYo = u.id === currentUser.id
              return (
                <TableRow
                  key={u.id}
                  sx={{
                    animation: 'fade-in-up 0.3s ease-out both',
                    bgcolor: soyYo ? 'rgba(201, 149, 42, 0.04)' : 'transparent',
                    '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.04)' },
                    transition: 'background 0.15s ease',
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{
                        width: 34, height: 34,
                        bgcolor: u.role === 'admin' ? 'rgba(45, 90, 30, 0.12)' : 'rgba(201, 149, 42, 0.14)',
                        color: u.role === 'admin' ? '#2D5A1E' : '#C9952A',
                        fontSize: '0.9rem', fontWeight: 700,
                      }}>
                        {u.username.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#2C1810', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {u.username}
                          {soyYo && (
                            <Chip label="tú" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#C9952A', color: '#FFF8F0', fontWeight: 600 }} />
                          )}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#6B5344' }}>ID #{u.id}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.85rem', color: '#2C1810', fontWeight: 500 }}>
                    {u.full_name || '—'}
                  </TableCell>
                  <TableCell>{rolChip(u.role)}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(u)} sx={{ color: '#C9952A', mr: 0.5, '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.1)' } }}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      disabled={soyYo}
                      onClick={() => setEliminar(u)}
                      sx={{ color: '#C62828', opacity: soyYo ? 0.3 : 0.7, '&:hover': { opacity: 1, bgcolor: 'rgba(198, 40, 40, 0.08)' } }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              )
            })}
            {filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} sx={{ py: 6 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Avatar sx={{ width: 56, height: 56, bgcolor: 'rgba(201, 149, 42, 0.08)', mx: 'auto', mb: 1.5 }}>
                      <ManageAccounts sx={{ fontSize: 28, color: '#C9952A' }} />
                    </Avatar>
                    <Typography sx={{ color: '#6B5344', fontWeight: 500, mb: 0.5 }}>
                      {busqueda.trim() ? 'No se encontraron usuarios' : 'No hay usuarios registrados'}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Paginador page={page} rowsPerPage={rowsPerPage} total={total} onPageChange={handleChangePage} onRowsPerPageChange={handleChangeRowsPerPage} />
      </TableContainer>

      {/* Crear / Editar */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          bgcolor: '#C9952A', color: '#FFF8F0', py: 2, px: 3,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Badge sx={{ fontSize: 22 }} />
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 600, fontSize: '1.15rem' }}>
              {editId ? 'Editar Usuario' : 'Nuevo Usuario'}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, px: 3, display: 'grid', gap: 2, mt: 1 }}>
          <TextField
            label="Nombre de usuario"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            fullWidth
            required
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            label="Nombre completo"
            value={form.full_name}
            onChange={e => setForm({ ...form, full_name: e.target.value })}
            fullWidth
            placeholder="Opcional"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <FormControl fullWidth>
            <InputLabel>Rol</InputLabel>
            <Select
              label="Rol"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="vendedor">Vendedor</MenuItem>
              <MenuItem value="admin">Administrador</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label={editId ? 'Nueva contraseña (opcional)' : 'Contraseña'}
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            fullWidth
            required={!editId}
            helperText={editId ? 'Déjala vacía para mantener la actual' : 'Mínimo 6 caracteres'}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5, px: 3, borderTop: '1px solid rgba(201, 149, 42, 0.08)', bgcolor: '#F8F5F0' }}>
          <Button onClick={() => setOpen(false)} sx={{ color: '#6B5344', fontWeight: 500 }}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ bgcolor: '#2D5A1E', '&:hover': { bgcolor: '#1E3D14' }, fontWeight: 600 }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmar eliminación */}
      <Dialog open={!!eliminar} onClose={() => setEliminar(null)} maxWidth="xs" fullWidth>
        <DialogContent sx={{ pt: 3, px: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <Person sx={{ color: '#C9952A' }} />
            <Typography sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2C1810', fontSize: '1.2rem' }}>
              Eliminar usuario
            </Typography>
          </Box>
          <Alert severity="warning" sx={{ borderRadius: 2, fontSize: '0.85rem' }}>
            ¿Seguro que deseas eliminar a <b>{eliminar?.full_name || eliminar?.username}</b> ({eliminar?.username})? Esta acción no se puede deshacer.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, px: 3, borderTop: '1px solid rgba(201, 149, 42, 0.08)', bgcolor: '#F8F5F0' }}>
          <Button onClick={() => setEliminar(null)} sx={{ color: '#6B5344', fontWeight: 500 }}>Cancelar</Button>
          <Button variant="contained" onClick={handleDelete} sx={{ bgcolor: '#C62828', '&:hover': { bgcolor: '#8E1B1B' }, fontWeight: 600 }}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack({ ...snack, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snack.severity} variant="filled" sx={{ borderRadius: 2.5, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', fontWeight: 500 }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  )
}