import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Copies the app's CSS into a pop-out document so Tailwind classes work there. */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n')
      const style = target.createElement('style')
      style.textContent = css
      target.head.appendChild(style)
    } catch {
      // Cross-origin sheet; not ours.
    }
  }
}

/**
 * Renders children into a separate native window (opened by the main process
 * via setWindowOpenHandler). Closing the window calls `onClose`; unmounting
 * closes the window.
 */
export function PopoutWindow({
  id,
  title,
  onClose,
  children,
}: {
  id: string
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const winRef = useRef<Window | null>(null)

  useEffect(() => {
    const name = `popout-${id.replace(/[^\w-]/g, '_')}`
    const win = window.open('about:blank', name, 'width=1280,height=760')
    if (!win) {
      onClose()
      return
    }
    const doc = win.document
    doc.title = title
    doc.documentElement.lang = 'pt-BR'
    doc.documentElement.style.colorScheme = 'dark'
    copyStyles(doc)
    doc.body.style.margin = '0'
    doc.body.style.background = '#000'
    doc.body.style.overflow = 'hidden'
    const root = doc.createElement('div')
    root.style.cssText = 'position:fixed;inset:0'
    doc.body.appendChild(root)
    winRef.current = win
    // Syncing with an external system (the native window we just opened).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContainer(root)

    const handleUnload = () => onClose()
    win.addEventListener('pagehide', handleUnload)
    return () => {
      win.removeEventListener('pagehide', handleUnload)
      winRef.current = null
      win.close()
    }
    // onClose/title are intentionally captured once per window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (winRef.current) winRef.current.document.title = title
  }, [container, title])

  return container ? createPortal(children, container) : null
}
