import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Redis } from '@upstash/redis'

/**
 * Private rooms and room ownership.
 *
 *   room:{id}:owner  identity of whoever created the room
 *   room:{id}:auth   {salt, hash, v}: scrypt hash of the password
 *   room:{id}:authv  counter bumped on every password change
 *
 * The app never stores a password: after checking it once the server hands
 * out a room key, an HMAC over the room and the password version, so keys
 * stop working when the owner changes or removes the password. The owner
 * proves ownership with an owner key, an HMAC over the room and their
 * identity, given when the room is created.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>
const TTL_S = 180 * 86_400

export interface RoomAuth {
  salt: string
  hash: string
  v: number
}

export interface RoomAccess {
  owner: string | null
  auth: RoomAuth | null
}

const keys = (roomId: string) => ({
  owner: `room:{${roomId}}:owner`,
  auth: `room:{${roomId}}:auth`,
  version: `room:{${roomId}}:authv`,
})

function secret(): string {
  const s = process.env.LIVEKIT_API_SECRET
  if (!s) throw new Error('LIVEKIT_API_SECRET is missing')
  return s
}

function sign(message: string): string {
  return createHmac('sha256', secret()).update(message).digest('base64url')
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const roomKeyFor = (roomId: string, v: number) => sign(`access:${roomId}:${v}`)
export const ownerKeyFor = (roomId: string, identity: string) => sign(`owner:${roomId}:${identity}`)

export function checkRoomKey(roomId: string, auth: RoomAuth, key: string | undefined): boolean {
  return !!key && sameString(key, roomKeyFor(roomId, auth.v))
}

export function checkOwnerKey(roomId: string, identity: string, key: string | undefined): boolean {
  return !!key && sameString(key, ownerKeyFor(roomId, identity))
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16)
  const hash = await scrypt(password.normalize('NFC'), salt, 32)
  return { salt: salt.toString('base64'), hash: hash.toString('base64') }
}

export async function verifyPassword(password: string, auth: RoomAuth): Promise<boolean> {
  const hash = await scrypt(password.normalize('NFC'), Buffer.from(auth.salt, 'base64'), 32)
  const expected = Buffer.from(auth.hash, 'base64')
  return hash.length === expected.length && timingSafeEqual(hash, expected)
}

function parseAuth(value: unknown): RoomAuth | null {
  const raw = typeof value === 'string' ? safeJson(value) : value
  if (!raw || typeof raw !== 'object') return null
  const { salt, hash, v } = raw as Partial<RoomAuth>
  return typeof salt === 'string' && typeof hash === 'string' && typeof v === 'number'
    ? { salt, hash, v }
    : null
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export async function getRoomAccess(redis: Redis, roomId: string): Promise<RoomAccess> {
  const k = keys(roomId)
  const [owner, auth] = (await redis.mget(k.owner, k.auth)) as unknown[]
  return { owner: typeof owner === 'string' && owner ? owner : null, auth: parseAuth(auth) }
}

/** Makes `identity` the owner unless the room already has one. Returns the owner. */
export async function claimOwner(redis: Redis, roomId: string, identity: string): Promise<string> {
  const k = keys(roomId)
  await redis.set(k.owner, identity, { nx: true, ex: TTL_S })
  const owner = await redis.get<string>(k.owner)
  return typeof owner === 'string' && owner ? owner : identity
}

/** Sets (or with null removes) the password. Returns the new version, or null when removed. */
export async function setRoomPassword(
  redis: Redis,
  roomId: string,
  password: string | null,
): Promise<number | null> {
  const k = keys(roomId)
  const v = await redis.incr(k.version)
  await redis.expire(k.version, TTL_S)
  if (!password) {
    await redis.del(k.auth)
    return null
  }
  const { salt, hash } = await hashPassword(password)
  await redis.set(k.auth, JSON.stringify({ salt, hash, v }), { ex: TTL_S })
  return v
}

/** Keeps a used room's access records alive as long as its name. */
export async function touchRoomAccess(redis: Redis, roomId: string): Promise<void> {
  const k = keys(roomId)
  await Promise.all([redis.expire(k.owner, TTL_S), redis.expire(k.auth, TTL_S)])
}

/** Which of these rooms have a password (one round trip). */
export async function privateRooms(redis: Redis, roomIds: string[]): Promise<Set<string>> {
  if (!roomIds.length) return new Set()
  const values = (await redis.mget(...roomIds.map((id) => keys(id).auth))) as unknown[]
  return new Set(roomIds.filter((_, i) => parseAuth(values[i])))
}
