# DeepFilterNet3 (noise suppression)

Built by `apps/desktop/scripts/build-dfn3.sh` from
[Rikorose/DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) at commit
`7b14b895fe7fc42cab72b4a4c1e49c982bd6404b` (MIT / Apache-2.0, code and model
weights). Don't edit by hand: rerun the script to upgrade.

| File | What | sha256 |
| --- | --- | --- |
| `df_bg.wasm` | libDF compiled to WebAssembly (SIMD), without the model | `d7585fb9f8d232591f8e53cdc667d2c4bfd65de1ac89ac9bafc8485d034df00b` |
| `df.js` | wasm-bindgen glue (`--target web`) | |
| `DeepFilterNet3_onnx.tar.gz` | model, from `models/` in the same commit | `c94d91f70911001c946e0fabb4aa9adc37045f45a03b56008cb0c8244cb63616` |
| `df.d.ts` | hand-written types for the glue | |
