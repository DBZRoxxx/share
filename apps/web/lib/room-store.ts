import type { Redis } from '@upstash/redis'

/** Room names outlive chats: kept 180 days after the room was last used. */
const NAME_TTL_S = 180 * 86_400

const nameKey = (roomId: string) => `room:{${roomId}}:name`

export async function getRoomName(redis: Redis, roomId: string): Promise<string | null> {
  const name = await redis.get<string>(nameKey(roomId))
  return typeof name === 'string' && name ? name : null
}

/**
 * Names a room unless it already has a name (creating a room that someone
 * else named first keeps theirs). Returns the room's name either way, and
 * renews its lifetime.
 */
export async function claimRoomName(
  redis: Redis,
  roomId: string,
  name: string | undefined,
): Promise<string | null> {
  const key = nameKey(roomId)
  if (name) await redis.set(key, name, { nx: true, ex: NAME_TTL_S })
  const current = await getRoomName(redis, roomId)
  if (current) await redis.expire(key, NAME_TTL_S)
  return current
}

/** Names of several rooms in one round trip (rooms without one are left out). */
export async function getRoomNames(redis: Redis, roomIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (!roomIds.length) return names
  const values = (await redis.mget(...roomIds.map(nameKey))) as unknown[]
  roomIds.forEach((id, i) => {
    const v = values[i]
    if (typeof v === 'string' && v) names.set(id, v)
  })
  return names
}

export async function setRoomName(redis: Redis, roomId: string, name: string | null) {
  if (name) await redis.set(nameKey(roomId), name, { ex: NAME_TTL_S })
  else await redis.del(nameKey(roomId))
}
