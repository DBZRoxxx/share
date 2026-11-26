# DeepFilterNet3 (noise suppression)

Built by `apps/desktop/scripts/build-dfn3.sh` from
[Rikorose/DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) at commit
`7b14b895fe7fc42cab72b4a4c1e49c982bd6404b` (MIT / Apache-2.0, code and model
weights), with `scripts/dfn3-wasm.patch` applied to `libDF/src/wasm.rs`: it
adds `df_set_thresholds` (the local SNR thresholds) and `df_get_last_lsnr`.
Don't edit by hand: rerun the script to upgrade.

| File | What | sha256 |
| --- | --- | --- |
| `df_bg.wasm` | libDF compiled to WebAssembly (SIMD), without the model | `28af711badedd8144837fb5741ac023399a6a82e69804f1b24dc10fe02caad4d` |
| `df.js` | wasm-bindgen glue (`--target web`) | |
| `DeepFilterNet3_onnx.tar.gz` | model, from `models/` in the same commit | `c94d91f70911001c946e0fabb4aa9adc37045f45a03b56008cb0c8244cb63616` |
| `df.d.ts` | hand-written types for the glue | |

The current `df_bg.wasm` was built without wasm-pack (it didn't compile on the
machine at hand), doing the same steps by hand: `cargo build -p deep_filter
--release --target wasm32-unknown-unknown --features wasm --lib` with
`RUSTFLAGS="-C target-feature=+simd128"` (rustc 1.100.0), then wasm-bindgen
0.2.92 (the version in DeepFilterNet's `Cargo.lock`) with `--target web
--no-typescript --remove-name-section --remove-producers-section`. No
`wasm-opt` pass, hence the larger file; it runs as fast as the previous build.
