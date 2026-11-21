/**
 * Attachments are only handed out to signed-in users: the app first asks the
 * server for a short-lived link, then opens or saves the file.
 */

/** Shows a small message at the bottom of the screen for a few seconds. */
function notify(message: string) {
  const el = document.createElement('div');
  el.textContent = message;
  el.setAttribute('role', 'status');
  el.style.cssText =
    'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;' +
    'background:#1a1f36;color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;' +
    'box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:90vw;text-align:center';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/**
 * Opens a file in a new tab to view it. The tab is opened right away, inside
 * the click, so browsers do not block it as a pop-up; it is pointed at the
 * file once the link arrives.
 */
export async function openSignedLink(getUrl: () => Promise<string | undefined>): Promise<void> {
  const win = window.open('', '_blank');
  try {
    const url = await getUrl();
    if (!url) throw new Error('No link returned');
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      window.location.href = url;
    }
  } catch (err) {
    if (win) win.close();
    notify('Impossibile aprire il file. Riprova.');
  }
}

/**
 * Saves a file without opening any tab: the link is served as a download, so
 * the current page stays where it is.
 */
export async function downloadSignedLink(getUrl: () => Promise<string | undefined>, filename?: string): Promise<void> {
  try {
    const url = await getUrl();
    if (!url) throw new Error('No link returned');
    const a = document.createElement('a');
    a.href = url;
    if (filename) a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    notify(filename ? `Download avviato: ${filename}` : 'Download avviato');
  } catch (err) {
    notify('Impossibile scaricare il file. Riprova.');
  }
}
