/**
 * Apre Mail.app come bozza con PDF allegato + corpo precompilato via Web Share API.
 *
 * Limite Apple noto: Mail.app su macOS ignora il `title` quando ci sono `files`
 * → l'oggetto rimane vuoto. Workaround: il chiamante copia l'oggetto negli
 * appunti PRIMA della share così l'utente fa ⌘V nel campo Oggetto.
 *
 * Limite Safari noto: "transient user activation" scade dopo ~5s. Se il
 * fetch del PDF è lungo, navigator.share() viene rifiutato con NotAllowedError.
 * Workaround: mostriamo un toast con bottone "Apri Mail" che fornisce un
 * gesto utente fresco quando l'utente lo clicca.
 */
export async function openEmailWithPdf(
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string = 'Buongiorno,\n\nin allegato il report in oggetto.\n\nCordiali saluti,\nStefano',
): Promise<void> {
  const pdfSizeMB = pdfBlob.size / 1024 / 1024;
  console.log(`[openEmailWithPdf] PDF size: ${pdfSizeMB.toFixed(2)} MB`);

  const pdfFile = new File([pdfBlob], pdfFilename, { type: 'application/pdf' });
  const shareData: ShareData = {
    files: [pdfFile],
    title: subject,
    text: body,
  };

  // Safari su macOS rifiuta share() di file > ~50MB con NotAllowedError.
  // Se siamo sopra soglia conservativa, saltiamo direttamente al fallback .eml
  // così non sprechiamo tempo con un share destinato a fallire.
  const SIZE_LIMIT_MB = 45;
  if (pdfSizeMB > SIZE_LIMIT_MB) {
    console.warn(`[openEmailWithPdf] PDF too large for Web Share (${pdfSizeMB.toFixed(1)} MB > ${SIZE_LIMIT_MB} MB), using .eml fallback`);
    showSizeWarningToast(pdfSizeMB);
    downloadEml(pdfBlob, pdfFilename, subject, body);
    return;
  }

  const canUseShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare(shareData);

  if (canUseShare) {
    // Toast informativo (oggetto da incollare)
    showClipboardToast(subject);

    try {
      await navigator.share(shareData);
      return;
    } catch (err: any) {
      // L'utente ha annullato il share sheet → nessun fallback
      if (err && err.name === 'AbortError') return;

      // Gesto utente scaduto durante il fetch → mostro toast con bottone
      // di retry che fornisce un gesto fresco
      if (err && err.name === 'NotAllowedError') {
        showRetryShareToast(shareData, pdfBlob, pdfFilename, subject, body);
        return;
      }

      console.warn('[openEmailWithPdf] Web Share failed, falling back to .eml:', err);
    }
  }

  // Fallback: download .eml per browser senza Web Share API
  downloadEml(pdfBlob, pdfFilename, subject, body);
}

// ────────────────────────────────────────────────────────────────────────────
// Toast: oggetto copiato negli appunti
// ────────────────────────────────────────────────────────────────────────────
function showClipboardToast(subject: string): void {
  document.getElementById('__share-toast__')?.remove();

  const toast = document.createElement('div');
  toast.id = '__share-toast__';
  toast.style.cssText = `
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 100000;
    max-width: 360px;
    background: #1a1a1a;
    color: #fff;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 0.875rem;
    line-height: 1.4;
    cursor: pointer;
  `;
  toast.innerHTML = `
    <div style="font-weight:600;margin-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem;">
      <span>📋</span><span>Oggetto copiato negli appunti</span>
    </div>
    <div style="opacity:0.8;font-size:0.8125rem;margin-bottom:0.5rem;">
      Fai ⌘V nel campo <b>Oggetto</b> di Mail per incollarlo:
    </div>
    <div style="background:rgba(255,255,255,0.1);padding:0.5rem 0.75rem;border-radius:4px;font-family:ui-monospace,Menlo,monospace;font-size:0.8125rem;word-break:break-word;">
      ${subject.replace(/</g, '&lt;')}
    </div>
    <div style="opacity:0.5;font-size:0.6875rem;margin-top:0.5rem;text-align:right;">
      Click per chiudere
    </div>
  `;
  toast.addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 12000);
}

