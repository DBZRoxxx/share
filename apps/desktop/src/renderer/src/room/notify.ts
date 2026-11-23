import { toast } from 'sonner'
import appIcon from '@/assets/app-icon.png'
import { avatarImage } from '@/lib/avatar-image'
import { playSound } from '@/lib/sounds'
import { usePrefs } from '@/stores/prefs'
import { useChat } from './chat-store'
import type { ChatNotice } from './notify-rules'
import { useRoomUi } from './room-ui'

/** Test hook: the e2e driver reads what was shown. */
declare global {
  interface Window {
    __notified?: { title: string; body: string; native: boolean }[]
  }
}

/**
 * The window is hidden in the tray, minimized or behind other apps. With
 * background throttling off (to keep streams smooth) `document.hidden` never
 * turns true, so focus is what tells.
 */
export function inBackground(): boolean {
  return document.hidden || !document.hasFocus()
}

function openChatAt(messageId: string) {
  void window.share.app.show()
  useRoomUi.getState().setPanel('chat')
  // Let the panel mount before scrolling to the message.
  setTimeout(() => useChat.getState().setHighlight(messageId), 150)
}

function nativeNotification(
  title: string,
  body: string,
  tag: string,
  onClick: () => void,
  icon: string = appIcon,
) {
  window.__notified?.push({ title, body, native: true })
  try {
    // Silent: the app plays its own sound (and respects its volume).
    const n = new Notification(title, {
      body: body.slice(0, 200),
      tag,
      silent: true,
      icon,
    })
    n.onclick = onClick
  } catch {
    // Notifications unavailable; the unread badge still shows.
  }
}

/** Sound + Windows notification or toast, depending on where the user is looking. */
export function deliverChatNotice(notice: ChatNotice) {
  playSound(notice.kind)
  const { desktop } = usePrefs.getState().notifications
  if (inBackground()) {
    if (desktop) {
      nativeNotification(notice.title, notice.body, `share-chat-${notice.messageId}`, () =>
        openChatAt(notice.messageId),
      )
    }
    return
  }
  // Reading the chat already: the sound is enough.
  if (useRoomUi.getState().panel === 'chat') return
  window.__notified?.push({ title: notice.title, body: notice.body, native: false })
  toast(notice.title, {
    id: 'chat-message',
    description: notice.body.length > 120 ? `${notice.body.slice(0, 120)}…` : notice.body,
    action: { label: 'Abrir chat', onClick: () => openChatAt(notice.messageId) },
  })
}

/**
 * Someone joined or left the room: sound for everyone, plus a Windows
 * notification when the app is in the background. Returns false when the
 * user turned these off (the caller skips its toast too).
 */
export function notifyPresence(
  person: { identity: string; name: string },
  joined: boolean,
): boolean {
  const { name } = person
  const { joinLeave, desktop } = usePrefs.getState().notifications
  if (!joinLeave) return false
  playSound(joined ? 'join' : 'leave')
  if (inBackground() && desktop) {
    nativeNotification(
      joined ? `${name} entrou na sala` : `${name} saiu da sala`,
      joined ? 'Clique para abrir o Share.' : '',
      'share-presence',
      () => void window.share.app.show(),
      // The person's initial on their color, as in the room.
      avatarImage(person.identity, name),
    )
  }
  return true
}
