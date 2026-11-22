/**
 * Forza l'aggiornamento dell'app (utile soprattutto quando è installata sulla
 * schermata Home dell'iPhone, dove non c'è il tasto "ricarica" del browser).
 * Svuota la cache dei file dell'app e il service worker, poi ricarica.
 * I dati offline (IndexedDB) non vengono toccati.
 */
export async function forceAppUpdate(): Promise<void> {
  if (!navigator.onLine) {
    window.alert("Sei offline: collegati a internet per aggiornare l'app.");
    return;
  }
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (err) {
    console.warn('[Update] Pulizia cache non riuscita:', err);
  }
  // Parametro unico per scavalcare eventuali cache HTTP della pagina
  const url = new URL(window.location.href);
  url.searchParams.set('_v', String(Date.now()));
  window.location.replace(url.toString());
}
