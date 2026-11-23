import { z } from 'zod'
import { isRoomId } from './room'
import {
  ownerKeySchema,
  roomKeySchema,
  roomPasswordSchema,
  type RoomErrorCode,
} from './room-access'
import { roomNameSchema } from './room-name'

export const DISPLAY_NAME_MAX = 32

export const tokenRequestSchema = z.object({
  roomId: z.string().refine(isRoomId, 'Código de sala inválido'),
  name: z
    .string()
    .trim()
    .min(1, 'Informe um apelido')
    .max(DISPLAY_NAME_MAX, `Máximo de ${DISPLAY_NAME_MAX} caracteres`),
  identity: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/, 'Identidade inválida'),
  /** Name for a room being created; ignored when the room already has one. */
  roomName: roomNameSchema.optional(),
  /** The caller is creating this room: they become its owner. */
  create: z.boolean().optional(),
  /** Password for a private room being created. */
  password: roomPasswordSchema.optional(),
  /** Access to a private room (from /api/rooms/:id/unlock). */
  roomKey: roomKeySchema.optional(),
  /** The caller created this room. */
  ownerKey: ownerKeySchema.optional(),
})

export type TokenRequest = z.infer<typeof tokenRequestSchema>

export interface TokenResponse {
  token: string
  url: string
  /** Custom room name, if any (servers before v0.4 omit it). */
  roomName?: string | null
  /** The room needs a password (servers before v0.5.2 omit these). */
  private?: boolean
  /** The caller created the room and may manage its password. */
  owner?: boolean
  /** Access key to remember for a private room. */
  roomKey?: string | null
  /** Given to the creator when the room is created. */
  ownerKey?: string | null
}

export interface ErrorResponse {
  error: string
  code?: RoomErrorCode
}
