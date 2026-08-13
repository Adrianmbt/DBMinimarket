import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  AppBar, Toolbar, Typography, IconButton, Box, Divider, Tooltip, Avatar
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import DashboardIcon from '@mui/icons-material/Dashboard'
import InventoryIcon from '@mui/icons-material/Inventory'
import PointOfSaleIcon from '@mui/icons-material/PointOfSale'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import LogoutIcon from '@mui/icons-material/Logout'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import StorefrontIcon from '@mui/icons-material/Storefront'
import GroupIcon from '@mui/icons-material/Group'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import { getTasa } from '../api/tasa'
import { clearSession } from '../api/axios'
import { useEffect } from 'react'
import { readSession } from '../utils/session'

const drawerWidth = 250

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/', adminOnly: true },
  { text: 'Inventario', icon: <InventoryIcon />, path: '/productos' },
  { text: 'Ventas', icon: <PointOfSaleIcon />, path: '/ventas' },
  { text: 'Compras', icon: <ShoppingCartIcon />, path: '/compras' },
  { text: 'Créditos', icon: <AccountBalanceWalletIcon />, path: '/creditos', adminOnly: true },
  { text: 'Usuarios', icon: <GroupIcon />, path: '/usuarios', adminOnly: true },
]

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [tasa, setTasa] = useState(null)
  const [tasaOpen, setTasaOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const rawUser = readSession('user')
  const user = JSON.parse(rawUser || '{}')
  const isAdmin = user.role === 'admin'

  useEffect(() => {
    getTasa().then(res => setTasa(res.data.rate)).catch(() => {})
  }, [])

  const handleLogout = () => {
    clearSession()
    navigate('/login')
  }

  const fetchTasa = async () => {
    try {
      const res = await getTasa()
      setTasa(res.data.rate)
      setTasaOpen(true)
      setTimeout(() => setTasaOpen(false), 2000)
    } catch {}
  }

  const visibleItems = menuItems.filter(item => !item.adminOnly || isAdmin)

  const drawer = (
    <Box sx={{
      height: '100%',
      background: 'linear-gradient(180deg, #2C1810 0%, #3D2317 100%)',
      color: '#FFF8F0',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <Box sx={{
        p: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        borderBottom: '1px solid rgba(255, 248, 240, 0.1)',
      }}>
        <Avatar sx={{
          bgcolor: '#C9952A',
          width: 42,
          height: 42,
          boxShadow: '0 2px 12px rgba(201, 149, 42, 0.3)',
        }}>
          <StorefrontIcon />
        </Avatar>
        <Box>
          <Typography sx={{
            fontFamily: '"Playfair Display", serif',
            fontWeight: 700,
            fontSize: '1.15rem',
            lineHeight: 1.2,
            color: '#FFF8F0',
          }}>
            Don Beni
          </Typography>
          <Typography sx={{
            fontSize: '0.7rem',
            color: '#E8C46A',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            Minimarket
          </Typography>
        </Box>
      </Box>

      <List sx={{ flex: 1, pt: 2 }}>
        {visibleItems.map((item, i) => {
          const selected = location.pathname === item.path
          return (
            <ListItemButton
              key={item.text}
              selected={selected}
              onClick={() => { navigate(item.path); setMobileOpen(false) }}
              sx={{
                mx: 1.5,
                my: 0.5,
                borderRadius: 3,
                color: selected ? '#FFF8F0' : 'rgba(255, 248, 240, 0.65)',
                bgcolor: selected ? 'rgba(201, 149, 42, 0.2)' : 'transparent',
                '&:hover': {
                  bgcolor: selected ? 'rgba(201, 149, 42, 0.25)' : 'rgba(255, 248, 240, 0.06)',
                  color: '#FFF8F0',
                },
                transition: 'all 0.2s ease',
                animation: `fade-in-left 0.4s ease-out ${0.1 + i * 0.1}s both`,
              }}
            >
              <ListItemIcon sx={{
                color: 'inherit',
                minWidth: 40,
                '& .MuiSvgIcon-root': { fontSize: '1.3rem' },
              }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                slotProps={{
                  primary: {
                    fontWeight: selected ? 600 : 400,
                    fontSize: '0.9rem',
                  },
                }}
              />
            </ListItemButton>
          )
        })}
      </List>

      <Divider sx={{ borderColor: 'rgba(255, 248, 240, 0.1)' }} />

      <List sx={{ pb: 2 }}>
        <ListItemButton
          onClick={fetchTasa}
          sx={{ mx: 1.5, my: 0.5, borderRadius: 3, color: 'rgba(255, 248, 240, 0.65)', '&:hover': { bgcolor: 'rgba(255, 248, 240, 0.06)', color: '#FFF8F0' } }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
            <AccountBalanceIcon sx={{ fontSize: '1.3rem' }} />
          </ListItemIcon>
          <ListItemText
            primary={tasa ? `Bs. ${tasa}` : 'Ver Tasa BCV'}
            slotProps={{ primary: { fontSize: '0.85rem' } }}
          />
        </ListItemButton>
        {user.full_name && (
          <ListItemButton
            sx={{ mx: 1.5, my: 0.5, borderRadius: 3, color: 'rgba(255, 248, 240, 0.5)', cursor: 'default' }}
          >
            <ListItemText
              primary={`👤 ${user.full_name}`}
              slotProps={{ primary: { fontSize: '0.8rem' } }}
            />
          </ListItemButton>
        )}
        <ListItemButton
          onClick={handleLogout}
          sx={{ mx: 1.5, my: 0.5, borderRadius: 3, color: 'rgba(255, 248, 240, 0.65)', '&:hover': { bgcolor: 'rgba(198, 40, 40, 0.15)', color: '#EF5350' } }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
            <LogoutIcon sx={{ fontSize: '1.3rem' }} />
          </ListItemIcon>
          <ListItemText primary="Salir" slotProps={{ primary: { fontSize: '0.9rem' } }} />
        </ListItemButton>
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: 'rgba(255, 248, 240, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(201, 149, 42, 0.12)',
          color: '#2C1810',
          ml: { sm: `${drawerWidth}px` },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          zIndex: (theme) => theme.zIndex.drawer + 1,
          boxShadow: '0 1px 0 rgba(44, 24, 16, 0.04)',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ mr: 2, display: { sm: 'none' }, color: '#2C1810' }}
          >
            <MenuIcon />
          </IconButton>
          <Typography
            variant="h6"
            noWrap
            sx={{
              flexGrow: 1,
              fontFamily: '"Playfair Display", serif',
              fontWeight: 600,
              color: '#2C1810',
              fontSize: '1.1rem',
            }}
          >
            {menuItems.find(m => m.path === location.pathname)?.text || 'Don Beni Minimarket'}
          </Typography>
          {tasa && (
            <Tooltip title="Tasa BCV actual" arrow>
              <Box
                onClick={fetchTasa}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 8,
                  bgcolor: tasaOpen ? 'rgba(201, 149, 42, 0.15)' : 'transparent',
                  border: '1px solid rgba(201, 149, 42, 0.2)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': { bgcolor: 'rgba(201, 149, 42, 0.1)' },
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: '#6B5344',
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  BCV
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: '#2C1810', fontWeight: 600, fontSize: '0.85rem' }}
                >
                  Bs. {tasa}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Toolbar>
      </AppBar>

      <Box component="nav" aria-label="Menú de navegación" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        id="main-content"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          mt: 8,
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #FFF8F0 0%, #F5EDE0 50%, #FFF8F0 100%)',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
