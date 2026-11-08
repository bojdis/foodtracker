/**
 * Client-side helper for image downscaling and compression before API upload.
 * Reduces 6-12 MB mobile photos down to crisp ~150-250 KB JPEGs in <150ms.
 */

const MAX_IMAGE_DIMENSION = 1280;
const JPEG_QUALITY = 0.85;

export interface CompressedImageResult {
  base64: string;
  mimeType: string;
  dataUrl: string;
}

export function compressImageFile(file: File): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Vybraný soubor není obrázek."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nepodařilo se načíst soubor."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Nepodařilo se dekódovat obrázek."));
      img.onload = () => {
        let { width, height } = img;

        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
            width = MAX_IMAGE_DIMENSION;
          } else {
            width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
            height = MAX_IMAGE_DIMENSION;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Chyba při přípravě plátna pro obrázek."));
          return;
        }

        // Draw image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = "image/jpeg";
        const dataUrl = canvas.toDataURL(mimeType, JPEG_QUALITY);
        const base64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");

        resolve({
          base64,
          mimeType,
          dataUrl,
        });
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
