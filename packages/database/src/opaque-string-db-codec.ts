const CODE_UNIT_BYTES = 2;
const DECODE_CHUNK_CODE_UNITS = 8192;

export function encodeOpaqueStringDbV1(value: string): Uint8Array {
  const encoded = new Uint8Array(value.length * CODE_UNIT_BYTES);
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    encoded[index * CODE_UNIT_BYTES] = codeUnit >>> 8;
    encoded[index * CODE_UNIT_BYTES + 1] = codeUnit & 0xff;
  }
  return encoded;
}

export function decodeOpaqueStringDbV1(value: Uint8Array): string {
  if (value.byteLength % CODE_UNIT_BYTES !== 0) {
    throw new Error("OpaqueStringDbCodec v1 requires an even number of bytes");
  }

  const decodedChunks: string[] = [];
  const codeUnits: number[] = [];

  for (let offset = 0; offset < value.byteLength; offset += CODE_UNIT_BYTES) {
    codeUnits.push((value[offset] << 8) | value[offset + 1]);
    if (codeUnits.length === DECODE_CHUNK_CODE_UNITS) {
      decodedChunks.push(String.fromCharCode(...codeUnits));
      codeUnits.length = 0;
    }
  }

  if (codeUnits.length > 0) {
    decodedChunks.push(String.fromCharCode(...codeUnits));
  }

  return decodedChunks.join("");
}

export const opaqueStringDbCodecV1 = Object.freeze({
  encode: encodeOpaqueStringDbV1,
  decode: decodeOpaqueStringDbV1,
});
