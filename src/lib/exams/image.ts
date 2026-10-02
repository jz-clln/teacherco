// Browser-only. Shrinks phone photos before upload so reading is faster and cheaper.
// Keeps enough resolution to read bubbles on a 50-item sheet.

export async function compressImage(file: File, maxEdge = 2000, quality = 0.85): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;
    // Keep the original when it is already a smaller JPEG.
    if (file.type === "image/jpeg" && file.size <= blob.size) return file;
    return new File([blob], "sheet.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