// ────────────────────────────────────────────────────────────────────────────
// Toast con bottone "Apri Mail" — usato quando il gesto utente è scaduto
// ────────────────────────────────────────────────────────────────────────────
function showRetryShareToast(
  shareData: ShareData,
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string,
): void {
  document.getElementById('__share-retry-toast__')?.remove();

  const toast = document.createElement('div');
  toast.id = '__share-retry-toast__';
  toast.style.cssText = `
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100001;
    background: #2E7D32;
    color: white;
    border-radius: 10px;
    padding: 1rem 1.5rem;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    max-width: 90vw;
  `;

  const text = document.createElement('div');
  text.innerHTML = '✉️ <b>PDF pronto</b> — clicca per aprire Mail';
  toast.appendChild(text);

  const btn = document.createElement('button');
  btn.textContent = 'Apri Mail';
  btn.style.cssText = `
    padding: 0.625rem 1.25rem;
    border-radius: 6px;
    background: white;
    color: #2E7D32;
    border: none;
    font-weight: 700;
    cursor: pointer;
    font-size: 0.95rem;
    white-space: nowrap;
  `;
  btn.onclick = async () => {
    toast.remove();
    try {
      await navigator.share(shareData);
    } catch (err: any) {
      if (err && err.name === 'AbortError') return;
      // Se anche il retry fallisce (es. permessi negati), fallback .eml
      console.warn('[openEmailWithPdf] Retry share failed:', err);
      downloadEml(pdfBlob, pdfFilename, subject, body);
    }
  };
  toast.appendChild(btn);

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = `
    background: transparent;
    color: white;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    opacity: 0.7;
    padding: 0 0.25rem;
  `;
  closeBtn.onclick = () => toast.remove();
  toast.appendChild(closeBtn);

  document.body.appendChild(toast);
  // Auto-rimozione dopo 60s
  setTimeout(() => toast.remove(), 60000);
}

// ────────────────────────────────────────────────────────────────────────────
// Toast: PDF troppo grande per la Web Share API
// ────────────────────────────────────────────────────────────────────────────
function showSizeWarningToast(sizeMB: number): void {
  document.getElementById('__share-size-warning__')?.remove();

  const toast = document.createElement('div');
  toast.id = '__share-size-warning__';
  toast.style.cssText = `
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100002;
    max-width: 460px;
    background: #b45309;
    color: white;
    border-radius: 10px;
    padding: 1rem 1.25rem;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 0.9rem;
    line-height: 1.4;
    cursor: pointer;
  `;
  toast.innerHTML = `
    <div style="font-weight:700;margin-bottom:0.375rem;">⚠️ PDF troppo grande per Mail (${sizeMB.toFixed(1)} MB)</div>
    <div style="opacity:0.95;font-size:0.85rem;">
      Safari non permette di condividere file > ~50 MB. Scaricato il file <b>.eml</b>
      — fai doppio click per aprirlo in Mail (verrà mostrato come messaggio ricevuto).
    </div>
    <div style="opacity:0.7;font-size:0.7rem;margin-top:0.5rem;text-align:right;">Click per chiudere</div>
  `;
  toast.addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 15000);
}

// ────────────────────────────────────────────────────────────────────────────
// Fallback: scarica .eml (per browser senza Web Share API o file troppo grande)
// ────────────────────────────────────────────────────────────────────────────
async function downloadEml(
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string,
): Promise<void> {
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 57) {
    const chunk = bytes.slice(i, i + 57);
    lines.push(btoa(String.fromCharCode(...Array.from(chunk))));
  }
  const base64Pdf = lines.join('\r\n');

  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const boundary = `=_Mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const eml = [
    'MIME-Version: 1.0',
    `Subject: ${encodedSubject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdfFilename}"`,
    `Content-Disposition: attachment; filename="${pdfFilename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Pdf,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const emlBlob = new Blob([eml], { type: 'message/rfc822' });
  const url = URL.createObjectURL(emlBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${subject.replace(/[/\\:*?<>|"]/g, '')}.eml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
