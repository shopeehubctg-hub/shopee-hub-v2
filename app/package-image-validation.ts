export const packageImageMaxBytes = 2_000_000;
export const packageImageExtensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

type ImageDimensions = { width: number; height: number };

function pngDimensions(bytes: Uint8Array, view: DataView): ImageDimensions | undefined {
  if (bytes.length < 33 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a ||
      view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array, view: DataView): ImageDimensions | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
  let offset = 2;
  while (offset + 3 < bytes.length && bytes[offset++] === 0xff) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) return;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) return;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (length < 11 || !bytes[offset + 7] || length !== 8 + 3 * bytes[offset + 7]) return;
      return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    }
    offset += length;
  }
}

function webpDimensions(bytes: Uint8Array, view: DataView): ImageDimensions | undefined {
  if (bytes.length < 25 || view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57454250 ||
      view.getUint32(4, true) + 8 !== bytes.length) return;
  const length = view.getUint32(16, true);
  if (20 + length + (length % 2) > bytes.length) return;
  const tag = view.getUint32(12);
  if (tag === 0x56503858 && length === 10) {
    const size = (offset: number) => 1 + bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
    return { width: size(24), height: size(27) };
  }
  if (tag === 0x5650384c && length >= 5 && bytes[20] === 0x2f && bytes[24] >> 5 === 0) {
    const bits = view.getUint32(21, true);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (tag === 0x56503820 && length >= 10 && !(bytes[20] & 1) &&
      bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
}

export async function packageImageIssue(file: Blob): Promise<string | undefined> {
  if (file.size >= packageImageMaxBytes) return "Each image must be under 2 MB.";
  if (!file.size || !Object.hasOwn(packageImageExtensions, file.type)) return "Choose a JPG, PNG or WebP image.";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dimensions = file.type === "image/png" ? pngDimensions(bytes, view)
    : file.type === "image/jpeg" ? jpegDimensions(bytes, view)
    : webpDimensions(bytes, view);
  if (!dimensions?.width || !dimensions.height) return "The image dimensions could not be read.";
  if (dimensions.width !== dimensions.height) return `Use a square (1:1) image. This image is ${dimensions.width} × ${dimensions.height}.`;
}
