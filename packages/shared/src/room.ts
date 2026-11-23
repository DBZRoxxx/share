/**
 * Room identifiers.
 *
 * A room id is 10 characters from an alphabet without visually ambiguous
 * characters (no 0/o, 1/l/i). That gives ~49 bits of entropy, which is plenty
 * to make links unguessable for a friends-only app with no accounts.
 *
 * Canonical form: 10 lowercase chars, e.g. `k7mq2xp9tn`.
 * Display form:   grouped with dashes, e.g. `k7m-q2xp-9tn`.
 */

export const ROOM_ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
export const ROOM_ID_LENGTH = 10
export const PROTOCOL = 'share'

const ROOM_ID_RE = new RegExp(`^[${ROOM_ID_ALPHABET}]{${ROOM_ID_LENGTH}}$`)

export function createRoomId(random: (n: number) => Uint8Array = cryptoRandom): string {
  const alphabetLength = ROOM_ID_ALPHABET.length
  // Rejection sampling to avoid modulo bias.
  const limit = 256 - (256 % alphabetLength)
  let id = ''
  while (id.length < ROOM_ID_LENGTH) {
    for (const byte of random(ROOM_ID_LENGTH * 2)) {
      if (byte >= limit) continue
      id += ROOM_ID_ALPHABET[byte % alphabetLength]
      if (id.length === ROOM_ID_LENGTH) break
    }
  }
  return id
}

function cryptoRandom(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

export function isRoomId(value: string): boolean {
  return ROOM_ID_RE.test(value)
}

/** Normalizes user-typed codes: trims, lowercases and strips dashes/spaces. */
export function normalizeRoomId(value: string): string | null {
  const cleaned = value.trim().toLowerCase().replace(/[\s-]/g, '')
  return isRoomId(cleaned) ? cleaned : null
}

export function formatRoomId(id: string): string {
  return `${id.slice(0, 3)}-${id.slice(3, 7)}-${id.slice(7)}`
}

/**
 * Accepts anything a user might paste to join a room:
 *  - a bare code (`k7m-q2xp-9tn` or `k7mq2xp9tn`)
 *  - an https invite link (`https://host/r/k7mq2xp9tn`)
 *  - a deep link (`share://join/k7mq2xp9tn`)
 */
export function parseRoomInput(input: string): string | null {
  const value = input.trim()
  if (!value) return null

  const direct = normalizeRoomId(value)
  if (direct) return direct

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol === `${PROTOCOL}:`) {
    // share://join/<id>  → host = "join", pathname = "/<id>"
    const parts = [url.hostname, ...url.pathname.split('/')].filter(Boolean)
    if (parts[0] !== 'join' || !parts[1]) return null
    return normalizeRoomId(decodeURIComponent(parts[1]))
  }

  if (url.protocol === 'https:' || url.protocol === 'http:') {
    const match = url.pathname.match(/^\/r\/([^/]+)\/?$/)
    if (!match?.[1]) return null
    return normalizeRoomId(decodeURIComponent(match[1]))
  }

  return null
}

export function inviteUrl(webBaseUrl: string, roomId: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}/r/${roomId}`
}

export function deepLinkUrl(roomId: string): string {
  return `${PROTOCOL}://join/${roomId}`
}
