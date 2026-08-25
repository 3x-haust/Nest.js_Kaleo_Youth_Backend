declare module 'heic-decode' {
  interface DecodeOptions {
    readonly buffer: ArrayBuffer | Uint8Array;
  }

  interface DecodedImage {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
  }

  export default function decode(options: DecodeOptions): Promise<DecodedImage>;
}
