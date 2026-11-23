import { BrowserWindow, desktopCapturer, type DesktopCapturerSource, type Session } from 'electron'
import type { CaptureSource } from '../shared/ipc'

const THUMBNAIL = { width: 480, height: 270 }

/** Sources from the last listing, so the renderer can only select real ones. */
const knownSources = new Map<string, DesktopCapturerSource>()
let pendingSelection: { source: DesktopCapturerSource; systemAudio: boolean } | null = null

function toJpegDataUrl(image: Electron.NativeImage, quality = 72): string {
  if (image.isEmpty()) return ''
  return `data:image/jpeg;base64,${image.toJPEG(quality).toString('base64')}`
}

export async function listSources(): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: THUMBNAIL,
    fetchWindowIcons: true,
  })

  // Hide Share's own windows from the picker — sharing them only makes a mirror tunnel.
  const ownIds = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()))

  knownSources.clear()
  let screenIndex = 0
  const result: CaptureSource[] = []
  for (const source of sources) {
    if (ownIds.has(source.id)) continue
    const kind = source.id.startsWith('screen:') ? 'screen' : 'window'
    knownSources.set(source.id, source)
    result.push({
      id: source.id,
      name: kind === 'screen' ? `Tela ${++screenIndex}` : source.name,
      kind,
      thumbnail: toJpegDataUrl(source.thumbnail),
      appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
    })
  }
  return result
}

export function getKnownSource(sourceId: string): DesktopCapturerSource | undefined {
  return knownSources.get(sourceId)
}

export function selectSource(sourceId: string, systemAudio: boolean): void {
  const source = knownSources.get(sourceId)
  if (!source) throw new Error('Fonte de captura não encontrada. Atualize a lista e tente de novo.')
  pendingSelection = { source, systemAudio }
}

/**
 * Answers getDisplayMedia() with the source the user picked in our own picker.
 * Chromium's `loopback` audio is only used as a fallback when native app-audio
 * capture is unavailable — it captures everything playing on the PC.
 */
export function installDisplayMediaHandler(session: Session): void {
  session.setDisplayMediaRequestHandler((request, callback) => {
    const selection = pendingSelection
    pendingSelection = null
    if (!selection) {
      callback(null)
      return
    }
    const video = { id: selection.source.id, name: selection.source.name }
    if (selection.systemAudio && request.audioRequested) {
      callback({ video, audio: 'loopback' })
    } else {
      callback({ video })
    }
  })
}
