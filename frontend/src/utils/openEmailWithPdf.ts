/**
 * Apre Outlook come bozza editabile (mailto:) con oggetto e corpo precompilati,
 * e tenta di copiare il PDF negli appunti di sistema in modo che l'utente possa
 * allegarlo con ⌘V direttamente nella bozza.
 *
 * FLUSSO:
 *   1. Tenta navigator.clipboard.write con il PDF blob (tipo application/pdf).
 *   2. Scarica il PDF nella download bar di Safari (fallback per il drag).
 *   3. Apre Outlook via mailto: → bozza editabile con oggetto + corpo pronti.
 *   4. Toast spiega: "Prova ⌘V per allegare il PDF. Se non funziona, trascinalo."
 *
 * PERCHÉ NON .EML:
 *   - L'associazione file .eml su macOS rimane Mail.app anche se Outlook è il
 *     client predefinito per mailto: (sono due registrazioni separate nel sistema).
 *   - X-Unsent: 1 non è rispettato da Outlook per Mac (è solo per Windows).
 *
 * PERCHÉ NON WEB SHARE API:
 *   - Outlook per Mac non ha una Share Extension → non compare MAI nel menu
 *     Condividi di macOS (scelta di Microsoft, non un'impostazione).
 */
export async function openEmailWithPdf(
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string = 'Buongiorno,\n\nin allegato il report in oggetto.\n\nCordiali saluti,\nStefano',
): Promise<void> {
  const pdfSizeMB = pdfBlob.size / 1024 / 1024;
  console.log(`[openEmailWithPdf] PDF ${pdfSizeMB.toFixed(2)} MB`);

  // 1. Prova a copiare il PDF negli appunti di sistema.
  //    Se l'utente preme ⌘V nella bozza Outlook, il PDF viene allegato.
  let clipboardSuccess = false;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'application/pdf': pdfBlob }),
    ]);
    clipboardSuccess = true;
    console.log('[openEmailWithPdf] PDF copied to clipboard');
  } catch (err) {
    console.warn('[openEmailWithPdf] clipboard.write(pdf) failed:', err);
  }

  // 2. Scarica il PDF nella download bar (fallback per drag manuale)
  const pdfUrl = URL.createObjectURL(pdfBlob);
  const pdfLink = document.createElement('a');
  pdfLink.href = pdfUrl;
  pdfLink.download = pdfFilename;
  document.body.appendChild(pdfLink);
  pdfLink.click();
  document.body.removeChild(pdfLink);
  setTimeout(() => URL.revokeObjectURL(pdfUrl), 30_000);

  // 3. Apri Outlook via mailto: → bozza EDITABILE con oggetto + corpo
  setTimeout(() => {
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const mailtoLink = document.createElement('a');
    mailtoLink.href = mailtoUrl;
    document.body.appendChild(mailtoLink);
    mailtoLink.click();
    document.body.removeChild(mailtoLink);
  }, 200);

  // 4. Toast con istruzioni
  showOutlookToast(pdfFilename, clipboardSuccess);
}

// ────────────────────────────────────────────────────────────────────────────
// Toast
// ────────────────────────────────────────────────────────────────────────────

function showOutlookToast(pdfFilename: string, clipboardSuccess: boolean): void {
  document.getElementById('__share-outlook-toast__')?.remove();

  const toast = document.createElement('div');
  toast.id = '__share-outlook-toast__';
  toast.style.cssText = `
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100002;
    width: 400px;
    max-width: 92vw;
    background: #1565C0;
    color: white;
    border-radius: 12px;
    padding: 1rem 1.25rem;
    box-shadow: 0 12px 48px rgba(0,0,0,0.45);
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 0.875rem;
    line-height: 1.5;
    cursor: pointer;
  `;

  const mainStep = clipboardSuccess
    ? `<li>In Outlook, fai clic nel corpo o sull'area allegati e premi <b>⌘V</b> → il PDF viene allegato</li>
       <li>Se ⌘V non funziona, trascina il PDF dalla download bar di Safari nella bozza</li>`
    : `<li>Trascina il PDF dalla download bar di Safari nella finestra di Outlook</li>`;

  const clipBadge = clipboardSuccess
    ? `<div style="background:rgba(255,255,255,0.2);border-radius:6px;padding:0.35rem 0.6rem;font-size:0.78rem;margin-bottom:0.6rem;">
        📋 PDF copiato negli appunti — prova <b>⌘V</b> in Outlook
       </div>`
    : '';

  toast.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;">
      <div style="font-weight:700;font-size:0.95rem;">✉️ Outlook si apre come bozza</div>
      <button id="__outlook-toast-close__" style="background:transparent;border:none;color:white;font-size:1.2rem;cursor:pointer;opacity:0.7;line-height:1;padding:0 0 0 0.5rem;">✕</button>
    </div>
    ${clipBadge}
    <ol style="margin:0 0 0.6rem 1.1rem;padding:0;font-size:0.82rem;opacity:0.95;line-height:1.8;">
      <li>Oggetto e corpo sono già compilati</li>
      <li>Aggiungi i destinatari</li>
      ${mainStep}
    </ol>
    <div style="background:rgba(255,255,255,0.15);padding:0.35rem 0.6rem;border-radius:5px;font-family:ui-monospace,Menlo,monospace;font-size:0.72rem;word-break:break-word;">
      📎 ${pdfFilename.replace(/</g, '&lt;')}
    </div>
    <div style="opacity:0.55;font-size:0.68rem;margin-top:0.5rem;text-align:right;">Click per chiudere</div>
  `;

  toast.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id !== '__outlook-toast-close__' &&
        (e.target as HTMLElement).tagName !== 'BUTTON') {
      toast.remove();
    }
  });
  document.getElementById('__outlook-toast-close__');
  toast.querySelector('#__outlook-toast-close__')?.addEventListener('click', () => toast.remove());

  document.body.appendChild(toast);

  // Re-attach close button listener after innerHTML
  setTimeout(() => {
    document.getElementById('__outlook-toast-close__')?.addEventListener('click', () => toast.remove());
  }, 0);

  setTimeout(() => toast.remove(), 45_000);
}
