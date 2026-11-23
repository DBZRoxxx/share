import { z } from 'zod'
import { isRoomId } from './room'
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
})

export type TokenRequest = z.infer<typeof tokenRequestSchema>

export interface TokenResponse {
  token: string
  url: string
  /** Custom room name, if any (servers before v0.4 omit it). */
  roomName?: string | null
}

export interface ErrorResponse {
  error: string
}
