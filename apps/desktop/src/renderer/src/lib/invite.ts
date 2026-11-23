import { formatRoomId, inviteUrl } from '@share/shared'
import { toast } from 'sonner'
import { WEB_URL } from './config'

export function roomInviteText(roomId: string): string {
  return WEB_URL ? inviteUrl(WEB_URL, roomId) : formatRoomId(roomId)
}

export async function copyInvite(roomId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(roomInviteText(roomId))
    toast.success('Link de convite copiado', {
      description: 'Cole no grupo — quem clicar entra direto na sala.',
    })
  } catch {
    toast.error('Não foi possível copiar o link.')
  }
}
