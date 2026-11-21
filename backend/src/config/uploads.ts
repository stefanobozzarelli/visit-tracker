/**
 * Largest file accepted by an upload (attachments, photos, invoices).
 * Files are held in memory while they are sent to S3, so an unbounded size
 * would let one request exhaust the server's memory. Override with
 * MAX_UPLOAD_MB on Railway if larger files are needed.
 */
export const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 50) * 1024 * 1024;
