import { describe, expect, it } from 'vitest'
import { bestGrid } from './layout'

describe('bestGrid', () => {
  it('handles empty input', () => {
    expect(bestGrid(0, 100, 100).cols).toBe(0)
    expect(bestGrid(3, 0, 100).cols).toBe(0)
  })

  it('fills a 16:9 box with a single tile', () => {
    const g = bestGrid(1, 1600, 900, 16 / 9, 0)
    expect(g).toEqual({ cols: 1, rows: 1, tileWidth: 1600, tileHeight: 900 })
  })

  it('puts two screens side by side on a wide box', () => {
    const g = bestGrid(2, 1920, 600, 16 / 9, 8)
    expect(g.cols).toBe(2)
    expect(g.rows).toBe(1)
  })

  it('stacks two screens on a tall box', () => {
    const g = bestGrid(2, 800, 1000, 16 / 9, 8)
    expect(g.cols).toBe(1)
    expect(g.rows).toBe(2)
  })

  it('uses a 2x2 grid for four tiles in a 16:9 box', () => {
    const g = bestGrid(4, 1600, 900, 16 / 9, 8)
    expect([g.cols, g.rows]).toEqual([2, 2])
  })

  it('never exceeds the container', () => {
    for (let n = 1; n <= 12; n++) {
      const W = 1234
      const H = 777
      const g = bestGrid(n, W, H, 16 / 9, 8)
      expect(g.cols * g.tileWidth + (g.cols - 1) * 8).toBeLessThanOrEqual(W)
      expect(g.rows * g.tileHeight + (g.rows - 1) * 8).toBeLessThanOrEqual(H)
      expect(g.cols * g.rows).toBeGreaterThanOrEqual(n)
    }
  })
})
