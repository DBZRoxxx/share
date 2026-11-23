import { z } from 'zod'

export const ROOM_PASSWORD_MIN = 4
export const ROOM_PASSWORD_MAX = 64

export const roomPasswordSchema = z
  .string()
  .min(ROOM_PASSWORD_MIN, `A senha precisa de pelo menos ${ROOM_PASSWORD_MIN} caracteres`)
  .max(ROOM_PASSWORD_MAX, `Máximo de ${ROOM_PASSWORD_MAX} caracteres`)

/**
 * Proof of access to a private room, handed out after the password was
 * checked once. Signed by the server and tied to the current password: it
 * stops working when the owner changes it. The app keeps this, never the
 * password.
 */
export const roomKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)

/** Proof of having created the room (lets its creator manage the password). */
export const ownerKeySchema = roomKeySchema

export const roomUnlockSchema = z.object({ password: z.string().min(1).max(ROOM_PASSWORD_MAX) })

export interface RoomUnlockResponse {
  roomKey: string
}

export const roomPasswordUpdateSchema = z.object({
  ownerKey: ownerKeySchema,
  /** null removes the password (the room becomes open). */
  password: roomPasswordSchema.nullable(),
})

export interface RoomPasswordResponse {
  private: boolean
  /** New access key for the owner (the old ones stop working). */
  roomKey: string | null
}

/** Live state of a room, for the rooms list. */
export interface RoomSummary {
  name: string | null
  private: boolean
  /** People in the room right now. */
  participants: number
}

export const ROOM_PRESENCE_MAX = 50

export interface RoomPresenceResponse {
  rooms: Record<string, RoomSummary>
}

/** Error codes the app reacts to (besides showing the message). */
export type RoomErrorCode = 'password_required' | 'password_invalid' | 'not_owner'

/** Sent over LiveKit when the owner adds or removes the password. */
export const roomAccessMessageSchema = z.object({
  v: z.literal(1),
  kind: z.literal('room-access'),
  private: z.boolean(),
})

export type RoomAccessMessage = z.infer<typeof roomAccessMessageSchema>
