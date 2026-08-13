import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TextField, Button, Typography, Box, Alert, InputAdornment, IconButton, Checkbox, FormControlLabel, CircularProgress } from '@mui/material'
import { login } from '../api/usuarios'
import { writeSession } from '../utils/session'

const DONBENI_LOGO = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#C9952A"/>
      <stop offset="100%" stop-color="#9E721E"/>
    </linearGradient>
  </defs>
  <rect x="8" y="28" width="64" height="44" rx="3" fill="none" stroke="url(#lg)" stroke-width="2.5"/>
  <rect x="8" y="28" width="64" height="12" rx="3" fill="url(#lg)" opacity="0.85"/>
  <rect x="16" y="46" width="10" height="18" rx="1.5" fill="url(#lg)" opacity="0.5"/>
  <rect x="30" y="46" width="10" height="18" rx="1.5" fill="url(#lg)" opacity="0.5"/>
  <rect x="44" y="46" width="10" height="18" rx="1.5" fill="url(#lg)" opacity="0.5"/>
  <rect x="58" y="46" width="10" height="18" rx="1.5" fill="url(#lg)" opacity="0.5"/>
  <path d="M18 28 L40 10 L62 28" fill="none" stroke="url(#lg)" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="40" cy="14" r="3" fill="#FFF8F0" opacity="0.9"/>
