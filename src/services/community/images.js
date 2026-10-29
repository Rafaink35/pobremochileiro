// Fotos dos relatos: valida e reduz no navegador. Redesenhar no canvas remove os metadados (EXIF, GPS).
export const MAX_IMAGES = 4;
export const MAX_INPUT_BYTES = 12 * 1024 * 1024; // antes de reduzir
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // mesmo limite do bucket
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateImageFile(file, currentCount = 0) {
  if (currentCount >= MAX_IMAGES) return `No máximo ${MAX_IMAGES} fotos por relato.`;
  if (!file || !ACCEPTED_TYPES.includes(file.type)) return 'Use fotos JPG, PNG ou WebP.';
  if (file.size > MAX_INPUT_BYTES) return 'Essa foto é grande demais (limite de 12 MB).';
  return null;
}

/** Lado maior limitado a `max`, mantendo a proporção; nunca aumenta a imagem. */
export function fitSize(width, height, max = 1600) {
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Reduz e converte para JPEG. Só roda no navegador (usa canvas). */
export async function compressImage(file, { max = 1600, quality = 0.82 } = {}) {
  const bitmap = await createImageBitmap(file);
  const size = fitSize(bitmap.width, bitmap.height, max);
  if (!size) throw new Error('Não foi possível ler a foto.');
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close?.();
  let q = quality;
  for (let i = 0; i < 4; i += 1) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));
    if (!blob) throw new Error('Não foi possível preparar a foto.');
    if (blob.size <= MAX_OUTPUT_BYTES) return blob;
    q -= 0.15;
  }
  throw new Error('A foto continua grande demais depois de reduzida.');
}

export const imagePath = (userId, id) => `${userId}/${id}.jpg`;
