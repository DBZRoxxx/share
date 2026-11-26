#!/bin/sh
# Builds the DeepFilterNet3 noise suppressor (WebAssembly) used by the
# microphone pipeline, from the official sources at a pinned commit, and copies
# the result into src/renderer/src/audio/dfn3/. The output is committed, so
# neither CI nor other developers need Rust: run this only to upgrade.
#
# Requirements: rustup with the wasm32-unknown-unknown target, and wasm-pack
# (https://github.com/wasm-bindgen/wasm-pack/releases) on PATH.
#
#   sh scripts/build-dfn3.sh [path/to/DeepFilterNet checkout]
set -eu

COMMIT=7b14b895fe7fc42cab72b4a4c1e49c982bd6404b
HERE=$(cd "$(dirname "$0")/.." && pwd)
OUT="$HERE/src/renderer/src/audio/dfn3"

SRC=${1:-}
if [ -z "$SRC" ]; then
  SRC=$(mktemp -d)/DeepFilterNet
  git clone --filter=blob:none https://github.com/Rikorose/DeepFilterNet.git "$SRC"
fi
cd "$SRC"
git checkout -q "$COMMIT"
git checkout -q -- libDF/Cargo.toml libDF/src/wasm.rs

# Expose what upstream's WASM API leaves out: the local SNR thresholds (so
# clean speech can skip processing) and the last frame's SNR estimate.
git apply --whitespace=nowarn "$HERE/scripts/dfn3-wasm.patch"

# The model ships as its own file (fetched once, cached by the app), so keep it
# out of the WASM binary: drop "default-model" from the "wasm" feature.
sed -i '/^wasm = \[/,/^\]/{/"default-model",/d}' libDF/Cargo.toml

# SIMD makes the network ~2x faster; every Chromium the app ships with has it.
RUSTFLAGS="-C target-feature=+simd128" \
  wasm-pack build libDF --release --target web --no-typescript --no-pack --features wasm

git checkout -q -- libDF/Cargo.toml libDF/src/wasm.rs

mkdir -p "$OUT"
cp libDF/pkg/df.js "$OUT/df.js"
cp libDF/pkg/df_bg.wasm "$OUT/df_bg.wasm"
cp models/DeepFilterNet3_onnx.tar.gz "$OUT/DeepFilterNet3_onnx.tar.gz"
cp LICENSE-MIT "$OUT/LICENSE-MIT"
cd "$OUT"
sha256sum df_bg.wasm DeepFilterNet3_onnx.tar.gz
echo "DeepFilterNet3 built from Rikorose/DeepFilterNet@$COMMIT into $OUT"
