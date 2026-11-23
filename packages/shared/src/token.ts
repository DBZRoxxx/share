import { z } from 'zod'
import { isRoomId } from './room'

export const DISPLAY_NAME_MAX = 32

export const tokenRequestSchema = z.object({
  roomId: z.string().refine(isRoomId, 'Código de sala inválido'),
  name: z
    .string()
    .trim()
    .min(1, 'Informe um apelido')
    .max(DISPLAY_NAME_MAX, `Máximo de ${DISPLAY_NAME_MAX} caracteres`),
  identity: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/, 'Identidade inválida'),
})

export type TokenRequest = z.infer<typeof tokenRequestSchema>

export interface TokenResponse {
  token: string
  url: string
}

export interface ErrorResponse {
  error: string
}
