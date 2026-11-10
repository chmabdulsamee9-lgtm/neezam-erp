import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { SyncProvider } from './context/SyncContext.jsx'
import AppCrashBoundary from './components/AppCrashBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppCrashBoundary>
        <SyncProvider>
          <App />
        </SyncProvider>
      </AppCrashBoundary>
    </BrowserRouter>
  </StrictMode>,
)
