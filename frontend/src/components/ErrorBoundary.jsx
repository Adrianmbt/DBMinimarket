import { Component } from 'react'
import { Typography, Box } from '@mui/material'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: '#C62828', fontWeight: 700, mb: 1 }}>Ocurrió un error inesperado</Typography>
          <Typography variant="body2" sx={{ color: '#6B5344' }}>
            {String(this.state.error?.message || this.state.error)}
          </Typography>
          <Typography variant="caption" sx={{ color: '#6B5344', display: 'block', mt: 2 }}>
            Recarga la página (Ctrl + Shift + R). Si persiste, comparte este mensaje.
          </Typography>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16 }}>
            Recargar
          </button>
        </Box>
      )
    }
    return this.props.children
  }
}