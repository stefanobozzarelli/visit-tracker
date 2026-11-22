const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml',
  txt: 'text/plain', csv: 'text/csv',
  mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg',
};

/** Content type for showing a file in the browser, guessed from its name. */
export function inlineContentType(filename: string): string | undefined {
  const ext = String(filename || '').split('.').pop()?.toLowerCase() || '';
  return TYPES[ext];
}

/**
 * Content-Disposition value: "inline" shows the file in the browser,
 * "attachment" saves it. The name is encoded so accents and quotes are safe.
 */
export function contentDisposition(filename: string, download: boolean): string {
  const safe = String(filename || 'file').replace(/["\\\r\n]/g, '_');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_');
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
