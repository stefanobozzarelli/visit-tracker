/**
 * Apre Mail (o un'altra app) con un PDF già allegato e l'oggetto precompilato.
 *
 * Strategia 1 (preferita): Web Share API con file
 *   - Su macOS Safari 16.4+ apre il share sheet nativo di sistema.
 *   - L'utente sceglie "Mail" e si apre una nuova email con:
 *     · oggetto precompilato (da `title`)
 *     · corpo precompilato (da `text`)
 *     · PDF allegato (da `files`)
 *   - L'utente aggiunge il destinatario e invia.
 *
 * Strategia 2 (fallback): download .eml
 *   - Su browser senza Web Share API, viene scaricato un file .eml
 *     che l'utente può aprire con doppio click per lanciare Mail.
 */
export async function openEmailWithPdf(
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string = 'Buongiorno,\n\nin allegato il report in oggetto.\n\nCordiali saluti,\nStefano',
): Promise<void> {
  // ────────────────────────────────────────────────────────────────
  // Strategia 1: Web Share API (Safari macOS 16.4+, iOS Safari, Chrome Android)
  // ────────────────────────────────────────────────────────────────
  try {
    const pdfFile = new File([pdfBlob], pdfFilename, { type: 'application/pdf' });
    const shareData: ShareData = {
      files: [pdfFile],
      title: subject,
      text: body,
    };

    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare(shareData)
    ) {
      await navigator.share(shareData);
      return; // Successo
    }
  } catch (err: any) {
    // AbortError = l'utente ha chiuso il share sheet — non facciamo fallback
    if (err && err.name === 'AbortError') return;
    // Per altri errori (NotAllowedError, ecc.) cadiamo nel fallback
    console.warn('[openEmailWithPdf] Web Share failed, falling back to .eml:', err);
  }

  // ────────────────────────────────────────────────────────────────
  // Strategia 2: fallback .eml (per browser senza Web Share API)
  // ────────────────────────────────────────────────────────────────
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 57) {
    const chunk = bytes.slice(i, i + 57);
    lines.push(btoa(String.fromCharCode(...Array.from(chunk))));
  }
  const base64Pdf = lines.join('\r\n');

  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const boundary = `----=_MixedPart_${Date.now()}_${Math.random().toString(36).slice(2)}`;

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
  link.download = `${pdfFilename.replace(/\.pdf$/i, '')}.eml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
