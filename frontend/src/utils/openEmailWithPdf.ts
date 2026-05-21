/**
 * Creates and downloads an .eml file with the given PDF pre-attached.
 * When the user opens the .eml file, their default mail client (e.g. Apple Mail)
 * opens a new compose window with the subject pre-filled and the PDF attached.
 * The user only needs to fill in the recipient address and send.
 */
export async function openEmailWithPdf(
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string = '',
): Promise<void> {
  // Convert PDF blob to base64 (57 bytes per chunk = 76 base64 chars per line, per RFC 2045)
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 57) {
    const chunk = bytes.slice(i, i + 57);
    lines.push(btoa(String.fromCharCode(...Array.from(chunk))));
  }
  const base64Pdf = lines.join('\r\n');

  // Encode subject for non-ASCII characters (RFC 2047)
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

  const boundary = `----=_MixedPart_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const bodyText = body || 'In allegato il report richiesto.\r\n\r\nCordiali saluti';

  const eml = [
    'MIME-Version: 1.0',
    `Subject: ${encodedSubject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    bodyText,
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

  const emlBlob = new Blob([eml], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(emlBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pdfFilename.replace('.pdf', '')}.eml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
