import { formatRoomId, parseRoomInput } from '@share/shared'
import { useEffect } from 'react'
import { toast, Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/primitives'
import { HomeScreen } from '@/screens/home'
import { PreJoinScreen } from '@/screens/prejoin'
import { RoomScreen } from '@/screens/room'
import { useNav } from '@/stores/nav'
import { usePrefs } from '@/stores/prefs'

function useDeepLinks() {
  useEffect(() => {
    const open = (url: string) => {
      const roomId = parseRoomInput(url)
      if (!roomId) {
        toast.error('Link de convite inválido.')
        return
      }
      const { view, goPrejoin } = useNav.getState()
      if (view.name === 'room') {
        if (view.roomId === roomId) return
        toast(`Convite para a sala ${formatRoomId(roomId)}`, {
          description: 'Sair da sala atual e entrar nela?',
          duration: 15_000,
          action: { label: 'Entrar', onClick: () => goPrejoin(roomId) },
        })
        return
      }
      goPrejoin(roomId)
    }

    void window.share.deepLink.consumePending().then((url) => url && open(url))
    return window.share.deepLink.onOpen(open)
  }, [])
}

export function App() {
  const view = useNav((s) => s.view)
  const hasName = usePrefs((s) => !!s.name.trim())
  useDeepLinks()

  return (
    <TooltipProvider delayDuration={400}>
      {view.name === 'room' && hasName ? (
        <RoomScreen key={view.roomId} roomId={view.roomId} />
      ) : view.name === 'prejoin' || view.name === 'room' ? (
        <PreJoinScreen key={view.roomId} roomId={view.roomId} />
      ) : (
        <HomeScreen />
      )}
      <Toaster
        theme="dark"
        position="top-center"
        offset={52}
        toastOptions={{
          classNames: {
            toast: '!bg-surface-2 !border-border !text-fg !rounded-xl',
            description: '!text-muted',
            actionButton: '!bg-accent !text-white',
          },
        }}
      />
    </TooltipProvider>
  )
}
