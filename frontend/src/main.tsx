import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/App.css'
import { offlineDB } from './services/offlineDB'

// Initialize offline database
offlineDB.init().catch((error) => {
  console.warn('Failed to initialize offline database:', error)
})

// --- Service Worker Management ---
// Bump this number whenever the Service Worker changes to force browsers
// to clear old caches and activate the new SW immediately.
const SW_VERSION = 4;

async function clearAllCachesAndSWs(): Promise<boolean> {
  let cleared = false;
  try {
    // Delete all Cache Storage entries
    const cacheNames = await caches.keys();
    if (cacheNames.length > 0) {
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('[SW] Cleared all caches:', cacheNames);
      cleared = true;
    }
    // Unregister all service workers
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length > 0) {
      await Promise.all(registrations.map(r => r.unregister()));
      console.log('[SW] Unregistered all service workers');
      cleared = true;
    }
  } catch (err) {
    console.warn('[SW] Failed to clear caches/SWs:', err);
  }
  return cleared;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    // Check if we need to force a full cache reset
    const storedVersion = localStorage.getItem('sw_version');
    if (storedVersion !== String(SW_VERSION)) {
      console.log(`[SW] Version mismatch (stored: ${storedVersion}, needed: ${SW_VERSION}). Forcing full reset...`);
      const didClear = await clearAllCachesAndSWs();
      localStorage.setItem('sw_version', String(SW_VERSION));
      if (didClear) {
        // Reload to ensure the browser fetches fresh HTML + JS from the server
        console.log('[SW] Reloading page to load fresh assets...');
        window.location.reload();
        return; // Stop here, the reload will re-run this script
      }
    }

    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        updateViaCache: 'none', // Never use HTTP cache for the SW script itself
      });
      console.log('✅ Service Worker registered:', registration.scope);

      // If there's a waiting SW, activate it immediately
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Listen for new SW installations
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              console.log('[SW] New service worker activated');
              // Optionally reload to use the new SW - only if there was a previous controller
              if (navigator.serviceWorker.controller) {
                window.location.reload();
              }
            }
          });
        }
      });

      // Force check for updates immediately, then every 60 seconds
      registration.update();
      setInterval(() => {
        registration.update();
      }, 60000);
    } catch (error: any) {
      console.error('❌ Service Worker registration failed:', error.message, error);
    }
  });
} else {
  console.warn('Service Workers not supported in this browser');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
