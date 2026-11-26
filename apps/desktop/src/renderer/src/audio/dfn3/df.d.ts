// Types for the wasm-bindgen glue in df.js (scripts/build-dfn3.sh). Only what
// the microphone worklet uses.
export function initSync(module: WebAssembly.Module): unknown
/** Returns a pointer to the DeepFilterNet state. */
export function df_create(model_bytes: Uint8Array, atten_lim: number): number
export function df_get_frame_length(st: number): number
export function df_set_atten_lim(st: number, lim_db: number): void
export function df_set_post_filter_beta(st: number, beta: number): void
export function df_process_frame(st: number, input: Float32Array): Float32Array
