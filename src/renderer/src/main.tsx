import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installMockBridge } from './mock'
import './styles.css'

// Fuera de Electron (vista previa en el navegador) se usa un modo demostración.
if (!window.cdm) installMockBridge()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
