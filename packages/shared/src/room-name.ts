import { z } from 'zod'

export const ROOM_NAME_MAX = 45

/** Collapses whitespace and drops control characters. Empty means "no name". */
export function cleanRoomName(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** A custom room name; `null` (or an empty string) removes it. */
export const roomNameSchema = z
  .string()
  .max(ROOM_NAME_MAX * 4)
  .transform(cleanRoomName)
  .refine((v) => [...v].length <= ROOM_NAME_MAX, `Máximo de ${ROOM_NAME_MAX} caracteres`)

export const roomNameUpdateSchema = z.object({
  name: roomNameSchema.nullable(),
})

export interface RoomInfoResponse {
  name: string | null
  /** Needs a password to enter (servers before v0.5.2 omit it). */
  private?: boolean
}

/** Sent over LiveKit when someone renames the room, so everyone updates at once. */
export const roomNameMessageSchema = z.object({
  v: z.literal(1),
  kind: z.literal('room-name'),
  name: roomNameSchema.nullable(),
})

export type RoomNameMessage = z.infer<typeof roomNameMessageSchema>
