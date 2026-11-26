/**
 * AudioWorkletGlobalScope lacks TextDecoder and crypto, which the
 * wasm-bindgen glue of DeepFilterNet expects. Imported first by the worklet,
 * so it runs before the glue module is evaluated.
 */

const scope = globalThis as unknown as {
  TextDecoder?: unknown
  crypto?: { getRandomValues?: unknown }
}

if (typeof scope.TextDecoder === 'undefined') {
  // Only used for error messages coming out of the WASM (panics).
  scope.TextDecoder = class {
    decode(bytes?: Uint8Array): string {
      if (!bytes) return ''
      let out = ''
      for (let i = 0; i < bytes.length;) {
        const c = bytes[i++] ?? 0
        if (c < 0x80) out += String.fromCharCode(c)
        else if (c < 0xe0)
          out += String.fromCharCode(((c & 0x1f) << 6) | ((bytes[i++] ?? 0) & 0x3f))
        else if (c < 0xf0)
          out += String.fromCharCode(
            ((c & 0x0f) << 12) | (((bytes[i++] ?? 0) & 0x3f) << 6) | ((bytes[i++] ?? 0) & 0x3f),
          )
        else {
          const cp =
            (((c & 0x07) << 18) |
              (((bytes[i++] ?? 0) & 0x3f) << 12) |
              (((bytes[i++] ?? 0) & 0x3f) << 6) |
              ((bytes[i++] ?? 0) & 0x3f)) -
            0x10000
          out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
        }
      }
      return out
    }
  }
}

if (typeof scope.crypto?.getRandomValues !== 'function') {
  // Seeds for the model runtime's internals; nothing security-related.
  scope.crypto = {
    getRandomValues<T extends ArrayBufferView>(array: T): T {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
      return array
    },
  }
}

export {}
