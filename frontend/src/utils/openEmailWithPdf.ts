/**
 * Apre Mail.app come BOZZA EDITABILE con PDF allegato + oggetto + corpo.
 *
 * Strategie (in ordine di priorità):
 *   1. Web Share API → share sheet → Mail. PDF + corpo allegati, oggetto da
 *      incollare con ⌘V (copiato negli appunti dal chiamante).
 *   2. Se share() fallisce per gesto utente scaduto (PDF lento da generare),
 *      mostriamo un toast con bottone "Apri Mail" che dà un gesto fresco.
 *   3. Se il PDF è > 45MB (limite Safari) o se anche il retry fallisce,
 *      apriamo Mail via `mailto:` (con oggetto + corpo) e scarichiamo il PDF
 *      in parallelo. L'utente trascina il PDF dalla download bar nella bozza.
 *      → Mail si apre SEMPRE come BOZZA EDITABILE (mai più .eml in sola lettura).
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

  // Safari rifiuta share() di file > ~50MB con NotAllowedError.
  // Skippa direttamente al fallback mailto:+download.
  const SIZE_LIMIT_MB = 45;
  if (pdfSizeMB > SIZE_LIMIT_MB) {
    console.warn(`[openEmailWithPdf] PDF too large (${pdfSizeMB.toFixed(1)} MB), using mailto:+download`);
    mailtoPlusDownload(pdfBlob, pdfFilename, subject, body, `PDF da ${pdfSizeMB.toFixed(1)} MB`);
    return;
  }

  const canUseShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare(shareData);

  if (canUseShare) {
    showClipboardToast(subject);

    try {
      await navigator.share(shareData);
      return;
    } catch (err: any) {
      if (err && err.name === 'AbortError') return;

      // Gesto utente scaduto durante il fetch → toast con retry button
      if (err && err.name === 'NotAllowedError') {
        showRetryShareToast(shareData, pdfBlob, pdfFilename, subject, body);
        return;
      }

      console.warn('[openEmailWithPdf] Web Share failed, using mailto:+download', err);
    }
  }

  // Browser senza Web Share API (es. Chrome desktop) → mailto:+download
  mailtoPlusDownload(pdfBlob, pdfFilename, subject, body);
}

// ────────────────────────────────────────────────────────────────────────────
// mailto: (apre Mail come bozza editabile) + download PDF (da trascinare)
// ────────────────────────────────────────────────────────────────────────────
function mailtoPlusDownload(
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string,
  sizeNote: string = '',
): void {
  // 1. Mostra il toast PRIMA (Safari sta per perdere focus a favore di Mail)
  showDragPdfToast(pdfFilename, sizeNote);

  // 2. Scarica il PDF (parte per primo così è in Downloads quando l'utente
  //    torna su Mail per fare il drag)
  const pdfUrl = URL.createObjectURL(pdfBlob);
  const pdfLink = document.createElement('a');
  pdfLink.href = pdfUrl;
  pdfLink.download = pdfFilename;
  document.body.appendChild(pdfLink);
  pdfLink.click();
  document.body.removeChild(pdfLink);
  setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000);

  // 3. Apri Mail via mailto: (apre una BOZZA editabile con oggetto + corpo)
  //    Piccolo delay per non sovrapporsi al download
  setTimeout(() => {
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const mailtoLink = document.createElement('a');
    mailtoLink.href = mailtoUrl;
    document.body.appendChild(mailtoLink);
    mailtoLink.click();
    document.body.removeChild(mailtoLink);
  }, 200);
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
      // Anche il retry fallisce → mailto+download (Mail come BOZZA editabile)
      console.warn('[openEmailWithPdf] Retry share failed, using mailto:+download:', err);
      mailtoPlusDownload(pdfBlob, pdfFilename, subject, body);
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
  setTimeout(() => toast.remove(), 60000);
}

// ────────────────────────────────────────────────────────────────────────────
// Toast: spiega all'utente di trascinare il PDF dalla download bar in Mail
// ────────────────────────────────────────────────────────────────────────────
function showDragPdfToast(pdfFilename: string, sizeNote: string): void {
  document.getElementById('__share-drag-toast__')?.remove();

  const toast = document.createElement('div');
  toast.id = '__share-drag-toast__';
  toast.style.cssText = `
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100002;
    max-width: 480px;
    background: #2E7D32;
    color: white;
    border-radius: 10px;
    padding: 1rem 1.25rem;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 0.9rem;
    line-height: 1.5;
    cursor: pointer;
  `;
  const sizeLine = sizeNote ? `<div style="opacity:0.85;font-size:0.75rem;margin-bottom:0.5rem;">${sizeNote}</div>` : '';
  toast.innerHTML = `
    ${sizeLine}
    <div style="font-weight:700;margin-bottom:0.5rem;">✉️ Mail si apre come bozza editabile</div>
    <div style="opacity:0.95;font-size:0.85rem;">
      Oggetto e corpo sono già compilati. <b>Trascina il PDF</b> dalla download bar
      di Safari nella finestra di Mail per allegarlo.
    </div>
    <div style="background:rgba(255,255,255,0.15);padding:0.4rem 0.6rem;border-radius:4px;font-family:ui-monospace,Menlo,monospace;font-size:0.75rem;margin-top:0.5rem;word-break:break-word;">
      📎 ${pdfFilename.replace(/</g, '&lt;')}
    </div>
    <div style="opacity:0.7;font-size:0.7rem;margin-top:0.5rem;text-align:right;">Click per chiudere</div>
  `;
  toast.addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 30000);
}
