/**
 * Client-side image compression using the Canvas API.
 *
 * Non-image files (PDF, etc.) are returned unchanged.
 * JPEG and PNG files are:
 *   - down-scaled to fit within MAX_DIMENSION × MAX_DIMENSION (preserving aspect ratio)
 *   - re-encoded as JPEG at QUALITY
 *
 * Typical result: a 4–5 MB phone photo → 300–600 KB.
 */

const MAX_DIMENSION = 1920; // px — enough for any screen / print use
const QUALITY = 0.82;       // JPEG quality (0–1)
const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export async function compressImage(file: File): Promise<File> {
  if (!IMAGE_TYPES.has(file.type)) return file; // not a compressible image

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Scale down if either dimension exceeds MAX_DIMENSION
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; } // fallback: return original

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          // Keep original filename but force .jpg extension
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          const compressed = new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          // Only use the compressed version if it's actually smaller
          resolve(compressed.size < file.size ? compressed : file);
        },
        'image/jpeg',
        QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // fallback: return original on error
    };

    img.src = objectUrl;
  });
}

/** Compress an array of files (non-images pass through unchanged). */
export async function compressImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map(compressImage));
}
