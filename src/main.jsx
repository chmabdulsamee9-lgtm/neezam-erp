import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { SyncProvider } from './context/SyncContext.jsx'
import AppCrashBoundary from './components/AppCrashBoundary.jsx'
import { installFetchRetry } from './lib/fetchResilience'

// before anything fetches: a read request dropped by a flaky HTTP/3 connection is tried again
installFetchRetry()

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
