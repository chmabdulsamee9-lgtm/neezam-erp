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

// keep the portal's own files in the browser (public/sw.js), so a dropped connection never stops the portal or a page from opening
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}

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
