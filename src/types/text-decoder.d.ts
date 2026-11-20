/**
 * Global type declarations for Web APIs available in React Native.
 */

// TextDecoder is available in RN's JS engine but not in TypeScript's default lib
declare class TextDecoder {
  constructor(encoding?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  decode(input?: ArrayBufferView | ArrayBuffer | null, options?: { stream?: boolean }): string;
  readonly encoding: string;
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;
}
