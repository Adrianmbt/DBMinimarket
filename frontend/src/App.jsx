import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider, createTheme, CssBaseline, CircularProgress, Box } from '@mui/material'
import Layout from './components/Layout'
import { readSession } from './utils/session'

// Carga bajo demanda (code-splitting) para acelerar el primer render.
const Dashboard = lazy(() => import('./components/Dashboard'))
const Productos = lazy(() => import('./components/Productos'))
const Ventas = lazy(() => import('./components/Ventas'))
const Compras = lazy(() => import('./components/Compras'))
const Usuarios = lazy(() => import('./components/Usuarios'))
const Creditos = lazy(() => import('./components/Creditos'))
const Login = lazy(() => import('./components/Login'))

const theme = createTheme({
  palette: {
    primary: {
      main: '#C9952A',
      light: '#E8C46A',
      dark: '#9E721E',
    },
    secondary: {
      main: '#2D5A1E',
      light: '#4A8A34',
    },
    background: {
      default: '#FFF8F0',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#2C1810',
      secondary: '#6B5344',
    },
    error: {
      main: '#C62828',
    },
    warning: {
      main: '#E8630C',
    },
  },
  typography: {
    fontFamily: '"DM Sans", sans-serif',
    h1: { fontFamily: '"Playfair Display", serif', fontWeight: 700 },
    h2: { fontFamily: '"Playfair Display", serif', fontWeight: 700 },
    h3: { fontFamily: '"Playfair Display", serif', fontWeight: 600 },
    h4: { fontFamily: '"Playfair Display", serif', fontWeight: 600 },
    h5: { fontFamily: '"Playfair Display", serif', fontWeight: 600 },
    h6: { fontFamily: '"DM Sans", sans-serif', fontWeight: 600 },
    button: {
      fontWeight: 600,
      textTransform: 'none',
      borderRadius: 10,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          padding: '8px 20px',
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 6px 16px rgba(201, 149, 42, 0.3)',
          },
        },
        contained: {
          boxShadow: '0 2px 8px rgba(201, 149, 42, 0.2)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 1px 4px rgba(44, 24, 16, 0.06), 0 1px 2px rgba(44, 24, 16, 0.04)',
          transition: 'all 0.2s ease',
          border: '1px solid rgba(201, 149, 42, 0.08)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          backgroundColor: '#FFF8F0',
          color: '#6B5344',
          fontSize: '0.8rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 20,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            transition: 'all 0.2s ease',
            '&:hover': {
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#C9952A',
              },
            },
            '&.Mui-focused': {
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#C9952A',
                borderWidth: 2,
              },
            },
          },
          '& .MuiInputLabel-root.Mui-focused': {
            color: '#C9952A',
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: '1px solid rgba(201, 149, 42, 0.08)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: 'none',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          margin: '2px 8px',
          transition: 'all 0.2s ease',
        },
      },
    },
    MuiSnackbar: {
      styleOverrides: {
        root: {
          '& .MuiAlert-root': {
            borderRadius: 12,
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
  },
})

// Lee la sesión desde localStorage o sessionStorage ("Recordar sesión").
function getSessionUser() {
  const u = readSession('user')
  try {
    return u ? JSON.parse(u) : null
  } catch {
    return null
  }
}

function ProtectedRoute({ children }) {
  const user = getSessionUser()
  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function AdminRoute({ children }) {
  const user = getSessionUser()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return <Layout>{children}</Layout>
}

function PublicRoute({ children }) {
  const user = getSessionUser()
  if (user) return <Navigate to="/" replace />
  return children
}

function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <CircularProgress />
    </Box>
  )
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/productos" element={<ProtectedRoute><Productos /></ProtectedRoute>} />
            <Route path="/ventas" element={<ProtectedRoute><Ventas /></ProtectedRoute>} />
            <Route path="/compras" element={<ProtectedRoute><Compras /></ProtectedRoute>} />
            <Route path="/creditos" element={<AdminRoute><Creditos /></AdminRoute>} />
            <Route path="/usuarios" element={<AdminRoute><Usuarios /></AdminRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  )
}
