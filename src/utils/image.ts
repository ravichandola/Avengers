/**
 * Tiny PNG header reader — no native dependency. Reads the IHDR chunk that
 * follows the 8-byte PNG signature to extract pixel width and height.
 *
 * PNG layout:
 *   bytes  0..7   signature (89 50 4E 47 0D 0A 1A 0A)
 *   bytes  8..11  IHDR chunk length (always 13)
 *   bytes 12..15  chunk type ("IHDR")
 *   bytes 16..19  width  (uint32 BE)
 *   bytes 20..23  height (uint32 BE)
 */
export function readPngSize(buf: Buffer): { width: number; height: number } | null {
  if (!buf || buf.length < 24) return null;
  if (
    buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47 ||
    buf[4] !== 0x0d || buf[5] !== 0x0a || buf[6] !== 0x1a || buf[7] !== 0x0a
  ) {
    return null;
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}
