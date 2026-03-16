import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/App.css'
import { offlineDB } from './services/offlineDB'

// Initialize offline database
offlineDB.init().catch((error) => {
  console.warn('Failed to initialize offline database:', error)
})

// Register Service Worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('✅ Service Worker registered:', registration)

        // Check for updates periodically
        setInterval(() => {
          registration.update()
        }, 60000) // Every minute
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error.message, error)
        // Provide more details about the error
        if (error instanceof TypeError) {
          console.error('Possible causes: Network issue, CORS problem, or invalid script')
        }
      })
  })
} else {
  console.warn('Service Workers not supported in this browser')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
