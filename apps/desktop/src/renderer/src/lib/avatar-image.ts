import { hueFor, initials } from './utils'

const cache = new Map<string, string>()

/**
 * The person's avatar (initials on their color, as in the room) as a PNG
 * data URL, for places that need an image, like Windows notifications.
 */
export function avatarImage(seed: string, name: string, size = 128): string {
  const key = `${seed}|${name}|${size}`
  const hit = cache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const hue = hueFor(seed)
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, `hsl(${hue} 70% 58%)`)
  gradient.addColorStop(1, `hsl(${(hue + 40) % 360} 65% 45%)`)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 ${Math.round(size * 0.4)}px "Segoe UI Variable Text", "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials(name || '?'), size / 2, size / 2 + size * 0.03)

  const url = canvas.toDataURL('image/png')
  cache.set(key, url)
  return url
}
