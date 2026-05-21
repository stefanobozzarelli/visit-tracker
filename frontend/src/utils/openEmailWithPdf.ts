/**
 * Apre Mail.app come bozza con PDF allegato + corpo precompilato.
 * L'oggetto viene COPIATO NEGLI APPUNTI automaticamente — l'utente fa Cmd+V
 * nel campo Oggetto di Mail per incollarlo.
 *
 * PERCHÉ QUESTO E NON ALTRO:
 *   - mailto: → apre Mail come bozza con oggetto+corpo, ma NON supporta allegati
 *   - .eml   → apre Mail come MESSAGGIO RICEVUTO (sola lettura), non come bozza
 *              (X-Unsent: 1 è Outlook, Mail.app non lo rispetta)
 *   - Web Share API → apre Mail come bozza con allegato+corpo, ma Mail ignora
 *                     il `title` quando ci sono file → oggetto vuoto
 *
 * Apple non espone alcuna API che dia oggetto+corpo+allegato insieme.
 * La copia automatica dell'oggetto negli appunti è il workaround più pulito.
 */
export async function openEmailWithPdf(
  pdfBlob: Blob,
  pdfFilename: string,
  subject: string,
  body: string = 'Buongiorno,\n\nin allegato il report in oggetto.\n\nCordiali saluti,\nStefano',
): Promise<void> {
  // 1. Copia l'oggetto negli appunti PRIMA della share
  //    (la writeText richiede gesto utente — funziona perché siamo dentro un onClick)
  let clipboardOK = false;
  try {
    await navigator.clipboard.writeText(subject);
    clipboardOK = true;
  } catch (err) {
    console.warn('[openEmailWithPdf] Clipboard write failed:', err);
  }

  // 2. Apri il share sheet di sistema → utente sceglie Mail → si apre bozza con PDF+corpo
  const pdfFile = new File([pdfBlob], pdfFilename, { type: 'application/pdf' });
  const shareData: ShareData = {
    files: [pdfFile],
    title: subject, // ignorato da Mail con file allegati, ma alcuni altri client lo onorano
    text: body,
  };

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare(shareData)
  ) {
    try {
      await navigator.share(shareData);
      // Dopo che l'utente ha completato la share, mostra un promemoria
      // (delay di 600ms così Mail ha tempo di aprirsi e prendere il focus)
      if (clipboardOK) {
        setTimeout(() => {
          alert(`✉️ Mail aperto con PDF e corpo.\n\nL'oggetto è negli appunti — vai sul campo "Oggetto" di Mail e premi ⌘V per incollarlo:\n\n«${subject}»`);
        }, 600);
      }
      return;
    } catch (err: any) {
      // AbortError = utente ha annullato la share — non facciamo fallback
      if (err && err.name === 'AbortError') return;
      console.warn('[openEmailWithPdf] Web Share failed, falling back to .eml:', err);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Fallback: download .eml (browser senza Web Share API, es. Chrome desktop)
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
