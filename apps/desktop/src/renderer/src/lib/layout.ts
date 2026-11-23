export interface GridLayout {
  cols: number
  rows: number
  tileWidth: number
  tileHeight: number
}

/**
 * Finds the column count that makes `count` tiles of the given aspect ratio as
 * large as possible inside a `width`×`height` box (with `gap` between tiles).
 */
export function bestGrid(
  count: number,
  width: number,
  height: number,
  aspect = 16 / 9,
  gap = 8,
): GridLayout {
  if (count <= 0 || width <= 0 || height <= 0) {
    return { cols: 0, rows: 0, tileWidth: 0, tileHeight: 0 }
  }

  let best: GridLayout = { cols: 1, rows: count, tileWidth: 0, tileHeight: 0 }
  let bestArea = -1

  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    let tileWidth = (width - gap * (cols - 1)) / cols
    let tileHeight = tileWidth / aspect
    if (tileHeight * rows + gap * (rows - 1) > height) {
      tileHeight = (height - gap * (rows - 1)) / rows
      tileWidth = tileHeight * aspect
    }
    if (tileWidth <= 0 || tileHeight <= 0) continue
    const area = tileWidth * tileHeight
    // Prefer fewer empty cells when areas tie (within half a pixel row).
    if (area > bestArea + 0.5) {
      bestArea = area
      best = { cols, rows, tileWidth: Math.floor(tileWidth), tileHeight: Math.floor(tileHeight) }
    }
  }
  return best
}
