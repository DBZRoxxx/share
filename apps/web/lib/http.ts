import type { ErrorResponse } from '@share/shared'
import type { createRateLimiter } from './rate-limit'

// The desktop app loads from file:// (Origin: null), so CORS must be open.
// That is fine: no cookies/credentials are involved, and every endpoint only
// returns data the caller is already allowed to have.
export function corsHeaders(methods: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': `${methods}, OPTIONS`,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Share-Client',
    'Access-Control-Max-Age': '86400',
  }
}

export function jsonResponse<T>(
  body: T,
  {
    status = 200,
    cors,
    headers = {},
  }: { status?: number; cors: Record<string, string>; headers?: Record<string, string> },
): Response {
  return Response.json(body, {
    status,
    headers: { ...cors, 'Cache-Control': 'no-store', ...headers },
  })
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export function rateLimited(
  request: Request,
  limiter: ReturnType<typeof createRateLimiter>,
  cors: Record<string, string>,
): Response | null {
  const limited = limiter(clientIp(request))
  if (limited.ok) return null
  return jsonResponse<ErrorResponse>(
    { error: 'Muitas tentativas, aguarde um pouco' },
    { status: 429, cors, headers: { 'Retry-After': String(limited.retryAfterS) } },
  )
}
