const CRC32_POLYNOMIAL = 0xedb88320;

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_value, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? CRC32_POLYNOMIAL ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

/** AWS EventStream uses the standard GZIP/IEEE CRC32 calculation. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
