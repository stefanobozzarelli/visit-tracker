/**
 * Apre Mail.app come bozza con PDF allegato + corpo precompilato.
 * L'oggetto deve essere copiato negli appunti dal CHIAMANTE prima di
 * invocare questa funzione (perché richiede gesto utente "fresco" —
 * dopo il fetch PDF Safari rifiuta clipboard.writeText).
 *
 * Limite Apple: Mail.app ignora il `title` della Web Share API quando ci
 * sono file allegati. Non esiste API web per pre-compilare l'oggetto E
 * avere l'allegato insieme. L'utente fa ⌘V nel campo Oggetto.
 */
export async function openEmailWithPdf(
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string = 'Buongiorno,\n\nin allegato il report in oggetto.\n\nCordiali saluti,\nStefano',
): Promise<void> {
  // Strategia 1: Web Share API → apre Mail come bozza con PDF+corpo
  const pdfFile = new File([pdfBlob], pdfFilename, { type: 'application/pdf' });
  const shareData: ShareData = {
    files: [pdfFile],
    title: subject, // ignorato da Mail.app, ma onorato da altri client
    text: body,
  };

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare(shareData)
  ) {
    try {
      // Toast in-page PRIMA della share, così l'utente lo vede prima
      // che Safari perda il focus a favore di Mail
      showClipboardToast(subject);
      await navigator.share(shareData);
      return;
    } catch (err: any) {
      if (err && err.name === 'AbortError') return;
      console.warn('[openEmailWithPdf] Web Share failed, falling back to .eml:', err);
    }
  }

  // Fallback: .eml download per browser senza Web Share API
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

/** Toast in-page non bloccante che mostra l'oggetto da incollare in Mail.
 *  Resta visibile per ~12s o finché l'utente non clicca per chiuderlo.
 *  Indipendente da React, si attacca direttamente al DOM. */
function showClipboardToast(subject: string): void {
  // Rimuovi un eventuale toast precedente
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
    animation: slidein 0.3s ease;
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
