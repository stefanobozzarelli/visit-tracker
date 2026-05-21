/**
 * Genera un file .eml (RFC 2822) come bozza email con:
 *   - Oggetto precompilato (header Subject)
 *   - Corpo formattato HTML con Helvetica
 *   - PDF già allegato
 *   - Header X-Unsent: 1 → Mail.app lo apre come BOZZA in finestra di composizione,
 *     non come messaggio ricevuto in sola lettura
 *
 * Su macOS Safari con "Apri file sicuri dopo il download" attivo (default), il file
 * si apre automaticamente in Mail. Altrimenti, doppio click sul file scaricato.
 *
 * Perché non Web Share API? Mail.app ignora il `title` della share quando ci sono
 * file allegati — l'oggetto rimane vuoto. È un limite di macOS. Solo il .eml
 * con Subject header permette di pre-compilare l'oggetto in modo affidabile.
 */
export async function openEmailWithPdf(
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string = 'Buongiorno,\n\nin allegato il report in oggetto.\n\nCordiali saluti,\nStefano',
): Promise<void> {
  // Converti il PDF in base64 (chunk di 57 byte = 76 caratteri base64 per linea, RFC 2045)
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 57) {
    const chunk = bytes.slice(i, i + 57);
    lines.push(btoa(String.fromCharCode(...Array.from(chunk))));
  }
  const base64Pdf = lines.join('\r\n');

  // Subject con caratteri non-ASCII (RFC 2047 Base64 UTF-8)
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

  const altBoundary = `=_Alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const mixedBoundary = `=_Mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Corpo HTML con Helvetica
  const htmlBody = [
    '<!DOCTYPE html>',
    '<html>',
    '<head><meta charset="UTF-8"></head>',
    '<body style="font-family: Helvetica, Arial, sans-serif; font-size: 14pt; color: #000;">',
    body.split('\n').map(line => line.trim() === '' ? '<br>' : `<div>${escapeHtml(line)}</div>`).join(''),
    '</body>',
    '</html>',
  ].join('');

  // Costruisci l'EML:
  //   multipart/mixed
  //   ├── multipart/alternative
  //   │   ├── text/plain (fallback)
  //   │   └── text/html (con formattazione Helvetica)
  //   └── application/pdf (allegato)
  const eml = [
    'MIME-Version: 1.0',
    'X-Unsent: 1',
    `Subject: ${encodedSubject}`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
    `--${altBoundary}--`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: application/pdf; name="${pdfFilename}"`,
    `Content-Disposition: attachment; filename="${pdfFilename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Pdf,
    '',
    `--${mixedBoundary}--`,
  ].join('\r\n');

  const emlBlob = new Blob([eml], { type: 'message/rfc822' });
  const url = URL.createObjectURL(emlBlob);
  const link = document.createElement('a');
  link.href = url;
  // Nome file leggibile = oggetto sanitizzato (no caratteri vietati nei nomi file)
  link.download = `${subject.replace(/[/\\:*?<>|"]/g, '')}.eml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
