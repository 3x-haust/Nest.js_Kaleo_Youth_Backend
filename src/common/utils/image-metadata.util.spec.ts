import { stripImageMetadata } from './image-metadata.util';

describe('stripImageMetadata', () => {
  it('removes JPEG EXIF and comment segments', () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xe1, 0x00, 0x08,
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xfe, 0x00, 0x05, 0x67, 0x70,
      0x73, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
    ]);

    const result = stripImageMetadata(jpeg, 'image/jpeg');

    expect(result.includes(Buffer.from('Exif'))).toBe(false);
    expect(result.includes(Buffer.from('gps'))).toBe(false);
    expect(result.includes(Buffer.from('JF'))).toBe(true);
    expect(result.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
  });

  it('removes PNG textual and EXIF chunks', () => {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const chunk = (type: string, data: string) => {
      const body = Buffer.from(data);
      const output = Buffer.alloc(12 + body.length);
      output.writeUInt32BE(body.length, 0);
      output.write(type, 4, 4, 'ascii');
      body.copy(output, 8);
      return output;
    };
    const png = Buffer.concat([
      signature,
      chunk('IHDR', 'header'),
      chunk('eXIf', 'gps'),
      chunk('tEXt', 'location'),
      chunk('IDAT', 'pixels'),
      chunk('IEND', ''),
    ]);

    const result = stripImageMetadata(png, 'image/png');

    expect(result.includes(Buffer.from('eXIf'))).toBe(false);
    expect(result.includes(Buffer.from('tEXt'))).toBe(false);
    expect(result.includes(Buffer.from('IDAT'))).toBe(true);
  });

  it('removes WebP EXIF and XMP chunks and rewrites the RIFF size', () => {
    const chunk = (type: string, data: string) => {
      const body = Buffer.from(data);
      const padding = body.length % 2;
      const output = Buffer.alloc(8 + body.length + padding);
      output.write(type, 0, 4, 'ascii');
      output.writeUInt32LE(body.length, 4);
      body.copy(output, 8);
      return output;
    };
    const body = Buffer.concat([
      Buffer.from('WEBP'),
      chunk('EXIF', 'gps'),
      chunk('XMP ', 'location'),
      chunk('VP8 ', 'pixels'),
    ]);
    const webp = Buffer.alloc(8 + body.length);
    webp.write('RIFF', 0, 4, 'ascii');
    webp.writeUInt32LE(body.length, 4);
    body.copy(webp, 8);

    const result = stripImageMetadata(webp, 'image/webp');

    expect(result.includes(Buffer.from('EXIF'))).toBe(false);
    expect(result.includes(Buffer.from('XMP '))).toBe(false);
    expect(result.includes(Buffer.from('VP8 '))).toBe(true);
    expect(result.readUInt32LE(4)).toBe(result.length - 8);
  });

  it('leaves non-image files unchanged', () => {
    const pdf = Buffer.from('%PDF-1.7\n%%EOF');
    expect(stripImageMetadata(pdf, 'application/pdf')).toBe(pdf);
    expect(() =>
      stripImageMetadata(
        Buffer.from('<html>not a pdf</html>'),
        'application/pdf',
      ),
    ).toThrow('올바른 PDF 파일이 아닙니다.');
  });

  it('rejects MIME-spoofed and structurally malformed image payloads', () => {
    expect(() =>
      stripImageMetadata(Buffer.from('<script>alert(1)</script>'), 'image/png'),
    ).toThrow('올바른 PNG 이미지가 아닙니다.');
    expect(() =>
      stripImageMetadata(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'),
    ).toThrow('올바른 JPEG 이미지가 아닙니다.');
  });
});
