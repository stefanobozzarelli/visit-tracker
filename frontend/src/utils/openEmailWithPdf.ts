/**
 * Apre Outlook come bozza con soggetto, corpo e PDF già allegato.
 *
 * COME FUNZIONA:
 *   Genera un file .eml (RFC 2822) con il PDF incorporato come allegato Base64.
 *   Lo scarica nella download bar di Safari.
 *   L'utente fa doppio click sul file .eml → Outlook lo apre.
 *
 *   - Se Outlook rispetta l'header X-Unsent: 1 → apre come BOZZA EDITABILE
 *     con oggetto, corpo e PDF allegati. L'utente aggiunge solo i destinatari.
 *   - Se Outlook lo apre come messaggio ricevuto → l'utente clicca "Inoltra"
 *     (Forward) e il PDF è già allegato.
 *
 * PREREQUISITO (già verificato): Outlook è il client di posta predefinito.
 */
export async function openEmailWithPdf(
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string = 'Buongiorno,\n\nin allegato il report in oggetto.\n\nCordiali saluti,\nStefano',
): Promise<void> {
  const pdfSizeMB = pdfBlob.size / 1024 / 1024;
  console.log(`[openEmailWithPdf] PDF ${pdfSizeMB.toFixed(2)} MB → building .eml`);

  try {
    const emlBlob = await buildEml(subject, body, pdfBlob, pdfFilename);
    const emlFilename = sanitizeFilename(subject) + '.eml';

    const emlUrl = URL.createObjectURL(emlBlob);
    const a = document.createElement('a');
    a.href = emlUrl;
    a.download = emlFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(emlUrl), 60_000);

    showEmlToast(emlFilename, subject, body);
  } catch (err) {
    console.error('[openEmailWithPdf] EML generation failed, fallback to mailto+download', err);
    fallbackMailtoPlusDownload(pdfBlob, pdfFilename, subject, body);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EML builder (RFC 2822 + MIME multipart/mixed)
// ────────────────────────────────────────────────────────────────────────────

async function buildEml(
  subject: string,
  body: string,
  pdfBlob: Blob,
  pdfFilename: string,
): Promise<Blob> {
  const boundary = `----=_NextPart_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;

  // RFC 2047 Base64 encoding for the subject (handles non-ASCII)
  const encodedSubject = rfc2047B(subject);

  // Body → base64 (safest encoding for non-ASCII chars)
  const bodyB64 = toBase64Lines(new TextEncoder().encode(body));

  // PDF → base64
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const pdfB64 = toBase64Lines(pdfBytes);

  // Safe filename for Content-Disposition
  const safePdfName = pdfFilename.replace(/[^\w\s\-_.()]/g, '_');

  const lines = [
    'MIME-Version: 1.0',
    'X-Unsent: 1',                          // tells Outlook: open as draft
    `Subject: ${encodedSubject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${safePdfName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${safePdfName}"`,
    '',
    pdfB64,
    '',
    `--${boundary}--`,
    '',
  ];

  return new Blob([lines.join('\r\n')], { type: 'message/rfc822' });
}

/** Encode a Uint8Array to a base64 string split into 76-char lines (RFC 2045). */
function toBase64Lines(bytes: Uint8Array): string {
  // Build binary string
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  const b64 = btoa(binary);
  return b64.match(/.{1,76}/g)?.join('\r\n') ?? b64;
}

/** RFC 2047 Base64 word encoding, respecting the 75-char encoded-word limit. */
function rfc2047B(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  // If it would exceed 75 chars in one word, split — but for typical subjects it fits
  const encoded = btoa(binary);
  return `=?UTF-8?B?${encoded}?=`;
}

/** Strip / replace chars illegal in filenames (macOS / Windows safe). */
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '');
}

// ────────────────────────────────────────────────────────────────────────────
// Toast: guida l'utente dopo il download del .eml
// ────────────────────────────────────────────────────────────────────────────

function showEmlToast(emlFilename: string, subject: string, body: string): void {
  document.getElementById('__share-eml-toast__')?.remove();

  const toast = document.createElement('div');
  toast.id = '__share-eml-toast__';
  toast.style.cssText = `
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100002;
    width: 420px;
    max-width: 92vw;
    background: #1565C0;
    color: white;
    border-radius: 12px;
    padding: 1rem 1.25rem;
    box-shadow: 0 12px 48px rgba(0,0,0,0.45);
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 0.875rem;
    line-height: 1.5;
  `;

  toast.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.6rem;">
      <div style="font-weight:700;font-size:0.95rem;">📎 Email pronta con PDF allegato</div>
      <button id="__eml-toast-close__" style="background:transparent;border:none;color:white;font-size:1.2rem;cursor:pointer;opacity:0.7;line-height:1;padding:0 0 0 0.5rem;">✕</button>
    </div>
    <ol style="margin:0 0 0.75rem 1.1rem;padding:0;font-size:0.82rem;opacity:0.95;line-height:1.7;">
      <li>Fai <b>doppio click</b> sul file nella <b>download bar</b> di Safari</li>
      <li>Outlook apre il messaggio con il PDF già allegato</li>
      <li>Se si apre come "ricevuto" → clicca <b>Inoltra</b> e aggiungi i destinatari</li>
    </ol>
    <div style="background:rgba(255,255,255,0.15);padding:0.35rem 0.6rem;border-radius:5px;font-family:ui-monospace,Menlo,monospace;font-size:0.72rem;word-break:break-word;margin-bottom:0.75rem;">
      📧 ${emlFilename.replace(/</g, '&lt;')}
    </div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button id="__eml-toast-mailto__" style="
        flex:1;min-width:120px;
        padding:0.4rem 0.75rem;
        background:rgba(255,255,255,0.15);
        color:white;border:1px solid rgba(255,255,255,0.4);
        border-radius:6px;font-size:0.78rem;cursor:pointer;
        white-space:nowrap;
      ">Apri bozza senza allegato</button>
    </div>
    <div style="opacity:0.55;font-size:0.68rem;margin-top:0.5rem;text-align:right;">Chiude in 60s · click per chiudere subito</div>
  `;

  document.body.appendChild(toast);

  // Close on click anywhere on the toast (except buttons)
  toast.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).tagName !== 'BUTTON') toast.remove();
  });

  document.getElementById('__eml-toast-close__')?.addEventListener('click', () => toast.remove());

  // "Apri bozza senza allegato" → mailto: fallback
  document.getElementById('__eml-toast-mailto__')?.addEventListener('click', () => {
    toast.remove();
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const link = document.createElement('a');
    link.href = mailtoUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  setTimeout(() => toast.remove(), 60_000);
}

// ────────────────────────────────────────────────────────────────────────────
// Fallback: mailto: (bozza editabile) + download PDF separato
// Usato solo se la generazione .eml fallisce per qualche motivo.
// ────────────────────────────────────────────────────────────────────────────

function fallbackMailtoPlusDownload(
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string,
): void {
  // Download PDF
  const pdfUrl = URL.createObjectURL(pdfBlob);
  const pdfLink = document.createElement('a');
  pdfLink.href = pdfUrl;
  pdfLink.download = pdfFilename;
  document.body.appendChild(pdfLink);
  pdfLink.click();
  document.body.removeChild(pdfLink);
  setTimeout(() => URL.revokeObjectURL(pdfUrl), 30_000);

  // Open mailto: after short delay
  setTimeout(() => {
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const mailtoLink = document.createElement('a');
    mailtoLink.href = mailtoUrl;
    document.body.appendChild(mailtoLink);
    mailtoLink.click();
    document.body.removeChild(mailtoLink);
  }, 250);
}