</svg>`

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await login({ username, password })
      if (res.data.ok && res.data.token) {
        writeSession('token', res.data.token, remember)
        writeSession('user', JSON.stringify(res.data.user), remember)
        navigate('/')
      } else {
        setError(res.data.message || 'Credenciales inválidas')
      }
    } catch (err) {
      const status = err?.response?.status
      if (status === 429) {
        setError(err?.response?.data?.detail || 'Demasiados intentos. Intenta más tarde.')
      } else {
        setError('Error de conexión con el servidor')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(160deg, #0E0907 0%, #1A0F0A 25%, #2C1810 50%, #1A0F0A 75%, #0E0907 100%)',
    }}>
      {/* Animated warm glow orbs */}
      <Box aria-hidden="true" sx={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 600px 400px at 30% 20%, rgba(201,149,42,0.07) 0%, transparent 70%),
          radial-gradient(ellipse 500px 500px at 70% 80%, rgba(232,99,12,0.05) 0%, transparent 70%),
          radial-gradient(ellipse 800px 600px at 50% 50%, rgba(44,24,16,0.3) 0%, transparent 80%)
        `,
      }} />

      {/* Subtle grid pattern */}
      <Box aria-hidden="true" sx={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(201,149,42,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(201,149,42,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
      }} />

      {/* Noise texture overlay */}
      <Box aria-hidden="true" sx={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
      }} />

      {/* Corner accents */}
      {[
        { top: 0, left: 0, gradient: '90deg', x1: 'rgba(201,149,42,0.35)', x2: 'transparent' },
        { top: 0, right: 0, gradient: '270deg', x1: 'rgba(201,149,42,0.35)', x2: 'transparent' },
        { bottom: 0, left: 0, gradient: '90deg', x1: 'transparent', x2: 'rgba(201,149,42,0.35)' },
        { bottom: 0, right: 0, gradient: '270deg', x1: 'transparent', x2: 'rgba(201,149,42,0.35)' },
      ].map((c, i) => (
        <Box key={i} aria-hidden="true" sx={{
          position: 'absolute', [c.top === 0 ? 'top' : 'bottom']: 0, [c.left === 0 ? 'left' : 'right']: 0,
          width: 140, height: 140, zIndex: 1, pointerEvents: 'none',
          '&::before': {
            content: '""', position: 'absolute',
            [c.top === 0 ? 'top' : 'bottom']: 32, [c.left === 0 ? 'left' : 'right']: 32,
            width: 48, height: 1,
            background: `linear-gradient(${c.gradient}, ${c.x1}, ${c.x2})`,
          },
          '&::after': {
            content: '""', position: 'absolute',
            [c.top === 0 ? 'top' : 'bottom']: 32, [c.left === 0 ? 'left' : 'right']: 32,
            width: 1, height: 48,
            background: `linear-gradient(${c.gradient === '90deg' ? '180deg' : '0deg'}, ${c.x1}, ${c.x2})`,
          },
        }} />
      ))}

      {/* Main card */}
      <Box sx={{
        position: 'relative', zIndex: 3,
        width: '100%', maxWidth: 440, mx: 2,
        animation: 'fade-in-up 0.7s ease-out both',
      }}>
        {/* Brand */}
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          {/* Custom SVG logo */}
          <Box sx={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 88, height: 88, mb: 2.5,
            background: 'linear-gradient(135deg, rgba(201,149,42,0.15) 0%, rgba(201,149,42,0.04) 100%)',
            borderRadius: '50%',
            border: '1.5px solid rgba(201,149,42,0.18)',
            boxShadow: '0 0 40px rgba(201,149,42,0.08), inset 0 0 20px rgba(201,149,42,0.04)',
            position: 'relative',
            '&::before': {
              content: '""', position: 'absolute', inset: -6, borderRadius: '50%',
              border: '1px solid rgba(201,149,42,0.06)',
            },
            '&::after': {
              content: '""', position: 'absolute', inset: -12, borderRadius: '50%',
              border: '1px solid rgba(201,149,42,0.03)',
            },
          }}
            dangerouslySetInnerHTML={{ __html: DONBENI_LOGO }}
          />
          <Typography
            variant="h2"
            sx={{
              fontFamily: '"Playfair Display", serif',
              fontWeight: 700, color: '#FFF8F0',
              fontSize: { xs: '2.1rem', sm: '2.4rem' },
              letterSpacing: '-0.02em', lineHeight: 1.1,
            }}
          >
            Don Beni
          </Typography>
          <Typography
            sx={{
              color: '#E8C46A', letterSpacing: '0.22em',
              textTransform: 'uppercase', fontSize: '0.72rem',
              mt: 0.8, fontWeight: 500,
            }}
          >
            Minimarket
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: 'rgba(255,248,240,0.3)', mt: 2.5, fontSize: '0.82rem' }}
          >
            Inicia sesión para continuar
          </Typography>
        </Box>

        {/* Form card */}
        <Box sx={{
          background: 'linear-gradient(135deg, rgba(255,248,240,0.06) 0%, rgba(255,248,240,0.02) 100%)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderRadius: 3.5,
          border: '1px solid rgba(255,248,240,0.07)',
          boxShadow: '0 8px 40px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,149,42,0.06)',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""', position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(201,149,42,0.25), transparent)',
          },
        }}>
          <Box sx={{ p: { xs: 3, sm: 4 } }}>
            {error && (
              <Alert
                severity="error" role="alert"
                sx={{
                  mb: 2.5, borderRadius: 2,
                  bgcolor: 'rgba(198,40,40,0.12)',
                  color: '#FF8A80',
                  border: '1px solid rgba(198,40,40,0.18)',
                  '& .MuiAlert-icon': { color: '#FF8A80' },
                }}
              >
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleLogin} noValidate>
              <TextField
                label="Usuario"
                id="login-username"
                name="username"
                type="text"
                fullWidth
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                slotProps={{ htmlInput: { id: 'login-username', 'aria-required': 'true' } }}
                sx={{
                  mb: 2.5,
                  '& .MuiOutlinedInput-root': {
                    color: '#FFF8F0', borderRadius: 2.5,
                    bgcolor: 'rgba(255,248,240,0.025)',
                    transition: 'all 0.25s ease',
                    '& fieldset': { borderColor: 'rgba(255,248,240,0.08)' },
                    '&:hover fieldset': { borderColor: 'rgba(201,149,42,0.25)' },
                    '&.Mui-focused fieldset': { borderColor: '#C9952A', borderWidth: 1.5 },
                  },
                  '& .MuiInputLabel-root': { color: 'rgba(255,248,240,0.3)', fontSize: '0.82rem' },
                  '& .MuiInputLabel-root.Mui-focused': { color: '#C9952A' },
                  '& .MuiInputLabel-shrink': { color: '#C9952A' },
                }}
              />
              <TextField
                label="Contraseña"
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                slotProps={{
                  htmlInput: {
                    'aria-required': 'true',
                    'aria-label': 'Contraseña',
                  },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          onClick={() => setShowPassword(s => !s)}
                          edge="end" size="small"
                          sx={{ color: 'rgba(255,248,240,0.3)', '&:hover': { color: '#C9952A' } }}
                        >
                          {showPassword
                            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="m14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          }
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{
                  mb: 1.5,
                  '& .MuiOutlinedInput-root': {
                    color: '#FFF8F0', borderRadius: 2.5,
                    bgcolor: 'rgba(255,248,240,0.025)',
                    transition: 'all 0.25s ease',
                    '& fieldset': { borderColor: 'rgba(255,248,240,0.08)' },
                    '&:hover fieldset': { borderColor: 'rgba(201,149,42,0.25)' },
                    '&.Mui-focused fieldset': { borderColor: '#C9952A', borderWidth: 1.5 },
                  },
                  '& .MuiInputLabel-root': { color: 'rgba(255,248,240,0.3)', fontSize: '0.82rem' },
                  '& .MuiInputLabel-root.Mui-focused': { color: '#C9952A' },
                  '& .MuiInputLabel-shrink': { color: '#C9952A' },
                }}
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    size="small"
                    sx={{
                      color: 'rgba(255,248,240,0.2)',
                      '&.Mui-checked': { color: '#C9952A' },
                    }}
                  />
                }
                label={
                  <Typography sx={{ color: 'rgba(255,248,240,0.35)', fontSize: '0.78rem' }}>
                    Recordar sesión
                  </Typography>
                }
                sx={{ mb: 3, ml: 0 }}
              />

              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading}
                aria-label="Iniciar sesión"
                sx={{
                  py: 1.8, borderRadius: 2.5,
                  fontSize: '0.95rem', fontWeight: 600,
                  letterSpacing: '0.03em',
                  background: 'linear-gradient(135deg, #C9952A 0%, #9E721E 100%)',
                  color: '#FFF8F0',
                  boxShadow: '0 4px 24px rgba(201,149,42,0.22)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #D4A235 0%, #C9952A 100%)',
                    boxShadow: '0 8px 36px rgba(201,149,42,0.32)',
                    transform: 'translateY(-1px)',
                  },
                  '&:active': { transform: 'translateY(0)' },
                  '&.Mui-disabled': {
                    background: 'rgba(201,149,42,0.35)',
                    color: 'rgba(255,248,240,0.35)',
                    boxShadow: 'none',
                  },
                  transition: 'all 0.25s ease',
                }}
              >
                {loading
                  ? <CircularProgress size={22} sx={{ color: 'rgba(255,248,240,0.7)' }} />
                  : 'Ingresar'
                }
              </Button>
            </Box>
          </Box>
        </Box>

        {/* Footer */}
        <Typography
          variant="caption" align="center"
          sx={{
            display: 'block', mt: 4,
            color: 'rgba(255,248,240,0.12)',
            fontSize: '0.68rem', letterSpacing: '0.06em',
          }}
        >
          Sistema de Gestión &mdash; Don Beni Minimarket
        </Typography>
      </Box>
    </Box>
  )
}