import type { ErrorResponse, RoomErrorCode, TokenRequest, TokenResponse } from '@share/shared'
import { WEB_URL } from './config'

export class TokenError extends Error {
  constructor(
    message: string,
    /** Set when the room needs a (new) password. */
    readonly code?: RoomErrorCode,
  ) {
    super(message)
  }
}

export async function fetchToken(request: TokenRequest): Promise<TokenResponse> {
  if (!WEB_URL)
    throw new TokenError('Este build do app não tem servidor configurado (VITE_SHARE_WEB_URL).')

  let res: Response
  try {
    res = await fetch(`${WEB_URL}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new TokenError(
      'Não foi possível falar com o servidor. Verifique sua internet e tente de novo.',
    )
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorResponse | null
    throw new TokenError(body?.error ?? `Erro no servidor (${res.status}).`, body?.code)
  }
  return (await res.json()) as TokenResponse
}
