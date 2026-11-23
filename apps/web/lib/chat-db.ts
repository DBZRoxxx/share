import { CHAT_EVENTS_MAX, CHAT_RETENTION_DAYS, type ChatEnvelope } from '@share/shared/chat'
import { Redis } from '@upstash/redis'
import type { PlannedEvent } from './chat-plan'

/**
 * Chat storage: one append-only event log per room in Upstash Redis. Clients
 * fold the log with `applyChatEvent`, the same function used for live events,
 * so the server never has to rebuild message state.
 *
 *   chat:{room}:log   ZSET  score = seq, member = JSON envelope
 *   chat:{room}:seq   last seq
 *   chat:{room}:ids   SET of stored event ids (idempotent retries)
 *   chat:{room}:meta  HASH (see chat-plan.ts)
 *
 * Every write renews the room's TTL, so a room is forgotten 7 days after its
 * last event.
 */

export const RETENTION_S = CHAT_RETENTION_DAYS * 86_400
const PAGE = 500

let client: Redis | null | undefined

export function getRedis(): Redis | null {
  if (client !== undefined) return client
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  client = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null
  return client
}

const keys = (room: string) => ({
  log: `chat:{${room}}:log`,
  seq: `chat:{${room}}:seq`,
  ids: `chat:{${room}}:ids`,
  meta: `chat:{${room}}:meta`,
})

// ARGV: ttl, max, then per event: id, member, nMeta, k1, v1, …
// Returns the seq of each event, or 0 when it was already stored.
const APPEND = `
local ttl = tonumber(ARGV[1])
local max = tonumber(ARGV[2])
local out = {}
local i = 3
while i <= #ARGV do
  local id = ARGV[i]
  local member = ARGV[i + 1]
  local nm = tonumber(ARGV[i + 2])
  i = i + 3
  if redis.call('SADD', KEYS[3], id) == 1 then
    local seq = redis.call('INCR', KEYS[2])
    redis.call('ZADD', KEYS[1], seq, member)
    for j = 0, nm - 1 do
      redis.call('HSET', KEYS[4], ARGV[i + 2 * j], ARGV[i + 2 * j + 1])
    end
    table.insert(out, seq)
  else
    table.insert(out, 0)
  end
  i = i + 2 * nm
end
local n = redis.call('ZCARD', KEYS[1])
if n > max then
  redis.call('ZREMRANGEBYRANK', KEYS[1], 0, n - max - 1)
end
for k = 1, 4 do
  if redis.call('EXISTS', KEYS[k]) == 1 then redis.call('EXPIRE', KEYS[k], ttl) end
end
return out
`

export async function getMeta(redis: Redis, room: string, fields: string[]) {
  const map = new Map<string, string>()
  if (!fields.length) return map
  // Without automatic deserialization the client returns the raw reply: an
  // array of values in field order.
  const values = (await redis.hmget(keys(room).meta, ...fields)) as unknown
  if (Array.isArray(values)) {
    fields.forEach((f, i) => {
      if (typeof values[i] === 'string') map.set(f, values[i] as string)
    })
  } else if (values && typeof values === 'object') {
    for (const [k, v] of Object.entries(values)) if (typeof v === 'string') map.set(k, v)
  }
  return map
}

export async function appendEvents(redis: Redis, room: string, events: PlannedEvent[]) {
  if (!events.length) return []
  const k = keys(room)
  const args: string[] = [String(RETENTION_S), String(CHAT_EVENTS_MAX)]
  for (const e of events) {
    args.push(e.id, e.member, String(e.meta.length))
    for (const [field, value] of e.meta) args.push(field, value)
  }
  return redis.eval<string[], number[]>(APPEND, [k.log, k.seq, k.ids, k.meta], args)
}

export async function listEvents(redis: Redis, room: string, after: number) {
  const raw = await redis.zrange<string[]>(keys(room).log, `(${after}`, '+inf', {
    byScore: true,
    withScores: true,
    offset: 0,
    count: PAGE + 1,
  })
  const events: (ChatEnvelope & { seq: number })[] = []
  for (let i = 0; i + 1 < raw.length; i += 2) {
    try {
      const envelope = JSON.parse(String(raw[i])) as ChatEnvelope
      events.push({ ...envelope, seq: Number(raw[i + 1]) })
    } catch {
      // Corrupt member; skip it.
    }
  }
  const more = events.length > PAGE
  if (more) events.length = PAGE
  return { events, cursor: events.at(-1)?.seq ?? after, more }
}
