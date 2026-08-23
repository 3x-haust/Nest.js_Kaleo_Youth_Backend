const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_METADATA_CHUNKS = new Set(['eXIf', 'iTXt', 'tEXt', 'zTXt']);
const WEBP_METADATA_CHUNKS = new Set(['EXIF', 'XMP ']);

function invalidImage(kind: string): never {
  throw new Error(`올바른 ${kind} 이미지가 아닙니다.`);
}

function stripJpegMetadata(input: Buffer): Buffer {
  if (
    input.length < 4 ||
    input[0] !== 0xff ||
    input[1] !== 0xd8 ||
    input[input.length - 2] !== 0xff ||
    input[input.length - 1] !== 0xd9
  ) {
    return invalidImage('JPEG');
  }

  const chunks: Buffer[] = [input.subarray(0, 2)];
  let offset = 2;

  while (offset < input.length) {
    const markerStart = offset;
    if (input[offset] !== 0xff) {
      chunks.push(input.subarray(offset));
      break;
    }

    while (offset < input.length && input[offset] === 0xff) offset += 1;
    if (offset >= input.length) return invalidImage('JPEG');

    const marker = input[offset];
    offset += 1;

    if (marker === 0xda) {
      chunks.push(input.subarray(markerStart));
      break;
    }

    const standalone =
      marker === 0x01 ||
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7);
    if (standalone) {
      chunks.push(input.subarray(markerStart, offset));
      if (marker === 0xd9) break;
      continue;
    }

    if (offset + 2 > input.length) return invalidImage('JPEG');
    const segmentLength = input.readUInt16BE(offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > input.length)
      return invalidImage('JPEG');

    const isMetadata = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!isMetadata) chunks.push(input.subarray(markerStart, segmentEnd));
    offset = segmentEnd;
  }

  return Buffer.concat(chunks);
}

function stripPngMetadata(input: Buffer): Buffer {
  if (
    input.length < PNG_SIGNATURE.length ||
    !input.subarray(0, 8).equals(PNG_SIGNATURE)
  ) {
    return invalidImage('PNG');
  }

  const chunks: Buffer[] = [input.subarray(0, 8)];
  let offset = 8;
  let sawEnd = false;

  while (offset < input.length) {
    if (offset + 12 > input.length) return invalidImage('PNG');
    const dataLength = input.readUInt32BE(offset);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > input.length) return invalidImage('PNG');

    const type = input.toString('ascii', offset + 4, offset + 8);
    if (!PNG_METADATA_CHUNKS.has(type))
      chunks.push(input.subarray(offset, chunkEnd));
    if (type === 'IEND') sawEnd = true;
    offset = chunkEnd;
  }

  if (!sawEnd) return invalidImage('PNG');
  return Buffer.concat(chunks);
}

function stripWebpMetadata(input: Buffer): Buffer {
  if (
    input.length < 12 ||
    input.toString('ascii', 0, 4) !== 'RIFF' ||
    input.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return invalidImage('WebP');
  }
  if (input.readUInt32LE(4) !== input.length - 8) return invalidImage('WebP');

  const chunks: Buffer[] = [];
  let offset = 12;
  let sawImage = false;

  while (offset < input.length) {
    if (offset + 8 > input.length) return invalidImage('WebP');
    const type = input.toString('ascii', offset, offset + 4);
    const dataLength = input.readUInt32LE(offset + 4);
    const chunkEnd = offset + 8 + dataLength + (dataLength % 2);
    if (chunkEnd > input.length) return invalidImage('WebP');

    if (!WEBP_METADATA_CHUNKS.has(type))
      chunks.push(input.subarray(offset, chunkEnd));
    if (type === 'VP8 ' || type === 'VP8L' || type === 'VP8X') sawImage = true;
    offset = chunkEnd;
  }

  if (!sawImage) return invalidImage('WebP');
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const output = Buffer.alloc(8 + body.length);
  output.write('RIFF', 0, 4, 'ascii');
  output.writeUInt32LE(body.length, 4);
  body.copy(output, 8);
  return output;
}

export function stripImageMetadata(input: Buffer, mimeType: string): Buffer {
  if (mimeType === 'image/jpeg') return stripJpegMetadata(input);
  if (mimeType === 'image/png') return stripPngMetadata(input);
  if (mimeType === 'image/webp') return stripWebpMetadata(input);
  if (
    mimeType === 'application/pdf' &&
    (!input.subarray(0, 5).equals(Buffer.from('%PDF-')) ||
      !input.includes(Buffer.from('%%EOF'), Math.max(0, input.length - 1024)))
  ) {
    throw new Error('올바른 PDF 파일이 아닙니다.');
  }
  return input;
}
